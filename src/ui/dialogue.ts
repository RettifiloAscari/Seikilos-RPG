import { VIRTUAL_H, VIRTUAL_W } from '../config';
import type { Input } from '../core/input';
import type { BitmapFont } from '../render/font';
import type { Renderer } from '../render/renderer';
import { drawWindow } from './window';

const BOX_MARGIN = 8;
const BOX_HEIGHT = 56;
const TEXT_PADDING = 8;
const LINES_PER_PAGE = 3;
const CHARS_PER_SECOND = 45;

/**
 * A typewriter message box.
 *
 * Text arrives one character at a time; pressing Confirm mid-page skips to the
 * full page, and pressing it again advances. That two-stage behaviour is what
 * makes JRPG dialogue feel responsive rather than slow.
 */
export class DialogueBox {
  /** Optional speaker name shown in a tab above the box. */
  speaker: string | null = null;

  private pages: string[][] = [];
  private pageIndex = 0;
  private revealed = 0;
  private finished = true;
  private time = 0;

  get active(): boolean {
    return !this.finished;
  }

  /** Queue a message. Long text is wrapped and split across pages. */
  show(font: BitmapFont, text: string, speaker: string | null = null): void {
    const maxWidth = VIRTUAL_W - BOX_MARGIN * 2 - TEXT_PADDING * 2;
    const lines = font.wrap(text, maxWidth);

    this.pages = [];
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
      this.pages.push(lines.slice(i, i + LINES_PER_PAGE));
    }
    if (this.pages.length === 0) this.pages.push(['']);

    this.speaker = speaker;
    this.pageIndex = 0;
    this.revealed = 0;
    this.finished = false;
  }

  /** Returns true on the frame the whole message is dismissed. */
  update(dt: number, input: Input): boolean {
    if (this.finished) return false;
    this.time += dt;

    const page = this.pages[this.pageIndex] ?? [];
    const total = page.reduce((sum, line) => sum + line.length, 0);
    const fullyRevealed = this.revealed >= total;

    if (!fullyRevealed) {
      this.revealed = Math.min(total, this.revealed + CHARS_PER_SECOND * dt);
      // First press fast-forwards the reveal instead of skipping the page.
      if (input.pressed('confirm') || input.pressed('cancel')) this.revealed = total;
      return false;
    }

    if (input.pressed('confirm')) {
      this.pageIndex += 1;
      this.revealed = 0;
      if (this.pageIndex >= this.pages.length) {
        this.finished = true;
        return true;
      }
    }
    return false;
  }

  render(r: Renderer, font: BitmapFont): void {
    if (this.finished) return;

    const boxY = VIRTUAL_H - BOX_HEIGHT - BOX_MARGIN;
    const boxW = VIRTUAL_W - BOX_MARGIN * 2;

    if (this.speaker) {
      const tabW = font.measure(this.speaker) + 12;
      drawWindow(r, BOX_MARGIN, boxY - 14, tabW, 16);
      font.drawShadowed(r.ctx, this.speaker, BOX_MARGIN + 6, boxY - 11, '#ffe066');
    }

    drawWindow(r, BOX_MARGIN, boxY, boxW, BOX_HEIGHT);

    const page = this.pages[this.pageIndex] ?? [];
    let budget = Math.floor(this.revealed);

    page.forEach((line, index) => {
      if (budget <= 0) return;
      const visible = line.slice(0, budget);
      budget -= line.length;
      font.draw(r.ctx, visible, BOX_MARGIN + TEXT_PADDING, boxY + TEXT_PADDING + index * font.lineHeight);
    });

    // Blinking "more" marker once the page is fully shown.
    const total = page.reduce((sum, line) => sum + line.length, 0);
    if (this.revealed >= total && Math.sin(this.time * 7) > 0) {
      const markerX = BOX_MARGIN + boxW - 12;
      const markerY = boxY + BOX_HEIGHT - 12;
      r.fillRect(markerX, markerY, 5, 1, '#ffe066');
      r.fillRect(markerX + 1, markerY + 1, 3, 1, '#ffe066');
      r.fillRect(markerX + 2, markerY + 2, 1, 1, '#ffe066');
    }
  }

  cancel(): void {
    this.finished = true;
  }
}
