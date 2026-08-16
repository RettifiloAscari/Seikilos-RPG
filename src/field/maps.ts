import { TILES } from '../art/placeholder';
import { collisionFromAscii, layerFromAscii, type MapDef } from './tilemap';

/**
 * Maps are authored as ASCII grids.
 *
 * One character per tile makes the layout readable at a glance and reviewable
 * in a diff, which matters far more than compactness. `LEGEND` maps characters
 * to tileset indices and `SOLID` lists the characters that block movement.
 *
 *   .  grass          ,  darker grass     *  grass with flowers
 *   o  stone floor    c  cracked stone    p  dirt path
 *   r  rubble         s  stairs
 *   #  wall (solid)   ~  water (solid)    I  pillar base (solid)
 */
const LEGEND: Record<string, number> = {
  '.': TILES.GRASS,
  ',': TILES.GRASS_ALT,
  '*': TILES.GRASS_FLOWER,
  o: TILES.STONE_FLOOR,
  c: TILES.STONE_FLOOR_CRACKED,
  p: TILES.PATH,
  r: TILES.RUBBLE,
  s: TILES.STAIRS,
  '#': TILES.WALL,
  '~': TILES.WATER,
  I: TILES.PILLAR_BASE,
};

const SOLID = '#~I';

/**
 * Pillars are two tiles tall: a solid base on the ground layer and a cap drawn
 * on the `above` layer so the player can walk behind it.
 */
function pillarCaps(rows: string[]): number[] {
  const width = rows[0]?.length ?? 0;
  const above = new Array<number>(width * rows.length).fill(-1);

  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === 'I' && y > 0) above[(y - 1) * width + x] = TILES.PILLAR_TOP;
    });
  });
  return above;
}

function buildMap(
  base: Omit<MapDef, 'ground' | 'collision' | 'above' | 'width' | 'height'>,
  rows: string[],
  extras: { above?: number[]; decor?: number[] } = {},
): MapDef {
  return {
    ...base,
    width: rows[0]?.length ?? 0,
    height: rows.length,
    ground: layerFromAscii(rows, LEGEND),
    collision: collisionFromAscii(rows, SOLID),
    above: extras.above ?? pillarCaps(rows),
    decor: extras.decor,
  };
}

// ------------------------------------------------------------------- camp

const CAMP_ROWS = [
  '##############################',
  '#............................#',
  '#....,,,.....................#',
  '#....,,,....oooooooo.........#',
  '#...........oooooooo.........#',
  '#...........oooooooo.........#',
  '#....*......pppppppp.........#',
  '#...........p.......~~~~~~...#',
  '#...........p.......~~~~~~...#',
  '#...........p.......~~~~~~...#',
  '#...........p................#',
  '#....,,.....p......,,,.......#',
  '#....,,.....p......,,,.......#',
  '#...........pppppppppp.......#',
  '#....................p.......#',
  '#....*...............p.......#',
  '#....................p.......#',
  '#.................*..p.......#',
  '#....................p.......#',
  '#####################p########',
];

export const CAMP: MapDef = buildMap(
  {
    id: 'camp',
    name: 'Wayside Camp',
    tileset: 'tileset.ruins',
    spawn: { tx: 14, ty: 8, facing: 'down' },
    npcs: [
      {
        id: 'elder',
        name: 'Elder Pheme',
        tx: 15,
        ty: 4,
        facing: 'down',
        lines: [
          'You hear it too, then. That thread of a melody, coming up out of the ruins at dusk.',
          'It has been nine hundred years and the chorus has never once stopped rehearsing.',
          'If you mean to go down there — go together. A single voice will not carry.',
        ],
        flagLines: [
          {
            flag: 'choragosDefeated',
            lines: ['The ruins are quiet tonight. For the first time in my life, they are quiet.'],
          },
        ],
      },
      {
        id: 'guard',
        name: 'Watchman Doros',
        tx: 20,
        ty: 14,
        facing: 'left',
        lines: [
          'South road leads to the old sanctum. Nothing living down there, but plenty still moving.',
          'Rest at the camp before you go. Sleeping restores everyone to full.',
        ],
      },
      {
        id: 'child',
        name: 'Nessa',
        tx: 7,
        ty: 11,
        facing: 'down',
        wander: 2,
        lines: [
          'When two of you are ready at the exact same time, you can attack together! I saw a travelling troupe do it once.',
          'Hold your turn instead of spending it. That is the whole trick.',
        ],
      },
    ],
    objects: [
      {
        id: 'campfire',
        kind: 'savePoint',
        tx: 15,
        ty: 8,
        lines: ['The campfire is warm. Rest here?'],
      },
      {
        id: 'campChest',
        kind: 'chest',
        tx: 26,
        ty: 2,
        item: 'greaterSalve',
        flag: 'campChestOpened',
      },
      {
        id: 'campSign',
        kind: 'sign',
        tx: 20,
        ty: 17,
        lines: ['A weathered marker: SANCTUM OF THE CHORUS — 1/2 STADION SOUTH'],
      },
    ],
    exits: [{ tx: 21, ty: 19, toMap: 'ruins', toX: 21, toY: 1, facing: 'down' }],
  },
  CAMP_ROWS,
);

// ------------------------------------------------------------------ ruins

const RUINS_ROWS = [
  '#####################p########',
  '#....................p.......#',
  '#....................p.......#',
  '#..oooooooooooo......p.......#',
  '#..occcccccccco......p.......#',
  '#..oc........co......p.......#',
  '#..oc..I...I..co.....p.......#',
  '#..oc........cooooooop.......#',
  '#..oc........co..............#',
  '#..oc..I...I..co.............#',
  '#..oc........co....rrrr......#',
  '#..occcccccccco..............#',
  '#..oooooosooooo..............#',
  '#........s...................#',
  '#........s...................#',
  '#..cccccccccccccc............#',
  '#..c............c............#',
  '#..c............c............#',
  '#..c.....cccc...c............#',
  '#..c.....cccc...c............#',
  '#..cccccccccccccc............#',
  '##############################',
];

export const RUINS: MapDef = buildMap(
  {
    id: 'ruins',
    name: 'Sanctum of the Chorus',
    tileset: 'tileset.ruins',
    spawn: { tx: 21, ty: 1, facing: 'down' },
    ambient: { color: '#1a1830', alpha: 0.22 },
    objects: [
      {
        id: 'ruinsSign',
        kind: 'sign',
        tx: 20,
        ty: 10,
        lines: ['Carved into the rubble, still legible: WHILE YOU LIVE, SHINE.'],
      },
      {
        id: 'ruinsChest',
        kind: 'chest',
        tx: 4,
        ty: 5,
        item: 'metronomeCharm',
        flag: 'ruinsChestOpened',
      },
      {
        id: 'ruinsChest2',
        kind: 'chest',
        tx: 13,
        ty: 10,
        gold: 220,
        flag: 'ruinsGoldTaken',
      },
      {
        id: 'stele',
        kind: 'sign',
        tx: 9,
        ty: 13,
        lines: [
          'A broken stele stands at the head of the stairs. Four lines are cut into it, and the last one is worn away entirely.',
        ],
      },
    ],
    enemies: [
      {
        id: 'wisps1',
        encounter: 'ruins.wisps',
        sprite: 'enemy.shardWisp',
        tx: 21,
        ty: 5,
        wander: 2,
        defeatFlag: 'ruins.wisps1',
        size: { w: 24, h: 24 },
      },
      {
        id: 'moths1',
        encounter: 'ruins.moths',
        sprite: 'enemy.graveMoth',
        tx: 8,
        ty: 8,
        wander: 3,
        defeatFlag: 'ruins.moths1',
        size: { w: 28, h: 24 },
      },
      {
        id: 'hounds1',
        encounter: 'ruins.hounds',
        sprite: 'enemy.cinderHound',
        tx: 20,
        ty: 12,
        wander: 3,
        defeatFlag: 'ruins.hounds1',
        size: { w: 32, h: 24 },
      },
      {
        id: 'line1',
        encounter: 'ruins.line',
        sprite: 'enemy.graveMoth',
        tx: 6,
        ty: 16,
        wander: 2,
        defeatFlag: 'ruins.line1',
        size: { w: 28, h: 24 },
      },
      {
        id: 'sentry1',
        encounter: 'ruins.sentry',
        sprite: 'enemy.stoneSentry',
        tx: 14,
        ty: 17,
        wander: 1,
        defeatFlag: 'ruins.sentry1',
        size: { w: 32, h: 40 },
      },
      {
        id: 'choragos',
        encounter: 'boss.choragos',
        sprite: 'enemy.choragos',
        tx: 10,
        ty: 18,
        wander: 0,
        defeatFlag: 'choragosDefeated',
        size: { w: 48, h: 56 },
      },
    ],
    exits: [{ tx: 21, ty: 0, toMap: 'camp', toX: 21, toY: 18, facing: 'up' }],
  },
  RUINS_ROWS,
);

export const MAPS: readonly MapDef[] = [CAMP, RUINS];

const MAP_BY_ID = new Map<string, MapDef>(MAPS.map((map) => [map.id, map]));

export function getMap(id: string): MapDef {
  const map = MAP_BY_ID.get(id);
  if (!map) throw new Error(`Unknown map id: "${id}"`);
  return map;
}
