import { TILE } from '../config';
import type { Assets } from '../core/assets';
import type { Renderer } from '../render/renderer';
import { FACING_ROWS } from '../art/placeholder';
import type { Facing, TileMap } from './tilemap';

export const FIELD_SPRITE_W = 16;
export const FIELD_SPRITE_H = 24;

/** Walk cycle order: neutral, step, neutral, other step. */
const FRAME_SEQUENCE = [0, 1, 2, 3];
const FRAME_DURATION = 0.14;

/**
 * A moving thing on the map: the player, an NPC, a roaming enemy.
 *
 * Position is in pixels at the sprite's feet, and collision uses a small box
 * around the feet rather than the whole sprite, so characters can overlap
 * scenery above their waist. That's what makes tile maps feel right.
 */
export class FieldEntity {
  x: number;
  y: number;
  facing: Facing = 'down';
  speed = 62;
  spriteKey: string;

  /** Feet collision box, relative to `x`/`y`. */
  hitboxW = 10;
  hitboxH = 8;

  /** Set false to make the entity walk through walls and other entities. */
  solid = true;

  private animTime = 0;
  private moving = false;

  constructor(spriteKey: string, tx: number, ty: number) {
    this.spriteKey = spriteKey;
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE;
  }

  get tileX(): number {
    return Math.floor(this.x / TILE);
  }

  get tileY(): number {
    return Math.floor((this.y - 1) / TILE);
  }

  /** Top-left of the feet collision box for a given position. */
  private boxAt(x: number, y: number): { x: number; y: number } {
    return { x: x - this.hitboxW / 2, y: y - this.hitboxH };
  }

  /**
   * Move by a delta, sliding along walls.
   *
   * Axes are resolved separately so walking diagonally into a wall slides
   * along it instead of stopping dead, which is the difference between a map
   * that feels smooth and one that feels sticky.
   */
  moveBy(dx: number, dy: number, map: TileMap, blockers: FieldEntity[] = []): void {
    if (dx === 0 && dy === 0) {
      this.moving = false;
      return;
    }
    this.moving = true;

    if (dx !== 0) {
      const nextX = this.x + dx;
      if (!this.blocked(nextX, this.y, map, blockers)) this.x = nextX;
    }
    if (dy !== 0) {
      const nextY = this.y + dy;
      if (!this.blocked(this.x, nextY, map, blockers)) this.y = nextY;
    }
  }

  private blocked(x: number, y: number, map: TileMap, blockers: FieldEntity[]): boolean {
    if (!this.solid) return false;

    const box = this.boxAt(x, y);
    if (map.boxCollides(box.x, box.y, this.hitboxW, this.hitboxH)) return true;

    for (const other of blockers) {
      if (other === this || !other.solid) continue;
      const otherBox = other.boxAt(other.x, other.y);
      const overlaps =
        box.x < otherBox.x + other.hitboxW &&
        box.x + this.hitboxW > otherBox.x &&
        box.y < otherBox.y + other.hitboxH &&
        box.y + this.hitboxH > otherBox.y;
      if (overlaps) return true;
    }
    return false;
  }

  /** Set facing from a movement vector, preferring horizontal on diagonals. */
  faceFromVector(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) >= Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
    else this.facing = dy > 0 ? 'down' : 'up';
  }

  /** The tile directly in front of this entity, used for interaction. */
  facingTile(): { tx: number; ty: number } {
    const tx = this.tileX;
    const ty = this.tileY;
    switch (this.facing) {
      case 'up':
        return { tx, ty: ty - 1 };
      case 'down':
        return { tx, ty: ty + 1 };
      case 'left':
        return { tx: tx - 1, ty };
      case 'right':
        return { tx: tx + 1, ty };
    }
  }

  /** Straight-line distance in pixels to another entity. */
  distanceTo(other: FieldEntity): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  update(dt: number): void {
    this.animTime = this.moving ? this.animTime + dt : 0;
    this.moving = false; // re-set by the next moveBy call
  }

  private get frame(): number {
    if (this.animTime <= 0) return 0;
    const step = Math.floor(this.animTime / FRAME_DURATION) % FRAME_SEQUENCE.length;
    return FRAME_SEQUENCE[step]!;
  }

  render(r: Renderer, assets: Assets): void {
    const sheet = assets.tryImage(this.spriteKey);
    if (!sheet) return;

    const row = FACING_ROWS[this.facing];
    r.sprite(
      sheet,
      this.frame * FIELD_SPRITE_W,
      row * FIELD_SPRITE_H,
      FIELD_SPRITE_W,
      FIELD_SPRITE_H,
      this.x - FIELD_SPRITE_W / 2,
      this.y - FIELD_SPRITE_H,
    );
  }
}

/** Draw entities back-to-front so lower ones overlap higher ones. */
export function renderSorted(entities: FieldEntity[], r: Renderer, assets: Assets): void {
  [...entities].sort((a, b) => a.y - b.y).forEach((entity) => entity.render(r, assets));
}
