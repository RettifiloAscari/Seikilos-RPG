import { describe, expect, it } from 'vitest';
import { MAPS, getMap } from './maps';
import { TileMap } from './tilemap';
import { getEncounter } from '../data/encounters';
import { tryGetItem } from '../data/items';

/**
 * Content validation. These catch the mistakes that are easy to make while
 * authoring ASCII maps by hand — a row one character too long, a chest holding
 * an item that was renamed, an exit pointing at a map that no longer exists —
 * and they catch them in `npm test` rather than as a blank screen in the game.
 */
describe('maps', () => {
  it.each(MAPS.map((map) => [map.id, map] as const))('%s has consistent layer sizes', (_id, map) => {
    const expected = map.width * map.height;
    expect(map.ground).toHaveLength(expected);
    expect(map.collision).toHaveLength(expected);
    if (map.decor) expect(map.decor).toHaveLength(expected);
    if (map.above) expect(map.above).toHaveLength(expected);
  });

  it.each(MAPS.map((map) => [map.id, map] as const))('%s constructs without throwing', (_id, map) => {
    expect(() => new TileMap(map)).not.toThrow();
  });

  it.each(MAPS.map((map) => [map.id, map] as const))('%s spawns the player on walkable ground', (_id, map) => {
    const tilemap = new TileMap(map);
    expect(tilemap.solidAt(map.spawn.tx, map.spawn.ty)).toBe(false);
  });

  it.each(MAPS.map((map) => [map.id, map] as const))('%s has reachable exits', (_id, map) => {
    const tilemap = new TileMap(map);
    for (const exit of map.exits ?? []) {
      expect(tilemap.solidAt(exit.tx, exit.ty), `exit at ${exit.tx},${exit.ty} is inside a wall`).toBe(false);

      const destination = getMap(exit.toMap);
      const destinationMap = new TileMap(destination);
      expect(
        destinationMap.solidAt(exit.toX, exit.toY),
        `${map.id} -> ${exit.toMap} lands on a solid tile at ${exit.toX},${exit.toY}`,
      ).toBe(false);
    }
  });

  it.each(MAPS.map((map) => [map.id, map] as const))('%s places NPCs on walkable tiles', (_id, map) => {
    const tilemap = new TileMap(map);
    for (const npc of map.npcs ?? []) {
      expect(tilemap.solidAt(npc.tx, npc.ty), `${npc.id} is stuck in a wall`).toBe(false);
    }
  });

  it.each(MAPS.map((map) => [map.id, map] as const))('%s places field enemies on walkable tiles', (_id, map) => {
    const tilemap = new TileMap(map);
    for (const enemy of map.enemies ?? []) {
      expect(tilemap.solidAt(enemy.tx, enemy.ty), `${enemy.id} is stuck in a wall`).toBe(false);
    }
  });

  it.each(MAPS.map((map) => [map.id, map] as const))('%s references only real content', (_id, map) => {
    for (const enemy of map.enemies ?? []) {
      expect(() => getEncounter(enemy.encounter)).not.toThrow();
    }
    for (const object of map.objects ?? []) {
      if (object.item) {
        expect(tryGetItem(object.item), `chest holds unknown item "${object.item}"`).toBeDefined();
      }
    }
  });
});
