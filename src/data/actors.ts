import type { ActorDef } from './types';

/**
 * The playable cast.
 *
 * `base` is the level 1 stat line and `growth` is added on every level up, so
 * a character's level 20 numbers are `base + growth * 19`. Keeping growth as
 * plain per-level deltas makes the curves easy to reason about and to retune.
 */
export const ACTORS: readonly ActorDef[] = [
  {
    id: 'kairos',
    name: 'Kairos',
    title: 'Swordsman of the Opportune Moment',
    fieldSprite: 'actor.kairos.field',
    battleSprite: 'actor.kairos.battle',
    color: '#6fb7ff',
    base: {
      hp: 120,
      mp: 18,
      atk: 22,
      def: 16,
      mag: 8,
      res: 10,
      spd: 24,
      hit: 96,
      eva: 14,
      crit: 0.08,
    },
    growth: { hp: 14, mp: 2, atk: 2.6, def: 1.6, mag: 0.7, res: 1.0, spd: 1.0, hit: 0.5, eva: 0.5, crit: 0.003 },
    learns: [
      { level: 1, tech: 'cleave' },
      { level: 3, tech: 'crescentArc' },
      { level: 6, tech: 'stillPoint' },
    ],
    equipSlots: ['weapon', 'armor', 'accessory'],
  },
  {
    id: 'melos',
    name: 'Melos',
    title: 'Keeper of the Old Songs',
    fieldSprite: 'actor.melos.field',
    battleSprite: 'actor.melos.battle',
    color: '#ff9ad5',
    base: {
      hp: 88,
      mp: 40,
      atk: 12,
      def: 10,
      mag: 24,
      res: 20,
      spd: 21,
      hit: 94,
      eva: 12,
      crit: 0.05,
    },
    growth: { hp: 9, mp: 5, atk: 1.1, def: 1.0, mag: 2.8, res: 2.0, spd: 0.9, hit: 0.4, eva: 0.4, crit: 0.002 },
    learns: [
      { level: 1, tech: 'emberSong' },
      { level: 2, tech: 'mendingHymn' },
      { level: 5, tech: 'lullaby' },
      { level: 7, tech: 'frostVerse' },
    ],
    equipSlots: ['weapon', 'armor', 'accessory'],
  },
  {
    id: 'threnos',
    name: 'Threnos',
    title: 'The Mourner',
    fieldSprite: 'actor.threnos.field',
    battleSprite: 'actor.threnos.battle',
    color: '#ffb45c',
    base: {
      hp: 155,
      mp: 24,
      atk: 26,
      def: 22,
      mag: 14,
      res: 14,
      spd: 15,
      hit: 90,
      eva: 8,
      crit: 0.06,
    },
    growth: { hp: 19, mp: 3, atk: 3.0, def: 2.3, mag: 1.5, res: 1.3, spd: 0.6, hit: 0.4, eva: 0.25, crit: 0.002 },
    learns: [
      { level: 1, tech: 'gravePress' },
      { level: 4, tech: 'dirgeGuard' },
      { level: 7, tech: 'shadowKnell' },
    ],
    equipSlots: ['weapon', 'armor', 'accessory'],
  },
];

const ACTOR_BY_ID = new Map<string, ActorDef>(ACTORS.map((actor) => [actor.id, actor]));

export function getActor(id: string): ActorDef {
  const actor = ACTOR_BY_ID.get(id);
  if (!actor) throw new Error(`Unknown actor id: "${id}"`);
  return actor;
}
