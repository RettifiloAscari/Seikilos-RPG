/**
 * Player preferences, kept separate from save files.
 *
 * These belong to the machine rather than the playthrough — you don't want
 * loading an old save to plug your flight stick back into the movement keys.
 */

export interface Settings {
  /** Read game controllers at all. Keyboard is never affected. */
  gamepadEnabled: boolean;
  /**
   * Trust controllers that don't report standard mapping. Off by default:
   * this is what lets a flight stick or wheel drive the game, usually badly.
   */
  allowNonStandardGamepads: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  gamepadEnabled: true,
  allowNonStandardGamepads: false,
};

const STORAGE_KEY = 'seikilos.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge over the defaults so a setting added later is never undefined.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or a blocked file:// origin; the setting still applies
    // for this session, it just won't be remembered.
  }
}
