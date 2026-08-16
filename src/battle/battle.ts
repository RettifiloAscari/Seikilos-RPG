import type { Rng } from '../core/rng';
import { getEnemy } from '../data/enemies';
import { getItem } from '../data/items';
import { STATUSES } from '../data/status';
import { COMBO_TECHS, getTech } from '../data/techs';
import type { ElementId, EncounterDef, StatusId, TechDef } from '../data/types';
import type { PartyMember } from '../state/party';
import type { BattleAction, BattleEvent, BattleOutcome, BattleRewards } from './action';
import { chooseEnemyAction } from './ai';
import { Combatant } from './combatant';
import {
  atbRate,
  computeDamage,
  computeHealing,
  critChance,
  escapeChance,
  expShare,
  hitChance,
} from './formulas';
import { alliesOf, enemiesOf, resolveTargets } from './targeting';

export type BattlePhase = 'intro' | 'active' | 'resolving' | 'finished';

/**
 * Where party members stand on the battle field, in virtual pixels.
 * Kept clear of the command window on the left so nobody is ever hidden
 * behind their own menu.
 */
const PARTY_POSITIONS: readonly { x: number; y: number }[] = [
  { x: 140, y: 96 },
  { x: 116, y: 124 },
  { x: 152, y: 150 },
];

const INTRO_DURATION = 0.55;
const DEFAULT_WINDUP = 0.3;
const DEFAULT_LINGER = 0.25;
const BASIC_ATTACK_POWER = 100;
/** Seconds between the impacts of a multi-hit tech. */
const HIT_INTERVAL = 0.12;

export interface BattleConfig {
  encounter: EncounterDef;
  party: PartyMember[];
  rng: Rng;
  /** Global ATB speed multiplier; the options menu exposes this. */
  battleSpeed?: number;
}

/** An action mid-flight, being played out over time. */
interface ResolvingAction {
  action: BattleAction;
  /** Seconds until the next thing happens. */
  timer: number;
  stage: 'windup' | 'hits' | 'linger';
  hitsRemaining: number;
}

/**
 * The ATB battle engine.
 *
 * Gauges fill continuously in real time. When a party member's gauge is full
 * the scene lets the player choose; when an enemy's fills, the AI decides
 * immediately. One action resolves at a time, and gauges pause while it plays
 * out so nothing lands during an animation.
 *
 * The engine never draws anything. It emits `BattleEvent`s that the battle
 * scene turns into damage numbers, flashes and messages.
 */
export class Battle {
  readonly encounter: EncounterDef;
  readonly party: Combatant[] = [];
  readonly enemies: Combatant[] = [];
  readonly all: Combatant[] = [];

  phase: BattlePhase = 'intro';
  outcome: BattleOutcome | null = null;
  rewards: BattleRewards = { exp: 0, gold: 0, items: [] };

  /**
   * Set by the scene while a targeting cursor or submenu is open. This is the
   * classic "Wait" battle mode: the world holds still while you aim.
   */
  atbPaused = false;

  /** Total battle time in seconds; drives status durations. */
  elapsed = 0;

  private readonly rng: Rng;
  private readonly battleSpeed: number;
  private readonly queue: BattleAction[] = [];
  private resolving: ResolvingAction | null = null;
  private events: BattleEvent[] = [];
  private introTimer = INTRO_DURATION;
  private escapeAttempts = 0;

  constructor(config: BattleConfig) {
    this.encounter = config.encounter;
    this.rng = config.rng;
    this.battleSpeed = config.battleSpeed ?? 1;

    config.party.slice(0, PARTY_POSITIONS.length).forEach((member, index) => {
      const spot = PARTY_POSITIONS[index]!;
      this.party.push(Combatant.fromPartyMember(member, spot.x, spot.y));
    });

    for (const entry of this.encounter.members) {
      this.enemies.push(Combatant.fromEnemy(getEnemy(entry.enemy), entry.x, entry.y));
    }

    this.all.push(...this.party, ...this.enemies);

    // Stagger opening gauges slightly so the first turns don't all land at once.
    for (const combatant of this.all) {
      combatant.atb = this.rng.float(0, 0.35);
    }
  }

  // ------------------------------------------------------------- queries

  /** Party members whose gauge is full and who are waiting for orders. */
  readyPartyMembers(): Combatant[] {
    return this.party.filter((c) => c.ready);
  }

  get busy(): boolean {
    return this.resolving !== null;
  }

  get livingEnemies(): Combatant[] {
    return enemiesOf('party', this.all);
  }

  get livingParty(): Combatant[] {
    return alliesOf('party', this.all);
  }

  /** Single techs the given character can currently perform. */
  availableSingleTechs(actor: Combatant): TechDef[] {
    if (!actor.member || actor.techsBlocked) return [];
    return actor.member
      .knownTechs()
      .map((id) => getTech(id))
      .filter((tech) => tech.users.length === 1);
  }

  /**
   * Combo techs that are available *right now*.
   *
   * This is the crux of the Chrono Trigger system: a combo only appears while
   * every participant is simultaneously ready. Spending a gauge the moment it
   * fills means giving up the combo, so the player is constantly deciding
   * whether to act now or hold for something bigger.
   */
  availableComboTechs(actor: Combatant): { tech: TechDef; partners: Combatant[] }[] {
    if (!actor.member || actor.techsBlocked) return [];

    const readyById = new Map<string, Combatant>();
    for (const c of this.party) {
      if (c.ready && c.member && !c.techsBlocked) readyById.set(c.member.id, c);
    }

    const results: { tech: TechDef; partners: Combatant[] }[] = [];
    for (const tech of COMBO_TECHS) {
      if (!tech.users.includes(actor.member.id)) continue;

      const participants = tech.users.map((id) => readyById.get(id));
      if (participants.some((c) => c === undefined)) continue;

      const members = participants as Combatant[];
      if (!this.comboRequirementsMet(tech, members)) continue;
      if (members.some((c) => c.mp < tech.mpCost)) continue;

      results.push({ tech, partners: members.filter((c) => c !== actor) });
    }
    return results;
  }

  /** Every participant must already know their share of the component techs. */
  private comboRequirementsMet(tech: TechDef, participants: Combatant[]): boolean {
    for (const requiredId of tech.requires ?? []) {
      const required = getTech(requiredId);
      const ownerId = required.users[0];
      const owner = participants.find((c) => c.member?.id === ownerId);
      if (!owner?.member?.knowsTech(requiredId)) return false;
    }
    return true;
  }

  canAfford(actor: Combatant, tech: TechDef): boolean {
    return actor.mp >= tech.mpCost;
  }

  // ------------------------------------------------------------ commands

  /** Queue an action. The engine plays it as soon as nothing else is resolving. */
  submit(action: BattleAction): void {
    if (this.phase === 'finished') return;
    action.actor.committed = true;
    for (const partner of action.partners) partner.committed = true;
    this.queue.push(action);
  }

  /** Convenience builder for a plain attack. */
  buildAttack(actor: Combatant, target: Combatant): BattleAction {
    return { actor, partners: [], kind: 'attack', chosen: target, targets: [target] };
  }

  buildTech(actor: Combatant, tech: TechDef, chosen: Combatant | undefined, partners: Combatant[] = []): BattleAction {
    return {
      actor,
      partners,
      kind: 'tech',
      techId: tech.id,
      chosen,
      targets: resolveTargets(tech.target, actor, chosen, this.all, { radius: tech.radius }),
    };
  }

  buildItem(actor: Combatant, itemId: string, chosen: Combatant | undefined): BattleAction {
    const item = getItem(itemId);
    const kind = item.target ?? 'oneAlly';
    return {
      actor,
      partners: [],
      kind: 'item',
      itemId,
      chosen,
      targets: resolveTargets(kind, actor, chosen, this.all),
    };
  }

  buildDefend(actor: Combatant): BattleAction {
    return { actor, partners: [], kind: 'defend', targets: [actor] };
  }

  buildFlee(actor: Combatant): BattleAction {
    return { actor, partners: [], kind: 'flee', targets: [] };
  }

  drainEvents(): BattleEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  // -------------------------------------------------------------- update

  update(dt: number): void {
    if (this.phase === 'finished') return;

    if (this.phase === 'intro') {
      this.introTimer -= dt;
      if (this.introTimer <= 0) this.phase = 'active';
      return;
    }

    this.elapsed += dt;

    if (this.resolving) {
      this.advanceResolution(dt);
      return;
    }

    // Nothing playing out: start the next queued action if there is one.
    const next = this.queue.shift();
    if (next) {
      this.beginResolution(next);
      return;
    }

    this.phase = 'active';
    if (this.atbPaused) return;

    this.tickStatuses(dt);
    this.tickGauges(dt);
    this.runEnemyAi();
  }

  private tickGauges(dt: number): void {
    for (const combatant of this.all) {
      if (!combatant.alive || combatant.committed || combatant.atbFrozen) continue;
      if (combatant.atb >= 1) continue;

      const rate = atbRate(combatant.stat('spd'), combatant.atbRateMultiplier, this.battleSpeed);
      combatant.atb = Math.min(1, combatant.atb + rate * dt);
    }
  }

  /** Count down durations and apply damage-over-time. */
  private tickStatuses(dt: number): void {
    for (const combatant of this.all) {
      if (!combatant.alive) continue;

      for (const status of [...combatant.statuses]) {
        const def = STATUSES[status.id];

        if (def.dotPercent && def.dotInterval) {
          status.dotTimer -= dt;
          if (status.dotTimer <= 0) {
            status.dotTimer += def.dotInterval;
            const damage = Math.max(1, Math.round(combatant.maxHp * def.dotPercent));
            this.dealRawDamage(combatant, damage, 'shadow');
          }
        }

        status.remaining -= dt;
        if (status.remaining <= 0) {
          combatant.removeStatus(status.id);
          this.events.push({ kind: 'statusExpired', target: combatant, status: status.id });
        }
      }
    }

    this.checkBattleEnd();
  }

  private runEnemyAi(): void {
    if (this.resolving || this.queue.length > 0) return;

    for (const enemy of this.enemies) {
      if (!enemy.ready) continue;
      this.submit(chooseEnemyAction(enemy, this.all, this.rng));
      return; // one decision at a time keeps the pacing readable
    }
  }

  // ---------------------------------------------------------- resolution

  private beginResolution(action: BattleAction): void {
    // The chosen target may have died while this action sat in the queue.
    if (action.kind !== 'flee' && action.kind !== 'defend') {
      action.targets = this.refreshTargets(action);
      if (action.targets.length === 0 && action.kind !== 'item') {
        this.finishAction(action);
        return;
      }
    }

    const tech = action.techId ? getTech(action.techId) : undefined;

    // The actor stops guarding the moment they act.
    action.actor.guarding = false;

    if (action.kind === 'tech' && tech) {
      for (const participant of [action.actor, ...action.partners]) {
        participant.mp = participant.mp - tech.mpCost;
      }
      this.events.push({
        kind: 'techStart',
        actor: action.actor,
        partners: action.partners,
        techId: tech.id,
        targets: action.targets,
      });
      const label =
        action.partners.length > 0
          ? `${[action.actor, ...action.partners].map((c) => c.name).join(' & ')}: ${tech.name}!`
          : `${action.actor.name}: ${tech.name}`;
      this.events.push({ kind: 'message', text: label });
    } else if (action.kind === 'attack' && action.targets[0]) {
      this.events.push({ kind: 'attackStart', actor: action.actor, target: action.targets[0] });
    } else if (action.kind === 'item' && action.itemId) {
      this.events.push({ kind: 'message', text: `${action.actor.name} uses ${getItem(action.itemId).name}` });
    } else if (action.kind === 'defend') {
      this.events.push({ kind: 'message', text: `${action.actor.name} defends` });
    }

    this.phase = 'resolving';
    this.resolving = {
      action,
      timer: tech?.fx.windup ?? DEFAULT_WINDUP,
      stage: 'windup',
      hitsRemaining: Math.max(1, tech?.hits ?? 1),
    };
  }

  private advanceResolution(dt: number): void {
    const current = this.resolving;
    if (!current) return;

    current.timer -= dt;
    if (current.timer > 0) return;

    const tech = current.action.techId ? getTech(current.action.techId) : undefined;

    switch (current.stage) {
      case 'windup': {
        current.stage = 'hits';
        current.timer = 0;
        return;
      }
      case 'hits': {
        this.applyImpact(current.action);
        current.hitsRemaining -= 1;
        if (current.hitsRemaining > 0) {
          current.timer = HIT_INTERVAL;
        } else {
          current.stage = 'linger';
          current.timer = tech?.fx.linger ?? DEFAULT_LINGER;
        }
        return;
      }
      case 'linger': {
        const action = current.action;
        this.resolving = null;
        this.finishAction(action);
        this.checkBattleEnd();
        return;
      }
    }
  }

  /** Release the actor's gauge and clear the committed flag. */
  private finishAction(action: BattleAction): void {
    for (const participant of [action.actor, ...action.partners]) {
      participant.atb = 0;
      participant.committed = false;
      participant.turnsTaken += 1;
      participant.offsetX = 0;
      participant.offsetY = 0;
    }
    if (this.phase !== 'finished') this.phase = 'active';
  }

  private refreshTargets(action: BattleAction): Combatant[] {
    if (action.kind === 'tech' && action.techId) {
      const tech = getTech(action.techId);
      return resolveTargets(tech.target, action.actor, action.chosen, this.all, { radius: tech.radius });
    }
    if (action.kind === 'item' && action.itemId) {
      const item = getItem(action.itemId);
      return resolveTargets(item.target ?? 'oneAlly', action.actor, action.chosen, this.all);
    }
    if (action.kind === 'attack') {
      return resolveTargets('oneEnemy', action.actor, action.chosen, this.all);
    }
    return action.targets;
  }

  /** The moment an action actually lands. */
  private applyImpact(action: BattleAction): void {
    switch (action.kind) {
      case 'attack':
        this.applyBasicAttack(action);
        return;
      case 'tech':
        this.applyTech(action);
        return;
      case 'item':
        this.applyItem(action);
        return;
      case 'defend':
        action.actor.guarding = true;
        return;
      case 'flee':
        this.attemptEscape(action);
        return;
    }
  }

  private applyBasicAttack(action: BattleAction): void {
    const attacker = action.actor;
    const element = this.weaponElement(attacker);

    for (const target of action.targets) {
      if (!target.alive) continue;

      if (!this.rollHit(attacker, target)) {
        this.events.push({ kind: 'miss', target });
        continue;
      }

      const critical = this.rng.chance(critChance(attacker.stat('crit')));
      const damage = computeDamage({
        power: BASIC_ATTACK_POWER,
        attack: attacker.stat('atk'),
        defense: target.stat('def'),
        affinity: target.affinity(element),
        critical,
        variance: this.rng.next(),
        guarding: target.guarding,
      });

      this.applyDamage(target, damage, element, critical);
      if (critical) this.events.push({ kind: 'shake', strength: 3 });
    }
  }

  private applyTech(action: BattleAction): void {
    if (!action.techId) return;
    const tech = getTech(action.techId);
    const participants = [action.actor, ...action.partners];

    if (tech.fx.shake) this.events.push({ kind: 'shake', strength: tech.fx.shake });

    for (const target of action.targets) {
      if (tech.target === 'deadAlly' ? target.alive : !target.alive) continue;

      switch (tech.kind) {
        case 'heal': {
          const magic = this.comboStat(participants, 'mag');
          const amount = computeHealing(tech.power, magic, this.rng.next());
          this.heal(target, amount);
          break;
        }
        case 'support': {
          // Support techs are pure status delivery.
          break;
        }
        case 'physical':
        case 'magical': {
          if (tech.power <= 0) break;

          const isPhysical = tech.kind === 'physical';
          const attack = this.comboStat(participants, isPhysical ? 'atk' : 'mag');
          const defense = target.stat(isPhysical ? 'def' : 'res');

          // Only physical techs can miss; spells always connect.
          if (isPhysical && !this.rollHit(action.actor, target)) {
            this.events.push({ kind: 'miss', target });
            continue;
          }

          const affinity = target.affinity(tech.element);
          if (affinity === 0) {
            this.events.push({ kind: 'immune', target });
            continue;
          }

          const critical = isPhysical && this.rng.chance(critChance(action.actor.stat('crit')));
          const damage = computeDamage({
            power: tech.power,
            attack,
            defense,
            affinity,
            critical,
            variance: this.rng.next(),
            piercing: tech.piercing,
            guarding: target.guarding,
          });

          this.applyDamage(target, damage, tech.element, critical);
          break;
        }
        case 'revive': {
          if (!target.alive) {
            target.hp = Math.max(1, Math.round(target.maxHp * 0.5));
            this.events.push({ kind: 'revived', target });
          }
          break;
        }
      }

      // Status riders land whether or not the tech dealt damage.
      if (tech.inflicts && target.alive && this.rng.chance(tech.inflicts.chance)) {
        this.tryApplyStatus(target, tech.inflicts.status);
      }
      if (tech.grants && target.alive && this.rng.chance(tech.grants.chance)) {
        this.tryApplyStatus(target, tech.grants.status);
      }
    }
  }

  private applyItem(action: BattleAction): void {
    if (!action.itemId) return;
    const item = getItem(action.itemId);
    const effect = item.effect;
    if (!effect) return;

    for (const target of action.targets) {
      if (effect.revive !== undefined) {
        if (!target.alive) {
          target.hp = Math.max(1, Math.round(target.maxHp * effect.revive));
          this.events.push({ kind: 'revived', target });
        }
        continue;
      }

      if (!target.alive) continue;

      if (effect.hp !== undefined) this.heal(target, effect.hp);
      if (effect.hpPercent !== undefined) this.heal(target, Math.round(target.maxHp * effect.hpPercent));

      if (effect.mp !== undefined) {
        const before = target.mp;
        target.mp = target.mp + effect.mp;
        this.events.push({ kind: 'mp', target, amount: target.mp - before });
      }

      if (effect.cures) {
        for (const status of effect.cures) {
          if (target.removeStatus(status)) {
            this.events.push({ kind: 'statusExpired', target, status });
          }
        }
      }

      if (effect.damage !== undefined) {
        const element = effect.element ?? 'physical';
        const affinity = target.affinity(element);
        const damage = computeDamage({
          power: 100,
          attack: effect.damage,
          defense: 0,
          affinity,
          variance: this.rng.next(),
          piercing: true,
        });
        this.applyDamage(target, damage, element, false);
      }

      if (effect.grants && this.rng.chance(effect.grants.chance)) {
        this.tryApplyStatus(target, effect.grants.status);
      }
    }
  }

  private attemptEscape(action: BattleAction): void {
    if (this.encounter.noEscape) {
      this.events.push({ kind: 'message', text: 'There is no way out!' });
      return;
    }

    this.escapeAttempts += 1;
    const partySpeed = average(this.livingParty.map((c) => c.stat('spd')));
    const enemySpeed = average(this.livingEnemies.map((c) => c.stat('spd')));

    if (this.rng.chance(escapeChance(partySpeed, enemySpeed, this.escapeAttempts - 1))) {
      this.events.push({ kind: 'message', text: 'Escaped!' });
      this.finish('escaped');
    } else {
      this.events.push({ kind: 'message', text: `${action.actor.name} could not get away.` });
    }
  }

  // ------------------------------------------------------------- helpers

  private rollHit(attacker: Combatant, target: Combatant): boolean {
    return this.rng.chance(hitChance(attacker.stat('hit'), target.stat('eva')));
  }

  /**
   * Combined attack power for a combo tech: the strongest participant at full
   * value plus half of each other, so a triple tech is meaningfully stronger
   * than the sum of the parts without being three times as strong.
   */
  private comboStat(participants: Combatant[], key: 'atk' | 'mag'): number {
    const values = participants.map((c) => c.stat(key)).sort((a, b) => b - a);
    return values.reduce((sum, value, index) => sum + (index === 0 ? value : value * 0.5), 0);
  }

  private weaponElement(combatant: Combatant): ElementId {
    const weaponId = combatant.member?.equipment.weapon;
    if (!weaponId) return 'physical';
    return getItem(weaponId).equip?.element ?? 'physical';
  }

  /** Damage that has already been through the formula. */
  private applyDamage(target: Combatant, amount: number, element: ElementId, critical: boolean): void {
    if (amount < 0) {
      // Absorbed: the element heals instead.
      this.heal(target, -amount);
      return;
    }
    this.dealRawDamage(target, amount, element, critical);
  }

  private dealRawDamage(target: Combatant, amount: number, element: ElementId, critical = false): void {
    target.hp = target.hp - amount;
    target.flash = 0.18;
    this.events.push({ kind: 'damage', target, amount, critical, element });

    for (const broken of target.breakOnDamage()) {
      this.events.push({ kind: 'statusExpired', target, status: broken });
    }

    if (!target.alive) {
      target.clearStatuses();
      target.committed = false;
      target.atb = 0;
      this.events.push({ kind: 'defeated', target });
    }
  }

  private heal(target: Combatant, amount: number): void {
    const before = target.hp;
    target.hp = target.hp + amount;
    const healed = target.hp - before;
    if (healed > 0) this.events.push({ kind: 'heal', target, amount: healed });
  }

  private tryApplyStatus(target: Combatant, status: StatusId): void {
    if (target.immuneTo(status)) {
      this.events.push({ kind: 'immune', target });
      return;
    }
    if (target.applyStatus(status)) {
      this.events.push({ kind: 'statusApplied', target, status });
    }
  }

  private checkBattleEnd(): void {
    if (this.phase === 'finished') return;

    if (this.livingEnemies.length === 0) {
      this.finish('victory');
    } else if (this.livingParty.length === 0) {
      this.finish('defeat');
    }
  }

  private finish(outcome: BattleOutcome): void {
    this.phase = 'finished';
    this.outcome = outcome;
    this.resolving = null;
    this.queue.length = 0;

    if (outcome === 'victory') {
      this.rewards = this.computeRewards();
    }
    for (const combatant of this.party) combatant.cleanupAfterBattle();
  }

  private computeRewards(): BattleRewards {
    let exp = 0;
    let gold = 0;
    const items: string[] = [];

    for (const enemy of this.enemies) {
      const def = enemy.enemy;
      if (!def) continue;
      exp += def.exp;
      gold += def.gold;
      for (const drop of def.drops ?? []) {
        if (this.rng.chance(drop.chance)) items.push(drop.item);
      }
    }

    const survivors = this.party.filter((c) => c.alive).length;
    return { exp: expShare(exp, Math.max(1, survivors)), gold, items };
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 1;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
