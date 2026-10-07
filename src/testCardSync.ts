// ============================================================
//  testCardSync.ts — Card Keyword Synchronization & Immutability Test
// ============================================================

import {
  getStaticCardById,
  HERO_SKY_VANGUARD,
  HERO_ABYSSAL_SORCERER,
  DECK_VANGUARD_40,
} from "./cards";
import { createCardInstance, cloneCards } from "./cardInstance";
import { generateBotDeck } from "./BotDeckGenerator";
import { GameEngine } from "./GameEngine";
import { Keyword, PlayerId } from "./types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

console.log("\n============================================================");
console.log("  CARD KEYWORD SYNCHRONIZATION & INSTANCE DECOUPLING TEST");
console.log("============================================================\n");

// ── TEST 1: Decoupled Card Instance Mutation Isolation ───────
console.log("▶ TEST 1: Decoupled Card Instance Mutation Isolation");
const baseCard = getStaticCardById("CARD_PEASHOOTER")!;
assert(baseCard !== null, "Found PEASHOOTER in master registry");
assert(baseCard.keywords.includes(Keyword.Rush), "Base PEASHOOTER has Rush keyword");

const instance1 = createCardInstance(baseCard);
const instance2 = createCardInstance(baseCard);

assert(instance1.instanceId !== instance2.instanceId, "Each card instance receives a unique instanceId");
assert(instance1.keywords !== instance2.keywords, "Keywords array reference is decoupled between instances");
assert(instance1.keywords !== baseCard.keywords, "Keywords array reference is decoupled from base definition");

// Mutate instance1 keywords and stats
instance1.keywords.push(Keyword.DoubleStrike);
instance1.currentAttack += 5;

assert(instance1.keywords.includes(Keyword.DoubleStrike), "Instance 1 received DoubleStrike buff");
assert(!instance2.keywords.includes(Keyword.DoubleStrike), "Instance 2 remains unpolluted by Instance 1 keyword mutation");
assert(!baseCard.keywords.includes(Keyword.DoubleStrike), "Base CardDefinition in master registry remains strictly immutable");
assert(instance2.currentAttack === baseCard.attack, "Instance 2 stats remain unaffected");

// ── TEST 2: Procedural Bot Deck Generator Keyword Alignment ──
console.log("\n▶ TEST 2: Bot Deck Generator Sourced from Master Registry");
const botDeck = generateBotDeck(HERO_SKY_VANGUARD.id, "Hard", 42);
assert(botDeck.length === 40, "Bot deck contains exactly 40 cards");

let matchCount = 0;
for (const card of botDeck) {
  const masterDef = getStaticCardById(card.id);
  assert(masterDef !== null, `Card ${card.id} (${card.name}) exists in master registry`);
  if (masterDef) {
    const cardKws = [...card.keywords].sort().join(",");
    const masterKws = [...masterDef.keywords].sort().join(",");
    assert(cardKws === masterKws, `Bot card ${card.name} keywords [${cardKws}] match master registry [${masterKws}]`);
    matchCount++;
  }
}
assert(matchCount === 40, "All 40 cards in bot deck perfectly synchronized with master registry");

// ── TEST 3: Cross-Player Deck Keyword Synchronization Check ──
console.log("\n▶ TEST 3: Cross-Player Deck Keyword Synchronization Check");
const playerDeck = cloneCards(DECK_VANGUARD_40);
const oppDeck = generateBotDeck(HERO_SKY_VANGUARD.id, "Medium", 123);

const playerCardMap = new Map(playerDeck.map((c) => [c.id, c]));
let sharedCardCount = 0;

for (const oppCard of oppDeck) {
  const playerCard = playerCardMap.get(oppCard.id);
  if (playerCard) {
    sharedCardCount++;
    const pKw = [...playerCard.keywords].sort().join(",");
    const oKw = [...oppCard.keywords].sort().join(",");
    assert(pKw === oKw, `Shared card "${oppCard.name}" (${oppCard.id}) has identical keywords between Player and Bot (${pKw || "None"})`);
  }
}
assert(sharedCardCount > 0, `Verified ${sharedCardCount} shared cards between Player and Bot decks have 100% keyword parity`);

// ── TEST 4: GameEngine In-Memory State Isolation ──────────────
console.log("\n▶ TEST 4: GameEngine In-Memory State Isolation");
const engine = new GameEngine();
const state = engine.initializeGame(
  HERO_SKY_VANGUARD,
  playerDeck,
  HERO_ABYSSAL_SORCERER,
  oppDeck,
  { seed: 9999, firstPlayerId: PlayerId.Player }
);

assert(state.player.hand.length === 4, "Player hand initialized");
assert(state.opponent.hand.length === 4, "Opponent hand initialized");

// Check that hand cards have fresh instance references
const pCard1 = state.player.hand[0];
const oCard1 = state.opponent.hand[0];
assert(pCard1.keywords !== oCard1.keywords, "Player and opponent hand cards have independent keyword array instances");

console.log("\n============================================================");
console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log("============================================================\n");

if (failed > 0) {
  process.exit(1);
}
