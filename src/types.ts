// ============================================================
//  TLL TimeSlayer — Core Type Definitions
//  Pure data layer; 100% deterministic, event-driven, strictly typed.
//  v2: Mulligan, Fatigue, Graveyard, Status Effects, Auras, Targeting
// ============================================================

// ─────────────────────────────────────────────────────────────
//  Enumerations
// ─────────────────────────────────────────────────────────────

/** The four lane archetypes. Lane positions are fixed indices 0-3. */
export enum LaneType {
  Aerial  = "AERIAL",   // Lane 0 -- requires Flying keyword to place
  Ground1 = "GROUND_1", // Lane 1 -- allows Environment cards
  Ground2 = "GROUND_2", // Lane 2 -- allows Environment cards
  Water   = "WATER",    // Lane 3 -- requires Amphibious keyword to place
}

/** Player side identifiers. */
export enum PlayerId {
  Player   = "PLAYER",
  Opponent = "OPPONENT",
}

/** All possible card categories. */
export enum CardType {
  Unit        = "UNIT",
  Spell       = "SPELL",
  Equipment   = "EQUIPMENT",
  Environment = "ENVIRONMENT",
  HeroAbility = "HERO_ABILITY",
}

/** 8 Core Thai Tactical Keywords + Engine Event Keywords */
export enum Keyword {
  Support       = "สนับสนุน",       // Support: Can be placed in the Support row
  Overkill      = "โจมตีต่อเนื่อง",   // Overkill/Bonus Attack: Attacks again immediately if it destroys a unit / Double Strike
  Strikethrough = "เกลียดชังตำนาน",  // Strikethrough/Cleave to Hero: When dealing damage to a unit, also deals damage to opponent Hero
  Aerial        = "อากาศยาน",     // Aerial: Can be played in Lane 0 (Aerial/Far-left)
  Naval         = "กองเรือ",       // Naval/Amphibious: Can be played in Lane 3 (Water/Far-right)
  Lifesteal     = "กลืนชีพ",       // Lifesteal: Heals your Hero equal to the damage dealt
  Armored       = "ทนทาน",        // Armored: Reduces incoming attack damage by 1
  Rush          = "จู่โจม",       // Rush: Attacks 1 time immediately when played onto the field

  // Aliases for compatibility:
  DoubleStrike  = "โจมตีต่อเนื่อง",
  Piercing      = "เกลียดชังตำนาน",
  Flying        = "อากาศยาน",
  Amphibious    = "กองเรือ",
  Deathrattle   = "DEATHRATTLE",
  Aura          = "AURA",
}

export type KeywordType =
  | 'สนับสนุน'       // Support: Can be placed in the Support row
  | 'โจมตีต่อเนื่อง'   // Overkill/Bonus Attack: Attacks again immediately if it destroys a unit
  | 'เกลียดชังตำนาน'  // Strikethrough/Cleave to Hero: When dealing damage to a unit, also deals damage to opponent Hero
  | 'อากาศยาน'     // Aerial: Can be played in Lane 0 (Aerial/Far-left)
  | 'กองเรือ'       // Naval/Amphibious: Can be played in Lane 3 (Water/Far-right)
  | 'กลืนชีพ'       // Lifesteal: Heals your Hero equal to the damage dealt
  | 'ทนทาน'        // Armored: Reduces incoming attack damage by 1
  | 'จู่โจม';       // Rush: Attacks 1 time immediately when played onto the field

/** 7 Core Thai Tactical Tribes + Neutral */
export type Tribe = 
  | 'ปัญญา'       // Wisdom / Tactical Control & Card Draw
  | 'จอมพล'       // Warlord / Swarm, Buffs & Leadership
  | 'จู่โจม'       // Assault / Rush, Direct Damage & High ATK
  | 'รักษา'       // Restoration / Healing & Sustainability
  | 'พิทักษ์'     // Guardian / High HP, Armor & Wall Defense
  | 'ยุทธศาสตร์'   // Strategy / Lane Manipulation & Tactical Trades
  | 'จอมอาคม'     // Sorcerer / Spells, Arcane & Burst Damage
  | 'เป็นกลาง';    // Neutral (can be added to any deck)

// ─────────────────────────────────────────────────────────────
//  Unified Targeting System
// ─────────────────────────────────────────────────────────────

export type TargetType =
  | "NONE"
  | "ANY_FIELD_POSITION"
  | "SINGLE_UNIT"
  | "FRIENDLY_UNIT"
  | "ENEMY_UNIT"
  | "ANY_HERO"
  | "ENEMY_HERO"
  | "LANE"
  | "ALL_ENEMIES";

// ─────────────────────────────────────────────────────────────
//  Status Effect Types
// ─────────────────────────────────────────────────────────────

export type StatusEffectType = "FROZEN" | "SHIELD" | "DEADLY";

// ─────────────────────────────────────────────────────────────
//  Turn Phases (FSM)
// ─────────────────────────────────────────────────────────────

export enum TurnPhase {
  HERO_SELECTION = "HERO_SELECTION",
  MULLIGAN       = "MULLIGAN",
  P1_UNIT_PHASE  = "P1_UNIT_PHASE",
  P2_UNIT_PHASE  = "P2_UNIT_PHASE",
  P1_SPELL_PHASE = "P1_SPELL_PHASE",
  P2_SPELL_PHASE = "P2_SPELL_PHASE",
  COMBAT_PHASE   = "COMBAT_PHASE",
  TURN_END       = "TURN_END",
}

/** Fine-grained event types emitted by every engine action. */
export enum GameEventType {
  GAME_INITIALIZED       = "GAME_INITIALIZED",
  TURN_STARTED           = "TURN_STARTED",
  TURN_ENDED             = "TURN_ENDED",
  PHASE_CHANGED          = "PHASE_CHANGED",
  MANA_CHANGED           = "MANA_CHANGED",
  GAME_OVER              = "GAME_OVER",
  HERO_SELECTED          = "HERO_SELECTED",
  MULLIGAN_STARTED       = "MULLIGAN_STARTED",
  MULLIGAN_CONFIRMED     = "MULLIGAN_CONFIRMED",
  MULLIGAN_COMPLETE      = "MULLIGAN_COMPLETE",
  CARD_DRAWN             = "CARD_DRAWN",
  CARD_PLAYED            = "CARD_PLAYED",
  CARD_DISCARDED         = "CARD_DISCARDED",
  CARD_BURNED            = "CARD_BURNED",
  CARD_SENT_TO_GRAVEYARD = "CARD_SENT_TO_GRAVEYARD",
  UNIT_SUMMONED          = "UNIT_SUMMONED",
  UNIT_ATTACKED          = "UNIT_ATTACKED",
  UNIT_DAMAGED           = "UNIT_DAMAGED",
  UNIT_DIED              = "UNIT_DIED",
  UNIT_HEALED            = "UNIT_HEALED",
  UNIT_BUFFED            = "UNIT_BUFFED",
  RUSH_ATTACK            = "RUSH_ATTACK",
  DOUBLE_STRIKE          = "DOUBLE_STRIKE",
  STRIKETHROUGH_HIT      = "STRIKETHROUGH_HIT",
  DEATHRATTLE_TRIGGER    = "DEATHRATTLE_TRIGGER",
  STATUS_FROZEN          = "STATUS_FROZEN",
  STATUS_FREEZE_SKIPPED  = "STATUS_FREEZE_SKIPPED",
  STATUS_SHIELD_GAINED   = "STATUS_SHIELD_GAINED",
  STATUS_SHIELD_BROKEN   = "STATUS_SHIELD_BROKEN",
  STATUS_DEADLY_APPLIED  = "STATUS_DEADLY_APPLIED",
  AURA_RECALCULATED      = "AURA_RECALCULATED",
  FATIGUE_DAMAGE         = "FATIGUE_DAMAGE",
  EQUIPMENT_ATTACHED     = "EQUIPMENT_ATTACHED",
  EQUIPMENT_DESTROYED    = "EQUIPMENT_DESTROYED",
  ENVIRONMENT_PLACED     = "ENVIRONMENT_PLACED",
  ENVIRONMENT_DESTROYED  = "ENVIRONMENT_DESTROYED",
  HERO_DAMAGED           = "HERO_DAMAGED",
  HERO_HEALED            = "HERO_HEALED",
  SUPER_BLOCK_CHARGE     = "SUPER_BLOCK_CHARGE",
  SUPER_BLOCK_TRIGGER    = "SUPER_BLOCK_TRIGGER",
  SUPER_BLOCK_INTERRUPT  = "SUPER_BLOCK_INTERRUPT",
  SUPER_BLOCK_RESOLVED   = "SUPER_BLOCK_RESOLVED",
  COMBAT_LANE_STARTED    = "COMBAT_LANE_STARTED",
  COMBAT_LANE_ENDED      = "COMBAT_LANE_ENDED",
}

// ─────────────────────────────────────────────────────────────
//  Card Effects
// ─────────────────────────────────────────────────────────────

export interface DeathrattleEffect {
  readonly description?: string;
  readonly damage?: number;
  readonly target?: "ADJACENT_LANES" | "OPPOSING_LANE" | "ALL_LANES" | "ENEMY_HERO" | "ALL_ENEMIES";
  readonly healHero?: number;
  readonly drawCards?: number;
  readonly applyStatus?: StatusEffectType;
}

export interface EquipmentEffect {
  readonly attackBonus: number;
  readonly hpBonus: number;
  readonly grantedKeywords?: readonly Keyword[];
  readonly grantedStatus?: StatusEffectType;
}

export interface EnvironmentEffect {
  readonly attackModifier?: number;
  readonly hpModifier?: number;
  readonly damagePerTurnEnd?: number;
  readonly buffTribe?: string;
}

export interface SpellEffect {
  readonly damage?: number;
  readonly heal?: number;
  readonly target?: "UNIT" | "HERO" | "ANY" | "ALL_UNITS" | "LANE" | "ENEMY_HERO" | "ALL_NON_WATER";
  readonly buffAttack?: number;
  readonly buffHp?: number;
  readonly drawCards?: number;
  readonly applyStatus?: StatusEffectType;
  readonly grantKeyword?: Keyword;
  readonly freezeLane?: boolean;
  readonly damagePerUnitOnBoard?: boolean;
  readonly damageAllNonWater?: number;
  readonly summonCardId?: string;
}

export interface AuraEffect {
  readonly attackBonus?: number;
  readonly hpBonus?: number;
  readonly range: "SAME_LANE" | "ADJACENT_LANES" | "ALL_FRIENDLY";
  readonly tribeFilter?: string;
  readonly description: string;
}

// ─────────────────────────────────────────────────────────────
//  Card Anatomy
// ─────────────────────────────────────────────────────────────

export interface Card {
  readonly id: string;
  readonly name: string;
  readonly type: CardType;
  readonly cost: number;
  readonly attack: number;
  readonly hp: number;
  readonly currentHp?: number;
  readonly tribes: readonly (Tribe | string)[]; // Primary: array of Tribes (multi-tribe support)
  readonly tribe?: Tribe | string;              // Backward compatibility fallback
  readonly laneTypeRestriction?: LaneType;
  readonly keywords: readonly Keyword[];
  readonly text?: string;
  readonly deathrattleEffect?: DeathrattleEffect;
  readonly equipmentEffect?: EquipmentEffect;
  readonly environmentEffect?: EnvironmentEffect;
  readonly spellEffect?: SpellEffect;
  readonly auraEffect?: AuraEffect;
  readonly targetType?: TargetType;
}

export type CardDefinition = Card;

// ─────────────────────────────────────────────────────────────
//  Hero & Superpower Kit Definition (Symmetric)
// ─────────────────────────────────────────────────────────────

export interface SuperpowerKit {
  /** 1-of-a-kind iconic signature superpower; powerful, game-changing effect. */
  readonly signatureAbility: Card;
  /** 3 versatile superpower cards tailored to the hero's archetype. */
  readonly coreAbilities: readonly [Card, Card, Card] | [Card, Card, Card];
}

export interface Hero {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly portraitUrl: string;
  readonly maxHp: number; // default: 20
  readonly superpowerKit: SuperpowerKit;
  // Backward compatibility / convenience properties
  readonly allowedTribes?: readonly string[];
  readonly startingHp?: number;
  readonly tribeSynergies?: readonly string[];
  readonly superpowers?: readonly Card[];
  readonly updatedAt?: number;
}

export interface HeroDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  maxHp: number; // default 20
  portraitUrl: string;
  allowedTribes: string[]; // Tribes this hero can build decks with
  signatureAbilityCardId: string; // References 1 specific Card ID
  coreAbilityCardIds: [string, string, string]; // References 3 Card IDs
  updatedAt: number;
}

/** Symmetric Hero entity types */
export type PlayerHero = Hero;
export type OpponentHero = Hero;

// ─────────────────────────────────────────────────────────────
//  Aura Modifier (runtime, recalculated)
// ─────────────────────────────────────────────────────────────

export interface AuraModifier {
  sourceInstanceId: string;
  attackBonus: number;
  hpBonus: number;
}

// ─────────────────────────────────────────────────────────────
//  Live Unit Instance (runtime)
// ─────────────────────────────────────────────────────────────

export interface UnitInstance {
  readonly instanceId: string;
  readonly cardId: string;
  readonly ownerId: PlayerId;
  laneIndex: number;
  readonly name: string;
  tribes?: (Tribe | string)[];                  // Primary: array of Tribes
  readonly tribe?: Tribe | string;              // Backward compatibility fallback
  readonly baseKeywords: readonly Keyword[];
  keywords: Keyword[];
  attack: number;
  maxHp: number;
  currentHp: number;
  hasAttackedThisTurn: boolean;
  summonedThisTurn: boolean;
  isSupport: boolean;
  attachedEquipment: Card[];
  deathrattleEffect?: DeathrattleEffect;
  auraEffect?: AuraEffect;
  isFrozen: boolean;
  hasShield: boolean;
  isDeadly: boolean;
  auraModifiers: AuraModifier[];
}

// ─────────────────────────────────────────────────────────────
//  Lane State
// ─────────────────────────────────────────────────────────────

export interface LaneState {
  readonly index: number;
  readonly type: LaneType;
  playerFrontline: UnitInstance | null;
  playerSupport: UnitInstance | null;
  opponentFrontline: UnitInstance | null;
  opponentSupport: UnitInstance | null;
  environment: Card | null;
  environmentOwnerId?: PlayerId | null;
  playerUnit: UnitInstance | null;
  opponentUnit: UnitInstance | null;
}

export type Lane = LaneState;

// ─────────────────────────────────────────────────────────────
//  Super-Block
// ─────────────────────────────────────────────────────────────

export interface SuperBlockMeter {
  charges: number;
  triggerCount: number;
  superBlockTriggered: boolean;
}

export interface SuperBlockInterrupt {
  readonly active: boolean;
  readonly playerId: PlayerId;
  readonly superpower: Card;
  readonly triggeringAttackDamage: number;
  readonly triggeringLaneIndex?: number;
}

// ─────────────────────────────────────────────────────────────
//  Mulligan State
// ─────────────────────────────────────────────────────────────

export interface MulliganState {
  p1MulliganHand: Card[];
  p2MulliganHand: Card[];
  p1Confirmed: boolean;
  p2Confirmed: boolean;
}

// ─────────────────────────────────────────────────────────────
//  Player State
// ─────────────────────────────────────────────────────────────

export interface PlayerState {
  readonly id: PlayerId;
  readonly hero: Hero;
  hp: number;
  maxHp: number;
  hand: Card[];
  deck: Card[];
  graveyard: Card[];
  currentMana: number;
  maxMana: number;
  superBlock: SuperBlockMeter;
  availableSuperpowers: Card[];
  fatigueCount: number;
}

// ─────────────────────────────────────────────────────────────
//  Game Events
// ─────────────────────────────────────────────────────────────

export interface GameEvent {
  readonly type: GameEventType;
  readonly message: string;
  readonly payload: Record<string, unknown>;
  readonly seq: number;
}

export type CombatEvent = GameEvent;

// ─────────────────────────────────────────────────────────────
//  Combat Step Queue
// ─────────────────────────────────────────────────────────────

export interface CombatQueueState {
  currentLaneIndex: number;
  currentStrike: 1 | 2;
  phaseStep: "STRIKE_1" | "STRIKE_2" | "NEXT_LANE" | "COMPLETE";
}

export interface CombatStepResult {
  done: boolean;
  laneIndex: number;
  events: CombatEvent[];
  state: GameState;
  interruptedBySuperBlock?: boolean;
}

// ─────────────────────────────────────────────────────────────
//  Game State (Root)
// ─────────────────────────────────────────────────────────────

export interface GameState {
  turnNumber: number;
  firstPlayerId: PlayerId;
  activePlayerId: PlayerId;
  currentPhase: TurnPhase;
  lanes: [LaneState, LaneState, LaneState, LaneState];
  player: PlayerState;
  opponent: PlayerState;
  superBlockInterrupt: SuperBlockInterrupt | null;
  combatQueue: CombatQueueState | null;
  eventLog: GameEvent[];
  winner: PlayerId | "DRAW" | null;
  isGameOver: boolean;
  mulliganState: MulliganState | null;
}

// ─────────────────────────────────────────────────────────────
//  Game Actions
// ─────────────────────────────────────────────────────────────

export type GameAction =
  | {
      readonly type: "PLAY_CARD";
      readonly playerId: PlayerId;
      readonly cardId: string;
      readonly laneIndex?: number;
      readonly targetInstanceId?: string;
      readonly targetHeroId?: PlayerId;
      readonly slotType?: "frontline" | "support";
    }
  | {
      readonly type: "PASS_ACTION";
      readonly playerId: PlayerId;
    }
  | {
      readonly type: "CONFIRM_MULLIGAN";
      readonly playerId: PlayerId;
      readonly cardIdsToReplace: string[];
    }
  | {
      readonly type: "SUPER_BLOCK_DECISION";
      readonly playerId: PlayerId;
      readonly action: "CAST" | "KEEP";
      readonly targetLaneIndex?: number;
      readonly targetInstanceId?: string;
    }
  | {
      readonly type: "ADVANCE_PHASE";
    }
  | {
      readonly type: "RESOLVE_COMBAT_STEP";
    };

// ─────────────────────────────────────────────────────────────
//  Action Result
// ─────────────────────────────────────────────────────────────

export type ActionResult =
  | { success: true;  state: GameState; events: GameEvent[] }
  | { success: false; state: GameState; error: string; reason?: string };

// ─────────────────────────────────────────────────────────────
//  Engine Config
// ─────────────────────────────────────────────────────────────

export interface EngineConfig {
  random?: () => number;
  startingHp?: number;
  startingHandSize?: number;
  maxHandSize?: number;
  maxSuperBlocks?: number;
  enableMulligan?: boolean;
}
