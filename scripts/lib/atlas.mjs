/**
 * Sprite-atlas surgery.
 *
 * Downloading a CC0 art pack is the easy half. The half that actually matters
 * is rearranging it: a pack ships tiles in whatever order its author chose, and
 * the engine wants them at specific semantic indices (`TILES.GRASS`,
 * `TILES.WALL_TOP`, ...) in an 8-column sheet. Everything here is pure image
 * arithmetic over RGBA buffers so it can be unit tested without a browser, a
 * network connection, or any real art.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

/**
 * @typedef {{ width: number, height: number, data: Uint8Array }} Image
 * RGBA, 4 bytes per pixel, row-major.
 */

/** @returns {Image} */
export function createImage(width, height) {
  if (width <= 0 || height <= 0) throw new Error(`createImage: bad size ${width}x${height}`);
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/**
 * @returns {Image}
 *
 * Accepts a Buffer or a Uint8Array. Archive entries arrive as plain
 * Uint8Arrays and pngjs only speaks Buffer, so wrap without copying.
 */
export function decodePng(bytes) {
  const buffer = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** @returns {Image} */
export function readPng(path) {
  return decodePng(readFileSync(path));
}

export function encodePng(image) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

export function writePng(path, image) {
  writeFileSync(path, encodePng(image));
}

export function getPixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]];
}

export function setPixel(image, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}

/**
 * Copy a rectangle from `src` into `dest`, replacing whatever is underneath.
 * Straight replacement rather than alpha blending: atlas cells should carry
 * the source's transparency through untouched.
 */
export function blit(dest, src, sx, sy, sw, sh, dx, dy) {
  for (let row = 0; row < sh; row++) {
    const srcY = sy + row;
    const destY = dy + row;
    if (srcY < 0 || srcY >= src.height || destY < 0 || destY >= dest.height) continue;

    for (let col = 0; col < sw; col++) {
      const srcX = sx + col;
      const destX = dx + col;
      if (srcX < 0 || srcX >= src.width || destX < 0 || destX >= dest.width) continue;

      const from = (srcY * src.width + srcX) * 4;
      const to = (destY * dest.width + destX) * 4;
      dest.data[to] = src.data[from];
      dest.data[to + 1] = src.data[from + 1];
      dest.data[to + 2] = src.data[from + 2];
      dest.data[to + 3] = src.data[from + 3];
    }
  }
}

export function fillRect(image, x, y, w, h, color) {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) setPixel(image, x + col, y + row, color);
  }
}

/**
 * How many whole cells of `cellW` x `cellH` fit in the image.
 * Reports the remainder so `assets:inspect` can warn about a sheet whose
 * dimensions are not a clean multiple — usually a sign of the wrong tile size
 * or of a pack that includes 1px spacing between tiles.
 */
export function gridOf(image, cellW, cellH) {
  return {
    columns: Math.floor(image.width / cellW),
    rows: Math.floor(image.height / cellH),
    remainderX: image.width % cellW,
    remainderY: image.height % cellH,
    exact: image.width % cellW === 0 && image.height % cellH === 0,
  };
}

/** Total number of whole cells in the sheet. */
export function cellCount(image, cellW, cellH) {
  const grid = gridOf(image, cellW, cellH);
  return grid.columns * grid.rows;
}

/** Top-left pixel of cell `index` in a grid `columns` wide. */
export function cellOrigin(index, columns, cellW, cellH) {
  if (columns <= 0) throw new Error('cellOrigin: columns must be positive');
  return { x: (index % columns) * cellW, y: Math.floor(index / columns) * cellH };
}

/** Extract a single cell as its own image. */
export function extractCell(source, index, { cellW, cellH, columns }) {
  const { x, y } = cellOrigin(index, columns, cellW, cellH);
  const out = createImage(cellW, cellH);
  blit(out, source, x, y, cellW, cellH, 0, 0);
  return out;
}

/** True if every pixel in the cell is fully transparent. */
export function cellIsEmpty(source, index, { cellW, cellH, columns }) {
  const { x, y } = cellOrigin(index, columns, cellW, cellH);
  for (let row = 0; row < cellH; row++) {
    for (let col = 0; col < cellW; col++) {
      const px = x + col;
      const py = y + row;
      if (px >= source.width || py >= source.height) continue;
      if (source.data[(py * source.width + px) * 4 + 3] !== 0) return false;
    }
  }
  return true;
}

/**
 * Rebuild an atlas by pulling cells out of a source sheet in a given order.
 *
 * `order[i]` is the source cell index that should land at output position `i`.
 * A `null` (or negative) entry leaves that slot transparent, which is how gaps
 * in the engine's tile numbering are preserved.
 *
 * This one function backs both tileset remapping and character sheet assembly;
 * they differ only in cell size and in how the order is derived.
 *
 * @returns {Image}
 */
export function composeAtlas({ source, cellW, cellH, sourceColumns, outputColumns, order }) {
  if (!Array.isArray(order) || order.length === 0) {
    throw new Error('composeAtlas: order must be a non-empty array');
  }
  if (outputColumns <= 0) throw new Error('composeAtlas: outputColumns must be positive');

  const available = cellCount(source, cellW, cellH);
  const columns = sourceColumns ?? gridOf(source, cellW, cellH).columns;

  order.forEach((sourceIndex, position) => {
    if (sourceIndex === null || sourceIndex === undefined || sourceIndex < 0) return;
    if (!Number.isInteger(sourceIndex)) {
      throw new Error(`composeAtlas: order[${position}] is not an integer (${sourceIndex})`);
    }
    if (sourceIndex >= available) {
      throw new Error(
        `composeAtlas: order[${position}] refers to cell ${sourceIndex}, ` +
          `but the source sheet only has ${available} cells (${columns} columns)`,
      );
    }
  });

  const outputRows = Math.ceil(order.length / outputColumns);
  const out = createImage(outputColumns * cellW, outputRows * cellH);

  order.forEach((sourceIndex, position) => {
    if (sourceIndex === null || sourceIndex === undefined || sourceIndex < 0) return;
    const from = cellOrigin(sourceIndex, columns, cellW, cellH);
    const to = cellOrigin(position, outputColumns, cellW, cellH);
    blit(out, source, from.x, from.y, cellW, cellH, to.x, to.y);
  });

  return out;
}

// ------------------------------------------------------------ contact sheet

/**
 * 3x5 digits, drawn by hand.
 *
 * A contact sheet has to label hundreds of cells with their index, and pulling
 * in a font renderer for ten glyphs would be silly.
 */
const DIGITS = [
  ['111', '101', '101', '101', '111'], // 0
  ['010', '110', '010', '010', '111'], // 1
  ['111', '001', '111', '100', '111'], // 2
  ['111', '001', '111', '001', '111'], // 3
  ['101', '101', '111', '001', '001'], // 4
  ['111', '100', '111', '001', '111'], // 5
  ['111', '100', '111', '101', '111'], // 6
  ['111', '001', '001', '001', '001'], // 7
  ['111', '101', '111', '101', '111'], // 8
  ['111', '101', '111', '001', '111'], // 9
];

const INK = [255, 255, 255, 255];
const BACKING = [0, 0, 0, 200];

export function drawNumber(image, value, x, y) {
  const text = String(value);
  let penX = x;

  // Dark plate behind the digits so they stay legible over any artwork.
  fillRect(image, x - 1, y - 1, text.length * 4 + 1, 7, BACKING);

  for (const char of text) {
    const glyph = DIGITS[Number(char)];
    if (glyph) {
      glyph.forEach((row, dy) => {
        [...row].forEach((bit, dx) => {
          if (bit === '1') setPixel(image, penX + dx, y + dy, INK);
        });
      });
    }
    penX += 4;
  }
}

/**
 * Render a source sheet scaled up with every cell numbered and outlined.
 *
 * This is the piece that makes mapping a pack tractable: open the contact
 * sheet, read off "grass is 0, cracked stone is 45", and type those numbers
 * into the config. It is the one step that genuinely needs human eyes.
 *
 * @returns {Image}
 */
export function contactSheet(source, { cellW, cellH, scale = 3, gap = 1, gridColor = [90, 90, 110, 255] }) {
  const grid = gridOf(source, cellW, cellH);
  if (grid.columns === 0 || grid.rows === 0) {
    throw new Error(`contactSheet: ${cellW}x${cellH} cells do not fit in a ${source.width}x${source.height} image`);
  }

  const stepX = cellW * scale + gap;
  const stepY = cellH * scale + gap;
  const out = createImage(grid.columns * stepX + gap, grid.rows * stepY + gap);

  // Checkerboard so transparent cells are visibly transparent.
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const shade = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 40 : 52;
      setPixel(out, x, y, [shade, shade, shade + 6, 255]);
    }
  }

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const index = row * grid.columns + col;
      const from = cellOrigin(index, grid.columns, cellW, cellH);
      const destX = gap + col * stepX;
      const destY = gap + row * stepY;

      // Nearest-neighbour upscale; this is pixel art, never interpolate.
      for (let py = 0; py < cellH * scale; py++) {
        for (let px = 0; px < cellW * scale; px++) {
          const [r, g, b, a] = getPixel(source, from.x + Math.floor(px / scale), from.y + Math.floor(py / scale));
          if (a === 0) continue;
          setPixel(out, destX + px, destY + py, [r, g, b, a]);
        }
      }

      fillRect(out, destX, destY, cellW * scale, 1, gridColor);
      fillRect(out, destX, destY, 1, cellH * scale, gridColor);
      drawNumber(out, index, destX + 2, destY + 2);
    }
  }

  return out;
}
