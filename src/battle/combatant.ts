import { STATUSES } from '../data/status';
import type { EnemyDef, ElementId, StatKey, Stats, StatusId } from '../data/types';
import type { PartyMember } from '../state/party';

export type Side = 'party' | 'enemy';

export interface ActiveStatus {
  id: StatusId;
  /** Seconds left, or Infinity for statuses that last until cured. */
  remaining: number;
  /** Countdown to the next damage-over-time tick. */
  dotTimer: number;
}

let nextInstanceId = 0;

/**
 * One participant in a battle.
 *
 * Wraps either a `PartyMember` or an `EnemyDef` so the engine can treat both
 * identically. HP and MP for party members write straight back through to the
 * party member, so damage taken in battle persists afterwards.
 */
export class Combatant {
  readonly key: string;
  readonly side: Side;
  readonly name: string;
  readonly member?: PartyMember;
  readonly enemy?: EnemyDef;
  readonly level: number;
  readonly spriteKey: string;
  readonly width: number;
  readonly height: number;

  /** Position on the battle field, in virtual pixels (sprite centre-bottom). */
  x: number;
  y: number;

  /** ATB gauge, 0..1. At 1 the combatant may act. */
  atb = 0;
  /** Set while the combatant has committed to an action but hasn't acted yet. */
  committed = false;
  /** Defending halves incoming damage until this combatant's next action. */
  guarding = false;
  statuses: ActiveStatus[] = [];

  /** Cosmetic: seconds left of the damage flash. */
  flash = 0;
  /** Cosmetic: horizontal lunge offset used by attack animations. */
  offsetX = 0;
  offsetY = 0;

  /** How many actions this combatant has taken; drives `turnAtLeast` AI. */
  turnsTaken = 0;
  /** Uses per AI entry index, for `maxUses`. */
  aiUses: number[] = [];

  private enemyHp: number;
  private enemyMp: number;
  private readonly baseStats: Stats;

  private constructor(opts: {
    side: Side;
    name: string;
    level: number;
    baseStats: Stats;
    spriteKey: string;
    width: number;
    height: number;
    x: number;
    y: number;
    member?: PartyMember;
    enemy?: EnemyDef;
  }) {
    this.key = `${opts.side}:${opts.member?.id ?? opts.enemy?.id ?? 'unit'}:${nextInstanceId++}`;
    this.side = opts.side;
    this.name = opts.name;
    this.level = opts.level;
    this.baseStats = opts.baseStats;
    this.spriteKey = opts.spriteKey;
    this.width = opts.width;
    this.height = opts.height;
    this.x = opts.x;
    this.y = opts.y;
    this.member = opts.member;
    this.enemy = opts.enemy;
    this.enemyHp = opts.baseStats.hp;
    this.enemyMp = opts.baseStats.mp;
  }

  static fromPartyMember(member: PartyMember, x: number, y: number): Combatant {
    return new Combatant({
      side: 'party',
      name: member.name,
      level: member.level,
      baseStats: member.stats,
      spriteKey: member.def.battleSprite,
      width: 24,
      height: 32,
      x,
      y,
      member,
    });
  }

  static fromEnemy(def: EnemyDef, x: number, y: number): Combatant {
    return new Combatant({
      side: 'enemy',
      name: def.name,
      level: def.level,
      baseStats: { ...def.stats },
      spriteKey: def.sprite,
      width: def.size.w,
      height: def.size.h,
      x,
      y,
      enemy: def,
    });
  }

  // ------------------------------------------------------------- vitals

  get hp(): number {
    return this.member ? this.member.hp : this.enemyHp;
  }

  set hp(value: number) {
    const clamped = Math.max(0, Math.min(this.maxHp, Math.round(value)));
    if (this.member) this.member.hp = clamped;
    else this.enemyHp = clamped;
  }

  get mp(): number {
    return this.member ? this.member.mp : this.enemyMp;
  }

  set mp(value: number) {
    const clamped = Math.max(0, Math.min(this.maxMp, Math.round(value)));
    if (this.member) this.member.mp = clamped;
    else this.enemyMp = clamped;
  }

  get maxHp(): number {
    return this.member ? this.member.maxHp : this.baseStats.hp;
  }

  get maxMp(): number {
    return this.member ? this.member.maxMp : this.baseStats.mp;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get hpFraction(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  /** Ready to act: gauge full, alive, not already committed, not disabled. */
  get ready(): boolean {
    return this.alive && this.atb >= 1 && !this.committed && !this.disabled;
  }

  // -------------------------------------------------------------- stats

  /** A stat with all active status multipliers applied. */
  stat(key: StatKey): number {
    const source = this.member ? this.member.stats : this.baseStats;
    let value = source[key];
    for (const active of this.statuses) {
      const mul = STATUSES[active.id].statMul?.[key];
      if (mul !== undefined) value *= mul;
    }
    return key === 'crit' ? Math.max(0, value) : Math.max(0, Math.round(value));
  }

  /** Multiplier for damage of a given element against this combatant. */
  affinity(element: ElementId): number {
    return this.enemy?.affinities?.[element] ?? 1;
  }

  // ------------------------------------------------------------ statuses

  hasStatus(id: StatusId): boolean {
    return this.statuses.some((status) => status.id === id);
  }

  /** True if this combatant can never receive the given status. */
  immuneTo(id: StatusId): boolean {
    return this.enemy?.immuneTo?.includes(id) ?? false;
  }

  /** Applies a status. Returns false if immune or already present. */
  applyStatus(id: StatusId): boolean {
    if (!this.alive || this.immuneTo(id)) return false;

    const def = STATUSES[id];
    const duration = def.duration > 0 ? def.duration : Infinity;
    const existing = this.statuses.find((status) => status.id === id);
    if (existing) {
      // Re-applying refreshes rather than stacking.
      existing.remaining = Math.max(existing.remaining, duration);
      return false;
    }

    this.statuses.push({ id, remaining: duration, dotTimer: def.dotInterval ?? 0 });
    return true;
  }

  removeStatus(id: StatusId): boolean {
    const index = this.statuses.findIndex((status) => status.id === id);
    if (index < 0) return false;
    this.statuses.splice(index, 1);
    return true;
  }

  clearStatuses(): void {
    this.statuses.length = 0;
  }

  /** Cannot choose an action right now. */
  get disabled(): boolean {
    return this.statuses.some((status) => STATUSES[status.id].disables);
  }

  /** ATB gauge is frozen. */
  get atbFrozen(): boolean {
    return this.statuses.some((status) => STATUSES[status.id].freezesAtb);
  }

  /** Cannot use techs (Silence). */
  get techsBlocked(): boolean {
    return this.statuses.some((status) => STATUSES[status.id].blocksTechs);
  }

  /** Must attack a random enemy (Berserk). */
  get forcedToAttack(): boolean {
    return this.statuses.some((status) => STATUSES[status.id].forcesAttack);
  }

  /** Combined ATB rate multiplier from all statuses. */
  get atbRateMultiplier(): number {
    let rate = 1;
    for (const status of this.statuses) {
      const mul = STATUSES[status.id].atbRate;
      if (mul !== undefined) rate *= mul;
    }
    return rate;
  }

  /** Statuses that end when the bearer is hit (Sleep). */
  breakOnDamage(): StatusId[] {
    const broken: StatusId[] = [];
    for (const status of [...this.statuses]) {
      if (STATUSES[status.id].breaksOnDamage) {
        this.removeStatus(status.id);
        broken.push(status.id);
      }
    }
    return broken;
  }

  /** Reset per-battle transient state. Called when a battle ends. */
  cleanupAfterBattle(): void {
    this.clearStatuses();
    this.atb = 0;
    this.committed = false;
    this.guarding = false;
    this.offsetX = 0;
    this.offsetY = 0;
  }
}
