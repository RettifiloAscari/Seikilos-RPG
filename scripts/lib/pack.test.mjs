import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { PackError, acquireArchive, extractArchive, findEntry, listPngs, sha256 } from './pack.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeArchive(entries) {
  const payload = {};
  for (const [path, text] of Object.entries(entries)) payload[path] = strToU8(text);
  return zipSync(payload);
}

const ARCHIVE = makeArchive({
  'kenney_tiny-town/Tilemap/tilemap_packed.png': 'fake-png-bytes',
  'kenney_tiny-town/Tiles/tile_0000.png': 'a',
  'kenney_tiny-town/Tiles/tile_0001.png': 'b',
  'kenney_tiny-town/License.txt': 'CC0',
  'kenney_tiny-town/empty/': '',
});

describe('extractArchive', () => {
  it('returns file entries and drops directories', () => {
    const files = extractArchive(ARCHIVE);
    expect(Object.keys(files)).toContain('kenney_tiny-town/License.txt');
    expect(Object.keys(files).some((path) => path.endsWith('/'))).toBe(false);
  });
});

describe('findEntry', () => {
  const files = extractArchive(ARCHIVE);

  it('finds an exact path', () => {
    expect(findEntry(files, 'kenney_tiny-town/Tilemap/tilemap_packed.png')).toBeDefined();
  });

  /** Packs get re-released with a renamed top folder; the inside rarely moves. */
  it('falls back to a trailing-path match so a renamed root folder still works', () => {
    expect(findEntry(files, 'Tilemap/tilemap_packed.png')).toBeDefined();
  });

  it('refuses to guess when the suffix is ambiguous', () => {
    const ambiguous = extractArchive(
      makeArchive({ 'a/sheet.png': 'x', 'b/sheet.png': 'y' }),
    );
    expect(() => findEntry(ambiguous, 'sheet.png')).toThrow(/ambiguous/);
  });

  it('lists the PNGs it does have when a path is missing', () => {
    expect(() => findEntry(files, 'Nope/missing.png')).toThrow(/tilemap_packed\.png/);
  });
});

describe('listPngs', () => {
  it('returns only PNGs, sorted', () => {
    const pngs = listPngs(extractArchive(ARCHIVE));
    expect(pngs).toHaveLength(3);
    expect(pngs.every((path) => path.endsWith('.png'))).toBe(true);
    expect([...pngs]).toEqual(pngs.slice().sort());
  });
});

describe('acquireArchive', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'seikilos-assets-'));

  it('reads a local file and reports its digest', async () => {
    const localPath = join(cacheDir, 'local.zip');
    writeFileSync(localPath, ARCHIVE);

    const result = await acquireArchive({ id: 'test' }, { from: localPath, cacheDir });

    expect(result.digest).toBe(sha256(ARCHIVE));
    expect(result.source).toBe(localPath);
  });

  /**
   * The guard that matters: an upstream re-upload shifting tile indices would
   * otherwise rewrite every map without touching a line of code.
   */
  it('refuses an archive whose checksum does not match the pinned one', async () => {
    const localPath = join(cacheDir, 'local.zip');
    writeFileSync(localPath, ARCHIVE);

    await expect(
      acquireArchive({ id: 'test', sha256: 'deadbeef' }, { from: localPath, cacheDir }),
    ).rejects.toThrow(/Checksum mismatch/);
  });

  it('explains how to supply the file when there is no URL', async () => {
    await expect(
      acquireArchive({ id: 'nourl', homepage: 'https://example.test' }, { cacheDir }),
    ).rejects.toThrow(/no download URL/);
  });

  it('does not reach the network when told not to', async () => {
    await expect(
      acquireArchive({ id: 'offline', url: 'https://example.test/x.zip' }, { cacheDir, allowNetwork: false }),
    ).rejects.toThrow(PackError);
  });
});
