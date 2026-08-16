import { VIRTUAL_H, VIRTUAL_W } from '../config';

export interface SpriteOptions {
  flipX?: boolean;
  flipY?: boolean;
  alpha?: number;
  /** Multiply the sprite by this colour (used for damage flashes). */
  tint?: string;
  /** 0..1 strength of the tint. */
  tintAmount?: number;
}

/**
 * Draws everything to an offscreen canvas of exactly VIRTUAL_W x VIRTUAL_H,
 * then blits that to the visible canvas at an integer scale. Nothing in the
 * game ever has to think about window size or device pixel ratio.
 */
export class Renderer {
  readonly width = VIRTUAL_W;
  readonly height = VIRTUAL_H;
  readonly ctx: CanvasRenderingContext2D;

  /** Camera position in world pixels; applied by `beginCamera`. */
  camX = 0;
  camY = 0;

  private readonly buffer: HTMLCanvasElement;
  private readonly display: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D;
  private tintCanvas: HTMLCanvasElement | null = null;

  constructor(display: HTMLCanvasElement) {
    this.display = display;

    const displayCtx = display.getContext('2d', { alpha: false });
    if (!displayCtx) throw new Error('Renderer: 2d context unavailable on the display canvas');
    this.displayCtx = displayCtx;

    this.buffer = document.createElement('canvas');
    this.buffer.width = VIRTUAL_W;
    this.buffer.height = VIRTUAL_H;

    const ctx = this.buffer.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Renderer: 2d context unavailable on the backbuffer');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(color = '#000000'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  /**
   * Shifts drawing by the camera. Positions are rounded so sprites always land
   * on whole pixels; sub-pixel camera movement would shimmer.
   */
  beginCamera(): void {
    this.ctx.save();
    this.ctx.translate(-Math.round(this.camX), -Math.round(this.camY));
  }

  endCamera(): void {
    this.ctx.restore();
  }

  /** Centre the camera on a world point, clamped to the given world bounds. */
  focusCamera(x: number, y: number, worldW: number, worldH: number): void {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.camX = worldW <= this.width ? (worldW - this.width) / 2 : clamp(x - halfW, 0, worldW - this.width);
    this.camY = worldH <= this.height ? (worldH - this.height) / 2 : clamp(y - halfH, 0, worldH - this.height);
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    this.ctx.fillRect(rx, ry, rw, 1);
    this.ctx.fillRect(rx, ry + rh - 1, rw, 1);
    this.ctx.fillRect(rx, ry, 1, rh);
    this.ctx.fillRect(rx + rw - 1, ry, 1, rh);
  }

  /** Filled ellipse, used for shadows and simple effects. */
  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(Math.round(cx), Math.round(cy), rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Draw a sub-rectangle of a spritesheet. */
  sprite(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    opts: SpriteOptions = {},
  ): void {
    const source = opts.tint && (opts.tintAmount ?? 1) > 0 ? this.tinted(image, sx, sy, sw, sh, opts) : null;

    const ctx = this.ctx;
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

    const x = Math.round(dx);
    const y = Math.round(dy);
    const flipX = opts.flipX ? -1 : 1;
    const flipY = opts.flipY ? -1 : 1;

    if (opts.flipX || opts.flipY) {
      ctx.translate(x + (opts.flipX ? sw : 0), y + (opts.flipY ? sh : 0));
      ctx.scale(flipX, flipY);
      if (source) ctx.drawImage(source, 0, 0);
      else ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    } else if (source) {
      ctx.drawImage(source, x, y);
    } else {
      ctx.drawImage(image, sx, sy, sw, sh, x, y, sw, sh);
    }

    ctx.restore();
  }

  /**
   * Produces a tinted copy of a sprite region on a scratch canvas.
   * `source-atop` keeps the sprite's own alpha, so transparent pixels stay
   * transparent instead of becoming a coloured box.
   */
  private tinted(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    opts: SpriteOptions,
  ): HTMLCanvasElement {
    if (!this.tintCanvas) this.tintCanvas = document.createElement('canvas');
    const canvas = this.tintCanvas;
    if (canvas.width < sw || canvas.height < sh) {
      canvas.width = Math.max(canvas.width, sw);
      canvas.height = Math.max(canvas.height, sh);
    }

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = opts.tintAmount ?? 1;
    ctx.fillStyle = opts.tint!;
    ctx.fillRect(0, 0, sw, sh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    return canvas;
  }

  /** Darken (or with a light colour, wash out) the whole screen. */
  overlay(color: string, alpha: number): void {
    if (alpha <= 0) return;
    this.ctx.save();
    this.ctx.globalAlpha = Math.min(1, alpha);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  /** Resize to the window and blit the backbuffer at an integer scale. */
  present(): void {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const cssW = this.display.clientWidth || window.innerWidth;
    const cssH = this.display.clientHeight || window.innerHeight;
    const pixelW = Math.max(1, Math.floor(cssW * dpr));
    const pixelH = Math.max(1, Math.floor(cssH * dpr));

    if (this.display.width !== pixelW || this.display.height !== pixelH) {
      this.display.width = pixelW;
      this.display.height = pixelH;
    }

    // Integer scale keeps every game pixel the same size. Below 1x we'd have to
    // squash the image, so clamp to 1 and let the edges crop.
    const scale = Math.max(1, Math.floor(Math.min(pixelW / VIRTUAL_W, pixelH / VIRTUAL_H)));
    const drawW = VIRTUAL_W * scale;
    const drawH = VIRTUAL_H * scale;
    const offsetX = Math.floor((pixelW - drawW) / 2);
    const offsetY = Math.floor((pixelH - drawH) / 2);

    const ctx = this.displayCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, pixelW, pixelH);
    ctx.drawImage(this.buffer, offsetX, offsetY, drawW, drawH);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
