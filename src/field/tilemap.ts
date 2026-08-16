import { TILE } from '../config';
import type { Assets } from '../core/assets';
import type { Renderer } from '../render/renderer';
import { TILESET_COLUMNS } from '../art/placeholder';

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface NpcDef {
  id: string;
  name: string;
  sprite?: string;
  /** Tile coordinates. */
  tx: number;
  ty: number;
  facing?: Facing;
  /** Lines spoken when talked to. Shown one message box at a time. */
  lines: string[];
  /** Alternative lines used once this flag is set. */
  flagLines?: { flag: string; lines: string[] }[];
  /** Wanders randomly around its start position within this tile radius. */
  wander?: number;
}

export interface ExitDef {
  /** Tile coordinates of the trigger. */
  tx: number;
  ty: number;
  /** How many tiles wide/tall the trigger is. */
  w?: number;
  h?: number;
  toMap: string;
  /** Tile coordinates to arrive at. */
  toX: number;
  toY: number;
  facing?: Facing;
}

/** An enemy visible on the field; touching it starts a battle. */
export interface FieldEnemyDef {
  id: string;
  /** Encounter to run on contact. */
  encounter: string;
  /** Sprite key, usually the lead enemy's. */
  sprite: string;
  tx: number;
  ty: number;
  /** Patrol radius in tiles. 0 stands still. */
  wander?: number;
  /** Flag set once defeated, so it stays gone. */
  defeatFlag?: string;
  /** Only appears when this flag is set. */
  requiresFlag?: string;
  size?: { w: number; h: number };
}

/** A tile the player can interact with (signs, chests, save points). */
export interface FieldObjectDef {
  id: string;
  kind: 'sign' | 'chest' | 'savePoint' | 'trigger';
  tx: number;
  ty: number;
  lines?: string[];
  /** For chests: what's inside. */
  item?: string;
  gold?: number;
  /** Flag recording that this has been used. */
  flag?: string;
  /** For `trigger`: fires on step rather than on Confirm. */
  onceFlag?: string;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  tileset: string;
  /** Background music key, when audio exists. */
  music?: string;
  /**
   * Tile layers, each `width * height` indices into the tileset.
   * `ground` is drawn first, `decor` over it, `above` over the player.
   */
  ground: number[];
  decor?: number[];
  above?: number[];
  /** 1 = solid. Same dimensions as the layers. */
  collision: number[];
  npcs?: NpcDef[];
  exits?: ExitDef[];
  enemies?: FieldEnemyDef[];
  objects?: FieldObjectDef[];
  /** Where the player starts if they enter without a specific destination. */
  spawn: { tx: number; ty: number; facing?: Facing };
  /** Tint applied over the whole map, e.g. for interiors. */
  ambient?: { color: string; alpha: number };
}

/**
 * Runtime wrapper around a `MapDef`: knows how to test collision and how to
 * draw only the tiles currently on screen.
 */
export class TileMap {
  readonly def: MapDef;

  constructor(def: MapDef) {
    this.def = def;
    const expected = def.width * def.height;
    // Catch authoring mistakes immediately rather than rendering garbage.
    if (def.ground.length !== expected) {
      throw new Error(`Map "${def.id}": ground layer has ${def.ground.length} tiles, expected ${expected}`);
    }
    if (def.collision.length !== expected) {
      throw new Error(`Map "${def.id}": collision layer has ${def.collision.length} tiles, expected ${expected}`);
    }
  }

  get widthPx(): number {
    return this.def.width * TILE;
  }

  get heightPx(): number {
    return this.def.height * TILE;
  }

  /** True if the tile blocks movement (out of bounds counts as solid). */
  solidAt(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.def.width || ty >= this.def.height) return true;
    return this.def.collision[ty * this.def.width + tx] === 1;
  }

  /** True if the pixel position is inside a solid tile. */
  solidAtPixel(x: number, y: number): boolean {
    return this.solidAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Axis-aligned box test against the collision grid. */
  boxCollides(x: number, y: number, w: number, h: number): boolean {
    const left = Math.floor(x / TILE);
    const right = Math.floor((x + w - 1) / TILE);
    const top = Math.floor(y / TILE);
    const bottom = Math.floor((y + h - 1) / TILE);

    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (this.solidAt(tx, ty)) return true;
      }
    }
    return false;
  }

  exitAt(tx: number, ty: number): ExitDef | undefined {
    return this.def.exits?.find((exit) => {
      const w = exit.w ?? 1;
      const h = exit.h ?? 1;
      return tx >= exit.tx && tx < exit.tx + w && ty >= exit.ty && ty < exit.ty + h;
    });
  }

  objectAt(tx: number, ty: number): FieldObjectDef | undefined {
    return this.def.objects?.find((obj) => obj.tx === tx && obj.ty === ty);
  }

  /** Draw a tile layer, clipped to what the camera can see. */
  drawLayer(r: Renderer, assets: Assets, layer: number[] | undefined): void {
    if (!layer) return;

    const tileset = assets.image(this.def.tileset);
    const startX = Math.max(0, Math.floor(r.camX / TILE));
    const startY = Math.max(0, Math.floor(r.camY / TILE));
    const endX = Math.min(this.def.width - 1, Math.floor((r.camX + r.width) / TILE));
    const endY = Math.min(this.def.height - 1, Math.floor((r.camY + r.height) / TILE));

    for (let ty = startY; ty <= endY; ty++) {
      for (let tx = startX; tx <= endX; tx++) {
        const index = layer[ty * this.def.width + tx];
        // -1 means "nothing here", used heavily by the decor and above layers.
        if (index === undefined || index < 0) continue;

        const sx = (index % TILESET_COLUMNS) * TILE;
        const sy = Math.floor(index / TILESET_COLUMNS) * TILE;
        r.sprite(tileset, sx, sy, TILE, TILE, tx * TILE, ty * TILE);
      }
    }
  }

  drawGround(r: Renderer, assets: Assets): void {
    this.drawLayer(r, assets, this.def.ground);
    this.drawLayer(r, assets, this.def.decor);
  }

  drawAbove(r: Renderer, assets: Assets): void {
    this.drawLayer(r, assets, this.def.above);
  }
}

/**
 * Build a layer array from an ASCII map, which is far easier to author and
 * review in a diff than a flat list of numbers.
 *
 * Every row must be the same length, and each character maps to a tile index
 * through `legend`. A character missing from the legend becomes -1 (empty).
 */
export function layerFromAscii(rows: string[], legend: Record<string, number>): number[] {
  const width = rows[0]?.length ?? 0;
  const out: number[] = [];

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`ASCII map row ${y} is ${row.length} chars, expected ${width}`);
    }
    for (const char of row) {
      out.push(legend[char] ?? -1);
    }
  });
  return out;
}

/** Build a collision array from an ASCII map: any char in `solid` blocks. */
export function collisionFromAscii(rows: string[], solid: string): number[] {
  const out: number[] = [];
  for (const row of rows) {
    for (const char of row) out.push(solid.includes(char) ? 1 : 0);
  }
  return out;
}
