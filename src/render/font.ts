/**
 * A 1-bit bitmap font, generated at runtime.
 *
 * Rather than shipping a font file, we render each ASCII glyph once with the
 * browser's own font engine, threshold it to hard on/off pixels, and measure
 * its real ink width so text can be proportionally spaced. The result looks
 * like a hand-made pixel font and needs no assets.
 *
 * To swap in a real pixel font later, replace `BitmapFont.generate` with a
 * loader that slices a PNG atlas; nothing else has to change.
 */

const FIRST_CHAR = 32; // space
const LAST_CHAR = 126; // ~
const GLYPH_COUNT = LAST_CHAR - FIRST_CHAR + 1;

export interface FontOptions {
  /** Pixel size passed to the browser font engine before thresholding. */
  size?: number;
  /** Font stack used as the source shapes. */
  family?: string;
  /** Alpha above which a source pixel becomes an opaque font pixel. */
  threshold?: number;
  /** Horizontal gap between glyphs, in pixels. */
  letterSpacing?: number;
  /** Width of a space character, in pixels. */
  spaceWidth?: number;
  bold?: boolean;
}

interface Glyph {
  /** X of this glyph's cell in the atlas. */
  atlasX: number;
  /** Offset of the ink within the cell, so we can draw tightly. */
  inkX: number;
  /** Ink width in pixels. */
  width: number;
}

export class BitmapFont {
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly spaceWidth: number;

  private readonly atlas: HTMLCanvasElement;
  private readonly glyphs: Glyph[];
  /** Height of one atlas cell; glyph widths are stored per glyph. */
  private readonly cellH: number;
  private readonly tintCache = new Map<string, HTMLCanvasElement>();

  private constructor(
    atlas: HTMLCanvasElement,
    glyphs: Glyph[],
    cellH: number,
    letterSpacing: number,
    spaceWidth: number,
  ) {
    this.atlas = atlas;
    this.glyphs = glyphs;
    this.cellH = cellH;
    this.lineHeight = cellH + 2;
    this.letterSpacing = letterSpacing;
    this.spaceWidth = spaceWidth;
  }

  static generate(opts: FontOptions = {}): BitmapFont {
    const size = opts.size ?? 10;
    const family = opts.family ?? '"Courier New", "DejaVu Sans Mono", monospace';
    const threshold = (opts.threshold ?? 0.5) * 255;
    const letterSpacing = opts.letterSpacing ?? 1;
    const weight = opts.bold ? 'bold ' : '';

    // Generous cell so no glyph is clipped; we crop to the real ink afterwards.
    const cellW = Math.ceil(size * 1.2) + 2;
    const cellH = Math.ceil(size * 1.35) + 2;

    const atlas = document.createElement('canvas');
    atlas.width = cellW * GLYPH_COUNT;
    atlas.height = cellH;

    const ctx = atlas.getContext('2d', { willReadFrequently: true })!;
    ctx.font = `${weight}${size}px ${family}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';

    for (let i = 0; i < GLYPH_COUNT; i++) {
      ctx.fillText(String.fromCharCode(FIRST_CHAR + i), i * cellW + 1, 1);
    }

    // Threshold to pure white-on-transparent so scaling stays crisp.
    const image = ctx.getImageData(0, 0, atlas.width, atlas.height);
    const data = image.data;
    for (let p = 0; p < data.length; p += 4) {
      const on = data[p + 3]! >= threshold;
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = on ? 255 : 0;
    }
    ctx.putImageData(image, 0, 0);

    // Measure each glyph's ink extents for proportional spacing.
    const glyphs: Glyph[] = [];
    for (let i = 0; i < GLYPH_COUNT; i++) {
      const baseX = i * cellW;
      let left = -1;
      let right = -1;
      for (let x = 0; x < cellW; x++) {
        let inked = false;
        for (let y = 0; y < cellH; y++) {
          if (data[((y * atlas.width) + baseX + x) * 4 + 3]! > 0) {
            inked = true;
            break;
          }
        }
        if (inked) {
          if (left < 0) left = x;
          right = x;
        }
      }
      glyphs.push(
        left < 0
          ? { atlasX: baseX, inkX: 0, width: 0 } // blank glyph (space)
          : { atlasX: baseX, inkX: left, width: right - left + 1 },
      );
    }

    // Base the space width on a real glyph so it scales with the font size.
    const measured = glyphs['n'.charCodeAt(0) - FIRST_CHAR]?.width ?? Math.round(size * 0.5);
    const spaceWidth = opts.spaceWidth ?? Math.max(2, Math.round(measured * 0.7));

    return new BitmapFont(atlas, glyphs, cellH, letterSpacing, spaceWidth);
  }

  /** Total width of `text` in pixels. */
  measure(text: string): number {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      width += this.advance(text.charCodeAt(i));
    }
    return Math.max(0, width - this.letterSpacing);
  }

  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#ffffff'): number {
    const sheet = this.tinted(color);
    let penX = Math.round(x);
    const penY = Math.round(y);

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const glyph = this.glyphAt(code);
      if (glyph && glyph.width > 0) {
        ctx.drawImage(
          sheet,
          glyph.atlasX + glyph.inkX,
          0,
          glyph.width,
          this.cellH,
          penX,
          penY,
          glyph.width,
          this.cellH,
        );
      }
      penX += this.advance(code);
    }
    return penX;
  }

  /** Text with a 1px drop shadow, which is what makes it readable over art. */
  drawShadowed(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color = '#ffffff',
    shadow = '#12121b',
  ): void {
    this.draw(ctx, text, x + 1, y + 1, shadow);
    this.draw(ctx, text, x, y, color);
  }

  drawCentered(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    y: number,
    color = '#ffffff',
    shadow?: string,
  ): void {
    const x = centerX - this.measure(text) / 2;
    if (shadow) this.drawShadowed(ctx, text, x, y, color, shadow);
    else this.draw(ctx, text, x, y, color);
  }

  drawRight(
    ctx: CanvasRenderingContext2D,
    text: string,
    rightX: number,
    y: number,
    color = '#ffffff',
    shadow?: string,
  ): void {
    const x = rightX - this.measure(text);
    if (shadow) this.drawShadowed(ctx, text, x, y, color, shadow);
    else this.draw(ctx, text, x, y, color);
  }

  /** Greedy word wrap. Respects existing newlines. */
  wrap(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(' ');
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && this.measure(candidate) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private glyphAt(code: number): Glyph | undefined {
    if (code < FIRST_CHAR || code > LAST_CHAR) return undefined;
    return this.glyphs[code - FIRST_CHAR];
  }

  private advance(code: number): number {
    if (code === 32) return this.spaceWidth + this.letterSpacing;
    const glyph = this.glyphAt(code);
    if (!glyph) return this.spaceWidth + this.letterSpacing;
    return glyph.width + this.letterSpacing;
  }

  /** Atlases are white; recolour once per colour and cache the result. */
  private tinted(color: string): HTMLCanvasElement {
    if (color === '#ffffff') return this.atlas;
    const cached = this.tintCache.get(color);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = this.atlas.width;
    canvas.height = this.atlas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.atlas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.tintCache.set(color, canvas);
    return canvas;
  }
}
