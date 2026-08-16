import { describe, expect, it } from 'vitest';
import {
  blit,
  cellCount,
  cellIsEmpty,
  cellOrigin,
  composeAtlas,
  contactSheet,
  createImage,
  decodePng,
  encodePng,
  extractCell,
  fillRect,
  getPixel,
  gridOf,
  setPixel,
} from './atlas.mjs';

/**
 * Builds a synthetic atlas where every cell is a single flat colour derived
 * from its index. That makes it trivial to assert that a given output cell
 * came from the intended source cell.
 */
function makeTestAtlas(columns, rows, cellW = 4, cellH = 4) {
  const image = createImage(columns * cellW, rows * cellH);
  for (let index = 0; index < columns * rows; index++) {
    const { x, y } = cellOrigin(index, columns, cellW, cellH);
    fillRect(image, x, y, cellW, cellH, colorFor(index));
  }
  return image;
}

/** Distinct, reversible colour per cell index. */
function colorFor(index) {
  return [index + 1, 100, 200, 255];
}

function cellColor(image, index, columns, cellW = 4, cellH = 4) {
  const { x, y } = cellOrigin(index, columns, cellW, cellH);
  return getPixel(image, x + 1, y + 1);
}

describe('grid geometry', () => {
  it('reports exact grids', () => {
    const image = createImage(48, 32);
    expect(gridOf(image, 16, 16)).toMatchObject({ columns: 3, rows: 2, exact: true });
  });

  it('flags sheets that are not a clean multiple of the cell size', () => {
    const image = createImage(50, 32);
    const grid = gridOf(image, 16, 16);
    expect(grid.columns).toBe(3);
    expect(grid.exact).toBe(false);
    expect(grid.remainderX).toBe(2);
  });

  it('locates cells row-major', () => {
    expect(cellOrigin(0, 4, 16, 16)).toEqual({ x: 0, y: 0 });
    expect(cellOrigin(3, 4, 16, 16)).toEqual({ x: 48, y: 0 });
    expect(cellOrigin(4, 4, 16, 16)).toEqual({ x: 0, y: 16 });
    expect(cellOrigin(9, 4, 16, 16)).toEqual({ x: 16, y: 32 });
  });

  it('counts whole cells only', () => {
    expect(cellCount(createImage(48, 32), 16, 16)).toBe(6);
    expect(cellCount(createImage(47, 32), 16, 16)).toBe(4);
  });
});

describe('blit', () => {
  it('copies a region verbatim, including alpha', () => {
    const src = createImage(4, 4);
    fillRect(src, 0, 0, 4, 4, [10, 20, 30, 128]);
    const dest = createImage(8, 8);

    blit(dest, src, 0, 0, 4, 4, 2, 2);

    expect(getPixel(dest, 3, 3)).toEqual([10, 20, 30, 128]);
    expect(getPixel(dest, 0, 0)).toEqual([0, 0, 0, 0]); // untouched
  });

  it('clips at the destination edges instead of wrapping', () => {
    const src = createImage(4, 4);
    fillRect(src, 0, 0, 4, 4, [255, 0, 0, 255]);
    const dest = createImage(6, 6);

    blit(dest, src, 0, 0, 4, 4, 4, 4);

    expect(getPixel(dest, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(getPixel(dest, 0, 5)).toEqual([0, 0, 0, 0]); // no wraparound
  });

  it('replaces rather than blends, so transparency carries through', () => {
    const dest = createImage(4, 4);
    fillRect(dest, 0, 0, 4, 4, [255, 255, 255, 255]);
    const src = createImage(4, 4); // fully transparent

    blit(dest, src, 0, 0, 4, 4, 0, 0);

    expect(getPixel(dest, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe('composeAtlas', () => {
  const source = makeTestAtlas(4, 3); // 12 cells, indices 0..11

  it('reorders cells into the requested positions', () => {
    const out = composeAtlas({
      source,
      cellW: 4,
      cellH: 4,
      sourceColumns: 4,
      outputColumns: 2,
      order: [11, 0, 5, 7],
    });

    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(cellColor(out, 0, 2)).toEqual(colorFor(11));
    expect(cellColor(out, 1, 2)).toEqual(colorFor(0));
    expect(cellColor(out, 2, 2)).toEqual(colorFor(5));
    expect(cellColor(out, 3, 2)).toEqual(colorFor(7));
  });

  it('leaves null entries transparent so index gaps are preserved', () => {
    const out = composeAtlas({
      source,
      cellW: 4,
      cellH: 4,
      sourceColumns: 4,
      outputColumns: 4,
      order: [1, null, 2, -1],
    });

    expect(cellColor(out, 0, 4)).toEqual(colorFor(1));
    expect(cellColor(out, 1, 4)).toEqual([0, 0, 0, 0]);
    expect(cellColor(out, 2, 4)).toEqual(colorFor(2));
    expect(cellColor(out, 3, 4)).toEqual([0, 0, 0, 0]);
  });

  it('sizes the output to fit a partial final row', () => {
    const out = composeAtlas({
      source,
      cellW: 4,
      cellH: 4,
      sourceColumns: 4,
      outputColumns: 4,
      order: [0, 1, 2, 3, 4],
    });

    expect(out.width).toBe(16);
    expect(out.height).toBe(8); // two rows, second one mostly empty
    expect(cellColor(out, 4, 4)).toEqual(colorFor(4));
  });

  it('infers source columns when not given', () => {
    const out = composeAtlas({ source, cellW: 4, cellH: 4, outputColumns: 1, order: [6] });
    expect(cellColor(out, 0, 1)).toEqual(colorFor(6));
  });

  /**
   * The failure that matters most in practice: a config written against a
   * different version of a pack silently pulling the wrong tile. Better to
   * refuse than to ship a wall that looks like water.
   */
  it('refuses to reference a cell the source does not have', () => {
    expect(() =>
      composeAtlas({ source, cellW: 4, cellH: 4, sourceColumns: 4, outputColumns: 2, order: [0, 99] }),
    ).toThrow(/only has 12 cells/);
  });

  it('rejects non-integer indices and empty orders', () => {
    expect(() =>
      composeAtlas({ source, cellW: 4, cellH: 4, sourceColumns: 4, outputColumns: 2, order: [1.5] }),
    ).toThrow(/not an integer/);
    expect(() => composeAtlas({ source, cellW: 4, cellH: 4, outputColumns: 2, order: [] })).toThrow(
      /non-empty/,
    );
  });
});

describe('extractCell and cellIsEmpty', () => {
  it('pulls a single cell out at its own size', () => {
    const source = makeTestAtlas(4, 3);
    const cell = extractCell(source, 6, { cellW: 4, cellH: 4, columns: 4 });

    expect(cell.width).toBe(4);
    expect(cell.height).toBe(4);
    expect(getPixel(cell, 0, 0)).toEqual(colorFor(6));
  });

  it('detects blank cells, which packs are full of', () => {
    const source = createImage(16, 4);
    fillRect(source, 0, 0, 4, 4, [1, 2, 3, 255]);

    expect(cellIsEmpty(source, 0, { cellW: 4, cellH: 4, columns: 4 })).toBe(false);
    expect(cellIsEmpty(source, 1, { cellW: 4, cellH: 4, columns: 4 })).toBe(true);
  });
});

describe('png round trip', () => {
  it('survives encode and decode unchanged', () => {
    const original = createImage(8, 8);
    fillRect(original, 0, 0, 8, 8, [12, 34, 56, 255]);
    setPixel(original, 3, 3, [200, 100, 50, 128]);

    const restored = decodePng(encodePng(original));

    expect(restored.width).toBe(8);
    expect(restored.height).toBe(8);
    expect(getPixel(restored, 0, 0)).toEqual([12, 34, 56, 255]);
    expect(getPixel(restored, 3, 3)).toEqual([200, 100, 50, 128]);
  });
});

describe('contactSheet', () => {
  it('scales up to a labelled grid of every source cell', () => {
    const source = makeTestAtlas(4, 2);
    const sheet = contactSheet(source, { cellW: 4, cellH: 4, scale: 3, gap: 1 });

    // 4 columns x (4px * 3 scale + 1 gap) + leading gap
    expect(sheet.width).toBe(4 * 13 + 1);
    expect(sheet.height).toBe(2 * 13 + 1);
  });

  it('refuses cell sizes larger than the sheet', () => {
    expect(() => contactSheet(createImage(8, 8), { cellW: 16, cellH: 16 })).toThrow(/do not fit/);
  });
});
