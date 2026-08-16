import type { Input } from '../core/input';
import type { BitmapFont } from '../render/font';
import type { Renderer } from '../render/renderer';
import { drawCursor } from './window';

export interface MenuItem<T = unknown> {
  label: string;
  /** Right-aligned secondary text: a price, a count, an MP cost. */
  detail?: string;
  /** Greyed out and unselectable. */
  disabled?: boolean;
  /** Payload handed back to the caller on confirm. */
  value?: T;
  /** Overrides the normal label colour. */
  color?: string;
}

export type MenuResult = 'confirm' | 'cancel' | 'move' | null;

export interface MenuLayout {
  /** Rows visible at once before the list scrolls. */
  visibleRows?: number;
  rowHeight?: number;
  columns?: number;
  columnWidth?: number;
  /** Wrap from the last row back to the first. */
  wrap?: boolean;
}

/**
 * A scrolling, optionally multi-column list with a blinking cursor.
 *
 * Used for battle commands, tech lists, inventories and shops. The caller owns
 * the items and reads `index` after a `'confirm'`.
 */
export class ListMenu<T = unknown> {
  index = 0;
  scroll = 0;
  items: MenuItem<T>[];

  readonly visibleRows: number;
  readonly rowHeight: number;
  readonly columns: number;
  readonly columnWidth: number;
  readonly wrap: boolean;

  private time = 0;

  constructor(items: MenuItem<T>[], layout: MenuLayout = {}) {
    this.items = items;
    this.visibleRows = layout.visibleRows ?? 6;
    this.rowHeight = layout.rowHeight ?? 13;
    this.columns = Math.max(1, layout.columns ?? 1);
    this.columnWidth = layout.columnWidth ?? 100;
    this.wrap = layout.wrap ?? true;
    this.snapToSelectable(1);
  }

  get selected(): MenuItem<T> | undefined {
    return this.items[this.index];
  }

  get selectedValue(): T | undefined {
    return this.items[this.index]?.value;
  }

  /** Replace the contents, keeping the cursor in range. */
  setItems(items: MenuItem<T>[]): void {
    this.items = items;
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    this.snapToSelectable(1);
    this.clampScroll();
  }

  /** Total rows once items are laid out across columns. */
  get rowCount(): number {
    return Math.ceil(this.items.length / this.columns);
  }

  update(dt: number, input: Input): MenuResult {
    this.time += dt;
    if (this.items.length === 0) {
      return input.pressed('cancel') ? 'cancel' : null;
    }

    const before = this.index;

    if (input.repeat('down')) this.move(this.columns);
    if (input.repeat('up')) this.move(-this.columns);
    if (this.columns > 1) {
      if (input.repeat('right')) this.move(1);
      if (input.repeat('left')) this.move(-1);
    }

    this.clampScroll();

    if (input.pressed('cancel')) return 'cancel';
    if (input.pressed('confirm')) {
      const item = this.items[this.index];
      // Confirming a disabled row is simply ignored.
      if (item && !item.disabled) return 'confirm';
      return null;
    }
    return this.index !== before ? 'move' : null;
  }

  private move(delta: number): void {
    if (this.items.length === 0) return;
    const count = this.items.length;
    let next = this.index + delta;

    if (this.wrap) {
      next = ((next % count) + count) % count;
    } else {
      next = Math.max(0, Math.min(count - 1, next));
    }

    this.index = next;
    this.snapToSelectable(Math.sign(delta) || 1);
  }

  /** Skip past disabled rows so the cursor never rests on one. */
  private snapToSelectable(direction: number): void {
    if (this.items.length === 0) return;
    for (let attempts = 0; attempts < this.items.length; attempts++) {
      if (!this.items[this.index]?.disabled) return;
      this.index = (this.index + direction + this.items.length) % this.items.length;
    }
    // Every row is disabled; leave the cursor where it is.
  }

  private clampScroll(): void {
    const row = Math.floor(this.index / this.columns);
    if (row < this.scroll) this.scroll = row;
    if (row >= this.scroll + this.visibleRows) this.scroll = row - this.visibleRows + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.rowCount - this.visibleRows)));
  }

  render(r: Renderer, font: BitmapFont, x: number, y: number, width?: number): void {
    const colWidth = width !== undefined ? width / this.columns : this.columnWidth;

    for (let row = 0; row < this.visibleRows; row++) {
      const dataRow = this.scroll + row;
      if (dataRow >= this.rowCount) break;

      for (let col = 0; col < this.columns; col++) {
        const itemIndex = dataRow * this.columns + col;
        const item = this.items[itemIndex];
        if (!item) continue;

        const itemX = x + col * colWidth;
        const itemY = y + row * this.rowHeight;
        const selected = itemIndex === this.index;

        const color = item.disabled ? '#6f6a80' : (item.color ?? '#ffffff');
        font.drawShadowed(r.ctx, item.label, itemX + 9, itemY, color);

        if (item.detail) {
          const detailColor = item.disabled ? '#5c5870' : '#b9c4e8';
          font.drawRight(r.ctx, item.detail, itemX + colWidth - 4, itemY, detailColor, '#12121b');
        }

        if (selected) drawCursor(r, itemX, itemY + 2, this.time);
      }
    }

    this.drawScrollHints(r, font, x, y, colWidth * this.columns);
  }

  /** Small arrows showing there is more list above or below. */
  private drawScrollHints(r: Renderer, font: BitmapFont, x: number, y: number, width: number): void {
    if (this.rowCount <= this.visibleRows) return;
    const rightX = x + width - 6;
    if (this.scroll > 0) font.draw(r.ctx, '^', rightX, y - 2, '#b9c4e8');
    if (this.scroll + this.visibleRows < this.rowCount) {
      font.draw(r.ctx, 'v', rightX, y + this.visibleRows * this.rowHeight - 4, '#b9c4e8');
    }
  }
}
