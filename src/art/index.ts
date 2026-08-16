import type { Assets } from '../core/assets';
import { GENERATED_MANIFEST } from './manifest.generated';
import { generatePlaceholderArt } from './placeholder';

/**
 * Hand-written art overrides, keyed the same way as the generated placeholders.
 *
 * Most real art should arrive through `npm run assets:import`, which writes
 * `manifest.generated.ts`. Use this file for one-off pieces that aren't sliced
 * out of a pack — a bespoke title screen, a boss nobody else drew.
 *
 * Expected formats:
 *   tileset.*        16x16 tiles, 8 columns, indices matching `TILES`
 *   actor.*.field    16x24 frames, 4 columns (walk cycle) x 4 rows (down/left/right/up)
 *   actor.*.battle   24x32 frames, 4 columns (idle/ready/attack/hurt)
 *   enemy.*          a single frame at the size declared in the enemy's `size`
 *   battlebg.*       384x216
 */
export const ART_MANIFEST: Record<string, string> = {
  // 'battlebg.sanctum': 'assets/sanctum.png',
};

/**
 * Hand-written entries win over imported ones, so overriding a single sliced
 * tile sheet doesn't mean abandoning the importer for everything else.
 */
export function resolveManifest(): Record<string, string> {
  return { ...GENERATED_MANIFEST, ...ART_MANIFEST };
}

export async function loadArt(assets: Assets): Promise<void> {
  // Placeholders first, so every key is always populated.
  generatePlaceholderArt(assets);

  const manifest = resolveManifest();
  if (Object.keys(manifest).length === 0) return;

  const failures = await assets.loadImagesOptional(manifest);
  if (failures.length > 0) {
    console.warn(`[art] using placeholders for: ${failures.join(', ')}`);
  }
}
