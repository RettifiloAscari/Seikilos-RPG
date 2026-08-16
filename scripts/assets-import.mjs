/**
 * Build real art into `public/assets/` from the packs in `assets.config.mjs`.
 *
 * Slices each source sheet, rearranges its cells into the layout the engine
 * expects, writes the PNGs, regenerates the art manifest, and records
 * attribution in CREDITS.md. Deterministic: same inputs, same bytes out, so a
 * re-import shows up as an empty diff unless something actually changed.
 *
 *   npm run assets:import
 *   npm run assets:import -- --pack kenney-tiny-town --from ~/Downloads/pack.zip
 *   npm run assets:import -- --check      # validate config, write nothing
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquireArchive, extractArchive, PackError } from './lib/pack.mjs';
import { buildOutputs, renderCredits, renderManifest } from './lib/build.mjs';
import { loadConfig, validateConfig } from './lib/config.mjs';
import { readTileEnum } from './lib/tiles.mjs';

const ASSET_DIR = 'public/assets';
const MANIFEST_PATH = 'src/art/manifest.generated.ts';
const CREDITS_PATH = 'CREDITS.md';
const TILE_ENUM_SOURCE = 'src/art/placeholder.ts';

function parseArgs(argv) {
  const args = { pack: null, from: null, check: false, offline: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=');
    const consume = () => {
      const value = inline ?? argv[i + 1];
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
      case '--check':
        args.check = true;
        break;
      case '--offline':
        args.offline = true;
        break;
      default:
        if (flag.startsWith('--')) throw new Error(`Unknown flag ${flag}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();
  const tileEnum = readTileEnum(TILE_ENUM_SOURCE);

  const problems = validateConfig(config, tileEnum);
  if (problems.length > 0) {
    console.error('assets.config.mjs has problems:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const outputs = args.pack ? config.outputs.filter((o) => o.pack === args.pack) : config.outputs;

  if (config.outputs.length === 0) {
    console.log('Config is valid, but no outputs are defined yet.\n');
    console.log('Run `npm run assets:inspect -- --pack <id> --from <zip>` to get numbered');
    console.log('contact sheets, then fill in an output entry in assets.config.mjs.');
    console.log('(The commented example in that file shows the shape.)\n');
    console.log('Until then the game keeps using its procedural placeholder art.');
    return;
  }

  if (args.check) {
    console.log(`Config is valid: ${config.packs.length} pack(s), ${config.outputs.length} output(s).`);
    return;
  }

  // Each archive is opened once even if several outputs draw from it.
  const archives = new Map();
  const unpinned = [];

  for (const packId of new Set(outputs.map((output) => output.pack))) {
    const pack = config.packs.find((candidate) => candidate.id === packId);
    const { buffer, source, digest } = await acquireArchive(pack, {
      from: args.pack === pack.id ? args.from : null,
      allowNetwork: !args.offline,
    });

    if (!pack.sha256) {
      unpinned.push(`Pack "${pack.id}" is unpinned. Add sha256: '${digest}' to assets.config.mjs.`);
    }
    console.log(`${pack.id}: ${source}`);
    archives.set(pack.id, extractArchive(buffer));
  }

  const { artifacts, manifest, warnings } = buildOutputs({ config, tileEnum, archives, outputs });

  mkdirSync(ASSET_DIR, { recursive: true });
  for (const artifact of artifacts) {
    const outPath = join(ASSET_DIR, artifact.file);
    writeFileSync(outPath, artifact.bytes);
    console.log(`  ${artifact.key.padEnd(24)} -> ${outPath} (${artifact.width}x${artifact.height})`);
  }

  writeFileSync(MANIFEST_PATH, renderManifest(manifest));
  console.log(`\nmanifest -> ${MANIFEST_PATH} (${Object.keys(manifest).length} entries)`);

  const credited = config.packs.filter((pack) => archives.has(pack.id));
  writeFileSync(CREDITS_PATH, renderCredits(credited));
  console.log(`credits  -> ${CREDITS_PATH}`);

  const allWarnings = [...unpinned, ...warnings];
  if (allWarnings.length > 0) {
    console.log('\nwarnings:');
    for (const warning of allWarnings) console.log(`  ! ${warning}`);
  }
}

main().catch((error) => {
  console.error(error instanceof PackError ? `\n${error.message}\n` : error);
  process.exit(1);
});
