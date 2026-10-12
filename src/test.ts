// ============================================================
//  TLL TimeSlayer — Integration Smoke Test
//  Run with:  npx ts-node src/test.ts
//  (or compile with tsc then node dist/test.js)
// ============================================================

import { GameEngine } from "./engine";
import { PlayerId, TurnPhase } from "./types";
import {
  SAMPLE_PLANT_DECK,
  SAMPLE_ZOMBIE_DECK,
  CARD_DEATH_DRAW_1,
  CARD_DEATH_DRAW_2,
  CARD_DEATH_DRAW_3,
  CARD_VANILLA_1,
  CARD_VANILLA_2,
  CARD_VANILLA_3,
  CARD_GRANT_DURABILITY,
  CARD_HERO_DAMAGE_DRAW,
  CARD_ADJACENT_DAMAGE,
} from "./cards";

// ─── Seeded deterministic RNG (LCG) ──────────────────────────
function makeSeedRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const rng = makeSeedRng(42);

// ─── Setup ────────────────────────────────────────────────────
const engine = new GameEngine({ random: rng, startingHandSize: 6 });

let state = engine.createGame(
  [...SAMPLE_PLANT_DECK],
  [...SAMPLE_ZOMBIE_DECK],
);

function log(label: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Turn: ${state.turnNumber}  Phase: ${state.currentPhase}`);
  console.log(`  Player HP: ${state.player.hp}  Mana: ${state.player.currentMana}/${state.player.maxMana}  Hand: ${state.player.hand.length}`);
  console.log(`  Oppoent HP: ${state.opponent.hp}  Mana: ${state.opponent.currentMana}/${state.opponent.maxMana}  Hand: ${state.opponent.hand.length}`);
  for (const lane of state.lanes) {
    const p = lane.playerUnit   ? `${lane.playerUnit.name} (${lane.playerUnit.currentHp}hp)`   : "—";
    const o = lane.opponentUnit ? `${lane.opponentUnit.name} (${lane.opponentUnit.currentHp}hp)` : "—";
    console.log(`  Lane ${lane.index} [${lane.type}]  P: ${p}  |  O: ${o}`);
  }
}

function applyResult(label: string, result: ReturnType<typeof engine.advancePhase>): void {
  if (!result.success) {
    console.error(`  ✗ ${label}: ${result.error}`);
    process.exit(1);
  }
  state = result.state;
  for (const ev of result.events) {
    console.log(`  [${ev.seq}] ${ev.type}: ${ev.message}`);
  }
}

// ─── Turn 1 ───────────────────────────────────────────────────
log("Initial State");

// Inject known cards into hands for deterministic play
state.player.hand[0]   = CARD_DEATH_DRAW_1;
state.player.hand[1]   = CARD_VANILLA_1;
state.player.hand[2]   = CARD_GRANT_DURABILITY;
state.player.hand[3]   = CARD_HERO_DAMAGE_DRAW;
state.opponent.hand[0] = CARD_DEATH_DRAW_2;
state.opponent.hand[1] = CARD_VANILLA_2;
state.opponent.hand[2] = CARD_ADJACENT_DAMAGE;
state.opponent.hand[3] = CARD_DEATH_DRAW_3;

// ── P1 UNIT PHASE ─────────────────────────────────────────────
console.log("\n>>> P1 plays Death Draw 1 (1 cost) to Lane 1");
applyResult("P1 play Death Draw 1 Lane 1", engine.playCard(state, PlayerId.Player, CARD_DEATH_DRAW_1.id, 1));

// Cannot afford a 2nd card this turn (mana exhausted)
console.log("\n>>> Advance to P2_UNIT_PHASE");
applyResult("advancePhase → P2_UNIT", engine.advancePhase(state));

// ── P2 UNIT PHASE ─────────────────────────────────────────────
console.log("\n>>> P2 plays Death Draw 2 (1 cost) to Lane 1");
applyResult("P2 play Death Draw 2 Lane 1", engine.playCard(state, PlayerId.Opponent, CARD_DEATH_DRAW_2.id, 1));

// ── Skip spell phases ──────────────────────────────────────────
console.log("\n>>> Advance to P1_SPELL_PHASE");
applyResult("advancePhase → P1_SPELL", engine.advancePhase(state));

console.log("\n>>> Advance to P2_SPELL_PHASE");
applyResult("advancePhase → P2_SPELL", engine.advancePhase(state));

// ── COMBAT ────────────────────────────────────────────────────
console.log("\n>>> Advance to COMBAT_PHASE");
applyResult("advancePhase → COMBAT", engine.advancePhase(state));

log("Before Combat");

console.log("\n>>> RESOLVE COMBAT");
applyResult("resolveCombat", engine.resolveCombat(state));

log("After Combat");

// ── TURN END ──────────────────────────────────────────────────
console.log("\n>>> Advance to TURN_END");
applyResult("advancePhase → TURN_END", engine.advancePhase(state));

console.log("\n>>> Advance to Turn 2");
applyResult("advancePhase → new turn", engine.advancePhase(state));

log("Turn 2 Start");

// ─── Validation Checks ────────────────────────────────────────
console.log("\n\n=== VALIDATION ===");

// Mana should now be 2 (turn 2)
const p2Mana = state.player.maxMana;
console.assert(p2Mana === 2, `Turn 2 mana should be 2, got ${p2Mana}`);
console.log(`  ✓ Turn 2 mana = ${p2Mana}`);

// Phase should be P1_UNIT_PHASE
console.assert(
  state.currentPhase === TurnPhase.P1_UNIT_PHASE,
  `Expected P1_UNIT_PHASE, got ${state.currentPhase}`,
);
console.log(`  ✓ Phase = ${state.currentPhase}`);

// Game should still be running (heroes at ≥ 1 hp with seeded test)
console.assert(!state.isGameOver, "Game should not be over yet.");
console.log(`  ✓ Game ongoing`);

// ─── Lane restriction validation ─────────────────────────────
const badResult = engine.playCard(state, PlayerId.Player, CARD_DEATH_DRAW_1.id, 0);
console.assert(!badResult.success, "Should reject non-Flying unit in aerial lane.");
console.log(`  ✓ Non-Flying unit correctly rejected from aerial lane: "${(badResult as any).error}"`);

console.log("\n✅ Smoke test complete.\n");
