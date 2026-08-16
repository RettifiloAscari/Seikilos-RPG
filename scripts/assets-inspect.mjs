/**
 * Look inside an art pack.
 *
 * Prints every PNG with its dimensions and the cell grids that divide it
 * evenly, then writes numbered contact sheets. Reading cell indices off a
 * contact sheet is the one step of the import that genuinely needs eyes;
 * everything downstream is mechanical.
 *
 *   npm run assets:inspect -- --pack kenney-tiny-town --from ~/Downloads/pack.zip
 *   npm run assets:inspect -- --pack kenney-tiny-town --sheet Tilemap/tilemap_packed.png --cell 16
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { contactSheet, decodePng, gridOf, writePng } from './lib/atlas.mjs';
import { acquireArchive, extractArchive, findEntry, listPngs, PackError } from './lib/pack.mjs';
import { loadConfig } from './lib/config.mjs';

/** Cell sizes worth reporting when guessing a sheet's layout. */
const CANDIDATE_CELLS = [8, 16, 24, 32, 48, 64];
const OUT_DIR = 'shots/contact';

function parseArgs(argv) {
  const args = { pack: null, from: null, sheet: null, cell: null, scale: 3 };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[i + 1];
    const consume = () => {
      if (inline === undefined) i++;
      return value;
    };

    switch (flag) {
      case '--pack':
        args.pack = consume();
        break;
      case '--from':
        args.from = consume();
        break;
      case '--sheet':
        args.sheet = consume();
        break;
      case '--cell':
        args.cell = Number(consume());
        break;
      case '--scale':
        args.scale = Number(consume());
        break;
      default:
        if (flag.startsWith('--')) throw new Error(`Unknown flag ${flag}`);
    }
  }
  return args;
}

/** Cell sizes that divide the image evenly, largest first. */
function plausibleGrids(image) {
  return CANDIDATE_CELLS.filter((size) => {
    const grid = gridOf(image, size, size);
    return grid.exact && grid.columns > 1 && grid.rows >= 1;
  })
    .map((size) => {
      const grid = gridOf(image, size, size);
      return `${size}px -> ${grid.columns}x${grid.rows} (${grid.columns * grid.rows} cells)`;
    })
    .reverse();
}

/** Largest standard cell size that divides the image evenly. */
function inferCell(image) {
  for (const size of [...CANDIDATE_CELLS].reverse()) {
    const grid = gridOf(image, size, size);
    if (grid.exact && grid.columns > 1) return size;
  }
  return null;
}

/** More than a handful of cells means it is an atlas, not a single sprite. */
function isAtlasLike(image, cell) {
  const grid = gridOf(image, cell, cell);
  return grid.columns * grid.rows >= 4;
}

function safeName(packId, path) {
  return `${packId}-${path.replace(/\.png$/i, '').replace(/[^a-z0-9]+/gi, '-')}`.replace(/-+/g, '-');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();

  const pack = args.pack ? config.packs.find((candidate) => candidate.id === args.pack) : config.packs[0];
  if (!pack) {
    console.error(`Unknown pack "${args.pack}". Configured: ${config.packs.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`pack: ${pack.name} (${pack.id}) — ${pack.license}, ${pack.author}`);

  const { buffer, source, digest } = await acquireArchive(pack, { from: args.from });
  console.log(`source: ${source}`);
  console.log(`sha256: ${digest}`);
  console.log(
    pack.sha256 ? '        (matches the pinned checksum)\n' : '        ^ paste into assets.config.mjs to pin this pack\n',
  );

  const files = extractArchive(buffer);
  const pngs = listPngs(files);
  console.log(`${pngs.length} PNG(s) in the archive:\n`);

  const targets = args.sheet ? [args.sheet] : pngs;
  mkdirSync(OUT_DIR, { recursive: true });

  for (const path of targets) {
    let image;
    try {
      image = decodePng(findEntry(files, path));
    } catch (error) {
      console.log(`  ${path}\n      cannot read: ${error.message}`);
      continue;
    }

    const grids = plausibleGrids(image);
    console.log(`  ${path}`);
    console.log(`      ${image.width}x${image.height}px`);
    console.log(
      grids.length > 0
        ? `      grids: ${grids.join(' | ')}`
        : '      no clean grid at standard cell sizes (spacing or padding?)',
    );

    // Only sheet out things that actually look like atlases, unless asked.
    const cell = args.cell ?? inferCell(image);
    if (!cell) continue;
    if (!args.sheet && !isAtlasLike(image, cell)) continue;

    const sheet = contactSheet(image, { cellW: cell, cellH: cell, scale: args.scale });
    const outPath = join(OUT_DIR, `${safeName(pack.id, path)}-${cell}px.png`);
    writePng(outPath, sheet);
    console.log(`      contact sheet -> ${outPath}`);
  }

  console.log('\nOpen the contact sheets, note the numbers you want, and put them into');
  console.log('assets.config.mjs. Then run: npm run assets:import');
}

main().catch((error) => {
  console.error(error instanceof PackError ? `\n${error.message}\n` : error);
  process.exit(1);
});
