/**
 * Global tuning constants.
 *
 * The game renders to a small virtual screen and is then scaled up by an
 * integer factor, which is what gives it a crisp pixel-art look. 384x216 is
 * 16:9 and scales exactly 5x to 1920x1080.
 */

export const VIRTUAL_W = 384;
export const VIRTUAL_H = 216;

/** Size of one map tile, in virtual pixels. */
export const TILE = 16;

/** Logic runs at a fixed rate so physics and ATB are deterministic. */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Never simulate more than this much time in one frame (tab-switch guard). */
export const MAX_FRAME_TIME = 0.25;
