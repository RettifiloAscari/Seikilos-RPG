import type { TargetKind } from '../data/types';
import type { Combatant, Side } from './combatant';

/** Everything on the opposing side that is still standing. */
export function enemiesOf(side: Side, all: Combatant[]): Combatant[] {
  return all.filter((c) => c.side !== side && c.alive);
}

/** Everything on the same side that is still standing. */
export function alliesOf(side: Side, all: Combatant[]): Combatant[] {
  return all.filter((c) => c.side === side && c.alive);
}

export function fallenAlliesOf(side: Side, all: Combatant[]): Combatant[] {
  return all.filter((c) => c.side === side && !c.alive);
}

/**
 * Which combatants the player is allowed to point the cursor at for a given
 * target kind. Area and line techs are aimed at a single combatant; the actual
 * splash is worked out later by `resolveTargets`.
 */
export function selectableTargets(kind: TargetKind, actor: Combatant, all: Combatant[]): Combatant[] {
  switch (kind) {
    case 'oneEnemy':
    case 'areaEnemies':
    case 'lineEnemies':
      return enemiesOf(actor.side, all);
    case 'allEnemies':
      return enemiesOf(actor.side, all);
    case 'oneAlly':
      return alliesOf(actor.side, all);
    case 'allAllies':
      return alliesOf(actor.side, all);
    case 'deadAlly':
      return fallenAlliesOf(actor.side, all);
    case 'self':
      return [actor];
  }
}

/** True when the player picks one target and the tech then spreads from it. */
export function needsCursor(kind: TargetKind): boolean {
  return kind === 'oneEnemy' || kind === 'oneAlly' || kind === 'deadAlly' || kind === 'areaEnemies' || kind === 'lineEnemies';
}

export interface ResolveOptions {
  /** Radius in pixels for `areaEnemies`. */
  radius?: number;
  /** Half-height of the band for `lineEnemies`. */
  lineHalfHeight?: number;
}

const DEFAULT_RADIUS = 34;
const DEFAULT_LINE_HALF_HEIGHT = 16;

/**
 * Expand a chosen target into the full list of combatants an action hits.
 *
 * This is where Chrono Trigger's positional targeting lives: `areaEnemies`
 * catches everything within a radius of the aimed-at enemy, and `lineEnemies`
 * catches everything in a horizontal band through it. Because encounters place
 * enemies at authored coordinates, how a group is arranged genuinely changes
 * which tech is the right answer.
 */
export function resolveTargets(
  kind: TargetKind,
  actor: Combatant,
  chosen: Combatant | undefined,
  all: Combatant[],
  opts: ResolveOptions = {},
): Combatant[] {
  switch (kind) {
    case 'self':
      return [actor];

    case 'allEnemies':
      return enemiesOf(actor.side, all);

    case 'allAllies':
      return alliesOf(actor.side, all);

    case 'oneEnemy': {
      // If the chosen target died before the action landed, hit someone else.
      if (chosen?.alive) return [chosen];
      const remaining = enemiesOf(actor.side, all);
      return remaining.length > 0 ? [remaining[0]!] : [];
    }

    case 'oneAlly': {
      if (chosen?.alive) return [chosen];
      const remaining = alliesOf(actor.side, all);
      return remaining.length > 0 ? [remaining[0]!] : [];
    }

    case 'deadAlly':
      return chosen && !chosen.alive ? [chosen] : [];

    case 'areaEnemies': {
      if (!chosen) return [];
      const radius = opts.radius ?? DEFAULT_RADIUS;
      const radiusSq = radius * radius;
      return enemiesOf(actor.side, all).filter((c) => {
        const dx = c.x - chosen.x;
        const dy = c.y - chosen.y;
        return dx * dx + dy * dy <= radiusSq;
      });
    }

    case 'lineEnemies': {
      if (!chosen) return [];
      const halfHeight = opts.lineHalfHeight ?? DEFAULT_LINE_HALF_HEIGHT;
      return enemiesOf(actor.side, all).filter((c) => Math.abs(c.y - chosen.y) <= halfHeight);
    }
  }
}

/** Cheapest living target by HP fraction, used by healing AI. */
export function mostWounded(candidates: Combatant[]): Combatant | undefined {
  let best: Combatant | undefined;
  for (const c of candidates) {
    if (!c.alive) continue;
    if (!best || c.hpFraction < best.hpFraction) best = c;
  }
  return best;
}
