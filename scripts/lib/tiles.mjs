/**
 * Reads the engine's tile numbering straight out of the game source.
 *
 * The importer has to know that `GRASS` means output index 1. Duplicating that
 * table into the asset config would guarantee the two drift apart the first
 * time somebody inserts a tile, and the symptom would be a map where every
 * tile past the insertion point is wrong. So we parse the single source of
 * truth instead and fail loudly on any mismatch.
 */

import { readFileSync } from 'node:fs';

const ENUM_BLOCK = /export const TILES\s*=\s*\{([\s\S]*?)\}\s*as const;/;
const ENTRY = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*(\d+)\s*,?\s*$/;

/**
 * Parse `export const TILES = { ... } as const;` into a plain name -> index map.
 * @returns {Record<string, number>}
 */
export function parseTileEnum(sourceText) {
  const block = ENUM_BLOCK.exec(sourceText);
  if (!block) {
    throw new Error('parseTileEnum: could not find `export const TILES = { ... } as const;`');
  }

  /** @type {Record<string, number>} */
  const tiles = {};
  const seen = new Map();

  for (const rawLine of block[1].split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (line === '') continue;

    const entry = ENTRY.exec(line);
    if (!entry) throw new Error(`parseTileEnum: cannot parse tile entry "${line.trim()}"`);

    const [, name, value] = entry;
    const index = Number(value);

    if (name in tiles) throw new Error(`parseTileEnum: duplicate tile name "${name}"`);
    if (seen.has(index)) {
      throw new Error(`parseTileEnum: tiles "${seen.get(index)}" and "${name}" share index ${index}`);
    }

    seen.set(index, name);
    tiles[name] = index;
  }

  if (Object.keys(tiles).length === 0) throw new Error('parseTileEnum: TILES block is empty');
  return tiles;
}

export function readTileEnum(path) {
  return parseTileEnum(readFileSync(path, 'utf8'));
}

/**
 * Turn `{ GRASS: 45 }` (engine tile name -> source cell index) into the dense
 * `order` array `composeAtlas` wants, indexed by the engine's own numbering.
 *
 * Unmapped engine tiles become `null`, which composes as transparent — a tile
 * you have not mapped yet shows up as a visible hole rather than as some
 * unrelated sprite.
 *
 * @returns {(number|null)[]}
 */
export function buildTilesetOrder(tileEnum, mapping) {
  const unknown = Object.keys(mapping).filter((name) => !(name in tileEnum));
  if (unknown.length > 0) {
    const known = Object.keys(tileEnum).sort().join(', ');
    throw new Error(
      `Unknown tile name(s) in mapping: ${unknown.join(', ')}.\n` +
        `The engine defines: ${known}`,
    );
  }

  const highest = Math.max(...Object.values(tileEnum));
  const order = new Array(highest + 1).fill(null);

  for (const [name, sourceIndex] of Object.entries(mapping)) {
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      throw new Error(`Tile "${name}" maps to ${sourceIndex}, which is not a source cell index`);
    }
    order[tileEnum[name]] = sourceIndex;
  }

  return order;
}

/** Engine tiles with no entry in the mapping, so the importer can warn. */
export function unmappedTiles(tileEnum, mapping) {
  return Object.keys(tileEnum)
    .filter((name) => !(name in mapping))
    .sort();
}
