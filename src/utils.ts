// ============================================================
//  TLL TimeSlayer — Pure Utility Functions
//  No side effects; safe to call anywhere.
// ============================================================

import {
  CardDefinition,
  GameEvent,
  GameEventType,
  GameState,
  Keyword,
  Lane,
  LaneType,
  PlayerId,
  PlayerState,
  SuperBlockMeter,
  TurnPhase,
  UnitInstance,
} from "./types";
import {
  LANE_TYPES,
  MAX_MANA_CAP,
  SUPER_BLOCK_CHARGE_MAX,
  SUPER_BLOCK_CHARGE_MIN,
  SUPER_BLOCK_THRESHOLD,
} from "./constants";

// ─────────────────────────────────────────────────────────────
//  Event Builder
// ─────────────────────────────────────────────────────────────

let _seqCounter = 0;

/** Reset sequence counter (call at the start of each public action). */
export function resetSeq(): void {
  _seqCounter = 0;
}

/** Create a structured game event with auto-incrementing sequence number. */
export function makeEvent(
  type: GameEventType,
  message: string,
  payload: Record<string, unknown> = {},
): GameEvent {
  return { type, message, payload, seq: _seqCounter++ };
}

// ─────────────────────────────────────────────────────────────
//  Random Number Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Returns an integer in [min, max] inclusive using the provided rng.
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Fisher-Yates shuffle — returns a new array, does not mutate input. */
export function shuffleArray<T>(rng: () => number, arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─────────────────────────────────────────────────────────────
//  Instance ID Generator
// ─────────────────────────────────────────────────────────────

let _instanceCounter = 0;

/** Generate a unique runtime instance ID for newly summoned units. */
export function nextInstanceId(): string {
  return `unit_${Date.now()}_${++_instanceCounter}`;
}

// ─────────────────────────────────────────────────────────────
//  Lane Validation
// ─────────────────────────────────────────────────────────────

/**
 * Checks whether a card is allowed to be placed in a given lane.
 * Flying → only Aerial; Amphibious → only Water; others → Ground lanes only.
 */
export function isLaneLegal(card: CardDefinition, laneIndex: number): boolean {
  const laneType = LANE_TYPES[laneIndex];

  // Explicit restriction wins first
  if (card.laneTypeRestriction !== undefined) {
    return laneType === card.laneTypeRestriction;
  }

  // Keyword-based implicit restrictions
  const isFlying     = card.keywords.includes(Keyword.Flying);
  const isAmphibious = card.keywords.includes(Keyword.Amphibious);

  if (isFlying)     return laneType === LaneType.Aerial;
  if (isAmphibious) return laneType === LaneType.Water;

  // Default: ground-only cards cannot go in Aerial or Water
  return laneType === LaneType.Ground1 || laneType === LaneType.Ground2;
}

// ─────────────────────────────────────────────────────────────
//  Phase Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Returns the PlayerId that is allowed to play cards in the given phase,
 * or null for phases that are not card-play phases.
 */
export function phaseToPlayerId(phase: TurnPhase): PlayerId | null {
  switch (phase) {
    case TurnPhase.P1_UNIT_PHASE:
    case TurnPhase.P1_SPELL_PHASE:
      return PlayerId.Player;
    case TurnPhase.P2_UNIT_PHASE:
    case TurnPhase.P2_SPELL_PHASE:
      return PlayerId.Opponent;
    default:
      return null;
  }
}

/** Returns true if the given phase is a unit-placement phase. */
export function isUnitPhase(phase: TurnPhase): boolean {
  return phase === TurnPhase.P1_UNIT_PHASE || phase === TurnPhase.P2_UNIT_PHASE;
}

/** Returns true if the given phase is a spell/trick phase. */
export function isSpellPhase(phase: TurnPhase): boolean {
  return phase === TurnPhase.P1_SPELL_PHASE || phase === TurnPhase.P2_SPELL_PHASE;
}

// ─────────────────────────────────────────────────────────────
//  PlayerState Accessors
// ─────────────────────────────────────────────────────────────

/** Returns the PlayerState for the given id from GameState. */
export function getPlayerState(state: GameState, id: PlayerId): PlayerState {
  return id === PlayerId.Player ? state.player : state.opponent;
}

/** Returns the opponent's PlayerId. */
export function getOpponentId(id: PlayerId): PlayerId {
  return id === PlayerId.Player ? PlayerId.Opponent : PlayerId.Player;
}

// ─────────────────────────────────────────────────────────────
//  Mana Helpers
// ─────────────────────────────────────────────────────────────

/** Compute the new maxMana for a player at the start of a new turn. */
export function computeNewMaxMana(currentMax: number): number {
  return Math.min(currentMax + 1, MAX_MANA_CAP);
}

// ─────────────────────────────────────────────────────────────
//  Super-Block Helpers
// ─────────────────────────────────────────────────────────────

export interface SuperBlockResult {
  /** Net damage that actually hits the hero (0 if blocked). */
  finalDamage: number;
  /** Charges added to the meter this hit. */
  chargesGained: number;
  /** True if a super block triggered this hit. */
  triggered: boolean;
  /** Updated meter state after this hit. */
  updatedMeter: SuperBlockMeter;
  /** Events describing what happened. */
  events: GameEvent[];
}

/**
 * Pure function: given an incoming unblocked damage value and the current
 * super-block meter, compute the resulting state.
 *
 * Rules:
 *  1. Roll random 1-3 charges and add to meter.
 *  2. If meter >= THRESHOLD and trigger count < max:
 *       - damage is cancelled (0)
 *       - meter resets to 0
 *       - triggerCount++
 *       - superBlockTriggered = true
 *  3. Otherwise, damage applies normally.
 */
export function applySuperBlock(
  rng: () => number,
  meter: SuperBlockMeter,
  incomingDamage: number,
  targetId: PlayerId,
  maxSuperBlocks: number,
): SuperBlockResult {
  const events: GameEvent[] = [];

  const chargesGained = randomInt(rng, SUPER_BLOCK_CHARGE_MIN, SUPER_BLOCK_CHARGE_MAX);
  const newCharges    = meter.charges + chargesGained;

  const canTrigger = meter.triggerCount < maxSuperBlocks && newCharges >= SUPER_BLOCK_THRESHOLD;

  events.push(
    makeEvent(
      GameEventType.SUPER_BLOCK_CHARGE,
      `${targetId} super-block meter: +${chargesGained} charge(s) → ${Math.min(newCharges, SUPER_BLOCK_THRESHOLD)}/${SUPER_BLOCK_THRESHOLD}`,
      { targetId, chargesGained, totalCharges: Math.min(newCharges, SUPER_BLOCK_THRESHOLD) },
    ),
  );

  if (canTrigger) {
    events.push(
      makeEvent(
        GameEventType.SUPER_BLOCK_TRIGGER,
        `SUPER BLOCK! ${targetId}'s meter is full — ${incomingDamage} damage cancelled! Hero ability added to hand.`,
        { targetId, damageCancelled: incomingDamage, triggerCount: meter.triggerCount + 1 },
      ),
    );

    return {
      finalDamage: 0,
      chargesGained,
      triggered: true,
      updatedMeter: {
        charges: 0,
        triggerCount: meter.triggerCount + 1,
        superBlockTriggered: true,
      },
      events,
    };
  }

  return {
    finalDamage: incomingDamage,
    chargesGained,
    triggered: false,
    updatedMeter: {
      charges: Math.min(newCharges, SUPER_BLOCK_THRESHOLD - 1), // Cap shy of threshold if not triggering
      triggerCount: meter.triggerCount,
      superBlockTriggered: false,
    },
    events,
  };
}

// ─────────────────────────────────────────────────────────────
//  UnitInstance Factory
// ─────────────────────────────────────────────────────────────

/** Instantiate a card definition into a live battlefield unit. */
export function createUnitInstance(
  card: CardDefinition,
  ownerId: PlayerId,
  laneIndex: number,
): UnitInstance {
  const hasRush = card.keywords.includes(Keyword.Rush);
  const tribes = card.tribes && card.tribes.length > 0 ? [...card.tribes] : (card.tribe ? [card.tribe] : ["เป็นกลาง"]);
  return {
    instanceId: nextInstanceId(),
    cardId: card.id,
    ownerId,
    laneIndex,
    name: card.name,
    baseKeywords: [...card.keywords],
    keywords: [...card.keywords],
    tribes,
    tribe: tribes[0] || card.tribe || "เป็นกลาง",
    attack: card.attack,
    maxHp: card.hp,
    currentHp: card.hp,
    hasAttackedThisTurn: false,
    // Rush units can act immediately; others have summoning sickness
    summonedThisTurn: !hasRush,
    isSupport: card.keywords.includes(Keyword.Support),
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
}

// ─────────────────────────────────────────────────────────────
//  Lane Utilities
// ─────────────────────────────────────────────────────────────

/** Deep-clone a Lane (avoids reference mutations). */
export function cloneLane(lane: Lane): Lane {
  const pFront = lane.playerFrontline ? { ...lane.playerFrontline, keywords: [...lane.playerFrontline.keywords], attachedEquipment: [...lane.playerFrontline.attachedEquipment] } : null;
  const pSupp = lane.playerSupport ? { ...lane.playerSupport, keywords: [...lane.playerSupport.keywords], attachedEquipment: [...lane.playerSupport.attachedEquipment] } : null;
  const oFront = lane.opponentFrontline ? { ...lane.opponentFrontline, keywords: [...lane.opponentFrontline.keywords], attachedEquipment: [...lane.opponentFrontline.attachedEquipment] } : null;
  const oSupp = lane.opponentSupport ? { ...lane.opponentSupport, keywords: [...lane.opponentSupport.keywords], attachedEquipment: [...lane.opponentSupport.attachedEquipment] } : null;

  return {
    index: lane.index,
    type: lane.type,
    playerFrontline: pFront,
    playerSupport: pSupp,
    opponentFrontline: oFront,
    opponentSupport: oSupp,
    environment: lane.environment ? { ...lane.environment } : null,
    playerUnit: pFront ?? pSupp ?? (lane.playerUnit ? { ...lane.playerUnit, keywords: [...lane.playerUnit.keywords] } : null),
    opponentUnit: oFront ?? oSupp ?? (lane.opponentUnit ? { ...lane.opponentUnit, keywords: [...lane.opponentUnit.keywords] } : null),
  };
}

/** Deep-clone all 4 lanes. */
export function cloneLanes(
  lanes: [Lane, Lane, Lane, Lane],
): [Lane, Lane, Lane, Lane] {
  return lanes.map(cloneLane) as [Lane, Lane, Lane, Lane];
}

// ─────────────────────────────────────────────────────────────
//  PlayerState Clone
// ─────────────────────────────────────────────────────────────

/** Shallow-clone a PlayerState (hand/deck/graveyard arrays are new refs). */
export function clonePlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    hand:      [...p.hand],
    deck:      [...p.deck],
    graveyard: [...p.graveyard],
    superBlock: { ...p.superBlock },
  };
}

// ─────────────────────────────────────────────────────────────
//  GameState Clone
// ─────────────────────────────────────────────────────────────

/**
 * Produce a deep-enough clone of GameState suitable for immutable updates.
 * Arrays and nested objects are cloned; CardDefinition objects are
 * treated as immutable and shared by reference.
 */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    lanes:    cloneLanes(state.lanes),
    player:   clonePlayer(state.player),
    opponent: clonePlayer(state.opponent),
    eventLog: [...state.eventLog],
  };
}

// ─────────────────────────────────────────────────────────────
//  Win Condition Check
// ─────────────────────────────────────────────────────────────

/**
 * Check whether the game is over after a state mutation.
 * Returns the winner PlayerId, "DRAW", or null if still ongoing.
 */
export function checkWinCondition(
  state: GameState,
): PlayerId | "DRAW" | null {
  const pDead = state.player.hp   <= 0;
  const oDead = state.opponent.hp <= 0;
  if (pDead && oDead) return "DRAW";
  if (pDead)          return PlayerId.Opponent;
  if (oDead)          return PlayerId.Player;
  return null;
}

// ─────────────────────────────────────────────────────────────
//  Deathrattle Placeholder
// ─────────────────────────────────────────────────────────────

/**
 * Apply the deathrattle effect for a dying unit.
 * Currently returns only a notification event; a future system
 * can dispatch into card-specific handlers registered by card ID.
 *
 * @param unit  The unit that just died.
 * @param state Mutable state after the unit's removal.
 * @returns     Ordered events emitted by the deathrattle.
 */
export function resolveDeathrattle(
  unit: UnitInstance,
  _state: GameState,
): GameEvent[] {
  // TODO: route to per-card deathrattle registry
  return [
    makeEvent(
      GameEventType.DEATHRATTLE_TRIGGER,
      `${unit.name} (${unit.ownerId}) triggers its Deathrattle!`,
      { instanceId: unit.instanceId, cardId: unit.cardId, laneIndex: unit.laneIndex },
    ),
  ];
}

// ─────────────────────────────────────────────────────────────
//  Hero Damage Application
// ─────────────────────────────────────────────────────────────

/**
 * Apply finalDamage to the target hero's HP (already post-super-block).
 * Mutates `player` in place and returns an event.
 */
export function applyHeroDamage(
  player: PlayerState,
  damage: number,
): GameEvent {
  const before = player.hp;
  player.hp = Math.max(0, player.hp - damage);
  return makeEvent(
    GameEventType.HERO_DAMAGED,
    `${player.id} hero takes ${damage} damage (${before} → ${player.hp} HP).`,
    { targetId: player.id, damage, hpBefore: before, hpAfter: player.hp },
  );
}

// ─────────────────────────────────────────────────────────────
//  Unit Damage Application
// ─────────────────────────────────────────────────────────────

/**
 * Apply damage to a unit and return whether it died, plus the event.
 * Mutates `unit` in place.
 */
export function applyUnitDamage(
  unit: UnitInstance,
  damage: number,
): { died: boolean; event: GameEvent } {
  const before  = unit.currentHp;
  unit.currentHp = Math.max(0, unit.currentHp - damage);
  const died    = unit.currentHp <= 0;

  const event = makeEvent(
    died ? GameEventType.UNIT_DIED : GameEventType.UNIT_DAMAGED,
    died
      ? `${unit.name} (${unit.ownerId}, lane ${unit.laneIndex}) is destroyed!`
      : `${unit.name} (${unit.ownerId}) takes ${damage} damage (${before} → ${unit.currentHp} HP).`,
    { instanceId: unit.instanceId, damage, hpBefore: before, hpAfter: unit.currentHp, died },
  );

  return { died, event };
}
