import type { EncounterDef } from './types';

/**
 * Battle setups.
 *
 * `x`/`y` are positions on the battle field in virtual pixels, which matters:
 * area and line techs resolve against these coordinates, so how a group is
 * arranged changes which techs are worth using against it.
 */
export const ENCOUNTERS: readonly EncounterDef[] = [
  {
    id: 'ruins.wisps',
    background: 'battlebg.ruins',
    members: [
      { enemy: 'shardWisp', x: 250, y: 74 },
      { enemy: 'shardWisp', x: 300, y: 96 },
    ],
  },
  {
    id: 'ruins.moths',
    background: 'battlebg.ruins',
    members: [
      { enemy: 'graveMoth', x: 244, y: 66 },
      { enemy: 'graveMoth', x: 288, y: 92 },
      { enemy: 'shardWisp', x: 316, y: 64 },
    ],
  },
  {
    id: 'ruins.hounds',
    background: 'battlebg.ruins',
    members: [
      { enemy: 'cinderHound', x: 250, y: 88 },
      { enemy: 'cinderHound', x: 302, y: 66 },
    ],
  },
  {
    id: 'ruins.sentry',
    background: 'battlebg.ruins',
    members: [
      { enemy: 'stoneSentry', x: 262, y: 72 },
      { enemy: 'graveMoth', x: 314, y: 96 },
    ],
  },
  {
    // Three in a row, which is exactly what Twin Cadence's line hit is for.
    id: 'ruins.line',
    background: 'battlebg.ruins',
    members: [
      { enemy: 'shardWisp', x: 248, y: 84 },
      { enemy: 'graveMoth', x: 288, y: 84 },
      { enemy: 'cinderHound', x: 330, y: 84 },
    ],
  },
  {
    id: 'boss.choragos',
    background: 'battlebg.sanctum',
    boss: true,
    noEscape: true,
    members: [{ enemy: 'choragos', x: 286, y: 62 }],
  },
];

const ENCOUNTER_BY_ID = new Map<string, EncounterDef>(ENCOUNTERS.map((e) => [e.id, e]));

export function getEncounter(id: string): EncounterDef {
  const encounter = ENCOUNTER_BY_ID.get(id);
  if (!encounter) throw new Error(`Unknown encounter id: "${id}"`);
  return encounter;
}
