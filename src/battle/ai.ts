import { getTech } from '../data/techs';
import type { AiEntry } from '../data/types';
import type { Rng } from '../core/rng';
import type { Combatant } from './combatant';
import type { BattleAction } from './action';
import { alliesOf, enemiesOf, mostWounded, resolveTargets, selectableTargets } from './targeting';

/**
 * Chooses what an enemy does when its gauge fills.
 *
 * Every AI entry whose condition currently holds goes into a weighted draw, so
 * behaviour shifts naturally as a fight progresses (a boss opening up a new
 * attack below 35% HP is just an entry with `hpBelow: 0.35`).
 */
export function chooseEnemyAction(actor: Combatant, all: Combatant[], rng: Rng): BattleAction {
  const targets = enemiesOf(actor.side, all);

  // Berserk overrides any plan the enemy had.
  if (actor.forcedToAttack || targets.length === 0) {
    return basicAttack(actor, targets, rng);
  }

  const def = actor.enemy;
  if (!def) return basicAttack(actor, targets, rng);

  const viable: (readonly [AiEntry, number])[] = [];
  def.ai.forEach((entry, index) => {
    if (!conditionHolds(entry, actor, all)) return;
    if (entry.action !== 'attack' && actor.techsBlocked) return;
    viable.push([entry, index] as const);
  });

  if (viable.length === 0) return basicAttack(actor, targets, rng);

  const [entry, index] = rng.weighted(viable.map((pair) => [pair, pair[0].weight] as const));
  actor.aiUses[index] = (actor.aiUses[index] ?? 0) + 1;

  if (entry.action === 'attack') return basicAttack(actor, targets, rng);

  const tech = getTech(entry.action);
  const candidates = selectableTargets(tech.target, actor, all);
  if (candidates.length === 0) return basicAttack(actor, targets, rng);

  // Healing and buffs go to whoever needs them; everything else picks randomly.
  const chosen =
    tech.kind === 'heal'
      ? (mostWounded(alliesOf(actor.side, all)) ?? rng.pick(candidates))
      : rng.pick(candidates);

  return {
    actor,
    partners: [],
    kind: 'tech',
    techId: tech.id,
    chosen,
    targets: resolveTargets(tech.target, actor, chosen, all, { radius: tech.radius }),
  };
}

function basicAttack(actor: Combatant, targets: Combatant[], rng: Rng): BattleAction {
  const chosen = targets.length > 0 ? rng.pick(targets) : undefined;
  return {
    actor,
    partners: [],
    kind: 'attack',
    chosen,
    targets: chosen ? [chosen] : [],
  };
}

function conditionHolds(entry: AiEntry, actor: Combatant, all: Combatant[]): boolean {
  const condition = entry.condition;
  if (!condition) return true;

  if (condition.hpBelow !== undefined && actor.hpFraction > condition.hpBelow) return false;
  if (condition.turnAtLeast !== undefined && actor.turnsTaken + 1 < condition.turnAtLeast) return false;

  if (condition.allyDead) {
    const anyDead = all.some((c) => c.side === actor.side && c !== actor && !c.alive);
    if (!anyDead) return false;
  }

  if (condition.targetLacksStatus) {
    const anyLacking = enemiesOf(actor.side, all).some((c) => !c.hasStatus(condition.targetLacksStatus!));
    if (!anyLacking) return false;
  }

  if (condition.maxUses !== undefined) {
    const index = actor.enemy?.ai.indexOf(entry) ?? -1;
    const used = index >= 0 ? (actor.aiUses[index] ?? 0) : 0;
    if (used >= condition.maxUses) return false;
  }

  return true;
}
