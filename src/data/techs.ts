import type { TechDef } from './types';

/**
 * Techs: every special move in the game, for party members and enemies alike.
 *
 * The Chrono Trigger mechanic lives in the `users` field. A tech with one user
 * is an ordinary skill. A tech with two or three users is a combo tech, and the
 * battle engine only offers it when *all* of those characters are in the active
 * party and ATB-ready at the same moment, and each already knows the component
 * techs listed in `requires`. That is what makes holding a ready gauge instead
 * of spending it immediately a real tactical decision.
 */
export const TECHS: readonly TechDef[] = [
  // ---------------------------------------------------------------- Kairos
  {
    id: 'cleave',
    name: 'Cleave',
    desc: 'A heavy downward cut on one foe.',
    users: ['kairos'],
    mpCost: 2,
    kind: 'physical',
    element: 'physical',
    power: 150,
    target: 'oneEnemy',
    fx: { shape: 'slash', color: '#dbe9ff', windup: 0.25, shake: 2 },
  },
  {
    id: 'crescentArc',
    name: 'Crescent Arc',
    desc: 'A spinning slash that catches every foe.',
    users: ['kairos'],
    mpCost: 6,
    kind: 'physical',
    element: 'physical',
    power: 95,
    target: 'allEnemies',
    fx: { shape: 'ring', color: '#bcd8ff', windup: 0.3, shake: 3 },
  },
  {
    id: 'stillPoint',
    name: 'Still Point',
    desc: 'Find the pause between beats. Grants Haste.',
    users: ['kairos'],
    mpCost: 8,
    kind: 'support',
    element: 'physical',
    power: 0,
    target: 'self',
    grants: { status: 'haste', chance: 1 },
    fx: { shape: 'aura', color: '#ffd166', windup: 0.2, linger: 0.4 },
  },

  // ----------------------------------------------------------------- Melos
  {
    id: 'emberSong',
    name: 'Ember Song',
    desc: 'A rising note that bursts into flame.',
    users: ['melos'],
    mpCost: 3,
    kind: 'magical',
    element: 'fire',
    power: 140,
    target: 'oneEnemy',
    fx: { shape: 'burst', color: '#ff7a3d', windup: 0.35, shake: 2 },
  },
  {
    id: 'mendingHymn',
    name: 'Mending Hymn',
    desc: 'Restores an ally with a steady melody.',
    users: ['melos'],
    mpCost: 4,
    kind: 'heal',
    element: 'light',
    power: 130,
    target: 'oneAlly',
    fx: { shape: 'aura', color: '#9be36b', windup: 0.25, linger: 0.3 },
  },
  {
    id: 'lullaby',
    name: 'Lullaby',
    desc: 'A drowsy refrain. May put all foes to sleep.',
    users: ['melos'],
    mpCost: 7,
    kind: 'magical',
    element: 'shadow',
    power: 0,
    target: 'allEnemies',
    inflicts: { status: 'sleep', chance: 0.6 },
    fx: { shape: 'ring', color: '#8fa9ff', windup: 0.4, linger: 0.3 },
  },
  {
    id: 'frostVerse',
    name: 'Frost Verse',
    desc: 'Ice crystallises around a point on the field.',
    users: ['melos'],
    mpCost: 9,
    kind: 'magical',
    element: 'ice',
    power: 125,
    target: 'areaEnemies',
    radius: 34,
    fx: { shape: 'burst', color: '#7fd8ff', windup: 0.35, shake: 2 },
  },

  // --------------------------------------------------------------- Threnos
  {
    id: 'gravePress',
    name: 'Grave Press',
    desc: 'Brings the full weight of the earth down on one foe.',
    users: ['threnos'],
    mpCost: 3,
    kind: 'physical',
    element: 'physical',
    power: 175,
    target: 'oneEnemy',
    fx: { shape: 'impact', color: '#c9a06a', windup: 0.45, shake: 5 },
  },
  {
    id: 'dirgeGuard',
    name: 'Dirge Guard',
    desc: 'A low hum that hardens the whole party. Grants Protect.',
    users: ['threnos'],
    mpCost: 8,
    kind: 'support',
    element: 'physical',
    power: 0,
    target: 'allAllies',
    grants: { status: 'protect', chance: 1 },
    fx: { shape: 'aura', color: '#7fd8ff', windup: 0.3, linger: 0.4 },
  },
  {
    id: 'shadowKnell',
    name: 'Shadow Knell',
    desc: 'A tolling bell that drags at everything nearby.',
    users: ['threnos'],
    mpCost: 11,
    kind: 'magical',
    element: 'shadow',
    power: 130,
    target: 'areaEnemies',
    radius: 38,
    inflicts: { status: 'slow', chance: 0.35 },
    fx: { shape: 'ring', color: '#b57bff', windup: 0.4, shake: 3 },
  },

  // ------------------------------------------------------------ Dual techs
  {
    id: 'resonantEdge',
    name: 'Resonant Edge',
    desc: 'Melos sets the blade singing; Kairos lands the note.',
    users: ['kairos', 'melos'],
    requires: ['cleave', 'emberSong'],
    mpCost: 5,
    kind: 'physical',
    element: 'fire',
    power: 230,
    target: 'oneEnemy',
    fx: { shape: 'slash', color: '#ffa64d', windup: 0.5, shake: 5 },
  },
  {
    id: 'twinCadence',
    name: 'Twin Cadence',
    desc: 'Two strikes on the same beat, cutting a line through the field.',
    users: ['kairos', 'threnos'],
    requires: ['cleave', 'gravePress'],
    mpCost: 6,
    kind: 'physical',
    element: 'physical',
    power: 165,
    target: 'lineEnemies',
    fx: { shape: 'beam', color: '#ffe0a8', windup: 0.5, shake: 5 },
  },
  {
    id: 'healingRefrain',
    name: 'Healing Refrain',
    desc: 'Hymn and dirge in harmony. Heals and shields the party.',
    users: ['melos', 'threnos'],
    requires: ['mendingHymn', 'dirgeGuard'],
    mpCost: 9,
    kind: 'heal',
    element: 'light',
    power: 145,
    target: 'allAllies',
    grants: { status: 'protect', chance: 1 },
    fx: { shape: 'aura', color: '#b8ffd0', windup: 0.45, linger: 0.5 },
  },

  // ---------------------------------------------------------- Triple tech
  {
    id: 'seikilosRefrain',
    name: 'Seikilos Refrain',
    desc: 'The whole song, sung at once. While you live, shine.',
    users: ['kairos', 'melos', 'threnos'],
    requires: ['crescentArc', 'emberSong', 'gravePress'],
    mpCost: 12,
    kind: 'magical',
    element: 'light',
    power: 260,
    target: 'allEnemies',
    piercing: true,
    fx: { shape: 'rain', color: '#fff2b8', windup: 0.9, linger: 0.6, shake: 8 },
  },

  // -------------------------------------------------------- Enemy-only techs
  {
    id: 'enemyEmber',
    name: 'Ember',
    desc: 'A gout of flame.',
    users: ['@enemy'],
    mpCost: 0,
    kind: 'magical',
    element: 'fire',
    power: 115,
    target: 'oneEnemy',
    fx: { shape: 'burst', color: '#ff7a3d', windup: 0.3, shake: 2 },
  },
  {
    id: 'enemyChill',
    name: 'Chill Touch',
    desc: 'A numbing cold that slows its victim.',
    users: ['@enemy'],
    mpCost: 0,
    kind: 'magical',
    element: 'ice',
    power: 95,
    target: 'oneEnemy',
    inflicts: { status: 'slow', chance: 0.4 },
    fx: { shape: 'burst', color: '#7fd8ff', windup: 0.3 },
  },
  {
    id: 'enemySporeCloud',
    name: 'Spore Cloud',
    desc: 'Poisonous dust over the whole party.',
    users: ['@enemy'],
    mpCost: 0,
    kind: 'magical',
    element: 'shadow',
    power: 60,
    target: 'allEnemies',
    inflicts: { status: 'poison', chance: 0.7 },
    fx: { shape: 'ring', color: '#9be36b', windup: 0.35 },
  },
  {
    id: 'enemyStoneFist',
    name: 'Stone Fist',
    desc: 'A slow, crushing blow.',
    users: ['@enemy'],
    mpCost: 0,
    kind: 'physical',
    element: 'physical',
    power: 165,
    target: 'oneEnemy',
    fx: { shape: 'impact', color: '#c9a06a', windup: 0.5, shake: 4 },
  },
  {
    id: 'enemySilencingChord',
    name: 'Silencing Chord',
    desc: 'A discordant strike that stills the voice.',
    users: ['@enemy'],
    mpCost: 0,
    kind: 'magical',
    element: 'shadow',
    power: 80,
    target: 'allEnemies',
    inflicts: { status: 'silence', chance: 0.55 },
    fx: { shape: 'ring', color: '#d78fd7', windup: 0.45, shake: 3 },
  },
  {
    id: 'enemyFinalCadence',
    name: 'Final Cadence',
    desc: 'A closing chord meant to end the song for good.',
    users: ['@enemy'],
    mpCost: 0,
    kind: 'magical',
    element: 'light',
    power: 145,
    target: 'allEnemies',
    fx: { shape: 'rain', color: '#fff2b8', windup: 0.8, shake: 7 },
  },
];

const TECH_BY_ID = new Map<string, TechDef>(TECHS.map((tech) => [tech.id, tech]));

export function getTech(id: string): TechDef {
  const tech = TECH_BY_ID.get(id);
  if (!tech) throw new Error(`Unknown tech id: "${id}"`);
  return tech;
}

export function tryGetTech(id: string): TechDef | undefined {
  return TECH_BY_ID.get(id);
}

/** Every combo tech (two or more users) in definition order. */
export const COMBO_TECHS: readonly TechDef[] = TECHS.filter((tech) => tech.users.length > 1);

/** Techs a single character can perform alone. */
export function singleTechsFor(actorId: string): TechDef[] {
  return TECHS.filter((tech) => tech.users.length === 1 && tech.users[0] === actorId);
}
