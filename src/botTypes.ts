// ============================================================
//  TLL TimeSlayer — Bot Action Types
//  Discriminated union returned by botDecideAction().
// ============================================================

import { CardDefinition, PlayerId } from "./types";

// ─────────────────────────────────────────────────────────────
//  Action Discriminants
// ─────────────────────────────────────────────────────────────

export type BotActionKind =
  | "PLAY_UNIT"   // Place a unit card in a lane
  | "PLAY_SPELL"  // Cast a spell or hero ability
  | "PASS";       // No beneficial play found — end this phase

// ─────────────────────────────────────────────────────────────
//  Concrete Action Shapes
// ─────────────────────────────────────────────────────────────

/** Bot wants to play a Unit card into a specific lane. */
export interface BotPlayUnitAction {
  readonly kind: "PLAY_UNIT";
  readonly botId: PlayerId;
  readonly card: CardDefinition;
  readonly laneIndex: number;
  /** Final evaluation score that caused this card to be selected. */
  readonly score: number;
  /** Human-readable explanation for why this play was chosen (debug/UI). */
  readonly reasoning: string;
}

/** Bot wants to cast a Spell / HeroAbility card. */
export interface BotPlaySpellAction {
  readonly kind: "PLAY_SPELL";
  readonly botId: PlayerId;
  readonly card: CardDefinition;
  /**
   * Optional lane index if the spell targets a specific lane.
   * Undefined for global / untargeted spells.
   */
  readonly targetLaneIndex?: number;
  readonly score: number;
  readonly reasoning: string;
}

/** Bot passes — no card played this phase. */
export interface BotPassAction {
  readonly kind: "PASS";
  readonly botId: PlayerId;
  /** Reason for passing (for UI / debug purposes). */
  readonly reasoning: string;
}

/** Discriminated union of all possible bot decisions. */
export type BotAction =
  | BotPlayUnitAction
  | BotPlaySpellAction
  | BotPassAction;

// ─────────────────────────────────────────────────────────────
//  Scored Candidate (internal — exported for tests)
// ─────────────────────────────────────────────────────────────

/** An evaluated play candidate before selection. */
export interface ScoredCandidate {
  readonly card: CardDefinition;
  /** Lane index, undefined for spells with no lane target. */
  readonly laneIndex?: number;
  readonly score: number;
  readonly reasoning: string;
}

// ─────────────────────────────────────────────────────────────
//  Bot Configuration
// ─────────────────────────────────────────────────────────────

export interface BotConfig {
  /**
   * How aggressively the bot values face damage vs board control.
   * 0.0 = pure control; 1.0 = pure aggro. Default: 0.5.
   */
  aggressionBias?: number;

  /**
   * Minimum score threshold to act (vs passing).
   * A candidate below this score is skipped. Default: 0.
   */
  minScoreToPlay?: number;

  /**
   * If true, the bot always plays the highest-cost affordable card
   * (greedy mana use). Default: false — bot may pass to save mana.
   */
  greedyMana?: boolean;
}
