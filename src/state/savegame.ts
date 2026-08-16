import type { InventoryEntry } from './gamestate';
import type { PartyMemberSave } from './party';

export interface SaveData {
  version: number;
  savedAt: number;
  playTime: number;
  gold: number;
  mapId: string;
  playerX: number;
  playerY: number;
  playerFacing: 'up' | 'down' | 'left' | 'right';
  activeIds: string[];
  roster: PartyMemberSave[];
  inventory: InventoryEntry[];
  flags: Record<string, number>;
}

const SLOT_PREFIX = 'seikilos.save.';
export const SAVE_SLOTS = 3;

function slotKey(slot: number): string {
  return `${SLOT_PREFIX}${slot}`;
}

export function writeSave(slot: number, data: SaveData): boolean {
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(data));
    return true;
  } catch {
    // Private browsing or a full quota; the caller shows a failure message.
    return false;
  }
}

export function readSave(slot: number): SaveData | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (typeof parsed?.version !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteSave(slot: number): void {
  try {
    localStorage.removeItem(slotKey(slot));
  } catch {
    /* nothing we can do */
  }
}

export function listSaves(): (SaveData | null)[] {
  return Array.from({ length: SAVE_SLOTS }, (_, i) => readSave(i));
}

/** "2:07" style play-time label. */
export function formatPlayTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}
