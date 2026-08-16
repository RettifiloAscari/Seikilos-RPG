import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTilesetOrder, parseTileEnum, readTileEnum, unmappedTiles } from './tiles.mjs';

const SAMPLE = `
export const TILES = {
  VOID: 0,
  GRASS: 1,
  STONE_FLOOR: 3, // out of order on purpose
  WALL: 6,
} as const;
`;

describe('parseTileEnum', () => {
  it('reads names and indices, comments and gaps included', () => {
    expect(parseTileEnum(SAMPLE)).toEqual({ VOID: 0, GRASS: 1, STONE_FLOOR: 3, WALL: 6 });
  });

  it('fails when the block is missing or empty', () => {
    expect(() => parseTileEnum('const NOPE = {};')).toThrow(/could not find/);
    expect(() => parseTileEnum('export const TILES = {\n} as const;')).toThrow(/empty/);
  });

  it('catches duplicate indices, which would silently overwrite a tile', () => {
    const clash = 'export const TILES = {\n  A: 1,\n  B: 1,\n} as const;';
    expect(() => parseTileEnum(clash)).toThrow(/share index 1/);
  });

  it('refuses lines it does not understand rather than skipping them', () => {
    const weird = 'export const TILES = {\n  ...SPREAD,\n} as const;';
    expect(() => parseTileEnum(weird)).toThrow(/cannot parse/);
  });

  /** The parser is only useful if it tracks the real file. */
  it('parses the live engine tile table', () => {
    const tiles = readTileEnum('src/art/placeholder.ts');
    expect(tiles.GRASS).toBeGreaterThanOrEqual(0);
    expect(tiles.WALL).toBeDefined();
    expect(Object.keys(tiles).length).toBeGreaterThan(8);

    // Whatever the file says must match what it exports at runtime.
    const source = readFileSync('src/art/placeholder.ts', 'utf8');
    expect(parseTileEnum(source)).toEqual(tiles);
  });
});

describe('buildTilesetOrder', () => {
  const tileEnum = { VOID: 0, GRASS: 1, STONE_FLOOR: 3, WALL: 6 };

  it('places source cells at the engine index for each name', () => {
    const order = buildTilesetOrder(tileEnum, { GRASS: 45, WALL: 12 });

    expect(order).toHaveLength(7); // highest index 6, plus slot 0
    expect(order[1]).toBe(45);
    expect(order[6]).toBe(12);
  });

  it('leaves unmapped tiles null so they render as visible holes', () => {
    const order = buildTilesetOrder(tileEnum, { GRASS: 45 });
    expect(order[0]).toBeNull();
    expect(order[3]).toBeNull();
  });

  /** Typo protection: this is the whole reason the enum is parsed. */
  it('rejects mappings for tiles the engine does not define', () => {
    expect(() => buildTilesetOrder(tileEnum, { GRSAS: 45 })).toThrow(/Unknown tile name/);
    expect(() => buildTilesetOrder(tileEnum, { GRSAS: 45 })).toThrow(/GRASS/); // suggests the real names
  });

  it('rejects nonsense source indices', () => {
    expect(() => buildTilesetOrder(tileEnum, { GRASS: -1 })).toThrow(/not a source cell index/);
    expect(() => buildTilesetOrder(tileEnum, { GRASS: 'x' })).toThrow(/not a source cell index/);
  });
});

describe('unmappedTiles', () => {
  it('lists what still needs a source cell', () => {
    expect(unmappedTiles({ A: 0, B: 1, C: 2 }, { B: 5 })).toEqual(['A', 'C']);
    expect(unmappedTiles({ A: 0 }, { A: 5 })).toEqual([]);
  });
});
