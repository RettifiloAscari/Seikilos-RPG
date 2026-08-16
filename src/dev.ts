import type { Game } from './core/game';
import { getEncounter } from './data/encounters';
import { BattleScene } from './scenes/battle';
import { FieldScene } from './scenes/field';
import type { Facing } from './field/tilemap';

/**
 * Console helpers, available as `dev` on `window` during `npm run dev` only.
 *
 * Jumping straight to a fight or a map is the difference between testing a
 * balance change in five seconds and replaying ten minutes of the game first.
 */
export function installDevTools(game: Game): void {
  const dev = {
    /** The live game object. */
    game,

    /** Start any encounter immediately: `dev.battle('boss.choragos')`. */
    battle(encounterId: string): void {
      game.scenes.push(new BattleScene({ encounter: getEncounter(encounterId) }));
    },

    /** Jump to a map: `dev.warp('ruins', 21, 1)`. */
    warp(mapId: string, tx = 1, ty = 1, facing: Facing = 'down'): void {
      game.scenes.reset(new FieldScene({ mapId, tx, ty, facing }));
    },

    /** Set every active party member to a level: `dev.level(12)`. */
    level(level: number): void {
      for (const member of game.state.roster) {
        member.level = Math.max(1, Math.floor(level));
        member.exp = 0;
        member.healFull();
      }
    },

    /** Full heal. */
    heal(): void {
      game.state.restParty();
    },

    /** Add an item: `dev.give('phoenixLeaf', 5)`. */
    give(itemId: string, count = 1): void {
      game.state.addItem(itemId, count);
    },

    gold(amount: number): void {
      game.state.gold = amount;
    },

    /** Set a story flag: `dev.flag('choragosDefeated')`. */
    flag(name: string, value = 1): void {
      game.state.setFlag(name, value);
    },
  };

  Object.assign(window, { dev, game });
  console.info('[dev] console helpers ready — try dev.battle("ruins.line") or dev.warp("ruins", 21, 1)');
}
