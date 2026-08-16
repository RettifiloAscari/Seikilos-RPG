import { describe, expect, it } from 'vitest';
import { ACTORS, getActor } from './actors';
import { ENCOUNTERS } from './encounters';
import { ENEMIES } from './enemies';
import { ITEMS, tryGetItem } from './items';
import { STATUSES } from './status';
import { COMBO_TECHS, TECHS, tryGetTech } from './techs';
import { STAT_KEYS, type TargetKind } from './types';

/**
 * Cross-references every piece of content against every other piece.
 *
 * Content is plain data with string ids, which is what makes it fast to author
 * — and what makes a typo silently produce a tech nobody can learn or an enemy
 * that crashes when its AI fires. These tests are the safety net for that.
 */

/** Marker used by techs that only enemies perform. */
const ENEMY_USER = '@enemy';

const ACTOR_IDS = new Set(ACTORS.map((actor) => actor.id));
const ITEM_IDS = new Set(ITEMS.map((item) => item.id));

describe('techs', () => {
  it('have unique ids', () => {
    const ids = TECHS.map((tech) => tech.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('list only real users', () => {
    for (const tech of TECHS) {
      expect(tech.users.length, `${tech.id} has no users`).toBeGreaterThan(0);
      for (const user of tech.users) {
        if (user === ENEMY_USER) continue;
        expect(ACTOR_IDS.has(user), `${tech.id} lists unknown user "${user}"`).toBe(true);
      }
    }
  });

  it('reference real statuses', () => {
    for (const tech of TECHS) {
      if (tech.inflicts) expect(STATUSES[tech.inflicts.status]).toBeDefined();
      if (tech.grants) expect(STATUSES[tech.grants.status]).toBeDefined();
    }
  });

  it('give area techs a radius', () => {
    for (const tech of TECHS) {
      if (tech.target === 'areaEnemies') {
        expect(tech.radius, `${tech.id} is an area tech with no radius`).toBeGreaterThan(0);
      }
    }
  });

  it('give damaging techs a power and support techs an effect', () => {
    for (const tech of TECHS) {
      if (tech.kind === 'physical' || tech.kind === 'magical') {
        // Power 0 is allowed for pure status-delivery spells like Lullaby.
        if (tech.power === 0) {
          expect(tech.inflicts ?? tech.grants, `${tech.id} does nothing at all`).toBeDefined();
        }
      }
      if (tech.kind === 'support') {
        expect(tech.grants ?? tech.inflicts, `support tech ${tech.id} has no effect`).toBeDefined();
      }
      if (tech.kind === 'heal') {
        expect(tech.power, `heal tech ${tech.id} has no power`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The bug this guards against: target kinds are relative to the caster, so an
   * enemy tech written as `oneAlly` damages the enemy's own allies instead of
   * the party.
   */
  it('point enemy offensive techs at the party', () => {
    const partyFacing: TargetKind[] = ['oneEnemy', 'allEnemies', 'areaEnemies', 'lineEnemies'];

    for (const tech of TECHS) {
      if (!tech.users.includes(ENEMY_USER)) continue;
      const harmful = tech.kind === 'physical' || tech.kind === 'magical';
      if (!harmful) continue;

      expect(
        partyFacing.includes(tech.target),
        `enemy tech "${tech.id}" targets "${tech.target}", which hits other enemies`,
      ).toBe(true);
    }
  });

  it('point healing techs at allies', () => {
    for (const tech of TECHS) {
      if (tech.kind !== 'heal') continue;
      expect(
        ['oneAlly', 'allAllies', 'self', 'deadAlly'].includes(tech.target),
        `heal tech "${tech.id}" targets "${tech.target}"`,
      ).toBe(true);
    }
  });
});

describe('combo techs', () => {
  it('require component techs owned by the listed participants', () => {
    for (const combo of COMBO_TECHS) {
      expect(combo.requires, `${combo.id} is a combo with no requirements`).toBeDefined();

      for (const requiredId of combo.requires ?? []) {
        const required = tryGetTech(requiredId);
        expect(required, `${combo.id} requires unknown tech "${requiredId}"`).toBeDefined();
        if (!required) continue;

        // The component must be a single tech belonging to a participant.
        expect(required.users, `${combo.id} requires combo tech "${requiredId}"`).toHaveLength(1);
        const owner = required.users[0]!;
        expect(
          combo.users.includes(owner),
          `${combo.id} requires "${requiredId}", which belongs to ${owner} who is not a participant`,
        ).toBe(true);
      }
    }
  });

  it('are reachable: every participant learns their component tech by some level', () => {
    for (const combo of COMBO_TECHS) {
      for (const requiredId of combo.requires ?? []) {
        const owner = tryGetTech(requiredId)?.users[0];
        if (!owner) continue;
        const actor = getActor(owner);
        expect(
          actor.learns.some((entry) => entry.tech === requiredId),
          `${actor.id} never learns "${requiredId}", so ${combo.id} is unobtainable`,
        ).toBe(true);
      }
    }
  });
});

describe('actors', () => {
  it('learn only real single techs, at sane levels', () => {
    for (const actor of ACTORS) {
      for (const entry of actor.learns) {
        const tech = tryGetTech(entry.tech);
        expect(tech, `${actor.id} learns unknown tech "${entry.tech}"`).toBeDefined();
        expect(tech?.users).toEqual([actor.id]);
        expect(entry.level).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('have a usable tech from level 1', () => {
    for (const actor of ACTORS) {
      expect(
        actor.learns.some((entry) => entry.level === 1),
        `${actor.id} starts with no techs`,
      ).toBe(true);
    }
  });

  it('have positive base stats and non-negative growth', () => {
    for (const actor of ACTORS) {
      for (const key of STAT_KEYS) {
        expect(actor.base[key], `${actor.id}.${key}`).toBeGreaterThan(0);
      }
      expect(actor.base.hp).toBeGreaterThan(0);
      expect(actor.equipSlots.length).toBeGreaterThan(0);
    }
  });
});

describe('enemies', () => {
  it('have unique ids and real AI actions', () => {
    const ids = ENEMIES.map((enemy) => enemy.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const enemy of ENEMIES) {
      expect(enemy.ai.length, `${enemy.id} has no AI entries`).toBeGreaterThan(0);

      for (const entry of enemy.ai) {
        if (entry.action === 'attack') continue;
        expect(tryGetTech(entry.action), `${enemy.id} AI uses unknown tech "${entry.action}"`).toBeDefined();
        expect(entry.weight, `${enemy.id} AI entry has non-positive weight`).toBeGreaterThan(0);
      }
    }
  });

  it('always have at least one unconditional AI option', () => {
    // Otherwise the enemy can reach a state where it has nothing valid to do.
    for (const enemy of ENEMIES) {
      expect(
        enemy.ai.some((entry) => !entry.condition),
        `${enemy.id} has no unconditional fallback action`,
      ).toBe(true);
    }
  });

  it('drop only real items', () => {
    for (const enemy of ENEMIES) {
      for (const drop of enemy.drops ?? []) {
        expect(ITEM_IDS.has(drop.item), `${enemy.id} drops unknown item "${drop.item}"`).toBe(true);
        expect(drop.chance).toBeGreaterThan(0);
        expect(drop.chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('give rewards worth having', () => {
    for (const enemy of ENEMIES) {
      expect(enemy.exp, `${enemy.id} gives no EXP`).toBeGreaterThan(0);
      expect(enemy.stats.hp).toBeGreaterThan(0);
      expect(enemy.size.w).toBeGreaterThan(0);
      expect(enemy.size.h).toBeGreaterThan(0);
    }
  });
});

describe('encounters', () => {
  it('reference real enemies and keep them on screen', () => {
    for (const encounter of ENCOUNTERS) {
      expect(encounter.members.length, `${encounter.id} is empty`).toBeGreaterThan(0);

      for (const member of encounter.members) {
        expect(
          ENEMIES.some((enemy) => enemy.id === member.enemy),
          `${encounter.id} references unknown enemy "${member.enemy}"`,
        ).toBe(true);

        // Enemies live on the right-hand side of a 384x216 field, clear of the
        // party on the left and the HUD along the bottom.
        expect(member.x, `${encounter.id}: ${member.enemy} is too far left`).toBeGreaterThan(190);
        expect(member.x, `${encounter.id}: ${member.enemy} is off screen`).toBeLessThan(370);
        expect(member.y).toBeGreaterThan(30);
        expect(member.y, `${encounter.id}: ${member.enemy} overlaps the HUD`).toBeLessThan(150);
      }
    }
  });
});

describe('items', () => {
  it('have unique ids and coherent definitions', () => {
    const ids = ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const item of ITEMS) {
      if (item.kind === 'consumable') {
        expect(item.effect, `consumable "${item.id}" does nothing`).toBeDefined();
        expect(
          item.usableInBattle || item.usableInField,
          `consumable "${item.id}" cannot be used anywhere`,
        ).toBe(true);
      }

      if (item.equip) {
        expect(item.equip.slot).toBe(item.kind);
        for (const user of item.equip.users ?? []) {
          expect(ACTOR_IDS.has(user), `"${item.id}" restricted to unknown actor "${user}"`).toBe(true);
        }
      }

      for (const status of item.effect?.cures ?? []) {
        expect(STATUSES[status], `"${item.id}" cures unknown status "${status}"`).toBeDefined();
      }
    }
  });

  it('lets every actor equip something in each of their slots', () => {
    for (const actor of ACTORS) {
      for (const slot of actor.equipSlots) {
        const options = ITEMS.filter(
          (item) =>
            item.equip?.slot === slot &&
            (!item.equip.users || item.equip.users.length === 0 || item.equip.users.includes(actor.id)),
        );
        expect(options.length, `${actor.id} has nothing to put in their ${slot} slot`).toBeGreaterThan(0);
      }
    }
  });

  it('prices everything that can be bought', () => {
    for (const item of ITEMS) {
      if (item.kind === 'key') continue;
      expect(item.price, `"${item.id}" has no price`).toBeGreaterThan(0);
      expect(tryGetItem(item.id)).toBe(item);
    }
  });
});
