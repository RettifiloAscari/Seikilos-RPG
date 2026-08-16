import type { Assets } from '../core/assets';
import { TILE, VIRTUAL_H, VIRTUAL_W } from '../config';
import { ACTORS } from '../data/actors';
import { ENEMIES } from '../data/enemies';
import { circle, ellipse, outline, px, rect, shade, speckle, surface, triangle, verticalGradient, type Surface } from './pixels';

/**
 * Procedural stand-in art.
 *
 * Everything here registers under the same asset keys that real artwork will
 * use, so replacing a placeholder is a matter of loading a PNG into that key
 * (see `loadArt` in `src/art/index.ts`) — no gameplay code changes.
 *
 * The goal is legibility, not beauty: silhouettes should read at a glance so
 * systems can be tested and tuned long before final art exists.
 */

/** Tile indices in the generated tileset, in draw order. */
export const TILES = {
  VOID: 0,
  GRASS: 1,
  GRASS_ALT: 2,
  STONE_FLOOR: 3,
  STONE_FLOOR_CRACKED: 4,
  PATH: 5,
  WALL: 6,
  WALL_TOP: 7,
  WATER: 8,
  PILLAR_BASE: 9,
  PILLAR_TOP: 10,
  RUBBLE: 11,
  STAIRS: 12,
  GRASS_FLOWER: 13,
} as const;

export const TILESET_COLUMNS = 8;
const TILE_COUNT = 14;

export function generatePlaceholderArt(assets: Assets): void {
  assets.register('tileset.ruins', buildTileset());

  for (const actor of ACTORS) {
    assets.register(actor.fieldSprite, buildFieldSprite(actor.color));
    assets.register(actor.battleSprite, buildBattleSprite(actor.color));
  }

  for (const enemy of ENEMIES) {
    assets.register(enemy.sprite, buildEnemySprite(enemy.id, enemy.size.w, enemy.size.h));
  }

  assets.register('battlebg.ruins', buildBattleBackground('#2b3b52', '#6d5f4a'));
  assets.register('battlebg.sanctum', buildBattleBackground('#241d38', '#4a3c5c'));
  assets.register('npc.generic', buildFieldSprite('#9aa7c7'));
  assets.register('title.emblem', buildEmblem());
}

// ---------------------------------------------------------------- tileset

function buildTileset(): HTMLCanvasElement {
  const rows = Math.ceil(TILE_COUNT / TILESET_COLUMNS);
  const s = surface(TILESET_COLUMNS * TILE, rows * TILE);

  for (let index = 0; index < TILE_COUNT; index++) {
    const ox = (index % TILESET_COLUMNS) * TILE;
    const oy = Math.floor(index / TILESET_COLUMNS) * TILE;
    drawTile(s, index, ox, oy);
  }
  return s.canvas;
}

function drawTile(s: Surface, index: number, ox: number, oy: number): void {
  switch (index) {
    case TILES.VOID:
      rect(s, ox, oy, TILE, TILE, '#0b0d14');
      break;

    case TILES.GRASS:
      rect(s, ox, oy, TILE, TILE, '#4a7a3f');
      speckle(s, ox, oy, TILE, TILE, '#568c48', 0.22, 1);
      speckle(s, ox, oy, TILE, TILE, '#3e6835', 0.14, 2);
      break;

    case TILES.GRASS_ALT:
      rect(s, ox, oy, TILE, TILE, '#456f3b');
      speckle(s, ox, oy, TILE, TILE, '#517f43', 0.3, 3);
      break;

    case TILES.GRASS_FLOWER:
      rect(s, ox, oy, TILE, TILE, '#4a7a3f');
      speckle(s, ox, oy, TILE, TILE, '#568c48', 0.2, 4);
      px(s, ox + 4, oy + 6, '#e8dc7a');
      px(s, ox + 11, oy + 10, '#e8a0c0');
      px(s, ox + 7, oy + 12, '#e8dc7a');
      break;

    case TILES.STONE_FLOOR:
      rect(s, ox, oy, TILE, TILE, '#8a8272');
      // Mortar lines make the grid readable while walking.
      px(s, ox, oy, '#6f685b', TILE, 1);
      px(s, ox, oy, '#6f685b', 1, TILE);
      speckle(s, ox + 1, oy + 1, TILE - 1, TILE - 1, '#948b7a', 0.18, 5);
      break;

    case TILES.STONE_FLOOR_CRACKED:
      rect(s, ox, oy, TILE, TILE, '#837b6c');
      px(s, ox, oy, '#6f685b', TILE, 1);
      px(s, ox, oy, '#6f685b', 1, TILE);
      px(s, ox + 4, oy + 5, '#6a6357');
      px(s, ox + 5, oy + 6, '#6a6357');
      px(s, ox + 6, oy + 7, '#6a6357');
      px(s, ox + 7, oy + 9, '#6a6357');
      px(s, ox + 10, oy + 3, '#6a6357');
      break;

    case TILES.PATH:
      rect(s, ox, oy, TILE, TILE, '#9c8c6e');
      speckle(s, ox, oy, TILE, TILE, '#a89a7a', 0.16, 6);
      speckle(s, ox, oy, TILE, TILE, '#8b7c60', 0.18, 7);
      break;

    case TILES.WALL:
      rect(s, ox, oy, TILE, TILE, '#5c5750');
      // Two courses of blocks, offset like real masonry.
      px(s, ox, oy + 7, '#413d38', TILE, 1);
      px(s, ox + 5, oy, '#413d38', 1, 8);
      px(s, ox + 11, oy + 8, '#413d38', 1, 8);
      speckle(s, ox, oy, TILE, TILE, '#66605a', 0.12, 8);
      break;

    case TILES.WALL_TOP:
      rect(s, ox, oy, TILE, TILE, '#7a736a');
      px(s, ox, oy, '#8e877d', TILE, 3);
      px(s, ox, oy + TILE - 2, '#4a4640', TILE, 2);
      break;

    case TILES.WATER:
      verticalGradient(s, ox, oy, TILE, TILE, '#2f6ea8', '#245a8c');
      px(s, ox + 2, oy + 5, '#5ea0d0', 5, 1);
      px(s, ox + 9, oy + 11, '#5ea0d0', 4, 1);
      break;

    case TILES.PILLAR_BASE:
      rect(s, ox, oy, TILE, TILE, '#4a7a3f');
      rect(s, ox + 3, oy, 10, TILE, '#b0a894');
      px(s, ox + 3, oy, '#c6bda6', 2, TILE);
      px(s, ox + 11, oy, '#8e8776', 2, TILE);
      px(s, ox + 2, oy + 13, '#9c9482', 12, 3);
      break;

    case TILES.PILLAR_TOP:
      rect(s, ox + 3, oy + 3, 10, TILE - 3, '#b0a894');
      px(s, ox + 3, oy + 3, '#c6bda6', 2, TILE - 3);
      px(s, ox + 11, oy + 3, '#8e8776', 2, TILE - 3);
      // Flared capital sitting on top of the shaft.
      px(s, ox + 2, oy + 1, '#c6bda6', 12, 3);
      outline(s, ox + 2, oy + 1, 12, 3, '#8e8776');
      break;

    case TILES.RUBBLE:
      rect(s, ox, oy, TILE, TILE, '#8a8272');
      px(s, ox, oy, '#6f685b', TILE, 1);
      circle(s, ox + 5, oy + 10, 3, '#a49b88');
      circle(s, ox + 11, oy + 7, 2, '#948b7a');
      px(s, ox + 8, oy + 13, '#7d7566', 4, 2);
      break;

    case TILES.STAIRS:
      rect(s, ox, oy, TILE, TILE, '#7d7566');
      for (let step = 0; step < 4; step++) {
        const y = oy + step * 4;
        px(s, ox, y, '#9c9482', TILE, 3);
        px(s, ox, y + 3, '#5f594e', TILE, 1);
      }
      break;
  }
}

// ------------------------------------------------------------ characters

const FIELD_W = 16;
const FIELD_H = 24;
/** Frame order per row: idle, step-left, idle, step-right. */
const WALK_FRAMES = 4;
/** Row order, matching the `Facing` type. */
export const FACING_ROWS = { down: 0, left: 1, right: 2, up: 3 } as const;

/**
 * A 4x4 walking spritesheet: four facings down the sheet, four frames across.
 * Kenney/LPC character sheets follow the same shape, so a real sheet slots in
 * with only the frame size changing.
 */
function buildFieldSprite(accent: string): HTMLCanvasElement {
  const s = surface(FIELD_W * WALK_FRAMES, FIELD_H * 4);

  for (const [facing, row] of Object.entries(FACING_ROWS)) {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      drawWalker(s, frame * FIELD_W, row * FIELD_H, facing as keyof typeof FACING_ROWS, frame, accent);
    }
  }
  return s.canvas;
}

function drawWalker(
  s: Surface,
  ox: number,
  oy: number,
  facing: keyof typeof FACING_ROWS,
  frame: number,
  accent: string,
): void {
  const skin = '#e8c39a';
  const hair = shade(accent, -0.35);
  const cloth = accent;
  const clothDark = shade(accent, -0.3);
  const boots = '#3b3630';

  // Frames 1 and 3 are the stepping poses; 0 and 2 are the neutral pose.
  const stepping = frame === 1 || frame === 3;
  const bob = stepping ? 1 : 0;
  const legSwing = frame === 1 ? 1 : frame === 3 ? -1 : 0;

  // Soft contact shadow keeps the sprite anchored to the ground.
  ellipse(s, ox + 8, oy + 22, 5, 2, 'rgba(0,0,0,0.25)');

  // Head
  rect(s, ox + 5, oy + 4 + bob, 6, 6, skin);
  rect(s, ox + 4, oy + 2 + bob, 8, 4, hair);
  px(s, ox + 4, oy + 5 + bob, hair, 1, 2);
  px(s, ox + 11, oy + 5 + bob, hair, 1, 2);

  // Face details, which is what actually sells the facing direction.
  if (facing === 'down') {
    px(s, ox + 6, oy + 7 + bob, '#2a2320');
    px(s, ox + 9, oy + 7 + bob, '#2a2320');
  } else if (facing === 'left') {
    px(s, ox + 6, oy + 7 + bob, '#2a2320');
    rect(s, ox + 8, oy + 2 + bob, 4, 6, hair);
  } else if (facing === 'right') {
    px(s, ox + 9, oy + 7 + bob, '#2a2320');
    rect(s, ox + 4, oy + 2 + bob, 4, 6, hair);
  } else {
    rect(s, ox + 4, oy + 2 + bob, 8, 7, hair);
  }

  // Torso
  rect(s, ox + 4, oy + 10 + bob, 8, 7, cloth);
  px(s, ox + 4, oy + 10 + bob, shade(accent, 0.25), 8, 1);
  px(s, ox + 4, oy + 16 + bob, clothDark, 8, 1);

  // Arms
  const armY = oy + 11 + bob;
  px(s, ox + 3, armY + (legSwing > 0 ? 1 : 0), skin, 1, 4);
  px(s, ox + 12, armY + (legSwing < 0 ? 1 : 0), skin, 1, 4);

  // Legs
  rect(s, ox + 5, oy + 17 + bob, 2, 4, clothDark);
  rect(s, ox + 9, oy + 17 + bob, 2, 4, clothDark);
  px(s, ox + 5, oy + 21 - (legSwing > 0 ? 1 : 0), boots, 2, 2);
  px(s, ox + 9, oy + 21 - (legSwing < 0 ? 1 : 0), boots, 2, 2);
}

/** Larger side-on sprite used in battle: idle, ready, attack, hurt. */
const BATTLE_W = 24;
const BATTLE_H = 32;
export const BATTLE_FRAMES = { idle: 0, ready: 1, attack: 2, hurt: 3 } as const;

function buildBattleSprite(accent: string): HTMLCanvasElement {
  const s = surface(BATTLE_W * 4, BATTLE_H);
  for (const [, frame] of Object.entries(BATTLE_FRAMES)) {
    drawBattler(s, frame * BATTLE_W, 0, frame, accent);
  }
  return s.canvas;
}

function drawBattler(s: Surface, ox: number, oy: number, frame: number, accent: string): void {
  const skin = '#e8c39a';
  const hair = shade(accent, -0.35);
  const cloth = accent;
  const clothDark = shade(accent, -0.3);

  const lean = frame === BATTLE_FRAMES.attack ? 3 : frame === BATTLE_FRAMES.ready ? 1 : 0;
  const drop = frame === BATTLE_FRAMES.hurt ? 2 : 0;

  ellipse(s, ox + 12, oy + 30, 8, 3, 'rgba(0,0,0,0.28)');

  // Head, angled slightly towards the enemy side (screen right).
  rect(s, ox + 9 + lean, oy + 5 + drop, 7, 7, skin);
  rect(s, ox + 8 + lean, oy + 3 + drop, 9, 4, hair);
  px(s, ox + 8 + lean, oy + 6 + drop, hair, 2, 4);
  px(s, ox + 14 + lean, oy + 9 + drop, '#2a2320');

  // Torso and cape
  rect(s, ox + 8 + lean, oy + 12 + drop, 9, 10, cloth);
  px(s, ox + 8 + lean, oy + 12 + drop, shade(accent, 0.25), 9, 1);
  rect(s, ox + 5 + lean, oy + 13 + drop, 3, 9, clothDark);

  // Legs
  rect(s, ox + 9 + lean, oy + 22 + drop, 3, 7, clothDark);
  rect(s, ox + 13 + lean, oy + 22 + drop, 3, 7, clothDark);
  px(s, ox + 8 + lean, oy + 28 + drop, '#3b3630', 4, 2);
  px(s, ox + 13 + lean, oy + 28 + drop, '#3b3630', 4, 2);

  // Weapon arm: raised when ready, extended on the attack frame.
  if (frame === BATTLE_FRAMES.attack) {
    px(s, ox + 17, oy + 12, skin, 3, 2);
    rect(s, ox + 19, oy + 6, 2, 12, '#d8dce8');
    px(s, ox + 18, oy + 16, '#8a7550', 4, 2);
  } else if (frame === BATTLE_FRAMES.ready) {
    px(s, ox + 17, oy + 14, skin, 2, 2);
    rect(s, ox + 18, oy + 4, 2, 12, '#d8dce8');
  } else {
    px(s, ox + 17, oy + 15, skin, 2, 3);
    rect(s, ox + 18, oy + 14, 2, 9, '#b8bccc');
  }
}

// ---------------------------------------------------------------- enemies

/**
 * Distinct silhouettes per enemy id, so a fight reads correctly even in
 * placeholder form. Unknown ids fall back to a generic blob.
 */
function buildEnemySprite(id: string, w: number, h: number): HTMLCanvasElement {
  const s = surface(w, h);
  ellipse(s, w / 2, h - 2, w * 0.36, 2.5, 'rgba(0,0,0,0.3)');

  switch (id) {
    case 'shardWisp': {
      const body = '#8fd8ff';
      triangle(s, w / 2, 2, w - 3, h / 2, w / 2, h - 4, body);
      triangle(s, w / 2, 2, 3, h / 2, w / 2, h - 4, shade(body, -0.25));
      circle(s, w / 2, h / 2 - 1, 3, '#ffffff');
      px(s, w / 2 - 3, h / 2 - 4, 'rgba(255,255,255,0.6)', 2, 2);
      break;
    }

    case 'graveMoth': {
      const wing = '#9a86b8';
      ellipse(s, w / 2 - 6, h / 2 - 2, 7, 6, wing);
      ellipse(s, w / 2 + 6, h / 2 - 2, 7, 6, wing);
      ellipse(s, w / 2 - 5, h / 2 - 3, 4, 3, shade(wing, 0.25));
      ellipse(s, w / 2 + 5, h / 2 - 3, 4, 3, shade(wing, 0.25));
      ellipse(s, w / 2, h / 2, 3, 7, '#4c4257');
      px(s, w / 2 - 2, h / 2 - 6, '#e8e0a0');
      px(s, w / 2 + 1, h / 2 - 6, '#e8e0a0');
      px(s, w / 2 - 3, h / 2 - 9, '#4c4257');
      px(s, w / 2 + 2, h / 2 - 9, '#4c4257');
      break;
    }

    case 'cinderHound': {
      const fur = '#a8442e';
      rect(s, 6, h - 14, w - 12, 8, fur);
      rect(s, w - 12, h - 18, 9, 8, fur); // head
      px(s, w - 5, h - 15, '#ffcf5c', 2, 2); // eye
      rect(s, 7, h - 6, 3, 5, shade(fur, -0.3));
      rect(s, 13, h - 6, 3, 5, shade(fur, -0.3));
      rect(s, w - 11, h - 6, 3, 5, shade(fur, -0.3));
      triangle(s, 6, h - 14, 1, h - 20, 8, h - 18, shade(fur, -0.2)); // tail
      speckle(s, 6, h - 14, w - 12, 8, '#ff8a3d', 0.12, 11);
      break;
    }

    case 'stoneSentry': {
      const stone = '#9a9384';
      rect(s, 4, 6, w - 8, h - 8, stone);
      px(s, 4, 6, shade(stone, 0.2), w - 8, 2);
      px(s, 4, h - 4, shade(stone, -0.3), w - 8, 2);
      rect(s, 8, 2, w - 16, 6, shade(stone, 0.1)); // head block
      px(s, 10, 4, '#5cc8ff', 3, 2);
      px(s, w - 13, 4, '#5cc8ff', 3, 2);
      // Carved seams
      px(s, 4, 16, shade(stone, -0.35), w - 8, 1);
      px(s, w / 2, 16, shade(stone, -0.35), 1, h - 22);
      speckle(s, 4, 6, w - 8, h - 8, shade(stone, -0.15), 0.08, 13);
      break;
    }

    case 'choragos': {
      const robe = '#3d3358';
      const trim = '#c8a84c';
      // Robed figure with raised arms, conducting.
      triangle(s, w / 2, 10, 2, h - 3, w - 2, h - 3, robe);
      px(s, 2, h - 6, shade(robe, -0.3), w - 4, 3);
      circle(s, w / 2, 9, 7, '#e8dcc0'); // mask
      px(s, w / 2 - 4, 7, '#221c33', 3, 2);
      px(s, w / 2 + 1, 7, '#221c33', 3, 2);
      px(s, w / 2 - 2, 13, '#221c33', 4, 1);
      // Arms
      rect(s, 6, 16, 4, 12, robe);
      rect(s, w - 10, 16, 4, 12, robe);
      px(s, 5, 12, trim, 6, 4);
      px(s, w - 11, 12, trim, 6, 4);
      // Trim
      px(s, w / 2 - 8, h - 14, trim, 16, 2);
      circle(s, w / 2, h - 22, 3, trim);
      break;
    }

    default: {
      const body = '#8a6fb0';
      ellipse(s, w / 2, h / 2 + 2, w * 0.35, h * 0.32, body);
      px(s, w / 2 - 4, h / 2, '#ffffff', 2, 2);
      px(s, w / 2 + 2, h / 2, '#ffffff', 2, 2);
      break;
    }
  }

  return s.canvas;
}

// ------------------------------------------------------------ backgrounds

function buildBattleBackground(sky: string, ground: string): HTMLCanvasElement {
  const s = surface(VIRTUAL_W, VIRTUAL_H);
  const horizon = 112;

  verticalGradient(s, 0, 0, VIRTUAL_W, horizon, shade(sky, 0.25), sky);
  verticalGradient(s, 0, horizon, VIRTUAL_W, VIRTUAL_H - horizon, shade(ground, 0.1), shade(ground, -0.35));

  // Distant broken columns to give the field some depth.
  for (let i = 0; i < 7; i++) {
    const x = 18 + i * 54;
    const height = 30 + ((i * 37) % 34);
    const width = 10;
    const tone = shade(sky, -0.25);
    rect(s, x, horizon - height, width, height, tone);
    px(s, x, horizon - height, shade(tone, 0.2), 2, height);
    px(s, x - 2, horizon - height - 3, shade(tone, 0.12), width + 4, 4);
  }

  // Ground texture and a soft vignette so sprites stay readable.
  speckle(s, 0, horizon, VIRTUAL_W, VIRTUAL_H - horizon, shade(ground, 0.18), 0.05, 21);
  speckle(s, 0, horizon, VIRTUAL_W, VIRTUAL_H - horizon, shade(ground, -0.25), 0.05, 22);
  px(s, 0, horizon, shade(ground, 0.3), VIRTUAL_W, 1);

  const vignette = s.ctx.createRadialGradient(
    VIRTUAL_W / 2,
    VIRTUAL_H / 2,
    VIRTUAL_H * 0.35,
    VIRTUAL_W / 2,
    VIRTUAL_H / 2,
    VIRTUAL_W * 0.7,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
  s.ctx.fillStyle = vignette;
  s.ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

  return s.canvas;
}

function buildEmblem(): HTMLCanvasElement {
  const s = surface(64, 64);
  // A lyre: two arms, a crossbar and strings.
  circle(s, 32, 40, 20, '#c8a84c');
  circle(s, 32, 40, 17, '#1a1626');
  rect(s, 12, 14, 5, 26, '#c8a84c');
  rect(s, 47, 14, 5, 26, '#c8a84c');
  rect(s, 12, 12, 40, 5, '#e0c46a');
  for (let i = 0; i < 5; i++) {
    rect(s, 19 + i * 6, 17, 1, 30, '#e8dcc0');
  }
  return s.canvas;
}
