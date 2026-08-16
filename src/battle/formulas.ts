/**
 * All the combat maths in one place.
 *
 * These functions are pure so they can be unit tested and tuned without
 * running the game. If a battle feels wrong, this is the file to edit.
 */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export interface DamageInput {
  /** Tech power. 100 is "a solid basic attack". */
  power: number;
  /** ATK for physical damage, MAG for magical. */
  attack: number;
  /** DEF for physical damage, RES for magical. */
  defense: number;
  /** Element affinity multiplier: 1 neutral, 1.5 weak, 0.5 resist, -1 absorb. */
  affinity?: number;
  critical?: boolean;
  /** A 0..1 roll; 0.5 is the average result. */
  variance?: number;
  /** Ignore the target's defense entirely. */
  piercing?: boolean;
  /** Target chose Defend this turn. */
  guarding?: boolean;
  /** Extra multiplier, e.g. row position or a damage buff. */
  multiplier?: number;
}

export const CRIT_MULTIPLIER = 2;
export const VARIANCE_SPREAD = 0.2; // +/-10%
export const GUARD_MULTIPLIER = 0.5;

/**
 * Core damage formula.
 *
 * Defense scales hyperbolically (`100 / (100 + def)`) rather than subtracting,
 * so stacking defense has diminishing returns and damage can never go negative
 * from mitigation alone. A negative affinity returns a negative number, which
 * the caller treats as healing (absorb).
 */
export function computeDamage(input: DamageInput): number {
  const {
    power,
    attack,
    defense,
    affinity = 1,
    critical = false,
    variance = 0.5,
    piercing = false,
    guarding = false,
    multiplier = 1,
  } = input;

  if (affinity === 0) return 0;

  const mitigation = piercing ? 1 : 100 / (100 + Math.max(0, defense));
  let raw = (power / 100) * Math.max(1, attack) * mitigation;

  if (critical) raw *= CRIT_MULTIPLIER;
  if (guarding) raw *= GUARD_MULTIPLIER;
  raw *= multiplier;
  raw *= 1 - VARIANCE_SPREAD / 2 + VARIANCE_SPREAD * clamp(variance, 0, 1);
  raw *= affinity;

  if (raw < 0) return -Math.max(1, Math.round(-raw)); // absorbed: heals the target
  return Math.max(1, Math.round(raw));
}

/** Healing from a restorative tech. Never critical, small variance. */
export function computeHealing(power: number, magic: number, variance = 0.5): number {
  const raw = (power / 100) * Math.max(1, magic) * (0.95 + 0.1 * clamp(variance, 0, 1));
  return Math.max(1, Math.round(raw));
}

/**
 * Chance for an attack to connect, 0..1.
 *
 * Evasion is a soft counter: it scales the attacker's accuracy down but can
 * never fully lock them out, and accuracy is capped just below certainty so
 * there is always a little tension.
 */
export function hitChance(hit: number, evasion: number): number {
  const attacker = Math.max(1, hit);
  const defender = Math.max(0, evasion);
  return clamp((attacker / (attacker + defender)) * 1.2, 0.05, 0.99);
}

/** Chance for an attack to critically strike, 0..1. */
export function critChance(baseCrit: number, luckBonus = 0): number {
  return clamp(baseCrit + luckBonus, 0, 0.95);
}

/**
 * Fraction of the ATB gauge filled per second at a given speed.
 *
 * Tuned so SPD 10 takes about four seconds per turn and SPD 40 about two,
 * which keeps the pace close to Chrono Trigger's default battle speed.
 */
export function atbRate(speed: number, rateMultiplier = 1, battleSpeed = 1): number {
  return ((Math.max(1, speed) + 20) / 120) * rateMultiplier * battleSpeed;
}

/** Chance to successfully flee a battle, 0..1. */
export function escapeChance(partySpeed: number, enemySpeed: number, attempts: number): number {
  const ratio = partySpeed / Math.max(1, enemySpeed);
  return clamp(0.25 * ratio + 0.15 * attempts, 0.1, 0.95);
}

/**
 * Experience required to advance from `level` to `level + 1`.
 * Superlinear so late levels are a real investment, but never a wall.
 */
export function expToNextLevel(level: number): number {
  return Math.floor(16 * Math.pow(level, 1.75)) + 10 * level;
}

/** Total experience accumulated by the time a character reaches `level`. */
export function totalExpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += expToNextLevel(l);
  return total;
}

/**
 * Experience awarded to each surviving party member.
 * Split is partial rather than even so a smaller party still levels sensibly.
 */
export function expShare(totalExp: number, survivors: number): number {
  if (survivors <= 0) return 0;
  return Math.max(1, Math.round(totalExp / Math.sqrt(survivors)));
}
