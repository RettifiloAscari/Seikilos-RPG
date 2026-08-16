import type { ItemDef } from './types';

/** Consumables, equipment and key items. */
export const ITEMS: readonly ItemDef[] = [
  // ---------------------------------------------------------- consumables
  {
    id: 'salve',
    name: 'Salve',
    desc: 'Restores 80 HP to one ally.',
    kind: 'consumable',
    price: 30,
    usableInBattle: true,
    usableInField: true,
    target: 'oneAlly',
    effect: { hp: 80 },
  },
  {
    id: 'greaterSalve',
    name: 'Greater Salve',
    desc: 'Restores 260 HP to one ally.',
    kind: 'consumable',
    price: 120,
    usableInBattle: true,
    usableInField: true,
    target: 'oneAlly',
    effect: { hp: 260 },
  },
  {
    id: 'chorusSalve',
    name: 'Chorus Salve',
    desc: 'Restores 120 HP to the whole party.',
    kind: 'consumable',
    price: 300,
    usableInBattle: true,
    usableInField: true,
    target: 'allAllies',
    effect: { hp: 120 },
  },
  {
    id: 'aetherDraught',
    name: 'Aether Draught',
    desc: 'Restores 30 MP to one ally.',
    kind: 'consumable',
    price: 100,
    usableInBattle: true,
    usableInField: true,
    target: 'oneAlly',
    effect: { mp: 30 },
  },
  {
    id: 'antidote',
    name: 'Antidote',
    desc: 'Cures Poison and Silence.',
    kind: 'consumable',
    price: 25,
    usableInBattle: true,
    usableInField: true,
    target: 'oneAlly',
    effect: { cures: ['poison', 'silence'] },
  },
  {
    id: 'wakingBell',
    name: 'Waking Bell',
    desc: 'Cures Sleep, Stop and Slow.',
    kind: 'consumable',
    price: 40,
    usableInBattle: true,
    usableInField: true,
    target: 'oneAlly',
    effect: { cures: ['sleep', 'stop', 'slow'] },
  },
  {
    id: 'phoenixLeaf',
    name: 'Phoenix Leaf',
    desc: 'Revives a fallen ally with half their HP.',
    kind: 'consumable',
    price: 200,
    usableInBattle: true,
    usableInField: true,
    target: 'deadAlly',
    effect: { revive: 0.5 },
  },
  {
    id: 'emberShard',
    name: 'Ember Shard',
    desc: 'Hurl it for fire damage to one foe. Ignores defence.',
    kind: 'consumable',
    price: 80,
    usableInBattle: true,
    target: 'oneEnemy',
    effect: { damage: 120, element: 'fire' },
  },

  // ------------------------------------------------------------- weapons
  {
    id: 'bronzeBlade',
    name: 'Bronze Blade',
    desc: 'A serviceable sword, older than anyone remembers.',
    kind: 'weapon',
    price: 120,
    equip: { slot: 'weapon', stats: { atk: 8, hit: 2 }, users: ['kairos'] },
  },
  {
    id: 'tunedEdge',
    name: 'Tuned Edge',
    desc: 'Hums faintly. Rings true when it strikes.',
    kind: 'weapon',
    price: 420,
    equip: { slot: 'weapon', stats: { atk: 18, hit: 3, crit: 0.05 }, users: ['kairos'] },
  },
  {
    id: 'reedLyre',
    name: 'Reed Lyre',
    desc: 'Six strings, three of them original.',
    kind: 'weapon',
    price: 110,
    equip: { slot: 'weapon', stats: { atk: 3, mag: 9 }, users: ['melos'] },
  },
  {
    id: 'silverLyre',
    name: 'Silver Lyre',
    desc: 'Carries a note far further than it should.',
    kind: 'weapon',
    price: 400,
    equip: { slot: 'weapon', stats: { atk: 5, mag: 20, mp: 8 }, users: ['melos'] },
  },
  {
    id: 'stoneMaul',
    name: 'Stone Maul',
    desc: 'Heavy enough to need both hands and most of a shoulder.',
    kind: 'weapon',
    price: 140,
    equip: { slot: 'weapon', stats: { atk: 11, hit: -2 }, users: ['threnos'] },
  },
  {
    id: 'knellHammer',
    name: 'Knell Hammer',
    desc: 'Every swing sounds like a closing door.',
    kind: 'weapon',
    price: 450,
    equip: { slot: 'weapon', stats: { atk: 23, hit: -2, mag: 4 }, users: ['threnos'] },
  },

  // -------------------------------------------------------------- armor
  {
    id: 'travelCloak',
    name: 'Travel Cloak',
    desc: 'Worn thin at the shoulders.',
    kind: 'armor',
    price: 90,
    equip: { slot: 'armor', stats: { def: 6, res: 4 } },
  },
  {
    id: 'chorusRobe',
    name: 'Chorus Robe',
    desc: 'Ceremonial, and surprisingly hard-wearing.',
    kind: 'armor',
    price: 260,
    equip: { slot: 'armor', stats: { def: 10, res: 14, mp: 6 } },
  },
  {
    id: 'sentryPlate',
    name: 'Sentry Plate',
    desc: 'Prised off something that stopped keeping time.',
    kind: 'armor',
    price: 340,
    equip: { slot: 'armor', stats: { def: 20, res: 6, spd: -2 } },
  },

  // ---------------------------------------------------------- accessories
  {
    id: 'metronomeCharm',
    name: 'Metronome Charm',
    desc: 'Ticks steadily. The ATB gauge fills faster.',
    kind: 'accessory',
    price: 500,
    equip: { slot: 'accessory', stats: { spd: 8 } },
  },
  {
    id: 'quietBand',
    name: 'Quiet Band',
    desc: 'Dulls incoming harm.',
    kind: 'accessory',
    price: 300,
    equip: { slot: 'accessory', stats: { def: 5, res: 5, eva: 4 } },
  },
  {
    id: 'echoPendant',
    name: 'Echo Pendant',
    desc: 'Deepens the wearer’s reserves.',
    kind: 'accessory',
    price: 350,
    equip: { slot: 'accessory', stats: { mp: 20, mag: 5 } },
  },

  // ----------------------------------------------------------- key items
  {
    id: 'brokenStele',
    name: 'Broken Stele',
    desc: 'A fragment of carved stone. Part of a song is still legible.',
    kind: 'key',
    price: 0,
  },
];

const ITEM_BY_ID = new Map<string, ItemDef>(ITEMS.map((item) => [item.id, item]));

export function getItem(id: string): ItemDef {
  const item = ITEM_BY_ID.get(id);
  if (!item) throw new Error(`Unknown item id: "${id}"`);
  return item;
}

export function tryGetItem(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id);
}
