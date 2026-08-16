/**
 * Loading and validating `assets.config.mjs`.
 *
 * Validation is strict and up front: a bad config should fail with a sentence
 * telling you which entry is wrong, not by writing a subtly corrupt PNG that
 * only looks wrong once you are standing in the map.
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { buildTilesetOrder, unmappedTiles } from './tiles.mjs';

/**
 * @typedef {Object} Pack
 * @property {string} id
 * @property {string} name
 * @property {string} author
 * @property {string} license
 * @property {string} [homepage]
 * @property {string|null} [url]
 * @property {string|null} [sha256]
 *
 * @typedef {Object} Output
 * @property {string} key      Engine asset key, e.g. 'tileset.ruins'
 * @property {string} file     Output filename inside public/assets/
 * @property {'tileset'|'frames'} kind
 * @property {string} pack
 * @property {string} source   Path to a PNG inside the archive
 * @property {number} cellW
 * @property {number} cellH
 * @property {number} [sourceColumns]
 * @property {number} [outputColumns]
 * @property {Record<string, number>} [tiles]
 * @property {(number|null)[]} [order]
 *
 * @typedef {{ packs: Pack[], outputs: Output[] }} AssetConfig
 */

export const CONFIG_PATH = 'assets.config.mjs';

/** Engine tilesets are always 8 columns wide; see TILESET_COLUMNS. */
export const TILESET_OUTPUT_COLUMNS = 8;

export async function loadConfig(path = CONFIG_PATH) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`Missing ${path}`);

  const module = await import(pathToFileURL(absolute).href);
  const config = module.default;
  if (!config || typeof config !== 'object') {
    throw new Error(`${path} must export a default object`);
  }
  return { packs: config.packs ?? [], outputs: config.outputs ?? [] };
}

/**
 * Check the config in isolation — everything that can be known without
 * opening an archive.
 * @returns {string[]} problems, empty when the config is sound
 */
export function validateConfig(config, tileEnum) {
  const problems = [];
  const packIds = new Set();

  for (const pack of config.packs) {
    if (!pack.id) problems.push('A pack has no id');
    else if (packIds.has(pack.id)) problems.push(`Duplicate pack id "${pack.id}"`);
    else packIds.add(pack.id);

    if (!pack.license) problems.push(`Pack "${pack.id}" has no license (needed for CREDITS.md)`);
    if (!pack.author) problems.push(`Pack "${pack.id}" has no author (needed for CREDITS.md)`);
  }

  const keys = new Set();
  const files = new Set();

  for (const output of config.outputs) {
    const label = output.key ?? '(unnamed output)';

    if (!output.key) problems.push('An output has no engine asset key');
    else if (keys.has(output.key)) problems.push(`Duplicate output key "${output.key}"`);
    else keys.add(output.key);

    if (!output.file) problems.push(`Output "${label}" has no file name`);
    else if (files.has(output.file)) problems.push(`Two outputs both write "${output.file}"`);
    else files.add(output.file);

    if (!packIds.has(output.pack)) {
      problems.push(`Output "${label}" refers to unknown pack "${output.pack}"`);
    }
    if (!output.source) problems.push(`Output "${label}" has no source path inside the archive`);

    for (const dimension of ['cellW', 'cellH']) {
      if (!Number.isInteger(output[dimension]) || output[dimension] <= 0) {
        problems.push(`Output "${label}" needs a positive integer ${dimension}`);
      }
    }

    if (output.kind === 'tileset') {
      if (!output.tiles || Object.keys(output.tiles).length === 0) {
        problems.push(`Tileset "${label}" has no tile mapping`);
      } else {
        try {
          buildTilesetOrder(tileEnum, output.tiles);
        } catch (error) {
          problems.push(`Tileset "${label}": ${error.message}`);
        }
      }
    } else if (output.kind === 'frames') {
      if (!Array.isArray(output.order) || output.order.length === 0) {
        problems.push(`Frames output "${label}" has no order array`);
      }
      if (!Number.isInteger(output.outputColumns) || output.outputColumns <= 0) {
        problems.push(`Frames output "${label}" needs a positive outputColumns`);
      }
    } else {
      problems.push(`Output "${label}" has unknown kind "${output.kind}" (expected tileset or frames)`);
    }
  }

  return problems;
}

/**
 * Resolve an output into the exact arguments `composeAtlas` needs.
 * @returns {{ order: (number|null)[], outputColumns: number, warnings: string[] }}
 */
export function planOutput(output, tileEnum) {
  const warnings = [];

  if (output.kind === 'tileset') {
    const missing = unmappedTiles(tileEnum, output.tiles);
    if (missing.length > 0) {
      warnings.push(
        `${output.key}: ${missing.length} tile(s) unmapped and will be transparent — ${missing.join(', ')}`,
      );
    }
    return {
      order: buildTilesetOrder(tileEnum, output.tiles),
      outputColumns: output.outputColumns ?? TILESET_OUTPUT_COLUMNS,
      warnings,
    };
  }

  return { order: output.order, outputColumns: output.outputColumns, warnings };
}
