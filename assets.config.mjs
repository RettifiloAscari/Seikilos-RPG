/**
 * Which CC0 art packs to import, and how their cells map onto the engine's
 * layouts. A JS module rather than JSON specifically so a mapping table can
 * carry a comment next to each number — "45 = cracked flagstone" is the whole
 * value of this file.
 *
 * Workflow:
 *   1. Add a pack below (homepage is enough; a URL is optional).
 *   2. npm run assets:inspect -- --pack <id>
 *      Writes numbered contact sheets to shots/contact/ — open them and read
 *      off the cell indices you want.
 *   3. Fill in an output entry with those indices.
 *   4. npm run assets:import
 *
 * Anything left unmapped keeps its procedural placeholder, so this can be
 * filled in a few tiles at a time rather than all at once.
 */

/** @type {import('./scripts/lib/config.mjs').AssetConfig} */
export default {
  packs: [
    {
      id: 'kenney-tiny-town',
      name: 'Tiny Town',
      author: 'Kenney',
      license: 'CC0-1.0',
      homepage: 'https://kenney.nl/assets/tiny-town',
      // Kenney's direct download URLs embed a version stamp and rot when a
      // pack is re-released, so we leave this null and pass the zip in with
      // --from. Set it (and sha256) once you have a URL you have verified.
      url: null,
      sha256: null,
    },
    {
      id: 'kenney-tiny-dungeon',
      name: 'Tiny Dungeon',
      author: 'Kenney',
      license: 'CC0-1.0',
      homepage: 'https://kenney.nl/assets/tiny-dungeon',
      url: null,
      sha256: null,
    },
  ],

  /**
   * Each output produces one PNG in `public/assets/` and one entry in the
   * generated art manifest, keyed the same way the engine looks art up.
   *
   * kind: 'tileset' — `tiles` maps engine tile NAMES (from the TILES enum in
   *   src/art/placeholder.ts) to source cell indices. Names are validated
   *   against the engine, so a typo fails the import instead of silently
   *   producing the wrong tile.
   *
   * kind: 'frames' — `order` lists source cell indices directly, laid out
   *   left-to-right into `outputColumns`. Use for character sheets, where the
   *   engine expects 4 columns (walk cycle) x 4 rows (down/left/right/up).
   *
   * Worked example, commented out because the cell indices below are
   * illustrative — run assets:inspect and replace them with real ones:
   *
   * {
   *   key: 'tileset.ruins',
   *   file: 'tileset-ruins.png',
   *   kind: 'tileset',
   *   pack: 'kenney-tiny-town',
   *   source: 'Tilemap/tilemap_packed.png',
   *   cellW: 16,
   *   cellH: 16,
   *   sourceColumns: 12,
   *   tiles: {
   *     GRASS: 0,
   *     GRASS_ALT: 1,
   *     GRASS_FLOWER: 2,
   *     STONE_FLOOR: 45,
   *     STONE_FLOOR_CRACKED: 46,
   *     PATH: 12,
   *     WALL: 60,
   *     WALL_TOP: 48,
   *     WATER: 24,
   *     PILLAR_BASE: 61,
   *     PILLAR_TOP: 49,
   *     RUBBLE: 47,
   *     STAIRS: 63,
   *   },
   * },
   * {
   *   key: 'actor.kairos.field',
   *   file: 'kairos-walk.png',
   *   kind: 'frames',
   *   pack: 'kenney-tiny-town',
   *   source: 'Tilemap/tilemap_packed.png',
   *   cellW: 16,
   *   cellH: 24,
   *   sourceColumns: 12,
   *   outputColumns: 4,
   *   // down x4, left x4, right x4, up x4
   *   order: [84, 85, 84, 86, 87, 88, 87, 89, 90, 91, 90, 92, 93, 94, 93, 95],
   * },
   */
  outputs: [],
};
