import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { buildOutputs, renderCredits, renderManifest } from './build.mjs';
import { extractArchive } from './pack.mjs';
import { validateConfig } from './config.mjs';
import { cellOrigin, createImage, decodePng, encodePng, fillRect, getPixel } from './atlas.mjs';

/**
 * End-to-end exercise of the import path against a synthetic art pack: build a
 * zip containing a numbered atlas, run it through the real slicing code, and
 * assert the output cells came from the right source cells.
 *
 * This is what proves the pipeline works without needing to reach kenney.nl.
 */

const CELL = 16;
const SOURCE_COLUMNS = 12;
const SOURCE_ROWS = 11;

/** Every cell a distinct flat colour keyed to its index. */
function colorFor(index) {
  return [index + 1, 60, 160, 255];
}

function makeSourceAtlas() {
  const image = createImage(SOURCE_COLUMNS * CELL, SOURCE_ROWS * CELL);
  for (let index = 0; index < SOURCE_COLUMNS * SOURCE_ROWS; index++) {
    const { x, y } = cellOrigin(index, SOURCE_COLUMNS, CELL, CELL);
    fillRect(image, x, y, CELL, CELL, colorFor(index));
  }
  return image;
}

function makeFakePack() {
  return zipSync({
    'fake_pack/Tilemap/tilemap_packed.png': encodePng(makeSourceAtlas()),
    'fake_pack/License.txt': new Uint8Array([67, 67, 48]),
  });
}

/** Mirrors the shape of the engine's real TILES enum, gaps included. */
const TILE_ENUM = {
  VOID: 0,
  GRASS: 1,
  STONE_FLOOR: 3,
  WALL: 6,
  WATER: 8,
};

const CONFIG = {
  packs: [
    {
      id: 'fake',
      name: 'Fake Pack',
      author: 'Nobody',
      license: 'CC0-1.0',
      homepage: 'https://example.test/fake',
      sha256: 'abc123',
    },
  ],
  outputs: [
    {
      key: 'tileset.ruins',
      file: 'tileset-ruins.png',
      kind: 'tileset',
      pack: 'fake',
      source: 'Tilemap/tilemap_packed.png',
      cellW: CELL,
      cellH: CELL,
      sourceColumns: SOURCE_COLUMNS,
      tiles: { GRASS: 0, STONE_FLOOR: 45, WALL: 60, WATER: 24 },
    },
    {
      key: 'actor.kairos.field',
      file: 'kairos-walk.png',
      kind: 'frames',
      pack: 'fake',
      source: 'Tilemap/tilemap_packed.png',
      cellW: CELL,
      cellH: CELL,
      sourceColumns: SOURCE_COLUMNS,
      outputColumns: 4,
      order: [84, 85, 84, 86, 87, 88, 87, 89, 90, 91, 90, 92, 93, 94, 93, 95],
    },
  ],
};

function loadArchives() {
  return new Map([['fake', extractArchive(makeFakePack())]]);
}

function cellColorOf(image, index, columns) {
  const { x, y } = cellOrigin(index, columns, CELL, CELL);
  return getPixel(image, x + 2, y + 2);
}

describe('the config for the synthetic pack', () => {
  it('validates cleanly', () => {
    expect(validateConfig(CONFIG, TILE_ENUM)).toEqual([]);
  });
});

describe('buildOutputs', () => {
  const result = buildOutputs({ config: CONFIG, tileEnum: TILE_ENUM, archives: loadArchives() });

  it('produces one artifact per output, keyed for the engine', () => {
    expect(result.artifacts.map((a) => a.key)).toEqual(['tileset.ruins', 'actor.kairos.field']);
    expect(result.manifest).toEqual({
      'tileset.ruins': 'assets/tileset-ruins.png',
      'actor.kairos.field': 'assets/kairos-walk.png',
    });
  });

  it('writes the tileset 8 columns wide, matching TILESET_COLUMNS', () => {
    const tileset = result.artifacts[0];
    expect(tileset.width).toBe(8 * CELL);
  });

  /** The heart of it: engine tile N must hold the source cell it was mapped to. */
  it('places each source cell at its engine tile index', () => {
    const tileset = decodePng(result.artifacts[0].bytes);

    expect(cellColorOf(tileset, TILE_ENUM.GRASS, 8)).toEqual(colorFor(0));
    expect(cellColorOf(tileset, TILE_ENUM.STONE_FLOOR, 8)).toEqual(colorFor(45));
    expect(cellColorOf(tileset, TILE_ENUM.WALL, 8)).toEqual(colorFor(60));
    expect(cellColorOf(tileset, TILE_ENUM.WATER, 8)).toEqual(colorFor(24));
  });

  it('leaves unmapped engine tiles transparent rather than filling them with junk', () => {
    const tileset = decodePng(result.artifacts[0].bytes);
    expect(cellColorOf(tileset, TILE_ENUM.VOID, 8)).toEqual([0, 0, 0, 0]);
  });

  it('warns about tiles that still need mapping', () => {
    expect(result.warnings.join(' ')).toMatch(/VOID/);
  });

  it('lays character frames out 4 wide in the order given', () => {
    const sheet = result.artifacts[1];
    expect(sheet.width).toBe(4 * CELL);
    expect(sheet.height).toBe(4 * CELL);

    const image = decodePng(sheet.bytes);
    expect(cellColorOf(image, 0, 4)).toEqual(colorFor(84)); // down, frame 0
    expect(cellColorOf(image, 1, 4)).toEqual(colorFor(85)); // down, step
    expect(cellColorOf(image, 4, 4)).toEqual(colorFor(87)); // left, frame 0
    expect(cellColorOf(image, 15, 4)).toEqual(colorFor(95)); // up, last frame
  });

  it('is deterministic, so a re-import is an empty diff', () => {
    const again = buildOutputs({ config: CONFIG, tileEnum: TILE_ENUM, archives: loadArchives() });
    expect(Buffer.from(again.artifacts[0].bytes)).toEqual(Buffer.from(result.artifacts[0].bytes));
  });

  it('fails loudly when an archive is missing', () => {
    expect(() =>
      buildOutputs({ config: CONFIG, tileEnum: TILE_ENUM, archives: new Map() }),
    ).toThrow(/No archive loaded/);
  });

  it('fails loudly when the source sheet is not in the archive', () => {
    const broken = { ...CONFIG, outputs: [{ ...CONFIG.outputs[0], source: 'Nope/gone.png' }] };
    expect(() => buildOutputs({ config: broken, tileEnum: TILE_ENUM, archives: loadArchives() })).toThrow(
      /not in the archive/,
    );
  });

  it('fails loudly when a mapping points past the end of the sheet', () => {
    const broken = {
      ...CONFIG,
      outputs: [{ ...CONFIG.outputs[0], tiles: { GRASS: 9999 } }],
    };
    expect(() => buildOutputs({ config: broken, tileEnum: TILE_ENUM, archives: loadArchives() })).toThrow(
      /only has 132 cells/,
    );
  });
});

describe('generated files', () => {
  it('renders a manifest that is valid TypeScript and sorted', () => {
    const source = renderManifest({ 'z.key': 'assets/z.png', 'a.key': 'assets/a.png' });
    expect(source).toContain("'a.key': 'assets/a.png',");
    expect(source.indexOf("'a.key'")).toBeLessThan(source.indexOf("'z.key'"));
    expect(source).toContain('export const GENERATED_MANIFEST: Record<string, string> = {');
  });

  it('renders an empty manifest without a syntax error', () => {
    expect(renderManifest({})).toContain('GENERATED_MANIFEST: Record<string, string> = {};');
  });

  it('credits every pack with author, license and source', () => {
    const credits = renderCredits(CONFIG.packs);
    expect(credits).toContain('## Fake Pack');
    expect(credits).toContain('- Author: Nobody');
    expect(credits).toContain('- License: CC0-1.0');
    expect(credits).toContain('https://example.test/fake');
    expect(credits).toContain('abc123');
  });

  it('says so plainly when nothing has been imported', () => {
    expect(renderCredits([])).toMatch(/No third-party art imported yet/);
  });
});
