import { VIRTUAL_H, VIRTUAL_W } from '../config';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { Battle } from '../battle/battle';
import { Combatant } from '../battle/combatant';
import { EffectSystem } from '../battle/effects';
import type { BattleEvent, BattleOutcome } from '../battle/action';
import { needsCursor, resolveTargets, selectableTargets } from '../battle/targeting';
import { BATTLE_FRAMES } from '../art/placeholder';
import { getItem } from '../data/items';
import { STATUSES } from '../data/status';
import { getTech } from '../data/techs';
import { ELEMENT_COLORS, type TargetKind, type TechDef } from '../data/types';
import type { Renderer } from '../render/renderer';
import type { LevelUpResult } from '../state/party';
import { ListMenu, type MenuItem } from '../ui/menu';
import { drawCursor, drawGauge, drawTargetCursor, drawWindow, PANEL_STYLE } from '../ui/window';
import { Fader } from './fader';

const BATTLE_SPRITE_W = 24;
const BATTLE_SPRITE_H = 32;

/** Bottom status bar geometry. */
const HUD_X = 4;
const HUD_Y = 158;
const HUD_W = VIRTUAL_W - 8;
const HUD_H = VIRTUAL_H - HUD_Y - 4;
const HUD_ROW_H = 16;

/** Menu geometry, all sized to stay clear of the HUD along the bottom. */
const MENU_X = 8;
const COMMAND_Y = 64;
const COMMAND_W = 92;
const LIST_Y = 26;
const LIST_H = 90;
/** Description strip sits just above the HUD. */
const DESC_Y = 118;

export interface BattleSceneOptions {
  encounter: import('../data/types').EncounterDef;
  /** Id of the field enemy that started this fight, so it can be removed. */
  fieldEnemyId?: string;
}

export interface BattleSceneResult {
  outcome: BattleOutcome;
  fieldEnemyId?: string;
}

/** What the player is currently choosing. */
type UiState =
  | { kind: 'watching' }
  | { kind: 'command'; actor: Combatant }
  | { kind: 'tech'; actor: Combatant }
  | { kind: 'item'; actor: Combatant }
  | { kind: 'target'; actor: Combatant; pending: PendingAction }
  | { kind: 'results' };

interface PendingAction {
  kind: 'attack' | 'tech' | 'item';
  targetKind: TargetKind;
  tech?: TechDef;
  partners?: Combatant[];
  itemId?: string;
}

/**
 * The battle screen.
 *
 * Owns all presentation: the HUD, the command menus, the targeting cursor and
 * the results screen. Rules live entirely in `Battle`; this scene reads its
 * state and feeds it player decisions.
 */
export class BattleScene implements Scene {
  private battle!: Battle;
  private readonly effects = new EffectSystem();
  private readonly fader = new Fader();

  private ui: UiState = { kind: 'watching' };
  private commandMenu: ListMenu<string> | null = null;
  private techMenu: ListMenu<{ tech: TechDef; partners: Combatant[] }> | null = null;
  private itemMenu: ListMenu<string> | null = null;
  private targetIndex = 0;
  private targetCandidates: Combatant[] = [];

  private message = '';
  private messageTimer = 0;
  private time = 0;
  private levelUps: LevelUpResult[] = [];
  private exiting = false;

  constructor(private readonly options: BattleSceneOptions) {}

  enter(game: Game): void {
    this.battle = new Battle({
      encounter: this.options.encounter,
      party: game.state.activeParty,
      rng: game.rng,
    });
    this.fader.startBlack(3.2);
    game.input.clear();
  }

  // ---------------------------------------------------------------- update

  update(dt: number, game: Game): void {
    this.time += dt;
    this.fader.update(dt);
    this.effects.update(dt);
    if (this.messageTimer > 0) this.messageTimer -= dt;

    for (const combatant of this.battle.all) {
      if (combatant.flash > 0) combatant.flash -= dt;
    }

    if (this.exiting) return;

    // Menus that pause the world: submenus and targeting, but not the
    // top-level command list. Leaving the command list live is what makes
    // holding a turn to set up a combo tech an actual decision.
    this.battle.atbPaused =
      this.ui.kind === 'tech' || this.ui.kind === 'item' || this.ui.kind === 'target';

    this.battle.update(dt);
    this.consumeEvents(game);

    if (this.battle.phase === 'finished') {
      this.handleFinish(game);
      // The victory screen is a normal interactive state and still needs its
      // input read. Returning here instead is what soft-locked every win:
      // the "press confirm" prompt was drawn by a branch that never ran.
      if (this.ui.kind === 'results') this.updateUi(dt, game);
      return;
    }

    // An action is playing out: close menus and just watch.
    if (this.battle.busy) {
      if (this.ui.kind !== 'watching' && this.ui.kind !== 'results') this.ui = { kind: 'watching' };
      return;
    }

    this.updateUi(dt, game);
  }

  private updateUi(dt: number, game: Game): void {
    switch (this.ui.kind) {
      case 'watching': {
        const ready = this.battle.readyPartyMembers();
        if (ready.length > 0) this.openCommandMenu(ready[0]!);
        return;
      }

      case 'command': {
        const actor = this.ui.actor;
        // The actor may have been knocked out or put to sleep while deciding.
        if (!actor.ready) {
          this.ui = { kind: 'watching' };
          return;
        }

        const menu = this.commandMenu;
        if (!menu) return;
        const result = menu.update(dt, game.input);

        if (result === 'cancel') {
          this.cycleReadyActor(actor);
          return;
        }
        if (result === 'confirm') this.chooseCommand(game, actor, menu.selectedValue ?? 'attack');
        return;
      }

      case 'tech': {
        const menu = this.techMenu;
        if (!menu) return;
        const result = menu.update(dt, game.input);

        if (result === 'cancel') {
          this.openCommandMenu(this.ui.actor);
          return;
        }
        if (result === 'confirm') {
          const choice = menu.selectedValue;
          if (choice) this.beginTargeting(this.ui.actor, {
            kind: 'tech',
            tech: choice.tech,
            partners: choice.partners,
            targetKind: choice.tech.target,
          });
        }
        return;
      }

      case 'item': {
        const menu = this.itemMenu;
        if (!menu) return;
        const result = menu.update(dt, game.input);

        if (result === 'cancel') {
          this.openCommandMenu(this.ui.actor);
          return;
        }
        if (result === 'confirm') {
          const itemId = menu.selectedValue;
          if (itemId) {
            const item = getItem(itemId);
            this.beginTargeting(this.ui.actor, {
              kind: 'item',
              itemId,
              targetKind: item.target ?? 'oneAlly',
            });
          }
        }
        return;
      }

      case 'target': {
        this.updateTargeting(game);
        return;
      }

      case 'results': {
        if (game.input.pressed('confirm') || game.input.pressed('cancel')) this.leave(game, 'victory');
        return;
      }
    }
  }

  // ------------------------------------------------------------ menu setup

  private openCommandMenu(actor: Combatant): void {
    const items: MenuItem<string>[] = [
      { label: 'Attack', value: 'attack' },
      { label: 'Tech', value: 'tech', disabled: actor.techsBlocked },
      { label: 'Item', value: 'item' },
      { label: 'Defend', value: 'defend' },
      { label: 'Run', value: 'run', disabled: this.battle.encounter.noEscape },
    ];

    // Flag the Tech entry when a combo is live. The count goes in the label
    // rather than the right-aligned detail column, which is too narrow here
    // and would run into the label itself.
    const combos = this.battle.availableComboTechs(actor);
    if (combos.length > 0) {
      items[1] = { ...items[1]!, label: `Tech (${combos.length})`, color: '#ffe066' };
    }

    this.commandMenu = new ListMenu(items, { visibleRows: 5, rowHeight: 13 });
    this.ui = { kind: 'command', actor };
  }

  /** Cancel on the command menu hands control to the next ready character. */
  private cycleReadyActor(current: Combatant): void {
    const ready = this.battle.readyPartyMembers();
    if (ready.length <= 1) {
      this.ui = { kind: 'watching' };
      return;
    }
    const index = ready.indexOf(current);
    const next = ready[(index + 1) % ready.length]!;
    this.openCommandMenu(next);
  }

  private chooseCommand(game: Game, actor: Combatant, command: string): void {
    switch (command) {
      case 'attack':
        this.beginTargeting(actor, { kind: 'attack', targetKind: 'oneEnemy' });
        return;

      case 'tech':
        this.openTechMenu(actor);
        return;

      case 'item':
        this.openItemMenu(game, actor);
        return;

      case 'defend':
        this.battle.submit(this.battle.buildDefend(actor));
        this.ui = { kind: 'watching' };
        return;

      case 'run':
        this.battle.submit(this.battle.buildFlee(actor));
        this.ui = { kind: 'watching' };
        return;
    }
  }

  /**
   * The tech list shows the character's own techs, then any combo techs that
   * are live at this exact moment, tagged with the partners involved.
   */
  private openTechMenu(actor: Combatant): void {
    const items: MenuItem<{ tech: TechDef; partners: Combatant[] }>[] = [];

    for (const tech of this.battle.availableSingleTechs(actor)) {
      items.push({
        label: tech.name,
        detail: `${tech.mpCost} MP`,
        disabled: !this.battle.canAfford(actor, tech),
        value: { tech, partners: [] },
      });
    }

    // Combo techs are listed after the character's own, tinted so they stand
    // out: gold for duals, pink for the triple. The partner list appears in
    // the description panel underneath.
    for (const combo of this.battle.availableComboTechs(actor)) {
      items.push({
        label: combo.tech.name,
        detail: `${combo.tech.mpCost} MP`,
        color: combo.tech.users.length >= 3 ? '#ff9ad5' : '#ffe066',
        value: combo,
      });
    }

    this.techMenu = new ListMenu(items, { visibleRows: 6, rowHeight: 13 });
    this.ui = { kind: 'tech', actor };
  }

  private openItemMenu(game: Game, actor: Combatant): void {
    const usable = game.state.itemsWhere((id) => getItem(id).usableInBattle === true);
    const items: MenuItem<string>[] = usable.map((entry) => ({
      label: getItem(entry.id).name,
      detail: `x${entry.count}`,
      value: entry.id,
    }));

    if (items.length === 0) items.push({ label: 'No usable items', disabled: true });

    this.itemMenu = new ListMenu(items, { visibleRows: 6, rowHeight: 13 });
    this.ui = { kind: 'item', actor };
  }

  // ------------------------------------------------------------- targeting

  private beginTargeting(actor: Combatant, pending: PendingAction): void {
    const candidates = selectableTargets(pending.targetKind, actor, this.battle.all);

    // Nothing to point at: either it's a whole-side effect or there are no
    // valid targets at all, so submit immediately.
    if (!needsCursor(pending.targetKind) || candidates.length === 0) {
      this.submitPending(actor, pending, candidates[0]);
      return;
    }

    this.targetCandidates = candidates;
    this.targetIndex = 0;
    this.ui = { kind: 'target', actor, pending };
  }

  private updateTargeting(game: Game): void {
    if (this.ui.kind !== 'target') return;

    // Targets can die between opening the cursor and confirming.
    this.targetCandidates = this.targetCandidates.filter(
      (c) => (this.ui.kind === 'target' && this.ui.pending.targetKind === 'deadAlly') === !c.alive,
    );
    if (this.targetCandidates.length === 0) {
      this.openCommandMenu(this.ui.actor);
      return;
    }
    this.targetIndex = Math.min(this.targetIndex, this.targetCandidates.length - 1);

    const input = game.input;
    if (input.repeat('right') || input.repeat('down')) {
      this.targetIndex = (this.targetIndex + 1) % this.targetCandidates.length;
    }
    if (input.repeat('left') || input.repeat('up')) {
      this.targetIndex = (this.targetIndex - 1 + this.targetCandidates.length) % this.targetCandidates.length;
    }

    if (input.pressed('cancel')) {
      const { actor, pending } = this.ui;
      if (pending.kind === 'tech') this.openTechMenu(actor);
      else if (pending.kind === 'item') this.openItemMenu(game, actor);
      else this.openCommandMenu(actor);
      return;
    }

    if (input.pressed('confirm')) {
      this.submitPending(this.ui.actor, this.ui.pending, this.targetCandidates[this.targetIndex]);
    }
  }

  private submitPending(actor: Combatant, pending: PendingAction, chosen: Combatant | undefined): void {
    switch (pending.kind) {
      case 'attack': {
        if (!chosen) return;
        this.battle.submit(this.battle.buildAttack(actor, chosen));
        break;
      }
      case 'tech': {
        if (!pending.tech) return;
        this.battle.submit(this.battle.buildTech(actor, pending.tech, chosen, pending.partners ?? []));
        break;
      }
      case 'item': {
        if (!pending.itemId) return;
        // Spend the item at submit time so it can't be used twice.
        this.pendingItemConsumption.push(pending.itemId);
        this.battle.submit(this.battle.buildItem(actor, pending.itemId, chosen));
        break;
      }
    }
    this.ui = { kind: 'watching' };
  }

  private pendingItemConsumption: string[] = [];

  // ---------------------------------------------------------------- events

  private consumeEvents(game: Game): void {
    for (const event of this.battle.drainEvents()) {
      this.handleEvent(event, game);
    }

    // Remove any items that were committed to an action this frame.
    while (this.pendingItemConsumption.length > 0) {
      const itemId = this.pendingItemConsumption.shift()!;
      game.state.removeItem(itemId, 1);
    }
  }

  private handleEvent(event: BattleEvent, game: Game): void {
    switch (event.kind) {
      case 'message':
        this.setMessage(event.text);
        return;

      case 'damage': {
        const color = event.critical ? '#ffe066' : ELEMENT_COLORS[event.element];
        this.effects.float(String(event.amount), event.target.x, event.target.y - event.target.height, color, event.critical);
        return;
      }

      case 'heal':
        this.effects.float(`+${event.amount}`, event.target.x, event.target.y - event.target.height, '#9be36b');
        return;

      case 'mp':
        this.effects.float(`+${event.amount} MP`, event.target.x, event.target.y - event.target.height, '#7fd8ff');
        return;

      case 'miss':
        this.effects.float('miss', event.target.x, event.target.y - event.target.height, '#c8c8d8');
        return;

      case 'immune':
        this.effects.float('no effect', event.target.x, event.target.y - event.target.height, '#c8c8d8');
        return;

      case 'statusApplied': {
        const def = STATUSES[event.status];
        this.effects.float(def.abbrev, event.target.x, event.target.y - event.target.height - 8, def.color);
        return;
      }

      case 'statusExpired':
        return;

      case 'revived':
        this.effects.float('revived', event.target.x, event.target.y - event.target.height, '#ffe9a8');
        return;

      case 'defeated':
        if (event.target.side === 'enemy') this.effects.shake(2);
        return;

      case 'attackStart': {
        // Lunge towards the target so a plain attack still reads as an action.
        const direction = event.target.x > event.actor.x ? 1 : -1;
        event.actor.offsetX = direction * 10;
        this.effects.spawn(
          { shape: 'slash', color: '#f2f2f2' },
          event.target.x,
          event.target.y - event.target.height / 2,
        );
        return;
      }

      case 'techStart': {
        const tech = getTech(event.techId);
        for (const target of event.targets) {
          this.effects.spawn(tech.fx, target.x, target.y - target.height / 2);
        }
        if (event.targets.length === 0) {
          this.effects.spawn(tech.fx, event.actor.x, event.actor.y - event.actor.height / 2);
        }
        for (const participant of [event.actor, ...event.partners]) {
          participant.offsetY = -6;
        }
        return;
      }

      case 'shake':
        this.effects.shake(event.strength);
        return;
    }
    // `game` is used by callers of this method; referenced here to keep the
    // signature stable as more events start needing party state.
    void game;
  }

  private setMessage(text: string): void {
    this.message = text;
    this.messageTimer = 2.2;
  }

  // ----------------------------------------------------------- resolution

  private handleFinish(game: Game): void {
    if (this.exiting || this.ui.kind === 'results') return;

    const outcome = this.battle.outcome;
    if (outcome === 'victory') {
      this.awardRewards(game);
      this.ui = { kind: 'results' };
      return;
    }
    if (outcome === 'escaped') {
      this.leave(game, 'escaped');
      return;
    }
    this.leave(game, 'defeat');
  }

  private awardRewards(game: Game): void {
    const rewards = this.battle.rewards;
    game.state.gold += rewards.gold;
    for (const item of rewards.items) game.state.addItem(item);

    this.levelUps = [];
    for (const member of game.state.activeParty) {
      if (!member.alive) continue; // the fallen learn nothing
      const result = member.gainExp(rewards.exp);
      if (result) this.levelUps.push(result);
    }
  }

  private leave(game: Game, outcome: BattleOutcome): void {
    if (this.exiting) return;
    this.exiting = true;
    this.fader.fadeOut(() => {
      const result: BattleSceneResult = { outcome, fieldEnemyId: this.options.fieldEnemyId };
      game.scenes.pop(result);
    }, 3.2);
  }

  // ---------------------------------------------------------------- render

  render(r: Renderer, game: Game): void {
    const shake = this.effects.shakeOffset;
    r.ctx.save();
    r.ctx.translate(shake.x, shake.y);

    this.renderBackground(r, game);
    this.renderCombatants(r, game);
    this.effects.render(r);

    r.ctx.restore();

    this.renderHud(r, game);
    this.renderMenus(r, game);
    this.effects.renderText(r, game.fontSmall, game.font);
    this.renderMessage(r, game);

    if (this.ui.kind === 'results') this.renderResults(r, game);

    this.fader.render(r);
  }

  private renderBackground(r: Renderer, game: Game): void {
    const background = game.assets.tryImage(this.battle.encounter.background);
    if (background) r.sprite(background, 0, 0, VIRTUAL_W, VIRTUAL_H, 0, 0);
    else r.clear('#1c2436');
  }

  private renderCombatants(r: Renderer, game: Game): void {
    const drawOrder = [...this.battle.all].sort((a, b) => a.y - b.y);

    for (const combatant of drawOrder) {
      const sheet = game.assets.tryImage(combatant.spriteKey);
      if (!sheet) continue;

      // Dead party members lie where they fell; dead enemies are removed.
      if (!combatant.alive && combatant.side === 'enemy') continue;

      const idleBob = combatant.alive ? Math.sin(this.time * 2.6 + combatant.x * 0.05) * 1.2 : 0;
      const x = combatant.x - combatant.width / 2 + combatant.offsetX;
      const y = combatant.y - combatant.height + combatant.offsetY + idleBob;

      const flashing = combatant.flash > 0;
      const options = flashing ? { tint: '#ffffff', tintAmount: 0.75 } : {};

      if (combatant.side === 'party') {
        const frame = this.partyFrame(combatant);
        r.sprite(
          sheet,
          frame * BATTLE_SPRITE_W,
          0,
          BATTLE_SPRITE_W,
          BATTLE_SPRITE_H,
          x,
          y,
          { ...options, alpha: combatant.alive ? 1 : 0.45 },
        );
      } else {
        r.sprite(sheet, 0, 0, combatant.width, combatant.height, x, y, options);
      }

      this.renderStatusTags(r, game, combatant);

      // Ease the lunge/hop offsets back to rest.
      combatant.offsetX *= 0.86;
      combatant.offsetY *= 0.86;
    }
  }

  private partyFrame(combatant: Combatant): number {
    if (!combatant.alive) return BATTLE_FRAMES.hurt;
    if (combatant.flash > 0) return BATTLE_FRAMES.hurt;
    if (Math.abs(combatant.offsetX) > 3) return BATTLE_FRAMES.attack;
    if (combatant.atb >= 1) return BATTLE_FRAMES.ready;
    return BATTLE_FRAMES.idle;
  }

  private renderStatusTags(r: Renderer, game: Game, combatant: Combatant): void {
    if (combatant.statuses.length === 0 || !combatant.alive) return;

    let x = combatant.x - (combatant.statuses.length * 11) / 2;
    const y = combatant.y - combatant.height - 9;
    for (const status of combatant.statuses) {
      const def = STATUSES[status.id];
      game.fontSmall.draw(r.ctx, def.abbrev, x, y, def.color);
      x += 11;
    }
  }

  /** Bottom bar: one row per party member with HP, MP and the ATB gauge. */
  private renderHud(r: Renderer, game: Game): void {
    drawWindow(r, HUD_X, HUD_Y, HUD_W, HUD_H);

    this.battle.party.forEach((combatant, index) => {
      const y = HUD_Y + 6 + index * HUD_ROW_H;
      const accent = combatant.member?.def.color ?? '#ffffff';
      const dead = !combatant.alive;

      game.font.drawShadowed(r.ctx, combatant.name, HUD_X + 8, y, dead ? '#8a8698' : accent);

      // HP
      game.fontSmall.drawRight(r.ctx, `${combatant.hp}`, HUD_X + 132, y + 1, dead ? '#8a8698' : '#ffffff');
      game.fontSmall.draw(r.ctx, `/${combatant.maxHp}`, HUD_X + 134, y + 1, '#8f9ac0');
      drawGauge(r, HUD_X + 176, y + 3, 60, 5, combatant.hpFraction, hpColor(combatant.hpFraction));

      // MP
      game.fontSmall.drawRight(r.ctx, `${combatant.mp}`, HUD_X + 264, y + 1, '#9fd0ff');
      drawGauge(r, HUD_X + 270, y + 3, 34, 5, combatant.maxMp > 0 ? combatant.mp / combatant.maxMp : 0, '#3d7fd8');

      // ATB — flashes when full so a ready character is impossible to miss.
      const full = combatant.atb >= 1;
      const atbColor = full && Math.sin(this.time * 9) > 0 ? '#ffffff' : full ? '#ffe066' : '#c88a3d';
      drawGauge(r, HUD_X + 312, y + 3, 54, 5, combatant.atb, atbColor);

      if (this.ui.kind !== 'watching' && 'actor' in this.ui && this.ui.actor === combatant) {
        drawCursor(r, HUD_X + 1, y + 1, this.time);
      }
    });
  }

  private renderMenus(r: Renderer, game: Game): void {
    switch (this.ui.kind) {
      case 'command': {
        drawWindow(r, MENU_X, COMMAND_Y, COMMAND_W, 77);
        this.commandMenu?.render(r, game.font, MENU_X + 6, COMMAND_Y + 6, COMMAND_W - 12);
        return;
      }

      case 'tech': {
        drawWindow(r, MENU_X, LIST_Y, 168, LIST_H);
        this.techMenu?.render(r, game.font, MENU_X + 6, LIST_Y + 6, 156);
        this.renderTechDescription(r, game, MENU_X, DESC_Y);
        return;
      }

      case 'item': {
        drawWindow(r, MENU_X, LIST_Y, 150, LIST_H);
        this.itemMenu?.render(r, game.font, MENU_X + 6, LIST_Y + 6, 138);
        const selected = this.itemMenu?.selectedValue;
        if (selected) this.renderDescription(r, game, getItem(selected).desc, MENU_X, DESC_Y);
        return;
      }

      case 'target': {
        this.renderTargetCursor(r, game);
        return;
      }

      default:
        return;
    }
  }

  private renderTechDescription(r: Renderer, game: Game, x: number, y: number): void {
    const choice = this.techMenu?.selectedValue;
    if (!choice) return;

    let text = choice.tech.desc;
    if (choice.partners.length > 0) {
      text = `[${[this.currentActorName(), ...choice.partners.map((p) => p.name)].join(' + ')}] ${text}`;
    }
    this.renderDescription(r, game, text, x, y);
  }

  private currentActorName(): string {
    return 'actor' in this.ui ? this.ui.actor.name : '';
  }

  private renderDescription(r: Renderer, game: Game, text: string, x: number, y: number): void {
    const width = 240;
    const lines = game.font.wrap(text, width - 12).slice(0, 2);
    const height = lines.length * game.font.lineHeight + 10;

    drawWindow(r, x, y - 2, width, height, PANEL_STYLE);
    lines.forEach((line, index) => {
      game.font.draw(r.ctx, line, x + 6, y + 3 + index * game.font.lineHeight, '#d6ddf2');
    });
  }

  /**
   * Targeting cursor. For area and line techs, everything that would be caught
   * in the splash is highlighted too, so the positional choice is visible
   * before committing.
   */
  private renderTargetCursor(r: Renderer, game: Game): void {
    if (this.ui.kind !== 'target') return;

    const chosen = this.targetCandidates[this.targetIndex];
    if (!chosen) return;

    const splash = resolveTargets(this.ui.pending.targetKind, this.ui.actor, chosen, this.battle.all, {
      radius: this.ui.pending.tech?.radius,
    });

    for (const target of splash) {
      const primary = target === chosen;
      const y = target.y - target.height - 12;
      if (primary) {
        drawTargetCursor(r, target.x, y, this.time);
        game.fontSmall.drawCentered(r.ctx, target.name, target.x, y - 12, '#ffe066', '#12121b');
      } else {
        // Secondary targets get a dimmer bracket.
        r.strokeRect(target.x - target.width / 2 - 2, target.y - target.height - 2, target.width + 4, target.height + 4, '#ffe06688');
      }
    }
  }

  private renderMessage(r: Renderer, game: Game): void {
    if (this.messageTimer <= 0 || !this.message) return;

    const width = game.font.measure(this.message) + 16;
    const x = (VIRTUAL_W - width) / 2;
    drawWindow(r, x, 6, width, 18);
    game.font.drawCentered(r.ctx, this.message, VIRTUAL_W / 2, 10, '#ffffff', '#12121b');
  }

  private renderResults(r: Renderer, game: Game): void {
    const rewards = this.battle.rewards;
    const width = 200;
    const lines: { text: string; color: string }[] = [
      { text: `${rewards.exp} EXP`, color: '#ffffff' },
      { text: `${rewards.gold} drachma`, color: '#ffe066' },
    ];

    for (const item of rewards.items) {
      lines.push({ text: `Found ${getItem(item).name}`, color: '#9be36b' });
    }
    for (const levelUp of this.levelUps) {
      lines.push({ text: `${levelUp.member.name} reached level ${levelUp.to}!`, color: '#7fd8ff' });
      for (const techId of levelUp.learned) {
        lines.push({ text: `  learned ${getTech(techId).name}`, color: '#ff9ad5' });
      }
    }

    const height = 34 + lines.length * game.font.lineHeight;
    const x = (VIRTUAL_W - width) / 2;
    const y = 40;

    drawWindow(r, x, y, width, height);
    game.font.drawCentered(r.ctx, 'Victory', x + width / 2, y + 8, '#ffe9a8', '#12121b');

    lines.forEach((line, index) => {
      game.font.draw(r.ctx, line.text, x + 14, y + 26 + index * game.font.lineHeight, line.color);
    });

    if (Math.sin(this.time * 5) > 0) {
      game.fontSmall.drawCentered(r.ctx, 'press confirm', x + width / 2, y + height - 12, '#b9c4e8');
    }
  }
}

function hpColor(fraction: number): string {
  if (fraction <= 0.25) return '#e05555';
  if (fraction <= 0.5) return '#e0b055';
  return '#5cc86a';
}
