// ============================================================
//  TLL TimeSlayer — Game Constants
// ============================================================

import { LaneType, TurnPhase } from "./types";

// ─── Board ────────────────────────────────────────────────────
export const LANE_COUNT = 4 as const;

/** Lane type per fixed index. */
export const LANE_TYPES: readonly [LaneType, LaneType, LaneType, LaneType] = [
  LaneType.Aerial,   // 0
  LaneType.Ground1,  // 1
  LaneType.Ground2,  // 2
  LaneType.Water,    // 3
] as const;

/** Human-readable lane labels (for event messages). */
export const LANE_LABELS: Readonly<Record<number, string>> = {
  0: "Aerial Lane",
  1: "Ground Lane 1",
  2: "Ground Lane 2",
  3: "Water Lane",
} as const;

// ─── Hero ─────────────────────────────────────────────────────
export const DEFAULT_HERO_HP          = 20;
export const DEFAULT_STARTING_HAND    = 4;
export const DEFAULT_MAX_HAND_SIZE    = 8;

// ─── Mana ─────────────────────────────────────────────────────
/** Mana resets to maxMana at the start of every turn. */
export const MANA_PER_TURN_INCREMENT  = 1;
/** Hard cap on mana regardless of turn count. */
export const MAX_MANA_CAP             = 10;

// ─── Super-Block Meter ────────────────────────────────────────
/** Meter segments required to trigger a super block. */
export const SUPER_BLOCK_THRESHOLD    = 8;
/** Min random charge gained from an unblocked hero hit. */
export const SUPER_BLOCK_CHARGE_MIN   = 1;
/** Max random charge gained from an unblocked hero hit. */
export const SUPER_BLOCK_CHARGE_MAX   = 3;
/** Maximum super-block triggers allowed per game. */
export const MAX_SUPER_BLOCKS         = 3;

// ─── Turn Phase Ordering ──────────────────────────────────────
/**
 * Canonical FSM phase progression for one full turn.
 * advancePhase() cycles through this array in order.
 */
export const PHASE_ORDER: readonly TurnPhase[] = [
  TurnPhase.P1_UNIT_PHASE,
  TurnPhase.P2_UNIT_PHASE,
  TurnPhase.P1_SPELL_PHASE,
  TurnPhase.P2_SPELL_PHASE,
  TurnPhase.COMBAT_PHASE,
  TurnPhase.TURN_END,
] as const;
