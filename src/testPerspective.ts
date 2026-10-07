import { getHeroPerspectives } from "./perspectiveHelper";
import { HERO_SKY_VANGUARD, HERO_ABYSSAL_SORCERER } from "./cards";
import { GameEngine } from "./GameEngine";
import { DECK_VANGUARD_40, DECK_ABYSSAL_40 } from "./cards";
import { PlayerId } from "./types";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

console.log("\n============================================================");
console.log("  RUNNING HERO PERSPECTIVE MAPPING TEST SUITE");
console.log("============================================================\n");

// ── Test 1: Flat object format (as described in User Prompt) ────
console.log("▶ TEST 1: Flat Object Perspective Mapping");
const mockFlatState = {
  p1Hero: HERO_SKY_VANGUARD,
  p2Hero: HERO_ABYSSAL_SORCERER,
  p1BlockMeter: { charges: 3, triggerCount: 0, superBlockTriggered: false },
  p2BlockMeter: { charges: 6, triggerCount: 1, superBlockTriggered: false },
  p1Hp: 18,
  p1MaxHp: 20,
  p2Hp: 12,
  p2MaxHp: 20,
};

const p1ViewFlat = getHeroPerspectives(mockFlatState, "P1");
assert(p1ViewFlat.selfHero.id === HERO_SKY_VANGUARD.id, "P1 Self Hero is Sky Vanguard");
assert(p1ViewFlat.selfBlockMeter.charges === 3, "P1 Self Block Meter has 3 charges");
assert(p1ViewFlat.opponentHero.id === HERO_ABYSSAL_SORCERER.id, "P1 Opponent Hero is Abyssal Sorcerer");
assert(p1ViewFlat.opponentBlockMeter.charges === 6, "P1 Opponent Block Meter has 6 charges");
assert(p1ViewFlat.selfHp === 18, "P1 Self HP is 18");
assert(p1ViewFlat.opponentHp === 12, "P1 Opponent HP is 12");

const p2ViewFlat = getHeroPerspectives(mockFlatState, "P2");
assert(p2ViewFlat.selfHero.id === HERO_ABYSSAL_SORCERER.id, "P2 Self Hero is Abyssal Sorcerer (Opponent in engine)");
assert(p2ViewFlat.selfBlockMeter.charges === 6, "P2 Self Block Meter has 6 charges");
assert(p2ViewFlat.opponentHero.id === HERO_SKY_VANGUARD.id, "P2 Opponent Hero is Sky Vanguard (Player in engine)");
assert(p2ViewFlat.opponentBlockMeter.charges === 3, "P2 Opponent Block Meter has 3 charges");
assert(p2ViewFlat.selfHp === 12, "P2 Self HP is 12");
assert(p2ViewFlat.opponentHp === 18, "P2 Opponent HP is 18");

// ── Test 2: Full Engine GameState Perspective Mapping ───────────
console.log("\n▶ TEST 2: Full Engine GameState Perspective Mapping");
const engine = new GameEngine();
const gameState = engine.initializeGame(
  HERO_SKY_VANGUARD,
  DECK_VANGUARD_40,
  HERO_ABYSSAL_SORCERER,
  DECK_ABYSSAL_40,
  { seed: 12345, firstPlayerId: PlayerId.Player },
);

// Mutate HP and SuperBlock charges to test distinct values
gameState.player.hp = 15;
gameState.player.superBlock.charges = 4;
gameState.opponent.hp = 9;
gameState.opponent.superBlock.charges = 7;

const p1ViewEngine = getHeroPerspectives(gameState, "P1");
assert(p1ViewEngine.selfHero.id === HERO_SKY_VANGUARD.id, "Engine State: P1 Self Hero matches P1 hero");
assert(p1ViewEngine.selfHp === 15, "Engine State: P1 Self HP is 15");
assert(p1ViewEngine.selfBlockMeter.charges === 4, "Engine State: P1 Self Block Meter is 4");
assert(p1ViewEngine.opponentHero.id === HERO_ABYSSAL_SORCERER.id, "Engine State: P1 Opponent Hero matches P2 hero");
assert(p1ViewEngine.opponentHp === 9, "Engine State: P1 Opponent HP is 9");
assert(p1ViewEngine.opponentBlockMeter.charges === 7, "Engine State: P1 Opponent Block Meter is 7");

const p2ViewEngine = getHeroPerspectives(gameState, "P2");
assert(p2ViewEngine.selfHero.id === HERO_ABYSSAL_SORCERER.id, "Engine State: P2 Self Hero is Abyssal Sorcerer");
assert(p2ViewEngine.selfHp === 9, "Engine State: P2 Self HP is 9 (Opponent's HP in GameState)");
assert(p2ViewEngine.selfBlockMeter.charges === 7, "Engine State: P2 Self Block Meter is 7");
assert(p2ViewEngine.opponentHero.id === HERO_SKY_VANGUARD.id, "Engine State: P2 Opponent Hero is Sky Vanguard");
assert(p2ViewEngine.opponentHp === 15, "Engine State: P2 Opponent HP is 15 (Player's HP in GameState)");
assert(p2ViewEngine.opponentBlockMeter.charges === 4, "Engine State: P2 Opponent Block Meter is 4");

console.log("\n============================================================");
console.log("  ALL PERSPECTIVE MAPPING TESTS PASSED SUCCESSFULLY!");
console.log("============================================================\n");
