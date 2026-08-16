import { describe, expect, it } from 'vitest';
import {
  atbRate,
  computeDamage,
  computeHealing,
  critChance,
  escapeChance,
  expShare,
  expToNextLevel,
  hitChance,
  totalExpForLevel,
} from './formulas';

describe('computeDamage', () => {
  it('scales with power', () => {
    const weak = computeDamage({ power: 50, attack: 40, defense: 20 });
    const strong = computeDamage({ power: 150, attack: 40, defense: 20 });
    expect(strong).toBeGreaterThan(weak);
  });

  it('gives defense diminishing returns and never goes below 1', () => {
    const soft = computeDamage({ power: 100, attack: 40, defense: 0 });
    const armored = computeDamage({ power: 100, attack: 40, defense: 100 });
    const tank = computeDamage({ power: 100, attack: 40, defense: 10_000 });

    expect(armored).toBeLessThan(soft);
    expect(armored).toBeCloseTo(soft / 2, 0); // def 100 halves damage by design
    expect(tank).toBe(1);
  });

  it('ignores defense when piercing', () => {
    const normal = computeDamage({ power: 100, attack: 40, defense: 200 });
    const pierce = computeDamage({ power: 100, attack: 40, defense: 200, piercing: true });
    expect(pierce).toBeGreaterThan(normal);
    expect(pierce).toBe(computeDamage({ power: 100, attack: 40, defense: 0 }));
  });

  // Results are rounded to whole numbers, so ratio checks allow 1 point of slack.
  const ROUNDING = 1;

  it('doubles on a critical hit', () => {
    const base = computeDamage({ power: 100, attack: 40, defense: 20 });
    const crit = computeDamage({ power: 100, attack: 40, defense: 20, critical: true });
    expect(Math.abs(crit - base * 2)).toBeLessThanOrEqual(ROUNDING);
  });

  it('halves against a guarding target', () => {
    const base = computeDamage({ power: 100, attack: 60, defense: 20 });
    const guarded = computeDamage({ power: 100, attack: 60, defense: 20, guarding: true });
    expect(Math.abs(guarded - base / 2)).toBeLessThanOrEqual(ROUNDING);
  });

  it('applies elemental affinity', () => {
    const neutral = computeDamage({ power: 100, attack: 40, defense: 20, affinity: 1 });
    const weak = computeDamage({ power: 100, attack: 40, defense: 20, affinity: 1.5 });
    const resist = computeDamage({ power: 100, attack: 40, defense: 20, affinity: 0.5 });

    expect(weak).toBe(Math.round(neutral * 1.5));
    expect(resist).toBe(Math.round(neutral * 0.5));
  });

  it('returns zero when the target is immune', () => {
    expect(computeDamage({ power: 200, attack: 99, defense: 0, affinity: 0 })).toBe(0);
  });

  it('returns a negative number when the element is absorbed', () => {
    const absorbed = computeDamage({ power: 100, attack: 40, defense: 20, affinity: -1 });
    expect(absorbed).toBeLessThan(0);
  });

  it('keeps variance inside +/-10% of the average roll', () => {
    const low = computeDamage({ power: 100, attack: 100, defense: 50, variance: 0 });
    const mid = computeDamage({ power: 100, attack: 100, defense: 50, variance: 0.5 });
    const high = computeDamage({ power: 100, attack: 100, defense: 50, variance: 1 });

    expect(low).toBeLessThan(mid);
    expect(high).toBeGreaterThan(mid);
    expect(Math.abs(low - mid * 0.9)).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(high - mid * 1.1)).toBeLessThanOrEqual(ROUNDING);
  });

  it('clamps a variance roll outside 0..1 instead of exploding', () => {
    expect(computeDamage({ power: 100, attack: 50, defense: 10, variance: 99 })).toBe(
      computeDamage({ power: 100, attack: 50, defense: 10, variance: 1 }),
    );
  });
});

describe('computeHealing', () => {
  it('scales with magic and always restores at least 1', () => {
    expect(computeHealing(100, 50)).toBeGreaterThan(computeHealing(100, 10));
    expect(computeHealing(1, 1)).toBeGreaterThanOrEqual(1);
  });
});

describe('hitChance', () => {
  it('is high against no evasion and drops as evasion climbs', () => {
    expect(hitChance(95, 0)).toBeGreaterThan(0.95);
    expect(hitChance(95, 95)).toBeLessThan(hitChance(95, 10));
  });

  it('never reaches certainty or hopelessness', () => {
    expect(hitChance(9999, 0)).toBeLessThanOrEqual(0.99);
    expect(hitChance(1, 9999)).toBeGreaterThanOrEqual(0.05);
  });
});

describe('critChance', () => {
  it('clamps into a sane range', () => {
    expect(critChance(0.05)).toBeCloseTo(0.05);
    expect(critChance(0.9, 0.5)).toBe(0.95);
    expect(critChance(-1)).toBe(0);
  });
});

describe('atbRate', () => {
  it('fills faster at higher speed', () => {
    expect(atbRate(40)).toBeGreaterThan(atbRate(10));
  });

  it('lands near the intended turn lengths', () => {
    expect(1 / atbRate(10)).toBeCloseTo(4, 0); // ~4s per turn at SPD 10
    expect(1 / atbRate(40)).toBeCloseTo(2, 0); // ~2s per turn at SPD 40
  });

  it('respects status and global speed multipliers', () => {
    expect(atbRate(20, 2)).toBeCloseTo(atbRate(20) * 2);
    expect(atbRate(20, 1, 0.5)).toBeCloseTo(atbRate(20) * 0.5);
  });
});

describe('escapeChance', () => {
  it('improves with speed and with repeated attempts', () => {
    expect(escapeChance(40, 20, 0)).toBeGreaterThan(escapeChance(20, 40, 0));
    expect(escapeChance(20, 20, 3)).toBeGreaterThan(escapeChance(20, 20, 0));
  });

  it('stays within bounds', () => {
    expect(escapeChance(1, 999, 0)).toBeGreaterThanOrEqual(0.1);
    expect(escapeChance(999, 1, 10)).toBeLessThanOrEqual(0.95);
  });
});

describe('experience curve', () => {
  it('increases monotonically', () => {
    for (let level = 1; level < 60; level++) {
      expect(expToNextLevel(level + 1)).toBeGreaterThan(expToNextLevel(level));
    }
  });

  it('accumulates totals consistently', () => {
    expect(totalExpForLevel(1)).toBe(0);
    expect(totalExpForLevel(3)).toBe(expToNextLevel(1) + expToNextLevel(2));
  });

  it('splits experience partially rather than evenly', () => {
    const solo = expShare(300, 1);
    const trio = expShare(300, 3);
    expect(solo).toBe(300);
    expect(trio).toBeGreaterThan(100); // a full split would give exactly 100
    expect(trio).toBeLessThan(solo);
  });
});
