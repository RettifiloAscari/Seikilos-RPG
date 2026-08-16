import type { Assets } from '../core/assets';
import { generatePlaceholderArt } from './placeholder';

/**
 * Real artwork, keyed the same way as the generated placeholders.
 *
 * Anything listed here overrides its placeholder. Drop a PNG into
 * `public/assets/` and add a line — that is the whole swap. Entries that fail
 * to load are logged and fall back to the placeholder, so a missing file never
 * breaks the build or the game.
 *
 * Expected formats:
 *   tileset.*        16x16 tiles, 8 columns, indices matching `TILES`
 *   actor.*.field    16x24 frames, 4 columns (walk cycle) x 4 rows (down/left/right/up)
 *   actor.*.battle   24x32 frames, 4 columns (idle/ready/attack/hurt)
 *   enemy.*          a single frame at the size declared in the enemy's `size`
 *   battlebg.*       384x216
 */
export const ART_MANIFEST: Record<string, string> = {
  // 'tileset.ruins': 'assets/tileset-ruins.png',
  // 'actor.kairos.field': 'assets/kairos-walk.png',
};

export async function loadArt(assets: Assets): Promise<void> {
  // Placeholders first, so every key is always populated.
  generatePlaceholderArt(assets);

  if (Object.keys(ART_MANIFEST).length === 0) return;

  const failures = await assets.loadImagesOptional(ART_MANIFEST);
  if (failures.length > 0) {
    console.warn(`[art] using placeholders for: ${failures.join(', ')}`);
  }
}
