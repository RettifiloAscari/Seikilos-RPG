/**
 * The logical buttons the game understands.
 *
 * Split into its own module so the keyboard and gamepad layers can both depend
 * on it without importing each other.
 */

export const BUTTONS = [
  'up',
  'down',
  'left',
  'right',
  'confirm',
  'cancel',
  'menu',
  'run',
  'start',
] as const;

export type Button = (typeof BUTTONS)[number];
