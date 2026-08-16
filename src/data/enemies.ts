import { AFFINITY, type EnemyDef } from './types';

/**
 * The bestiary.
 *
 * `ai` is a weighted table evaluated fresh every time the enemy's gauge fills.
 * Entries whose `condition` fails are dropped, then one of the survivors is
 * chosen by weight, so an enemy naturally shifts behaviour as a fight turns.
 */
export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'shardWisp',
    name: 'Shard Wisp',
    desc: 'A splinter of frozen song, drifting where the chorus used to stand.',
    sprite: 'enemy.shardWisp',
    level: 2,
    stats: { hp: 46, mp: 20, atk: 12, def: 6, mag: 16, res: 8, spd: 26, hit: 92, eva: 22, crit: 0.04 },
    exp: 14,
    gold: 9,
    size: { w: 24, h: 24 },
    affinities: { fire: AFFINITY.weak, ice: AFFINITY.resist, physical: AFFINITY.resist },
    drops: [{ item: 'salve', chance: 0.25 }],
    techs: ['enemyChill'],
    ai: [
      { action: 'attack', weight: 3 },
      { action: 'enemyChill', weight: 2 },
    ],
  },
  {
    id: 'graveMoth',
    name: 'Grave Moth',
    desc: 'Feeds on the dust of unfinished melodies.',
    sprite: 'enemy.graveMoth',
    level: 3,
    stats: { hp: 62, mp: 16, atk: 15, def: 9, mag: 14, res: 10, spd: 22, hit: 90, eva: 16, crit: 0.05 },
    exp: 20,
    gold: 12,
    size: { w: 28, h: 24 },
    affinities: { fire: AFFINITY.weak, shadow: AFFINITY.resist },
    drops: [
      { item: 'antidote', chance: 0.3 },
      { item: 'salve', chance: 0.2 },
    ],
    techs: ['enemySporeCloud'],
    ai: [
      { action: 'attack', weight: 4 },
      { action: 'enemySporeCloud', weight: 2, condition: { turnAtLeast: 2 } },
    ],
  },
  {
    id: 'cinderHound',
    name: 'Cinder Hound',
    desc: 'Still guarding a hearth that burned out centuries ago.',
    sprite: 'enemy.cinderHound',
    level: 4,
    stats: { hp: 84, mp: 18, atk: 22, def: 12, mag: 18, res: 12, spd: 28, hit: 94, eva: 14, crit: 0.09 },
    exp: 30,
    gold: 18,
    size: { w: 32, h: 24 },
    affinities: { ice: AFFINITY.weak, fire: AFFINITY.immune },
    drops: [{ item: 'aetherDraught', chance: 0.2 }],
    techs: ['enemyEmber'],
    ai: [
      { action: 'attack', weight: 4 },
      { action: 'enemyEmber', weight: 3 },
      { action: 'enemyEmber', weight: 4, condition: { hpBelow: 0.4 } },
    ],
  },
  {
    id: 'stoneSentry',
    name: 'Stone Sentry',
    desc: 'Carved to keep time. It has not missed a beat in nine hundred years.',
    sprite: 'enemy.stoneSentry',
    level: 5,
    stats: { hp: 145, mp: 10, atk: 26, def: 30, mag: 8, res: 18, spd: 11, hit: 88, eva: 3, crit: 0.04 },
    exp: 48,
    gold: 30,
    size: { w: 32, h: 40 },
    affinities: { lightning: AFFINITY.veryWeak, physical: AFFINITY.resist, shadow: AFFINITY.resist },
    immuneTo: ['sleep', 'poison'],
    drops: [{ item: 'greaterSalve', chance: 0.25 }],
    techs: ['enemyStoneFist'],
    ai: [
      { action: 'attack', weight: 3 },
      { action: 'enemyStoneFist', weight: 3 },
    ],
  },

  // ------------------------------------------------------------------ boss
  {
    id: 'choragos',
    name: 'Choragos',
    desc: 'The chorus leader, still conducting an audience of dust.',
    sprite: 'enemy.choragos',
    level: 7,
    stats: { hp: 620, mp: 80, atk: 30, def: 20, mag: 30, res: 22, spd: 20, hit: 95, eva: 10, crit: 0.07 },
    exp: 260,
    gold: 180,
    size: { w: 48, h: 56 },
    affinities: { light: AFFINITY.resist, shadow: AFFINITY.resist, fire: AFFINITY.weak },
    immuneTo: ['sleep', 'stop'],
    drops: [{ item: 'phoenixLeaf', chance: 1 }],
    techs: ['enemySilencingChord', 'enemyEmber', 'enemyFinalCadence'],
    ai: [
      { action: 'attack', weight: 4 },
      { action: 'enemyEmber', weight: 3 },
      { action: 'enemySilencingChord', weight: 3, condition: { turnAtLeast: 2, maxUses: 3 } },
      // Only opens up once the fight is going badly for it.
      { action: 'enemyFinalCadence', weight: 6, condition: { hpBelow: 0.35 } },
    ],
  },
];

const ENEMY_BY_ID = new Map<string, EnemyDef>(ENEMIES.map((enemy) => [enemy.id, enemy]));

export function getEnemy(id: string): EnemyDef {
  const enemy = ENEMY_BY_ID.get(id);
  if (!enemy) throw new Error(`Unknown enemy id: "${id}"`);
  return enemy;
}
