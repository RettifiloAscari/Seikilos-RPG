import { TILE } from '../config';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { cosmeticRng } from '../core/rng';
import { getEncounter } from '../data/encounters';
import { getItem } from '../data/items';
import { FieldEntity, renderSorted } from '../field/entity';
import { getMap } from '../field/maps';
import { TileMap, type FieldEnemyDef, type Facing, type NpcDef } from '../field/tilemap';
import type { Renderer } from '../render/renderer';
import { writeSave } from '../state/savegame';
import { DialogueBox } from '../ui/dialogue';
import { drawWindow } from '../ui/window';
import { BattleScene, type BattleSceneResult } from './battle';
import { Fader } from './fader';
import { GameOverScene } from './gameover';
import { PauseMenuScene } from './menu';

const WALK_SPEED = 62;
const RUN_SPEED = 108;
const NPC_WANDER_SPEED = 26;
/** How close an enemy must be before it starts a battle. */
const ENEMY_TOUCH_RADIUS = 11;
/** Grace period after a battle so the player isn't immediately re-caught. */
const POST_BATTLE_GRACE = 1.4;

interface NpcInstance {
  def: NpcDef;
  entity: FieldEntity;
  homeX: number;
  homeY: number;
  wanderTimer: number;
  moveX: number;
  moveY: number;
}

interface EnemyInstance {
  def: FieldEnemyDef;
  entity: FieldEntity;
  homeX: number;
  homeY: number;
  wanderTimer: number;
  moveX: number;
  moveY: number;
}

/**
 * The overworld: walking around, talking to people, opening chests, and
 * bumping into enemies to start battles.
 */
export class FieldScene implements Scene {
  private map!: TileMap;
  private player!: FieldEntity;
  private npcs: NpcInstance[] = [];
  private enemies: EnemyInstance[] = [];

  private readonly dialogue = new DialogueBox();
  private readonly fader = new Fader();

  /** Set while a chest/save prompt is waiting for the message to finish. */
  private pendingPrompt: (() => void) | null = null;
  private battleGrace = 0;
  /** Encounter queued while the screen fades out. */
  private pendingEncounter: { encounterId: string; enemyId: string } | null = null;
  private locationBanner = 0;

  constructor(private readonly entry?: { mapId: string; tx: number; ty: number; facing?: Facing }) {}

  enter(game: Game): void {
    const mapId = this.entry?.mapId ?? game.state.mapId ?? 'camp';
    this.loadMap(game, mapId, this.entry?.tx, this.entry?.ty, this.entry?.facing);
    this.fader.startBlack();
  }

  resume(game: Game, result?: unknown): void {
    // Coming back from a battle.
    if (result && typeof result === 'object' && 'outcome' in result) {
      this.handleBattleResult(game, result as BattleSceneResult);
    }
    this.battleGrace = POST_BATTLE_GRACE;
    game.input.clear();
  }

  private loadMap(game: Game, mapId: string, tx?: number, ty?: number, facing?: Facing): void {
    const def = getMap(mapId);
    this.map = new TileMap(def);
    game.state.mapId = mapId;

    const spawnX = tx ?? def.spawn.tx;
    const spawnY = ty ?? def.spawn.ty;

    const leader = game.state.leader;
    this.player = new FieldEntity(leader?.def.fieldSprite ?? 'npc.generic', spawnX, spawnY);
    this.player.facing = facing ?? def.spawn.facing ?? 'down';

    this.npcs = (def.npcs ?? []).map((npc) => {
      const entity = new FieldEntity(npc.sprite ?? 'npc.generic', npc.tx, npc.ty);
      entity.facing = npc.facing ?? 'down';
      entity.speed = NPC_WANDER_SPEED;
      return {
        def: npc,
        entity,
        homeX: entity.x,
        homeY: entity.y,
        wanderTimer: cosmeticRng.float(0.5, 2.5),
        moveX: 0,
        moveY: 0,
      };
    });

    this.enemies = (def.enemies ?? [])
      .filter((enemy) => !enemy.defeatFlag || !game.state.hasFlag(enemy.defeatFlag))
      .filter((enemy) => !enemy.requiresFlag || game.state.hasFlag(enemy.requiresFlag))
      .map((enemy) => {
        const entity = new FieldEntity(enemy.sprite, enemy.tx, enemy.ty);
        entity.speed = NPC_WANDER_SPEED;
        // Field enemies drift through each other; only walls stop them.
        entity.solid = false;
        return {
          def: enemy,
          entity,
          homeX: entity.x,
          homeY: entity.y,
          wanderTimer: cosmeticRng.float(0.3, 2),
          moveX: 0,
          moveY: 0,
        };
      });

    this.locationBanner = 2.6;
    this.syncStatePosition(game);
  }

  update(dt: number, game: Game): void {
    game.state.playTime += dt;
    this.fader.update(dt);
    if (this.locationBanner > 0) this.locationBanner -= dt;
    if (this.battleGrace > 0) this.battleGrace -= dt;

    // A fade owns the screen; nothing else runs during it.
    if (this.fader.busy) {
      this.player.update(dt);
      return;
    }

    if (this.dialogue.active) {
      const done = this.dialogue.update(dt, game.input);
      if (done && this.pendingPrompt) {
        const prompt = this.pendingPrompt;
        this.pendingPrompt = null;
        prompt();
      }
      return;
    }

    if (game.input.pressed('menu')) {
      game.scenes.push(new PauseMenuScene());
      return;
    }

    this.updatePlayer(dt, game);
    this.updateNpcs(dt);
    this.updateEnemies(dt, game);
    this.checkExit(game);
  }

  private updatePlayer(dt: number, game: Game): void {
    const axis = game.input.axis();
    const running = game.input.down('run');
    const speed = running ? RUN_SPEED : WALK_SPEED;

    // Normalise so diagonal movement isn't faster.
    let dx = axis.x;
    let dy = axis.y;
    if (dx !== 0 && dy !== 0) {
      const inv = Math.SQRT1_2;
      dx *= inv;
      dy *= inv;
    }

    if (dx !== 0 || dy !== 0) {
      this.player.faceFromVector(axis.x, axis.y);
      this.player.moveBy(
        dx * speed * dt,
        dy * speed * dt,
        this.map,
        this.npcs.map((npc) => npc.entity),
      );
    }
    this.player.update(dt);
    this.syncStatePosition(game);

    if (game.input.pressed('confirm')) this.interact(game);
  }

  private updateNpcs(dt: number): void {
    for (const npc of this.npcs) {
      if (!npc.def.wander) {
        npc.entity.update(dt);
        continue;
      }

      npc.wanderTimer -= dt;
      if (npc.wanderTimer <= 0) {
        npc.wanderTimer = cosmeticRng.float(1.2, 3.4);
        // Half the time, stand still instead of picking a new direction.
        if (cosmeticRng.chance(0.5)) {
          npc.moveX = 0;
          npc.moveY = 0;
        } else {
          const dir = cosmeticRng.pick([
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const);
          npc.moveX = dir[0];
          npc.moveY = dir[1];
        }
      }

      if (npc.moveX !== 0 || npc.moveY !== 0) {
        const range = npc.def.wander * TILE;
        const nextX = npc.entity.x + npc.moveX * npc.entity.speed * dt;
        const nextY = npc.entity.y + npc.moveY * npc.entity.speed * dt;

        // Turn back rather than drifting away from home forever.
        if (Math.abs(nextX - npc.homeX) > range || Math.abs(nextY - npc.homeY) > range) {
          npc.moveX = -npc.moveX;
          npc.moveY = -npc.moveY;
        } else {
          npc.entity.faceFromVector(npc.moveX, npc.moveY);
          npc.entity.moveBy(npc.moveX * npc.entity.speed * dt, npc.moveY * npc.entity.speed * dt, this.map, [
            this.player,
          ]);
        }
      }
      npc.entity.update(dt);
    }
  }

  private updateEnemies(dt: number, game: Game): void {
    for (const enemy of this.enemies) {
      const wander = enemy.def.wander ?? 0;

      if (wander > 0) {
        enemy.wanderTimer -= dt;
        if (enemy.wanderTimer <= 0) {
          enemy.wanderTimer = cosmeticRng.float(0.8, 2.2);
          const dir = cosmeticRng.pick([
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [0, 0],
          ] as const);
          enemy.moveX = dir[0];
          enemy.moveY = dir[1];
        }

        if (enemy.moveX !== 0 || enemy.moveY !== 0) {
          const range = wander * TILE;
          const nextX = enemy.entity.x + enemy.moveX * enemy.entity.speed * dt;
          const nextY = enemy.entity.y + enemy.moveY * enemy.entity.speed * dt;
          if (Math.abs(nextX - enemy.homeX) > range || Math.abs(nextY - enemy.homeY) > range) {
            enemy.moveX = -enemy.moveX;
            enemy.moveY = -enemy.moveY;
          } else {
            enemy.entity.faceFromVector(enemy.moveX, enemy.moveY);
            enemy.entity.moveBy(
              enemy.moveX * enemy.entity.speed * dt,
              enemy.moveY * enemy.entity.speed * dt,
              this.map,
            );
          }
        }
      }
      enemy.entity.update(dt);

      if (this.battleGrace <= 0 && this.player.distanceTo(enemy.entity) < ENEMY_TOUCH_RADIUS) {
        this.startBattle(game, enemy);
        return;
      }
    }
  }

  private startBattle(game: Game, enemy: EnemyInstance): void {
    this.pendingEncounter = { encounterId: enemy.def.encounter, enemyId: enemy.def.id };
    this.fader.fadeOut(() => {
      const pending = this.pendingEncounter;
      this.pendingEncounter = null;
      if (!pending) return;
      game.scenes.push(
        new BattleScene({
          encounter: getEncounter(pending.encounterId),
          fieldEnemyId: pending.enemyId,
        }),
      );
    }, 3.4);
  }

  private handleBattleResult(game: Game, result: BattleSceneResult): void {
    if (result.outcome === 'defeat') {
      game.scenes.replace(new GameOverScene());
      return;
    }

    if (result.outcome === 'victory' && result.fieldEnemyId) {
      const enemy = this.enemies.find((e) => e.def.id === result.fieldEnemyId);
      if (enemy?.def.defeatFlag) game.state.setFlag(enemy.def.defeatFlag);
      this.enemies = this.enemies.filter((e) => e.def.id !== result.fieldEnemyId);

      if (enemy?.def.id === 'choragos') {
        this.dialogue.show(
          game.font,
          'The last chord fades. For the first time in nine hundred years, the sanctum is silent — and somewhere far above, the camp is sleeping through it.',
          null,
        );
      }
    }

    // Escaping leaves the enemy on the map, which is the point of escaping.
  }

  // ------------------------------------------------------------ interaction

  private interact(game: Game): void {
    const { tx, ty } = this.player.facingTile();

    // NPCs are matched by proximity rather than exact tile, since they move.
    const npc = this.npcs.find((candidate) => {
      const dx = Math.abs(candidate.entity.x - this.player.x);
      const dy = Math.abs(candidate.entity.y - this.player.y);
      return dx < TILE * 1.2 && dy < TILE * 1.2;
    });

    if (npc) {
      npc.entity.facing = opposite(this.player.facing);
      const lines = this.linesFor(game, npc.def);
      this.showSequence(game, lines, npc.def.name);
      return;
    }

    const object = this.map.objectAt(tx, ty) ?? this.map.objectAt(this.player.tileX, this.player.tileY);
    if (!object) return;

    switch (object.kind) {
      case 'sign':
        this.showSequence(game, object.lines ?? [], null);
        return;

      case 'chest': {
        if (object.flag && game.state.hasFlag(object.flag)) {
          this.dialogue.show(game.font, 'The chest is empty.', null);
          return;
        }
        if (object.flag) game.state.setFlag(object.flag);

        if (object.item) {
          game.state.addItem(object.item);
          this.dialogue.show(game.font, `Found ${getItem(object.item).name}!`, null);
        } else if (object.gold) {
          game.state.gold += object.gold;
          this.dialogue.show(game.font, `Found ${object.gold} drachma!`, null);
        }
        return;
      }

      case 'savePoint': {
        game.state.restParty();
        this.dialogue.show(
          game.font,
          'You rest a while. Everyone recovers fully.\nProgress is recorded.',
          null,
        );
        // Autosave once the message clears, so the save reflects the rest.
        this.pendingPrompt = () => {
          writeSave(0, game.state.toSave());
        };
        return;
      }

      case 'trigger':
        this.showSequence(game, object.lines ?? [], null);
        return;
    }
  }

  /** Pick the right dialogue variant for the flags currently set. */
  private linesFor(game: Game, npc: NpcDef): string[] {
    for (const variant of npc.flagLines ?? []) {
      if (game.state.hasFlag(variant.flag)) return variant.lines;
    }
    return npc.lines;
  }

  /** Show several messages back to back. */
  private showSequence(game: Game, lines: string[], speaker: string | null): void {
    if (lines.length === 0) return;
    const [first, ...rest] = lines;
    this.dialogue.show(game.font, first!, speaker);
    if (rest.length > 0) {
      this.pendingPrompt = () => this.showSequence(game, rest, speaker);
    }
  }

  private checkExit(game: Game): void {
    const exit = this.map.exitAt(this.player.tileX, this.player.tileY);
    if (!exit) return;

    this.fader.fadeOut(() => {
      this.loadMap(game, exit.toMap, exit.toX, exit.toY, exit.facing);
    });
  }

  private syncStatePosition(game: Game): void {
    game.state.playerX = this.player.x;
    game.state.playerY = this.player.y;
    game.state.playerFacing = this.player.facing;
  }

  // ---------------------------------------------------------------- render

  render(r: Renderer, game: Game): void {
    r.focusCamera(this.player.x, this.player.y - 8, this.map.widthPx, this.map.heightPx);

    r.beginCamera();
    this.map.drawGround(r, game.assets);

    const actors: FieldEntity[] = [this.player, ...this.npcs.map((n) => n.entity)];
    renderSorted(actors, r, game.assets);
    this.renderFieldEnemies(r, game);

    this.map.drawAbove(r, game.assets);
    r.endCamera();

    const ambient = this.map.def.ambient;
    if (ambient) r.overlay(ambient.color, ambient.alpha);

    this.renderLocationBanner(r, game);
    this.dialogue.render(r, game.font);
    this.fader.render(r);
  }

  /**
   * Field enemies use their battle sprites, drawn centred on the entity with a
   * gentle hover so they read as hazards rather than scenery.
   */
  private renderFieldEnemies(r: Renderer, game: Game): void {
    for (const enemy of this.enemies) {
      const sheet = game.assets.tryImage(enemy.def.sprite);
      if (!sheet) continue;

      const size = enemy.def.size ?? { w: 24, h: 24 };
      const hover = Math.sin(game.elapsed * 2.4 + enemy.homeX * 0.1) * 1.5;
      r.sprite(
        sheet,
        0,
        0,
        size.w,
        size.h,
        enemy.entity.x - size.w / 2,
        enemy.entity.y - size.h + hover,
      );
    }
  }

  private renderLocationBanner(r: Renderer, game: Game): void {
    if (this.locationBanner <= 0) return;

    // Fade the banner out over its last half second.
    const alpha = Math.min(1, this.locationBanner / 0.5);
    const label = this.map.def.name;
    const width = game.font.measure(label) + 20;

    r.ctx.save();
    r.ctx.globalAlpha = alpha;
    drawWindow(r, 8, 8, width, 18);
    game.font.drawShadowed(r.ctx, label, 18, 12, '#ffe9a8');
    r.ctx.restore();
  }
}

function opposite(facing: Facing): Facing {
  switch (facing) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}
