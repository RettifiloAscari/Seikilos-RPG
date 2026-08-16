/** Tiny helpers for hand-drawing pixel art onto a canvas. */

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export function surface(width: number, height: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx, width, height };
}

export function px(s: Surface, x: number, y: number, color: string, w = 1, h = 1): void {
  s.ctx.fillStyle = color;
  s.ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function rect(s: Surface, x: number, y: number, w: number, h: number, color: string): void {
  px(s, x, y, color, w, h);
}

export function outline(s: Surface, x: number, y: number, w: number, h: number, color: string): void {
  px(s, x, y, color, w, 1);
  px(s, x, y + h - 1, color, w, 1);
  px(s, x, y, color, 1, h);
  px(s, x + w - 1, y, color, 1, h);
}

export function ellipse(s: Surface, cx: number, cy: number, rx: number, ry: number, color: string): void {
  s.ctx.fillStyle = color;
  s.ctx.beginPath();
  s.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  s.ctx.fill();
}

export function circle(s: Surface, cx: number, cy: number, r: number, color: string): void {
  ellipse(s, cx, cy, r, r, color);
}

/** Filled triangle from three points. */
export function triangle(
  s: Surface,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  color: string,
): void {
  s.ctx.fillStyle = color;
  s.ctx.beginPath();
  s.ctx.moveTo(x1, y1);
  s.ctx.lineTo(x2, y2);
  s.ctx.lineTo(x3, y3);
  s.ctx.closePath();
  s.ctx.fill();
}

/** Vertical gradient band. */
export function verticalGradient(
  s: Surface,
  x: number,
  y: number,
  w: number,
  h: number,
  top: string,
  bottom: string,
): void {
  const gradient = s.ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  s.ctx.fillStyle = gradient;
  s.ctx.fillRect(x, y, w, h);
}

/** Deterministic value noise, so generated art is identical every run. */
export function hashNoise(x: number, y: number, seed = 0): number {
  let h = Math.imul(x + seed * 374761393, 668265263) ^ Math.imul(y + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Scatter single-pixel speckles to break up flat fills. */
export function speckle(
  s: Surface,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  density: number,
  seed = 0,
): void {
  for (let py = 0; py < h; py++) {
    for (let pxi = 0; pxi < w; pxi++) {
      if (hashNoise(x + pxi, y + py, seed) < density) px(s, x + pxi, y + py, color);
    }
  }
}

/** Lighten or darken a hex colour by `amount` (-1..1). */
export function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  const mix = (channel: number): number => {
    const target = amount >= 0 ? 255 : 0;
    return Math.round(channel + (target - channel) * Math.abs(amount));
  };

  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
