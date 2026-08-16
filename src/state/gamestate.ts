import { tryGetItem } from '../data/items';
import { PartyMember } from './party';
import type { SaveData } from './savegame';

/** How many characters can be in a battle at once. */
export const ACTIVE_PARTY_SIZE = 3;

export interface InventoryEntry {
  id: string;
  count: number;
}

/**
 * Everything that belongs in a save file: the roster, what they're carrying,
 * where they are, and which story flags have been set.
 */
export class GameState {
  /** Everyone recruited so far, in recruitment order. */
  roster: PartyMember[] = [];
  /** Ids of the characters currently in the field/battle party. */
  activeIds: string[] = [];

  inventory: InventoryEntry[] = [];
  gold = 0;

  /** Current map and position, used when returning from battles and menus. */
  mapId = '';
  playerX = 0;
  playerY = 0;
  playerFacing: 'up' | 'down' | 'left' | 'right' = 'down';

  /** Arbitrary named booleans/numbers set by events. */
  flags: Record<string, number> = {};

  /** Total seconds of play, shown on the save screen. */
  playTime = 0;

  // ------------------------------------------------------------ party

  get activeParty(): PartyMember[] {
    return this.activeIds
      .map((id) => this.roster.find((member) => member.id === id))
      .filter((member): member is PartyMember => member !== undefined);
  }

  /** The party leader, whose sprite walks the field. */
  get leader(): PartyMember | undefined {
    return this.activeParty[0];
  }

  member(id: string): PartyMember | undefined {
    return this.roster.find((m) => m.id === id);
  }

  recruit(actorId: string, level = 1): PartyMember {
    const existing = this.member(actorId);
    if (existing) return existing;

    const member = new PartyMember(actorId, level);
    this.roster.push(member);
    if (this.activeIds.length < ACTIVE_PARTY_SIZE) this.activeIds.push(actorId);
    return member;
  }

  /** True if every active member is knocked out. */
  get wiped(): boolean {
    const party = this.activeParty;
    return party.length > 0 && party.every((member) => !member.alive);
  }

  restParty(): void {
    for (const member of this.roster) member.healFull();
  }

  // -------------------------------------------------------- inventory

  addItem(id: string, count = 1): void {
    if (!tryGetItem(id)) throw new Error(`Cannot add unknown item "${id}"`);
    const entry = this.inventory.find((e) => e.id === id);
    if (entry) entry.count += count;
    else this.inventory.push({ id, count });
  }

  /** Remove items. Returns false (and changes nothing) if there aren't enough. */
  removeItem(id: string, count = 1): boolean {
    const index = this.inventory.findIndex((e) => e.id === id);
    if (index < 0) return false;
    const entry = this.inventory[index]!;
    if (entry.count < count) return false;

    entry.count -= count;
    if (entry.count <= 0) this.inventory.splice(index, 1);
    return true;
  }

  itemCount(id: string): number {
    return this.inventory.find((e) => e.id === id)?.count ?? 0;
  }

  /** Inventory filtered to a predicate, preserving order. */
  itemsWhere(predicate: (id: string) => boolean): InventoryEntry[] {
    return this.inventory.filter((entry) => predicate(entry.id));
  }

  spendGold(amount: number): boolean {
    if (amount > this.gold) return false;
    this.gold -= amount;
    return true;
  }

  // ------------------------------------------------------------ flags

  flag(name: string): number {
    return this.flags[name] ?? 0;
  }

  setFlag(name: string, value = 1): void {
    this.flags[name] = value;
  }

  hasFlag(name: string): boolean {
    return this.flag(name) !== 0;
  }

  // ------------------------------------------------------- persistence

  toSave(): SaveData {
    return {
      version: 1,
      savedAt: Date.now(),
      playTime: this.playTime,
      gold: this.gold,
      mapId: this.mapId,
      playerX: this.playerX,
      playerY: this.playerY,
      playerFacing: this.playerFacing,
      activeIds: [...this.activeIds],
      roster: this.roster.map((member) => member.toSave()),
      inventory: this.inventory.map((entry) => ({ ...entry })),
      flags: { ...this.flags },
    };
  }

  static fromSave(data: SaveData): GameState {
    const state = new GameState();
    state.playTime = data.playTime ?? 0;
    state.gold = data.gold ?? 0;
    state.mapId = data.mapId ?? '';
    state.playerX = data.playerX ?? 0;
    state.playerY = data.playerY ?? 0;
    state.playerFacing = data.playerFacing ?? 'down';
    state.roster = (data.roster ?? []).map((entry) => PartyMember.fromSave(entry));
    state.activeIds = (data.activeIds ?? []).filter((id) => state.roster.some((m) => m.id === id));
    // Drop items that no longer exist, so renaming content can't corrupt a save.
    state.inventory = (data.inventory ?? []).filter((entry) => tryGetItem(entry.id) !== undefined);
    state.flags = { ...(data.flags ?? {}) };
    return state;
  }
}
