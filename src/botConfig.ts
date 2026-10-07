// ============================================================
//  botConfig.ts — Difficulty Preset Configs for the Bot AI
//
//  Maps the three difficulty tiers to concrete BotConfig objects
//  that tune the heuristic weights, aggression bias, and
//  play-threshold in bot.ts.
//
//  Usage:
//    import { getBotConfig } from "./botConfig";
//    const config = getBotConfig("Hard");
//    botDecideAction(state, botId, config);
// ============================================================

import { BotConfig } from "./botTypes";
import { BotDifficulty } from "./BotDeckGenerator";

// ─────────────────────────────────────────────────────────────
//  Preset configurations per difficulty
// ─────────────────────────────────────────────────────────────

/**
 * Easy — makes occasional sub-optimal choices, passes early,
 * low aggression, doesn't fully exploit lethal windows.
 */
const EASY_CONFIG: BotConfig = {
  aggressionBias: 0.3,   // prefers board control over face
  minScoreToPlay: 5,     // only plays cards with clear value (misses edge plays)
  greedyMana: false,
};

/**
 * Medium — balanced heuristic play, considers trade-ups and
 * lethal, but won't chain optimal multi-card turns.
 */
const MEDIUM_CONFIG: BotConfig = {
  aggressionBias: 0.55,  // balanced
  minScoreToPlay: 1,     // plays most cards with any positive value
  greedyMana: false,
};

/**
 * Hard — maximally aggressive scoring, chases lethal, greedy
 * mana usage, no missed positive plays.
 */
const HARD_CONFIG: BotConfig = {
  aggressionBias: 0.85,  // very aggressive, pushes face damage
  minScoreToPlay: 0,     // plays anything with non-negative score
  greedyMana: true,      // always tries to spend all mana
};

const PRESET_MAP: Record<BotDifficulty, BotConfig> = {
  Easy:   EASY_CONFIG,
  Medium: MEDIUM_CONFIG,
  Hard:   HARD_CONFIG,
};

// ─────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────

/**
 * Returns the BotConfig for a given difficulty tier.
 * Defaults to Medium if the difficulty string is unrecognized.
 */
export function getBotConfig(difficulty: BotDifficulty): BotConfig {
  return PRESET_MAP[difficulty] ?? MEDIUM_CONFIG;
}

export type { BotDifficulty };
