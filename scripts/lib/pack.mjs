/**
 * Getting an art pack onto disk and open: download, verify, extract.
 *
 * Deliberately trust-on-first-use rather than trust-forever. The first run of
 * a pack prints its SHA-256 and you paste that into the config; every run
 * after that refuses to proceed if the bytes have changed. Art packs get
 * silently re-uploaded, and a tileset that gains one row shifts every index
 * after it — which would rewrite the whole map without a single code change.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { unzipSync } from 'fflate';

export const CACHE_DIR = '.assets-cache';

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export class PackError extends Error {}

/**
 * Obtain the archive bytes for a pack.
 *
 * Order of preference: an explicit local file, then the download cache, then
 * the network. Local-first means a blocked or offline environment still works
 * as long as somebody has fetched the zip once.
 *
 * @returns {Promise<{ buffer: Uint8Array, source: string, digest: string }>}
 */
export async function acquireArchive(pack, { from = null, cacheDir = CACHE_DIR, allowNetwork = true } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${pack.id}.zip`);

  let buffer;
  let source;

  if (from) {
    if (!existsSync(from)) throw new PackError(`No such file: ${from}`);
    buffer = new Uint8Array(readFileSync(from));
    source = from;
  } else if (existsSync(cachePath)) {
    buffer = new Uint8Array(readFileSync(cachePath));
    source = `${cachePath} (cached)`;
  } else {
    if (!pack.url) {
      throw new PackError(
        `Pack "${pack.id}" has no download URL.\n` +
          `  Download it from ${pack.homepage ?? 'the pack homepage'} and re-run with:\n` +
          `    npm run assets:import -- --pack ${pack.id} --from path/to/${basename(cachePath)}`,
      );
    }
    if (!allowNetwork) throw new PackError(`Pack "${pack.id}" is not cached and --offline was given`);

    buffer = await download(pack.url);
    writeFileSync(cachePath, buffer);
    source = pack.url;
  }

  const digest = sha256(buffer);

  if (pack.sha256 && pack.sha256 !== digest) {
    throw new PackError(
      `Checksum mismatch for pack "${pack.id}".\n` +
        `  expected ${pack.sha256}\n` +
        `  actual   ${digest}\n` +
        `  The upstream file has changed. Re-inspect the pack before trusting the\n` +
        `  existing tile mapping — indices may have shifted. Delete ${cachePath} to refetch.`,
    );
  }

  return { buffer, source, digest };
}

async function download(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'seikilos-asset-importer' },
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new PackError(`Download failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Unzip in memory. Returns entry path -> bytes, directories omitted.
 * @returns {Record<string, Uint8Array>}
 */
export function extractArchive(buffer) {
  const entries = unzipSync(buffer);
  /** @type {Record<string, Uint8Array>} */
  const files = {};

  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith('/') || bytes.length === 0) continue;
    files[path] = bytes;
  }
  return files;
}

/**
 * Find one entry by path.
 *
 * Packs get re-released with a renamed top-level folder far more often than
 * they get restructured inside it, so an exact miss falls back to matching on
 * the trailing path. An ambiguous fallback is an error, never a guess.
 */
export function findEntry(files, wanted) {
  if (files[wanted]) return files[wanted];

  const normalised = wanted.replace(/^\.?\//, '');
  const matches = Object.keys(files).filter(
    (path) => path === normalised || path.endsWith(`/${normalised}`),
  );

  if (matches.length === 1) return files[matches[0]];
  if (matches.length > 1) {
    throw new PackError(
      `"${wanted}" is ambiguous inside the archive; it matches:\n  ${matches.join('\n  ')}`,
    );
  }

  const pngs = Object.keys(files)
    .filter((path) => path.toLowerCase().endsWith('.png'))
    .slice(0, 25);
  throw new PackError(
    `"${wanted}" is not in the archive. PNGs it does contain:\n  ${pngs.join('\n  ') || '(none)'}`,
  );
}

/** Every PNG in the archive, sorted, for `assets:inspect`. */
export function listPngs(files) {
  return Object.keys(files)
    .filter((path) => path.toLowerCase().endsWith('.png'))
    .sort();
}
