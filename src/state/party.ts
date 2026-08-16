import { expToNextLevel } from '../battle/formulas';
import { getActor } from '../data/actors';
import { getItem, tryGetItem } from '../data/items';
import type { ActorDef, EquipSlot, StatKey, Stats } from '../data/types';
import { STAT_KEYS } from '../data/types';

export interface PartyMemberSave {
  id: string;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  equipment: Partial<Record<EquipSlot, string>>;
  /** Techs known beyond the level-up list (taught by items or events). */
  extraTechs: string[];
}

export interface LevelUpResult {
  member: PartyMember;
  from: number;
  to: number;
  /** Stat deltas across the whole level gain, for the results screen. */
  gains: Partial<Record<StatKey, number>>;
  learned: string[];
}

/**
 * A playable character at runtime.
 *
 * Stats are always derived — base line, plus per-level growth, plus equipment —
 * rather than stored. That way retuning a growth curve instantly applies to an
 * existing save instead of baking in old numbers.
 */
export class PartyMember {
  readonly def: ActorDef;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  equipment: Partial<Record<EquipSlot, string>>;
  private extraTechs: Set<string>;

  constructor(actorId: string, level = 1) {
    this.def = getActor(actorId);
    this.level = level;
    this.exp = 0;
    this.equipment = {};
    this.extraTechs = new Set();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  get id(): string {
    return this.def.id;
  }

  get name(): string {
    return this.def.name;
  }

  /** Fully derived stat line: base + growth + equipment. */
  get stats(): Stats {
    const levels = this.level - 1;
    const out = { ...this.def.base };

    for (const key of STAT_KEYS) {
      const growth = this.def.growth[key];
      if (growth !== undefined) out[key] += growth * levels;
    }

    for (const itemId of Object.values(this.equipment)) {
      if (!itemId) continue;
      const equip = tryGetItem(itemId)?.equip;
      if (!equip) continue;
      for (const key of STAT_KEYS) {
        const bonus = equip.stats[key];
        if (bonus !== undefined) out[key] += bonus;
      }
    }

    // Whole numbers everywhere except crit, which is a probability.
    for (const key of STAT_KEYS) {
      out[key] = key === 'crit' ? Math.max(0, out[key]) : Math.max(0, Math.round(out[key]));
    }
    return out;
  }

  get maxHp(): number {
    return this.stats.hp;
  }

  get maxMp(): number {
    return this.stats.mp;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get expToNext(): number {
    return expToNextLevel(this.level);
  }

  /** Every tech this character can currently perform alone. */
  knownTechs(): string[] {
    const known = this.def.learns.filter((entry) => entry.level <= this.level).map((entry) => entry.tech);
    return [...new Set([...known, ...this.extraTechs])];
  }

  knowsTech(techId: string): boolean {
    return this.knownTechs().includes(techId);
  }

  teachTech(techId: string): void {
    this.extraTechs.add(techId);
  }

  /** Grant experience and apply any level ups. Returns null if no level gained. */
  gainExp(amount: number): LevelUpResult | null {
    if (amount <= 0) return null;
    const before = this.level;
    const beforeStats = this.stats;
    this.exp += amount;

    const learned: string[] = [];
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.level += 1;
      for (const entry of this.def.learns) {
        if (entry.level === this.level) learned.push(entry.tech);
      }
    }

    if (this.level === before) return null;

    const afterStats = this.stats;
    const gains: Partial<Record<StatKey, number>> = {};
    for (const key of STAT_KEYS) {
      const delta = afterStats[key] - beforeStats[key];
      if (delta !== 0) gains[key] = delta;
    }

    // A level up tops up the newly gained HP/MP rather than healing fully.
    this.hp = Math.min(this.maxHp, this.hp + (gains.hp ?? 0));
    this.mp = Math.min(this.maxMp, this.mp + (gains.mp ?? 0));

    return { member: this, from: before, to: this.level, gains, learned };
  }

  /** Can this character wear the given item? */
  canEquip(itemId: string): boolean {
    const item = tryGetItem(itemId);
    if (!item?.equip) return false;
    if (!this.def.equipSlots.includes(item.equip.slot)) return false;
    const users = item.equip.users;
    return !users || users.length === 0 || users.includes(this.id);
  }

  /** Equip an item, returning whatever was displaced from that slot. */
  equip(itemId: string): string | undefined {
    if (!this.canEquip(itemId)) return undefined;
    const slot = getItem(itemId).equip!.slot;
    const previous = this.equipment[slot];
    this.equipment[slot] = itemId;
    this.clampVitals();
    return previous;
  }

  unequip(slot: EquipSlot): string | undefined {
    const previous = this.equipment[slot];
    delete this.equipment[slot];
    this.clampVitals();
    return previous;
  }

  healFull(): void {
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  /** Keep current HP/MP inside their maxima after an equipment change. */
  clampVitals(): void {
    this.hp = Math.min(this.hp, this.maxHp);
    this.mp = Math.min(this.mp, this.maxMp);
    if (this.hp < 0) this.hp = 0;
    if (this.mp < 0) this.mp = 0;
  }

  toSave(): PartyMemberSave {
    return {
      id: this.id,
      level: this.level,
      exp: this.exp,
      hp: this.hp,
      mp: this.mp,
      equipment: { ...this.equipment },
      extraTechs: [...this.extraTechs],
    };
  }

  static fromSave(save: PartyMemberSave): PartyMember {
    const member = new PartyMember(save.id, save.level);
    member.exp = save.exp;
    member.equipment = { ...save.equipment };
    member.extraTechs = new Set(save.extraTechs ?? []);
    member.hp = Math.min(save.hp, member.maxHp);
    member.mp = Math.min(save.mp, member.maxMp);
    return member;
  }
}
