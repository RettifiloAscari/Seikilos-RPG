import type { StatusDef, StatusId } from './types';

/**
 * Status effect definitions.
 *
 * Durations are in seconds of battle time rather than "turns", because an ATB
 * system has no global turn — a fast character gets more actions inside the
 * same poison duration, which is exactly the trade-off we want.
 */
export const STATUSES: Readonly<Record<StatusId, StatusDef>> = {
  poison: {
    id: 'poison',
    name: 'Poison',
    abbrev: 'PSN',
    color: '#9be36b',
    duration: 30,
    dotPercent: 0.04,
    dotInterval: 3,
  },
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    abbrev: 'SLP',
    color: '#8fa9ff',
    duration: 12,
    disables: true,
    freezesAtb: true,
    breaksOnDamage: true,
  },
  stop: {
    id: 'stop',
    name: 'Stop',
    abbrev: 'STP',
    color: '#c8c8d8',
    duration: 8,
    disables: true,
    freezesAtb: true,
  },
  slow: {
    id: 'slow',
    name: 'Slow',
    abbrev: 'SLO',
    color: '#7c8bb0',
    duration: 20,
    atbRate: 0.5,
  },
  haste: {
    id: 'haste',
    name: 'Haste',
    abbrev: 'HST',
    color: '#ffd166',
    duration: 20,
    atbRate: 1.75,
  },
  protect: {
    id: 'protect',
    name: 'Protect',
    abbrev: 'PRO',
    color: '#7fd8ff',
    duration: 25,
    statMul: { def: 1.6 },
  },
  shell: {
    id: 'shell',
    name: 'Shell',
    abbrev: 'SHL',
    color: '#b57bff',
    duration: 25,
    statMul: { res: 1.6 },
  },
  blind: {
    id: 'blind',
    name: 'Blind',
    abbrev: 'BLD',
    color: '#6b6b7a',
    duration: 20,
    statMul: { hit: 0.45 },
  },
  silence: {
    id: 'silence',
    name: 'Silence',
    abbrev: 'SIL',
    color: '#d78fd7',
    duration: 18,
    blocksTechs: true,
  },
  berserk: {
    id: 'berserk',
    name: 'Berserk',
    abbrev: 'BSK',
    color: '#ff6b6b',
    duration: 20,
    forcesAttack: true,
    statMul: { atk: 1.5, def: 0.75 },
  },
};

export function statusDef(id: StatusId): StatusDef {
  return STATUSES[id];
}

/** Statuses the player generally wants; used to colour the HUD tags. */
export const BENEFICIAL: ReadonlySet<StatusId> = new Set<StatusId>(['haste', 'protect', 'shell']);
