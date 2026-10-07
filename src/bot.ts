// ============================================================
//  TLL TimeSlayer — Rule-Based Heuristic AI Bot
//
//  Entry point: botDecideAction(state, botId, config?)
//
//  Architecture:
//    1. Route to phase-specific evaluator.
//    2. Evaluator generates ScoredCandidate[] for every
//       affordable, legal card in hand.
//    3. Pick the highest-scoring candidate above minScoreToPlay.
//    4. Return a typed BotAction (PLAY_UNIT | PLAY_SPELL | PASS).
//
//  All functions are pure (no mutation of GameState).
//  Scoring weights are centralised in WEIGHTS for easy tuning.
// ============================================================

import {
  CardDefinition,
  CardType,
  GameState,
  Keyword,
  Lane,
  PlayerId,
  UnitInstance,
} from "./types";
import { LANE_COUNT } from "./constants";
import { isLaneLegal, isSpellPhase, isUnitPhase, phaseToPlayerId } from "./utils";
import {
  BotAction,
  BotConfig,
  BotPassAction,
  BotPlaySpellAction,
  BotPlayUnitAction,
  ScoredCandidate,
} from "./botTypes";

// ─────────────────────────────────────────────────────────────
//  Scoring Weights  (tweak here to change bot personality)
// ─────────────────────────────────────────────────────────────

const WEIGHTS = {
  // ── Unit placement ─────────────────────────────────────────
  /** Reward for placing a unit in a lane where the opponent is uncontested. */
  OPEN_LANE_ATTACK:           12,
  /** Reward for countering an opponent unit that threatens the hero. */
  COUNTER_THREAT:             15,
  /** Multiplier on (ourAttack - theirHP): reward for units that trade up. */
  TRADE_UP_MULTIPLIER:         3,
  /** Multiplier on (ourHP - theirAttack): reward for surviving a trade. */
  SURVIVE_MULTIPLIER:          2,
  /** Reward for each point of Attack power (raw aggression). */
  RAW_ATTACK:                  2,
  /** Reward for each point of HP (defensive value). */
  RAW_HP:                      1,
  /** Bonus for DoubleStrike keyword. */
  KEYWORD_DOUBLE_STRIKE:       6,
  /** Bonus for Piercing keyword (hero bleed). */
  KEYWORD_PIERCING:            5,
  /** Bonus for Rush keyword (can attack this turn). */
  KEYWORD_RUSH:                4,
  /** Bonus for Deathrattle keyword (card advantage). */
  KEYWORD_DEATHRATTLE:         2,
  /** Penalty for placing into a lane that is already occupied. */
  ALREADY_OCCUPIED_PENALTY:  -99,

  // ── Mana efficiency ────────────────────────────────────────
  /** Reward per mana spent (encourage efficient mana use). */
  MANA_EFFICIENCY:             1.5,
  /** Penalty for leaving leftover mana unspent (opportunity cost). */
  LEFTOVER_MANA_PENALTY:      -0.5,

  // ── Spell / damage ─────────────────────────────────────────
  /** Reward for a damage spell that exactly kills an enemy unit. */
  LETHAL_REMOVAL:             25,
  /** Reward per damage point toward an enemy unit (partial removal). */
  DAMAGE_TOWARD_UNIT:          3,
  /** Reward per damage point dealt to enemy hero. */
  DAMAGE_TO_HERO:              4,
  /** Reward for buff spells when a friendly unit is on board. */
  BUFF_WITH_UNIT:              8,

  // ── Lane threat ────────────────────────────────────────────
  /** Per-attack-point bonus when assessing how threatening an enemy unit is. */
  THREAT_PER_ATTACK:           2,
  /** Per-HP-point bonus when assessing enemy durability (hard to remove). */
  THREAT_PER_HP:               1,
  /** Extra threat for enemy units with Piercing. */
  THREAT_PIERCING_BONUS:       4,
  /** Extra threat for enemy units with DoubleStrike. */
  THREAT_DOUBLE_STRIKE_BONUS:  4,

  // ── Aggression bias ────────────────────────────────────────
  /** Scales open-lane aggro reward by aggressionBias. */
  AGGRESSION_SCALE:            1.0,
} as const;

// ─────────────────────────────────────────────────────────────
//  Internal Pure Helpers
// ─────────────────────────────────────────────────────────────

/** Resolved config with defaults filled in. */
interface ResolvedConfig {
  aggressionBias: number;
  minScoreToPlay: number;
  greedyMana: boolean;
}

function resolveConfig(cfg: BotConfig = {}): ResolvedConfig {
  return {
    aggressionBias: cfg.aggressionBias ?? 0.5,
    minScoreToPlay: cfg.minScoreToPlay ?? 0,
    greedyMana:     cfg.greedyMana     ?? false,
  };
}

/** Get the bot's PlayerState from GameState. */
function getBotState(state: GameState, botId: PlayerId) {
  return botId === PlayerId.Player ? state.player : state.opponent;
}

/** Get the opponent's PlayerState from GameState. */
function getEnemyState(state: GameState, botId: PlayerId) {
  return botId === PlayerId.Player ? state.opponent : state.player;
}

/**
 * Returns the bot's unit in the given lane, or null.
 * The "bot's" slot depends on whether the bot is Player or Opponent.
 */
function getBotUnit(lane: Lane, botId: PlayerId): UnitInstance | null {
  return botId === PlayerId.Player ? lane.playerUnit : lane.opponentUnit;
}

/** Returns the enemy unit in the given lane, or null. */
function getEnemyUnit(lane: Lane, botId: PlayerId): UnitInstance | null {
  return botId === PlayerId.Player ? lane.opponentUnit : lane.playerUnit;
}

// ─────────────────────────────────────────────────────────────
//  Threat Assessment
// ─────────────────────────────────────────────────────────────

/**
 * Compute a numeric threat score for a single enemy unit.
 * Used to decide how urgently the bot needs to respond.
 */
function threatScore(unit: UnitInstance): number {
  let score = 0;
  score += unit.attack   * WEIGHTS.THREAT_PER_ATTACK;
  score += unit.currentHp * WEIGHTS.THREAT_PER_HP;
  if (unit.keywords.includes(Keyword.Piercing))     score += WEIGHTS.THREAT_PIERCING_BONUS;
  if (unit.keywords.includes(Keyword.DoubleStrike)) score += WEIGHTS.THREAT_DOUBLE_STRIKE_BONUS;
  return score;
}

// ─────────────────────────────────────────────────────────────
//  Unit Card Scoring
// ─────────────────────────────────────────────────────────────

/**
 * Score a single unit card being placed in a specific lane.
 *
 * Heuristic hierarchy:
 *   1. Reject illegal / occupied slots immediately.
 *   2. Reward counter-placing against a high-threat enemy unit.
 *   3. Reward filling an empty enemy lane (face damage potential).
 *   4. Add keyword bonuses.
 *   5. Add mana-efficiency reward.
 */
function scoreUnitPlay(
  card: CardDefinition,
  laneIndex: number,
  state: GameState,
  botId: PlayerId,
  cfg: ResolvedConfig,
): ScoredCandidate {
  const lane    = state.lanes[laneIndex];
  const botUnit = getBotUnit(lane, botId);
  const enemy   = getEnemyUnit(lane, botId);
  const botMana = getBotState(state, botId).currentMana;

  const reasons: string[] = [];
  let score = 0;

  // ── Hard reject: slot occupied ────────────────────────────
  if (botUnit !== null) {
    return {
      card,
      laneIndex,
      score: WEIGHTS.ALREADY_OCCUPIED_PENALTY,
      reasoning: `Lane ${laneIndex} already has bot unit "${botUnit.name}".`,
    };
  }

  // ── Raw stat value ─────────────────────────────────────────
  score += card.attack * WEIGHTS.RAW_ATTACK;
  score += card.hp     * WEIGHTS.RAW_HP;
  reasons.push(`stats (${card.attack}/${card.hp})`);

  // ── Keyword bonuses ────────────────────────────────────────
  if (card.keywords.includes(Keyword.DoubleStrike)) {
    score += WEIGHTS.KEYWORD_DOUBLE_STRIKE;
    reasons.push("DoubleStrike");
  }
  if (card.keywords.includes(Keyword.Piercing)) {
    score += WEIGHTS.KEYWORD_PIERCING;
    reasons.push("Piercing");
  }
  if (card.keywords.includes(Keyword.Rush)) {
    score += WEIGHTS.KEYWORD_RUSH;
    reasons.push("Rush");
  }
  if (card.keywords.includes(Keyword.Deathrattle)) {
    score += WEIGHTS.KEYWORD_DEATHRATTLE;
    reasons.push("Deathrattle");
  }

  // ── vs Enemy unit in same lane ────────────────────────────
  if (enemy !== null) {
    const threat = threatScore(enemy);

    // Counter-threat: prioritise answering dangerous units
    score += WEIGHTS.COUNTER_THREAT * (threat / 10);
    reasons.push(`counters threat (${threat.toFixed(1)})`);

    // Trade-up: our attack kills them, they don't kill us
    const tradeAdvantage = card.attack - enemy.currentHp;
    if (tradeAdvantage >= 0) {
      score += tradeAdvantage * WEIGHTS.TRADE_UP_MULTIPLIER;
      reasons.push(`kills enemy (trade up +${tradeAdvantage})`);
    }

    // Survive: does our unit live after their counter-hit?
    const surviveMargin = card.hp - enemy.attack;
    if (surviveMargin > 0) {
      score += surviveMargin * WEIGHTS.SURVIVE_MULTIPLIER;
      reasons.push(`survives (margin +${surviveMargin})`);
    } else if (surviveMargin < 0) {
      // We die; penalise unless we also kill them
      score += surviveMargin; // negative
    }
  } else {
    // ── Empty enemy lane → potential face damage ──────────────
    const aggroBonus = WEIGHTS.OPEN_LANE_ATTACK * cfg.aggressionBias * WEIGHTS.AGGRESSION_SCALE;
    score += aggroBonus;
    reasons.push(`open lane face attack (+${aggroBonus.toFixed(1)})`);

    // Piercing is extra valuable when going face
    if (card.keywords.includes(Keyword.Piercing)) {
      score += WEIGHTS.KEYWORD_PIERCING * cfg.aggressionBias;
      reasons.push("piercing face bonus");
    }
  }

  // ── Mana efficiency ────────────────────────────────────────
  score += card.cost * WEIGHTS.MANA_EFFICIENCY;
  const leftover = botMana - card.cost;
  score += leftover * WEIGHTS.LEFTOVER_MANA_PENALTY;
  if (leftover > 0) reasons.push(`leftover mana ${leftover}`);

  return {
    card,
    laneIndex,
    score,
    reasoning: reasons.join(" | "),
  };
}

/**
 * Generate all scored unit candidates for the current hand.
 * Evaluates every (affordable card × legal lane) pair.
 */
function evaluateUnitPhase(
  state: GameState,
  botId: PlayerId,
  cfg: ResolvedConfig,
): ScoredCandidate[] {
  const botState = getBotState(state, botId);
  const candidates: ScoredCandidate[] = [];

  for (const card of botState.hand) {
    if (card.type !== CardType.Unit)    continue;
    if (card.cost > botState.currentMana) continue;

    for (let i = 0; i < LANE_COUNT; i++) {
      if (!isLaneLegal(card, i)) continue;

      const candidate = scoreUnitPlay(card, i, state, botId, cfg);
      candidates.push(candidate);
    }
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────
//  Spell Card Scoring
// ─────────────────────────────────────────────────────────────

/**
 * Heuristic categories for spells derived from their text/stats.
 * A proper implementation would use a spell-effect registry; this
 * lightweight version classifies by attack stat as a proxy for
 * "damage spell" and hp stat as proxy for "heal/buff spell".
 *
 * Override this classification by registering spells in a map
 * when the spell effect registry is built.
 */
type SpellKind = "DAMAGE" | "BUFF" | "DRAW" | "UNKNOWN";

function classifySpell(card: CardDefinition): SpellKind {
  if (card.attack > 0)   return "DAMAGE";
  if (card.hp     > 0)   return "BUFF";
  // Rough text-based classification (fallback)
  const text = (card.text ?? "").toLowerCase();
  if (text.includes("draw"))   return "DRAW";
  if (text.includes("damage")) return "DAMAGE";
  if (text.includes("+"))      return "BUFF";
  return "UNKNOWN";
}

/**
 * Score a damage spell against a specific lane (or hero directly).
 *
 * @param damageAmount Proxy: card.attack (damage spells set attack > 0).
 * @param laneIndex    Which lane the spell targets, or -1 for direct hero.
 */
function scoreDamageSpell(
  card: CardDefinition,
  damageAmount: number,
  laneIndex: number,
  state: GameState,
  botId: PlayerId,
  cfg: ResolvedConfig,
): ScoredCandidate {
  const lane   = state.lanes[laneIndex];
  const enemy  = lane !== undefined ? getEnemyUnit(lane, botId) : null;
  const botMana = getBotState(state, botId).currentMana;

  let score = 0;
  const reasons: string[] = [];

  if (enemy !== null) {
    // ── Removal spell ─────────────────────────────────────────
    if (damageAmount >= enemy.currentHp) {
      // Lethal removal — highest priority
      const threat = threatScore(enemy);
      score += WEIGHTS.LETHAL_REMOVAL + threat;
      reasons.push(`lethal removal of "${enemy.name}" (threat ${threat.toFixed(1)})`);
    } else {
      // Partial damage toward enemy unit
      score += damageAmount * WEIGHTS.DAMAGE_TOWARD_UNIT;
      reasons.push(`${damageAmount} dmg toward "${enemy.name}" (${enemy.currentHp} hp)`);
    }
  } else {
    // Empty lane → damage goes to hero directly
    const enemyHero = getEnemyState(state, botId);
    if (damageAmount >= enemyHero.hp) {
      // Lethal face damage — absolute maximum priority
      score += 9999;
      reasons.push("LETHAL FACE DAMAGE — win condition!");
    } else {
      score += damageAmount * WEIGHTS.DAMAGE_TO_HERO * cfg.aggressionBias;
      reasons.push(`${damageAmount} face dmg to hero (${enemyHero.hp} hp)`);
    }
  }

  // Mana efficiency
  score += card.cost * WEIGHTS.MANA_EFFICIENCY;
  const leftover = botMana - card.cost;
  score += leftover * WEIGHTS.LEFTOVER_MANA_PENALTY;

  return { card, laneIndex, score, reasoning: reasons.join(" | ") };
}

/**
 * Score a buff / heal spell.
 * Rewarded when the bot has a friendly unit already on the board.
 */
function scoreBuffSpell(
  card: CardDefinition,
  state: GameState,
  botId: PlayerId,
  cfg: ResolvedConfig,
): ScoredCandidate {
  const botMana  = getBotState(state, botId).currentMana;
  let score = 0;
  const reasons: string[] = [];

  // Count friendly units
  let friendlyCount = 0;
  let bestLane: number | undefined;
  let bestUnitValue = -Infinity;

  for (let i = 0; i < LANE_COUNT; i++) {
    const unit = getBotUnit(state.lanes[i], botId);
    if (unit !== null) {
      friendlyCount++;
      const val = unit.attack + unit.currentHp;
      if (val > bestUnitValue) {
        bestUnitValue = val;
        bestLane = i;
      }
    }
  }

  if (friendlyCount > 0) {
    score += WEIGHTS.BUFF_WITH_UNIT * friendlyCount;
    reasons.push(`buffs ${friendlyCount} friendly unit(s)`);
    // Extra aggression bonus
    score += (cfg.aggressionBias - 0.5) * 4;
  } else {
    // No targets — buff is mostly wasted
    score -= 5;
    reasons.push("no friendly units to buff (weak play)");
  }

  score += card.cost * WEIGHTS.MANA_EFFICIENCY;
  const leftover = botMana - card.cost;
  score += leftover * WEIGHTS.LEFTOVER_MANA_PENALTY;

  return {
    card,
    ...(bestLane !== undefined ? { laneIndex: bestLane } : {}),
    score,
    reasoning: reasons.join(" | "),
  };
}

/**
 * Score a draw spell.
 * Valued more highly when the bot's hand is small.
 */
function scoreDrawSpell(
  card: CardDefinition,
  state: GameState,
  botId: PlayerId,
  _cfg: ResolvedConfig,
): ScoredCandidate {
  const botState = getBotState(state, botId);
  const handSize = botState.hand.length;
  const deckSize = botState.deck.length;
  const botMana  = botState.currentMana;

  let score = 0;
  const reasons: string[] = [];

  // Value draw when hand is thin
  if (handSize <= 2) {
    score += 14;
    reasons.push("hand empty — draw is urgent");
  } else if (handSize <= 4) {
    score += 7;
    reasons.push("hand thin — draw is valuable");
  } else {
    score += 2;
    reasons.push("hand full — draw has low value");
  }

  if (deckSize === 0) {
    score = -99;
    reasons.push("deck empty — can't draw");
  }

  score += card.cost * WEIGHTS.MANA_EFFICIENCY;
  const leftover = botMana - card.cost;
  score += leftover * WEIGHTS.LEFTOVER_MANA_PENALTY;

  return {
    card,
    score,
    reasoning: reasons.join(" | "),
  };
}

/**
 * Generate all scored spell/hero-ability candidates for the hand.
 * Each damage spell is evaluated against every lane (the best target wins).
 */
function evaluateSpellPhase(
  state: GameState,
  botId: PlayerId,
  cfg: ResolvedConfig,
): ScoredCandidate[] {
  const botState   = getBotState(state, botId);
  const candidates: ScoredCandidate[] = [];

  for (const card of botState.hand) {
    if (card.type !== CardType.Spell && card.type !== CardType.HeroAbility) continue;
    if (card.cost > botState.currentMana)                                    continue;

    const kind = classifySpell(card);

    switch (kind) {
      case "DAMAGE": {
        // Evaluate against each lane — pick best target
        const perLane: ScoredCandidate[] = [];
        for (let i = 0; i < LANE_COUNT; i++) {
          perLane.push(scoreDamageSpell(card, card.attack, i, state, botId, cfg));
        }
        // Also consider direct hero damage (laneIndex = -1 conceptually, use empty-lane logic)
        // (already handled inside scoreDamageSpell when enemy lane has no unit)
        const best = perLane.reduce((a, b) => (a.score >= b.score ? a : b));
        candidates.push(best);
        break;
      }
      case "BUFF":
        candidates.push(scoreBuffSpell(card, state, botId, cfg));
        break;
      case "DRAW":
        candidates.push(scoreDrawSpell(card, state, botId, cfg));
        break;
      default:
        // Unknown spell — score neutrally based on mana use
        candidates.push({
          card,
          score: card.cost * WEIGHTS.MANA_EFFICIENCY,
          reasoning: "unknown spell kind — scored by mana value only",
        });
    }
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────
//  Candidate Selection
// ─────────────────────────────────────────────────────────────

/**
 * Select the best candidate from a scored list.
 * - Filters out anything below minScoreToPlay.
 * - Returns null if the list is empty or all scores are too low.
 */
function selectBest(
  candidates: ScoredCandidate[],
  minScore: number,
): ScoredCandidate | null {
  if (candidates.length === 0) return null;

  const valid = candidates.filter((c) => c.score >= minScore);
  if (valid.length === 0) return null;

  return valid.reduce((best, c) => (c.score > best.score ? c : best));
}

// ─────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────

/**
 * Decide the bot's next action for the current game phase.
 *
 * @param state    Current immutable game state snapshot.
 * @param botId    Which player the bot is controlling.
 * @param config   Optional behaviour tuning (aggression, thresholds).
 * @returns        A BotAction describing what to do, or PASS.
 *
 * @remarks
 * This function is synchronous and non-blocking. O(H × L) where
 * H = hand size (≤8) and L = lane count (4). Total iterations ≤ 32.
 */
export function botDecideAction(
  state: GameState,
  botId: PlayerId,
  config?: BotConfig,
): BotAction {
  const cfg = resolveConfig(config);

  // ── Guard: game over ─────────────────────────────────────────
  if (state.isGameOver) {
    return pass(botId, "Game is already over.");
  }

  // ── Guard: not the bot's turn ─────────────────────────────────
  const phaseOwner = phaseToPlayerId(state.currentPhase);
  if (phaseOwner !== botId) {
    return pass(botId, `Phase ${state.currentPhase} belongs to ${phaseOwner ?? "no one"} — not the bot.`);
  }

  // ── Route to phase-specific evaluator ────────────────────────
  let candidates: ScoredCandidate[] = [];

  if (isUnitPhase(state.currentPhase)) {
    candidates = evaluateUnitPhase(state, botId, cfg);
  } else if (isSpellPhase(state.currentPhase)) {
    candidates = evaluateSpellPhase(state, botId, cfg);
  } else {
    return pass(botId, `Phase ${state.currentPhase} has no bot card-play action.`);
  }

  const best = selectBest(candidates, cfg.minScoreToPlay);

  if (best === null) {
    return pass(botId, "No beneficial play found (all scores below threshold or no affordable cards).");
  }

  // ── Build the concrete BotAction ─────────────────────────────
  if (best.card.type === CardType.Unit) {
    if (best.laneIndex === undefined) {
      return pass(botId, "Unit candidate missing laneIndex — internal error.");
    }
    const action: BotPlayUnitAction = {
      kind:      "PLAY_UNIT",
      botId,
      card:      best.card,
      laneIndex: best.laneIndex,
      score:     best.score,
      reasoning: best.reasoning,
    };
    return action;
  }

  // Spell / HeroAbility
  const action: BotPlaySpellAction = {
    kind:  "PLAY_SPELL",
    botId,
    card:  best.card,
    score: best.score,
    reasoning: best.reasoning,
    ...(best.laneIndex !== undefined ? { targetLaneIndex: best.laneIndex } : {}),
  };
  return action;
}

/** Convenience factory for PASS actions. */
function pass(botId: PlayerId, reasoning: string): BotPassAction {
  return { kind: "PASS", botId, reasoning };
}

// ─────────────────────────────────────────────────────────────
//  botRunFullTurn (multi-play loop helper)
// ─────────────────────────────────────────────────────────────

/**
 * Repeatedly call `engine.playCard()` (or `advancePhase()`) based on
 * the bot's decisions until the bot PASSes or runs out of mana.
 *
 * Returns an ordered list of all BotActions taken this phase.
 *
 * Usage:
 *   const { actions, finalState } = botRunPhase(engine, state, botId);
 *
 * @param playCardFn   Thin wrapper: (state, cardId, laneIndex?) → ActionResult
 * @param maxPlays     Safety cap on the loop count (default 8).
 */
export function botRunPhase(
  state: GameState,
  botId: PlayerId,
  playCardFn: (
    state: GameState,
    cardId: string,
    laneIndex?: number,
  ) => { success: boolean; state: GameState; error?: string },
  config?: BotConfig,
  maxPlays = 8,
): { actions: BotAction[]; finalState: GameState } {
  const actions: BotAction[] = [];
  let current = state;

  for (let i = 0; i < maxPlays; i++) {
    const decision = botDecideAction(current, botId, config);
    actions.push(decision);

    if (decision.kind === "PASS") break;

    const cardId    = decision.card.id;
    const laneIndex = decision.kind === "PLAY_UNIT" ? decision.laneIndex : decision.targetLaneIndex;

    const result = playCardFn(current, cardId, laneIndex);

    if (!result.success) {
      // Engine rejected the play — stop to prevent infinite loops
      actions.push(pass(botId, `Engine rejected play: ${result.error ?? "unknown"}`));
      break;
    }

    current = result.state;
  }

  return { actions, finalState: current };
}

// ─────────────────────────────────────────────────────────────
//  Scoring Introspection (debug / UI)
// ─────────────────────────────────────────────────────────────

/**
 * Return the full scored candidate list for all affordable cards
 * in the current phase, sorted descending by score.
 *
 * Useful for debug overlays or "AI thinking" visualizations.
 */
export function botInspectScores(
  state: GameState,
  botId: PlayerId,
  config?: BotConfig,
): ScoredCandidate[] {
  const cfg = resolveConfig(config);
  const phase = state.currentPhase;

  if (isUnitPhase(phase))  return evaluateUnitPhase(state, botId, cfg).sort((a, b) => b.score - a.score);
  if (isSpellPhase(phase)) return evaluateSpellPhase(state, botId, cfg).sort((a, b) => b.score - a.score);
  return [];
}
