/**
 * Shared type vocabulary for all game content.
 *
 * Everything the designer touches — characters, enemies, techs, items — is
 * plain data described by these types. The battle engine only ever reads them,
 * so adding a new enemy or spell is a data edit, never an engine edit.
 */

export type ElementId = 'physical' | 'fire' | 'ice' | 'lightning' | 'shadow' | 'light';

export const ELEMENTS: readonly ElementId[] = [
  'physical',
  'fire',
  'ice',
  'lightning',
  'shadow',
  'light',
] as const;

/** Display colour per element, used for damage numbers and spell effects. */
export const ELEMENT_COLORS: Readonly<Record<ElementId, string>> = {
  physical: '#f2f2f2',
  fire: '#ff7a3d',
  ice: '#7fd8ff',
  lightning: '#ffe066',
  shadow: '#b57bff',
  light: '#fff2b8',
};

export interface Stats {
  /** Maximum hit points. */
  hp: number;
  /** Maximum magic points. */
  mp: number;
  /** Physical attack power. */
  atk: number;
  /** Physical damage reduction. */
  def: number;
  /** Magical attack power. */
  mag: number;
  /** Magical damage reduction. */
  res: number;
  /** Drives how fast the ATB gauge fills. */
  spd: number;
  /** Accuracy rating. */
  hit: number;
  /** Evasion rating. */
  eva: number;
  /** Critical hit chance, 0..1. */
  crit: number;
}

export type StatKey = keyof Stats;

export const STAT_KEYS: readonly StatKey[] = [
  'hp',
  'mp',
  'atk',
  'def',
  'mag',
  'res',
  'spd',
  'hit',
  'eva',
  'crit',
] as const;

/**
 * Who an action can hit.
 *
 * These are **relative to the caster**, not to the player. An enemy tech that
 * should hit the party is `oneEnemy`/`allEnemies`, and `allAllies` on an enemy
 * tech buffs its fellow monsters. Getting this backwards is easy and quiet, so
 * `content.test.ts` asserts that damaging enemy techs point at the party.
 *
 * `areaEnemies` and `lineEnemies` are the Chrono Trigger-style positional
 * shapes: they resolve against where combatants actually stand on the field,
 * so party positioning matters.
 */
export type TargetKind =
  | 'oneEnemy'
  | 'allEnemies'
  | 'areaEnemies'
  | 'lineEnemies'
  | 'oneAlly'
  | 'allAllies'
  | 'deadAlly'
  | 'self';

export type SkillKind = 'physical' | 'magical' | 'heal' | 'revive' | 'support';

export type StatusId =
  | 'poison'
  | 'sleep'
  | 'stop'
  | 'slow'
  | 'haste'
  | 'protect'
  | 'shell'
  | 'blind'
  | 'silence'
  | 'berserk';

export interface StatusDef {
  id: StatusId;
  name: string;
  /** Short tag shown in the battle HUD. */
  abbrev: string;
  color: string;
  /** Default duration in seconds of battle time. 0 = lasts until cured. */
  duration: number;
  /** Cannot choose actions while this is active. */
  disables?: boolean;
  /** ATB gauge does not fill while this is active. */
  freezesAtb?: boolean;
  /** Multiplier applied to ATB fill rate. */
  atbRate?: number;
  /** Damage per tick as a fraction of max HP. */
  dotPercent?: number;
  /** Seconds between damage-over-time ticks. */
  dotInterval?: number;
  /** Removed when the bearer takes damage. */
  breaksOnDamage?: boolean;
  /** Flat multipliers applied to the bearer's stats. */
  statMul?: Partial<Record<StatKey, number>>;
  /** Blocks tech usage. */
  blocksTechs?: boolean;
  /** Forces basic attacks on random enemies. */
  forcesAttack?: boolean;
}

/** Visual treatment for a tech, read by the battle animation layer. */
export interface TechFx {
  /** How the effect is drawn. */
  shape: 'slash' | 'burst' | 'beam' | 'ring' | 'rain' | 'aura' | 'impact';
  color: string;
  /** Seconds the animation plays before damage lands. */
  windup?: number;
  /** Seconds the animation lingers after damage. */
  linger?: number;
  /** Shake the screen on impact. */
  shake?: number;
}

export interface TechDef {
  id: string;
  name: string;
  desc: string;
  /**
   * Which characters perform this tech.
   *
   * One id is a normal single tech. Two or three ids make it a combo tech,
   * which only becomes selectable when every listed character is in the active
   * party, is ATB-ready at the same moment, and knows the component techs.
   */
  users: string[];
  /** MP cost paid by each participating character. */
  mpCost: number;
  kind: SkillKind;
  element: ElementId;
  /** Scales damage or healing. Roughly "percent of the caster's power". */
  power: number;
  target: TargetKind;
  /** Radius in pixels for `areaEnemies`. */
  radius?: number;
  /** Number of separate damage rolls. */
  hits?: number;
  /** Ignores the target's DEF/RES entirely. */
  piercing?: boolean;
  /** Combo techs require every listed component tech to be known. */
  requires?: string[];
  /** Status the tech may inflict on hit. */
  inflicts?: { status: StatusId; chance: number };
  /** Status granted to the target (buffs). */
  grants?: { status: StatusId; chance: number };
  fx: TechFx;
}

export interface LearnEntry {
  level: number;
  tech: string;
}

export interface ActorDef {
  id: string;
  name: string;
  /** Asset key for the overworld walking sprite. */
  fieldSprite: string;
  /** Asset key for the battle sprite. */
  battleSprite: string;
  /** One-line character blurb for the status screen. */
  title: string;
  /** Accent colour used for this character's UI panels and combo techs. */
  color: string;
  /** Stats at level 1. */
  base: Stats;
  /** Added per level gained. `crit` is a fraction, so its growth is tiny. */
  growth: Partial<Record<StatKey, number>>;
  /** Techs learned as the character levels up. */
  learns: LearnEntry[];
  /** Equipment slots this character can use. */
  equipSlots: EquipSlot[];
}

export type EquipSlot = 'weapon' | 'armor' | 'accessory';

export type ItemKind = 'consumable' | 'weapon' | 'armor' | 'accessory' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: ItemKind;
  price: number;
  /** Can this be used from the battle item menu? */
  usableInBattle?: boolean;
  /** Can this be used from the field menu? */
  usableInField?: boolean;
  target?: TargetKind;
  /** What using the item does. */
  effect?: {
    /** Flat HP restored. */
    hp?: number;
    /** Fraction of max HP restored, 0..1. */
    hpPercent?: number;
    mp?: number;
    mpPercent?: number;
    /** Revive with this fraction of max HP. */
    revive?: number;
    cures?: StatusId[];
    /** Damage dealt, for throwables like bombs. */
    damage?: number;
    element?: ElementId;
    grants?: { status: StatusId; chance: number };
  };
  /** Stat changes while equipped. */
  equip?: {
    slot: EquipSlot;
    stats: Partial<Stats>;
    /** Restrict to specific characters. Empty/undefined means anyone. */
    users?: string[];
    /** Element the weapon deals, if it overrides physical. */
    element?: ElementId;
  };
}

/** How an enemy reacts to each element. 1 is neutral. */
export type Affinities = Partial<Record<ElementId, number>>;

/** Multipliers used when authoring affinities, for readability. */
export const AFFINITY = {
  weak: 1.5,
  veryWeak: 2,
  neutral: 1,
  resist: 0.5,
  immune: 0,
  /** Negative multipliers heal the target. */
  absorb: -1,
} as const;

export interface AiCondition {
  /** Only when the enemy's HP fraction is at or below this (0..1). */
  hpBelow?: number;
  /** Only from this battle turn onwards. */
  turnAtLeast?: number;
  /** Only when at least one ally enemy has died. */
  allyDead?: boolean;
  /** Only when the enemy does not already have this status active on a target. */
  targetLacksStatus?: StatusId;
  /** Hard cap on how many times this entry can be chosen per battle. */
  maxUses?: number;
}

export interface AiEntry {
  /** `'attack'` for a basic attack, otherwise a tech id. */
  action: string;
  /** Relative likelihood among all currently valid entries. */
  weight: number;
  condition?: AiCondition;
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  level: number;
  stats: Stats;
  exp: number;
  gold: number;
  /** Pixel dimensions of the battle sprite. */
  size: { w: number; h: number };
  affinities?: Affinities;
  /** Statuses this enemy can never receive. */
  immuneTo?: StatusId[];
  drops?: { item: string; chance: number }[];
  /** Techs this enemy may use, referenced by `ai` entries. */
  techs?: string[];
  ai: AiEntry[];
  /** Short bestiary blurb. */
  desc?: string;
}

/** A battle setup: which enemies, standing where. */
export interface EncounterDef {
  id: string;
  /** Asset key for the battle backdrop. */
  background: string;
  members: { enemy: string; x: number; y: number }[];
  /** Prevents running away. */
  noEscape?: boolean;
  /** Plays a boss victory flow and cannot be re-fought. */
  boss?: boolean;
}

export function emptyStats(): Stats {
  return { hp: 0, mp: 0, atk: 0, def: 0, mag: 0, res: 0, spd: 0, hit: 0, eva: 0, crit: 0 };
}

export function addStats(a: Stats, b: Partial<Stats>): Stats {
  const out = { ...a };
  for (const key of STAT_KEYS) {
    const delta = b[key];
    if (delta !== undefined) out[key] = out[key] + delta;
  }
  return out;
}
