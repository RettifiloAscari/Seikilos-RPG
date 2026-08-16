import type { Renderer } from '../render/renderer';

/**
 * The classic JRPG message window: a deep blue gradient panel with a bevelled
 * light border and clipped corners. Drawn procedurally so it can be any size.
 */

export interface WindowStyle {
  fillTop: string;
  fillBottom: string;
  border: string;
  borderDark: string;
  alpha: number;
}

export const WINDOW_STYLE: WindowStyle = {
  fillTop: '#1b2a63',
  fillBottom: '#0a1030',
  border: '#c8d4f0',
  borderDark: '#5a6ba8',
  alpha: 0.94,
};

/** A lighter panel for highlighted or secondary content. */
export const PANEL_STYLE: WindowStyle = {
  fillTop: '#2a2438',
  fillBottom: '#171422',
  border: '#9a8fb8',
  borderDark: '#4c445e',
  alpha: 0.94,
};

export function drawWindow(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  h: number,
  style: WindowStyle = WINDOW_STYLE,
): void {
  const ctx = r.ctx;
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.round(w);
  const rh = Math.round(h);
  if (rw < 6 || rh < 6) return;

  ctx.save();
  ctx.globalAlpha = style.alpha;

  const gradient = ctx.createLinearGradient(0, ry, 0, ry + rh);
  gradient.addColorStop(0, style.fillTop);
  gradient.addColorStop(1, style.fillBottom);
  ctx.fillStyle = gradient;

  // Body with 2px clipped corners, drawn as three bands.
  ctx.fillRect(rx + 2, ry, rw - 4, rh);
  ctx.fillRect(rx, ry + 2, 2, rh - 4);
  ctx.fillRect(rx + rw - 2, ry + 2, 2, rh - 4);

  ctx.globalAlpha = 1;

  // Outer border, following the same clipped shape.
  ctx.fillStyle = style.border;
  ctx.fillRect(rx + 2, ry, rw - 4, 1);
  ctx.fillRect(rx + 2, ry + rh - 1, rw - 4, 1);
  ctx.fillRect(rx, ry + 2, 1, rh - 4);
  ctx.fillRect(rx + rw - 1, ry + 2, 1, rh - 4);
  ctx.fillRect(rx + 1, ry + 1, 1, 1);
  ctx.fillRect(rx + rw - 2, ry + 1, 1, 1);
  ctx.fillRect(rx + 1, ry + rh - 2, 1, 1);
  ctx.fillRect(rx + rw - 2, ry + rh - 2, 1, 1);

  // Inner shading gives the panel a little depth.
  ctx.fillStyle = style.borderDark;
  ctx.fillRect(rx + 2, ry + 1, rw - 4, 1);
  ctx.fillRect(rx + 2, ry + rh - 2, rw - 4, 1);

  ctx.restore();
}

/** A horizontal bar (HP, MP, ATB) with a 1px dark frame. */
export function drawGauge(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  h: number,
  fraction: number,
  color: string,
  background = '#241f33',
): void {
  const clamped = Math.max(0, Math.min(1, fraction));
  r.fillRect(x - 1, y - 1, w + 2, h + 2, '#0c0a14');
  r.fillRect(x, y, w, h, background);

  const filled = Math.round(w * clamped);
  if (filled <= 0) return;

  r.fillRect(x, y, filled, h, color);
  // A lighter top row reads as a highlight at this scale.
  if (h >= 3) {
    r.fillRect(x, y, filled, 1, lighten(color));
  }
}

function lighten(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const channels = [0, 2, 4].map((i) => {
    const channel = parseInt(value.slice(i, i + 2), 16);
    return Math.min(255, Math.round(channel + (255 - channel) * 0.35));
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Downward-pointing cursor that hovers over a battle target. Bobs vertically
 * rather than horizontally so it reads as pointing *at* something.
 */
export function drawTargetCursor(r: Renderer, x: number, y: number, time: number, color = '#ffe066'): void {
  const bob = Math.round(Math.sin(time * 6) * 1.5);
  const cx = Math.round(x);
  const cy = Math.round(y) + bob;

  r.fillRect(cx - 3, cy, 7, 2, color);
  r.fillRect(cx - 2, cy + 2, 5, 2, color);
  r.fillRect(cx - 1, cy + 4, 3, 2, color);
  r.fillRect(cx, cy + 6, 1, 1, color);
}

/** The blinking selection cursor. */
export function drawCursor(r: Renderer, x: number, y: number, time: number, color = '#ffe066'): void {
  const bob = Math.sin(time * 8) > 0 ? 0 : 1;
  const cx = Math.round(x + bob);
  const cy = Math.round(y);
  // Small right-pointing triangle.
  r.fillRect(cx, cy, 2, 7, color);
  r.fillRect(cx + 2, cy + 1, 2, 5, color);
  r.fillRect(cx + 4, cy + 2, 2, 3, color);
  r.fillRect(cx + 6, cy + 3, 1, 1, color);
}
