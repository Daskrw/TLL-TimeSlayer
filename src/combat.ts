// ============================================================
//  TLL TimeSlayer — Combat Resolution
//  Pure function: takes state snapshot, returns new state + events.
// ============================================================

import {
  GameEvent,
  GameEventType,
  GameState,
  Keyword,
  PlayerId,
  UnitInstance,
} from "./types";
import { LANE_COUNT, LANE_LABELS } from "./constants";
import {
  applyHeroDamage,
  applySuperBlock,
  applyUnitDamage,
  checkWinCondition,
  cloneLanes,
  clonePlayer,
  makeEvent,
  resolveDeathrattle,
} from "./utils";

// ─────────────────────────────────────────────────────────────
//  Internal: Single Strike Resolution
// ─────────────────────────────────────────────────────────────

interface StrikeContext {
  rng: () => number;
  maxSuperBlocks: number;
}

interface StrikeResult {
  events: GameEvent[];
  attackerDied: boolean;
  defenderDied: boolean;
  heroDamaged: number;
}

/**
 * Resolve one attack event from `attacker` against `defender` (and
 * optionally the defender's hero when Piercing is active).
 *
 * Mutates:
 *   - attacker.currentHp  (counter-strike from defender if alive)
 *   - defender.currentHp
 *   - targetHeroState.hp  (if piercing or no defender)
 *
 * Returns events and death flags.
 */
function resolveStrike(
  attacker: UnitInstance,
  defender: UnitInstance | null,
  attackerOwner: PlayerId,
  targetHeroRef: ReturnType<typeof clonePlayer>,
  ctx: StrikeContext,
): StrikeResult {
  const events: GameEvent[] = [];
  let attackerDied  = false;
  let defenderDied  = false;
  let heroDamaged   = 0;

  const hasPiercing = attacker.keywords.includes(Keyword.Piercing);

  events.push(
    makeEvent(
      GameEventType.UNIT_ATTACKED,
      `${attacker.name} (${attackerOwner}) attacks ${defender ? defender.name : "the hero directly"} [${hasPiercing ? "Piercing" : "normal"}].`,
      {
        attackerId: attacker.instanceId,
        defenderId: defender?.instanceId ?? null,
        laneIndex:  attacker.laneIndex,
        piercing:   hasPiercing,
      },
    ),
  );

  // ── Damage to defender unit ───────────────────────────────
  if (defender !== null) {
    const { died, event } = applyUnitDamage(defender, attacker.attack);
    events.push(event);
    defenderDied = died;

    // ── Counter-strike: defender retaliates ──────────────────
    if (!died && defender.attack > 0) {
      const counter = applyUnitDamage(attacker, defender.attack);
      events.push(counter.event);
      attackerDied = counter.died;
    }

    // ── Piercing: overflow / passthrough to hero ──────────────
    if (hasPiercing && attacker.attack > 0) {
      const { finalDamage, events: sbEvents } = applySuperBlock(
        ctx.rng,
        targetHeroRef.superBlock,
        attacker.attack, // full attack passes through (PvZ Heroes style)
        targetHeroRef.id,
        ctx.maxSuperBlocks,
      );
      events.push(...sbEvents);
      if (finalDamage > 0) {
        events.push(applyHeroDamage(targetHeroRef, finalDamage));
        heroDamaged = finalDamage;
      }
    }
  } else {
    // ── No defender: direct hero hit ─────────────────────────
    const { finalDamage, events: sbEvents } = applySuperBlock(
      ctx.rng,
      targetHeroRef.superBlock,
      attacker.attack,
      targetHeroRef.id,
      ctx.maxSuperBlocks,
    );
    events.push(...sbEvents);
    if (finalDamage > 0) {
      events.push(applyHeroDamage(targetHeroRef, finalDamage));
      heroDamaged = finalDamage;
    }
  }

  return { events, attackerDied, defenderDied, heroDamaged };
}

// ─────────────────────────────────────────────────────────────
//  Internal: Single-Lane Combat
// ─────────────────────────────────────────────────────────────

interface LaneCombatResult {
  events: GameEvent[];
  playerHeroDamaged: number;
  opponentHeroDamaged: number;
}

/**
 * Resolve all combat interactions in one lane.
 * Modifies the passed mutable lane and player objects.
 */
function resolveLaneCombat(
  laneIndex: number,
  playerUnit: UnitInstance | null,
  opponentUnit: UnitInstance | null,
  playerHero: ReturnType<typeof clonePlayer>,
  opponentHero: ReturnType<typeof clonePlayer>,
  ctx: StrikeContext,
): LaneCombatResult {
  const events: GameEvent[] = [];
  let playerHeroDamaged   = 0;
  let opponentHeroDamaged = 0;

  const laneLabel = LANE_LABELS[laneIndex] ?? `Lane ${laneIndex}`;

  if (!playerUnit && !opponentUnit) {
    return { events, playerHeroDamaged, opponentHeroDamaged };
  }

  events.push(
    makeEvent(
      GameEventType.UNIT_ATTACKED,
      `=== ${laneLabel} combat begins ===`,
      { laneIndex },
    ),
  );

  // ── Helper: run attacker's strike(s) accounting for DoubleStrike ──
  function doAttacks(
    attacker: UnitInstance,
    defender: UnitInstance | null,
    attackerOwner: PlayerId,
    targetHero: ReturnType<typeof clonePlayer>,
  ): { attackerDied: boolean; defenderDied: boolean; heroDamage: number } {
    const strikes = attacker.keywords.includes(Keyword.DoubleStrike) ? 2 : 1;
    let attackerDied  = false;
    let defenderDied  = false;
    let heroDamage    = 0;

    for (let s = 0; s < strikes; s++) {
      if (attackerDied) break; // Attacker died on previous counter — stop
      const result = resolveStrike(attacker, defenderDied ? null : defender, attackerOwner, targetHero, ctx);
      events.push(...result.events);
      if (result.attackerDied) attackerDied = true;
      if (result.defenderDied) defenderDied = true;
      heroDamage += result.heroDamaged;
    }

    return { attackerDied, defenderDied, heroDamage };
  }

  // ── Both units present: simultaneous resolution ──────────────
  if (playerUnit && opponentUnit) {
    // Track who has already died so second resolution skips dead units
    let pDied = false;
    let oDied = false;

    // Player unit attacks opponent
    const pAttack = doAttacks(playerUnit, opponentUnit, PlayerId.Player, opponentHero);
    pDied = pAttack.attackerDied;
    oDied = pAttack.defenderDied;
    opponentHeroDamaged += pAttack.heroDamage;

    // Opponent unit counter-attacks player (only if both still alive)
    if (!oDied && !pDied) {
      // Opponent unit attacks player unit
      const oAttack = doAttacks(opponentUnit, playerUnit, PlayerId.Opponent, playerHero);
      pDied = pDied || oAttack.defenderDied;
      oDied = oDied || oAttack.attackerDied;
      playerHeroDamaged += oAttack.heroDamage;
    } else if (!oDied) {
      // Opponent unit survived, player unit already dead → direct hero hit
      const oAttack = doAttacks(opponentUnit, null, PlayerId.Opponent, playerHero);
      playerHeroDamaged += oAttack.heroDamage;
    } else if (!pDied) {
      // Player unit survived, opponent already dead → may get another hit
      // (DoubleStrike second hit vs hero if first killed opponent unit)
      const pExtra = doAttacks(playerUnit, null, PlayerId.Player, opponentHero);
      opponentHeroDamaged += pExtra.heroDamage;
    }

  } else if (playerUnit) {
    // Only player has a unit — hits hero directly
    const result = doAttacks(playerUnit, null, PlayerId.Player, opponentHero);
    opponentHeroDamaged += result.heroDamage;

  } else if (opponentUnit) {
    // Only opponent has a unit — hits hero directly
    const result = doAttacks(opponentUnit, null, PlayerId.Opponent, playerHero);
    playerHeroDamaged += result.heroDamage;
  }

  return { events, playerHeroDamaged, opponentHeroDamaged };
}

// ─────────────────────────────────────────────────────────────
//  Public: resolveCombat
// ─────────────────────────────────────────────────────────────

/**
 * Resolve all lane combats (lane 0 → 3) for the current turn.
 *
 * Pure in intent: clones state, applies mutations to the clone,
 * and returns the updated snapshot plus all events.
 *
 * Death resolution order within a lane:
 *   1. Units with Deathrattle fire.
 *   2. Dead units are removed from the lane.
 *   3. Win condition is checked after ALL lanes resolve.
 */
export function resolveCombat(
  state: GameState,
  rng: () => number,
  maxSuperBlocks: number,
): { newState: GameState; events: GameEvent[] } {
  const allEvents: GameEvent[] = [];

  // Working copies — we mutate these, then write back
  const lanes  = cloneLanes(state.lanes);
  const player  = clonePlayer(state.player);
  const opponent = clonePlayer(state.opponent);

  const ctx: StrikeContext = { rng, maxSuperBlocks };

  for (let i = 0; i < LANE_COUNT; i++) {
    const lane = lanes[i];

    const { events, playerHeroDamaged, opponentHeroDamaged } = resolveLaneCombat(
      i,
      lane.playerUnit,
      lane.opponentUnit,
      player,
      opponent,
      ctx,
    );
    allEvents.push(...events);

    // ── Sync super-block meters back to hero states ────────────
    // (applySuperBlock mutates targetHeroRef.superBlock in place)

    // ── Remove dead units, trigger deathrattles ───────────────
    if (lane.playerUnit && lane.playerUnit.currentHp <= 0) {
      if (lane.playerUnit.keywords.includes(Keyword.Deathrattle)) {
        allEvents.push(...resolveDeathrattle(lane.playerUnit, state));
      }
      lane.playerUnit = null;
    }

    if (lane.opponentUnit && lane.opponentUnit.currentHp <= 0) {
      if (lane.opponentUnit.keywords.includes(Keyword.Deathrattle)) {
        allEvents.push(...resolveDeathrattle(lane.opponentUnit, state));
      }
      lane.opponentUnit = null;
    }

    // Suppress unused-variable warnings for accumulated lane damage totals
    void playerHeroDamaged;
    void opponentHeroDamaged;
  }

  // ── Reset attack flags on all surviving units ─────────────────
  for (const lane of lanes) {
    if (lane.playerUnit)   lane.playerUnit.hasAttackedThisTurn   = true;
    if (lane.opponentUnit) lane.opponentUnit.hasAttackedThisTurn = true;
  }

  // ── Build new state snapshot ──────────────────────────────────
  const newState: GameState = {
    ...state,
    lanes,
    player,
    opponent,
    eventLog: [...state.eventLog, ...allEvents],
  };

  // ── Check win condition ───────────────────────────────────────
  const winner = checkWinCondition(newState);
  if (winner !== null) {
    const gameOverEvent = makeEvent(
      GameEventType.GAME_OVER,
      winner === "DRAW"
        ? "The game ends in a DRAW — both heroes defeated simultaneously!"
        : `${winner} WINS!`,
      { winner },
    );
    allEvents.push(gameOverEvent);
    newState.winner    = winner;
    newState.isGameOver = true;
    newState.eventLog  = [...newState.eventLog, gameOverEvent];
  }

  return { newState, events: allEvents };
}
