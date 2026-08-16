import type { ElementId, StatusId } from '../data/types';
import type { Combatant } from './combatant';

export type ActionKind = 'attack' | 'tech' | 'item' | 'defend' | 'flee';

/** A committed decision, waiting to be resolved by the battle engine. */
export interface BattleAction {
  actor: Combatant;
  /**
   * Extra characters performing a combo tech alongside `actor`. Their gauges
   * are spent and their MP is charged too.
   */
  partners: Combatant[];
  kind: ActionKind;
  techId?: string;
  itemId?: string;
  /** The single combatant the player aimed at, before area splash. */
  chosen?: Combatant;
  /** Final resolved list of combatants this action affects. */
  targets: Combatant[];
}

/**
 * Things the engine reports to the presentation layer: floating numbers,
 * status popups, log lines. The scene drains these each frame and turns them
 * into on-screen effects, which keeps rendering entirely out of the engine.
 */
export type BattleEvent =
  | { kind: 'message'; text: string }
  | { kind: 'damage'; target: Combatant; amount: number; critical: boolean; element: ElementId }
  | { kind: 'heal'; target: Combatant; amount: number }
  | { kind: 'mp'; target: Combatant; amount: number }
  | { kind: 'miss'; target: Combatant }
  | { kind: 'immune'; target: Combatant }
  | { kind: 'statusApplied'; target: Combatant; status: StatusId }
  | { kind: 'statusExpired'; target: Combatant; status: StatusId }
  | { kind: 'defeated'; target: Combatant }
  | { kind: 'revived'; target: Combatant }
  | { kind: 'techStart'; actor: Combatant; partners: Combatant[]; techId: string; targets: Combatant[] }
  | { kind: 'attackStart'; actor: Combatant; target: Combatant }
  | { kind: 'shake'; strength: number };

export type BattleOutcome = 'victory' | 'defeat' | 'escaped';

export interface BattleRewards {
  exp: number;
  gold: number;
  items: string[];
}
