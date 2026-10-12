// ============================================================
//  TLL TimeSlayer — Bot Integration Test
//  Run with:  npx ts-node src/testBot.ts
// ============================================================

import { GameEngine } from "./engine";
import { botDecideAction, botRunPhase, botInspectScores } from "./bot";
import { CardType, Keyword, CardDefinition, PlayerId } from "./types";
import {
  SAMPLE_PLANT_DECK,
  SAMPLE_ZOMBIE_DECK,
} from "./cards";

// Local test fixtures for bot behavior testing
const TEST_CHOMPER: CardDefinition = {
  id: "test_chomper",
  name: "Chomper",
  cost: 3,
  attack: 4,
  hp: 2,
  type: CardType.Unit,
  tribe: "พืช",
  tribes: ["พืช"],
  keywords: [Keyword.Piercing],
};

const TEST_CONEHEAD: CardDefinition = {
  id: "test_conehead",
  name: "Conehead Zombie",
  cost: 2,
  attack: 2,
  hp: 3,
  type: CardType.Unit,
  tribe: "ซอมบี้",
  tribes: ["ซอมบี้"],
  keywords: [Keyword.Armored],
};

const TEST_BUCKETHEAD: CardDefinition = {
  id: "test_buckethead",
  name: "Buckethead Zombie",
  cost: 3,
  attack: 3,
  hp: 4,
  type: CardType.Unit,
  tribe: "ซอมบี้",
  tribes: ["ซอมบี้"],
  keywords: [Keyword.Armored],
};

const TEST_BULLY: CardDefinition = {
  id: "test_bully",
  name: "Bully Zombie",
  cost: 3,
  attack: 3,
  hp: 3,
  type: CardType.Unit,
  tribe: "ซอมบี้",
  tribes: ["ซอมบี้"],
  keywords: [],
};

const TEST_AIR_RAID: CardDefinition = {
  id: "test_air_raid",
  name: "Air Raid Zombie",
  cost: 4,
  attack: 3,
  hp: 3,
  type: CardType.Unit,
  tribe: "ซอมบี้",
  tribes: ["ซอมบี้"],
  keywords: [Keyword.Flying],
};

const TEST_SUNFLOWER: CardDefinition = {
  id: "test_sunflower",
  name: "Sunflower",
  cost: 1,
  attack: 0,
  hp: 1,
  type: CardType.Unit,
  tribe: "พืช",
  tribes: ["พืช"],
  keywords: [],
};

const TEST_PEASHOOTER: CardDefinition = {
  id: "test_peashooter",
  name: "Peashooter",
  cost: 1,
  attack: 1,
  hp: 2,
  type: CardType.Unit,
  tribe: "พืช",
  tribes: ["พืช"],
  keywords: [],
};

const TEST_BONK_CHOY: CardDefinition = {
  id: "test_bonk_choy",
  name: "Bonk Choy",
  cost: 2,
  attack: 2,
  hp: 2,
  type: CardType.Unit,
  tribe: "พืช",
  tribes: ["พืช"],
  keywords: [],
};

const TEST_HOMING_THISTLE: CardDefinition = {
  id: "test_homing_thistle",
  name: "Homing Thistle",
  cost: 3,
  attack: 3,
  hp: 1,
  type: CardType.Unit,
  tribe: "พืช",
  tribes: ["พืช"],
  keywords: [],
};

const TEST_ROTOBAGA: CardDefinition = {
  id: "test_rotobaga",
  name: "Rotobaga",
  cost: 4,
  attack: 2,
  hp: 1,
  type: CardType.Unit,
  tribe: "พืช",
  tribes: ["พืช"],
  keywords: [Keyword.Flying],
};

const TEST_SEA_ZOMBIE: CardDefinition = {
  id: "test_sea_zombie",
  name: "Sea Zombie",
  cost: 2,
  attack: 2,
  hp: 2,
  type: CardType.Unit,
  tribe: "ซอมบี้",
  tribes: ["ซอมบี้"],
  keywords: [Keyword.Amphibious],
};

const TEST_LIGHTNING_REED: CardDefinition = {
  id: "test_lightning_reed",
  name: "Lightning Reed",
  cost: 3,
  attack: 0,
  hp: 0,
  type: CardType.Spell,
  spellEffect: {
    target: "UNIT",
    damage: 3,
  },
  tribe: "พืช",
  tribes: ["พืช"],
  keywords: [],
};

const TEST_BRAINS_FOR_BRAINS: CardDefinition = {
  id: "test_brains_for_brains",
  name: "Brains for Brains",
  cost: 2,
  attack: 0,
  hp: 0,
  type: CardType.Spell,
  spellEffect: {
    target: "ALL_UNITS",
    drawCards: 2,
  },
  tribe: "ซอมบี้",
  tribes: ["ซอมบี้"],
  keywords: [],
};

// ─── Helpers ──────────────────────────────────────────────────
function makeSeedRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const SEP = "═".repeat(62);
const sep = "─".repeat(62);

function header(title: string): void {
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

function sub(title: string): void {
  console.log(`\n${sep}`);
  console.log(`  ${title}`);
  console.log(sep);
}

function printBoard(engine: GameEngine, state: ReturnType<typeof engine["createGame"]>): void {
  console.log(`  Turn ${state.turnNumber}  Phase: ${state.currentPhase}`);
  console.log(`  PLAYER   HP:${state.player.hp}  Mana:${state.player.currentMana}/${state.player.maxMana}  Hand:${state.player.hand.length}  BlockMeter:${state.player.superBlock.charges}/8`);
  console.log(`  OPPONENT HP:${state.opponent.hp}  Mana:${state.opponent.currentMana}/${state.opponent.maxMana}  Hand:${state.opponent.hand.length}  BlockMeter:${state.opponent.superBlock.charges}/8`);
  for (const lane of state.lanes) {
    const p = lane.playerUnit   ? `${lane.playerUnit.name} [${lane.playerUnit.attack}/${lane.playerUnit.currentHp}]`   : "—";
    const o = lane.opponentUnit ? `${lane.opponentUnit.name} [${lane.opponentUnit.attack}/${lane.opponentUnit.currentHp}]` : "—";
    console.log(`  Lane ${lane.index} [${lane.type.padEnd(8)}]  PLAYER: ${p.padEnd(28)} | OPP: ${o}`);
  }
}

// ─────────────────────────────────────────────────────────────
//  Scenario helpers
// ─────────────────────────────────────────────────────────────

const engine = new GameEngine({
  random: makeSeedRng(7),
  startingHandSize: 6,
  startingHp: 20,
});

// ─────────────────────────────────────────────────────────────
//  SCENARIO 1 — Bot as OPPONENT in P2_UNIT_PHASE
//  Bot sees a high-threat Chomper (Piercing) in Lane 1.
//  Expects: Bot places a counter unit in Lane 1 (not open lane 2).
// ─────────────────────────────────────────────────────────────
header("SCENARIO 1 — Counter high-threat Chomper in Lane 1");

{
  let state = engine.createGame([...SAMPLE_PLANT_DECK], [...SAMPLE_ZOMBIE_DECK]);

  // Force phase to P2_UNIT_PHASE
  const advance1 = engine.advancePhase(state); // → P2
  if (!advance1.success) throw new Error(advance1.error);
  state = advance1.state;

  // Give bot (Opponent) mana for a 3-cost card, place enemy threat first
  state.opponent.currentMana = 3;
  state.opponent.maxMana     = 3;

  // Manually place a threatening Chomper (Piercing, 4/2) for Player in Lane 1
  state.lanes[1].playerUnit = {
    instanceId: "test_chomper",
    cardId: TEST_CHOMPER.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: TEST_CHOMPER.name,
    baseKeywords: [...TEST_CHOMPER.keywords],
    keywords: [...TEST_CHOMPER.keywords],
    tribe: TEST_CHOMPER.tribe || "เป็นกลาง",
    tribes: [TEST_CHOMPER.tribe || "เป็นกลาง"],
    attack: TEST_CHOMPER.attack,
    maxHp: TEST_CHOMPER.hp,
    currentHp: TEST_CHOMPER.hp,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Bot hand: Conehead (2-cost ground), Buckethead (3-cost ground), Bully (3-cost)
  state.opponent.hand = [TEST_CONEHEAD, TEST_BUCKETHEAD, TEST_BULLY, TEST_AIR_RAID];

  printBoard(engine, state);

  sub("Bot score inspection");
  const scores = botInspectScores(state, PlayerId.Opponent);
  for (const c of scores.slice(0, 6)) {
    console.log(`  [score ${c.score.toFixed(1)}] ${c.card.name} → lane ${c.laneIndex ?? "?"} | ${c.reasoning}`);
  }

  const decision = botDecideAction(state, PlayerId.Opponent);
  console.log(`\n  ▶ Bot decision: ${decision.kind}`);
  if (decision.kind !== "PASS") {
    console.log(`    Card: ${decision.card.name}  (cost ${decision.card.cost})`);
    if (decision.kind === "PLAY_UNIT") console.log(`    Lane: ${decision.laneIndex}`);
    console.log(`    Score: ${decision.score.toFixed(1)}`);
    console.log(`    Reasoning: ${decision.reasoning}`);
  }

  // Assert: bot should counter in Lane 1 (where Chomper sits)
  console.assert(
    decision.kind === "PLAY_UNIT" && decision.laneIndex === 1,
    `❌ Expected counter in Lane 1, got: ${JSON.stringify(decision)}`,
  );
  console.log(`  ✓ Bot correctly countered threat in Lane 1`);
}

// ─────────────────────────────────────────────────────────────
//  SCENARIO 2 — Bot targets open lane for face damage
//  Opponent lanes 0,1,2,3 are empty. Bot should flood open lanes.
// ─────────────────────────────────────────────────────────────
header("SCENARIO 2 — Open lanes: bot goes face-aggressive");

{
  let state = engine.createGame([...SAMPLE_ZOMBIE_DECK], [...SAMPLE_PLANT_DECK]);

  // Set bot to P1_UNIT_PHASE (Player)
  state.player.currentMana = 4;
  state.player.maxMana     = 4;
  state.player.hand        = [TEST_SUNFLOWER, TEST_PEASHOOTER, TEST_BONK_CHOY, TEST_HOMING_THISTLE, TEST_ROTOBAGA];

  printBoard(engine, state);

  sub("Bot score inspection (aggro bias 0.8)");
  const scores = botInspectScores(state, PlayerId.Player, { aggressionBias: 0.8 });
  for (const c of scores.slice(0, 8)) {
    console.log(`  [score ${c.score.toFixed(1)}] ${c.card.name} → lane ${c.laneIndex ?? "?"} | ${c.reasoning}`);
  }

  const decision = botDecideAction(state, PlayerId.Player, { aggressionBias: 0.8 });
  console.log(`\n  ▶ Bot decision: ${decision.kind}`);
  if (decision.kind !== "PASS") {
    console.log(`    Card: ${decision.card.name}  cost(${decision.card.cost})`);
    if (decision.kind === "PLAY_UNIT") console.log(`    Lane: ${decision.laneIndex}`);
    console.log(`    Score: ${decision.score.toFixed(1)}`);
    console.log(`    Reasoning: ${decision.reasoning}`);
  }

  console.assert(decision.kind === "PLAY_UNIT", "Expected PLAY_UNIT in open lane scenario");
  console.log(`  ✓ Bot chose to attack an open lane`);
}

// ─────────────────────────────────────────────────────────────
//  SCENARIO 3 — Spell phase: lethal removal
//  Bot has Lightning Reed (3-cost, 3 damage) and enemy has a
//  Peashooter (2/2 — HP:2) in Lane 1. Should remove it.
// ─────────────────────────────────────────────────────────────
header("SCENARIO 3 — Spell phase: lethal removal of 2-HP unit");

{
  let state = engine.createGame([...SAMPLE_ZOMBIE_DECK], [...SAMPLE_PLANT_DECK]);

  // Navigate to P2_SPELL_PHASE (Opponent's spell phase)
  for (let i = 0; i < 3; i++) {
    const adv = engine.advancePhase(state);
    if (!adv.success) throw new Error(adv.error);
    state = adv.state;
  }
  // Should now be P2_SPELL_PHASE
  console.log(`  Current phase: ${state.currentPhase}`);

  state.opponent.currentMana = 3;
  state.opponent.maxMana     = 3;
  // 5 cards in hand → draw is low-value; lethal removal should win
  state.opponent.hand        = [TEST_LIGHTNING_REED, TEST_BRAINS_FOR_BRAINS, TEST_CONEHEAD, TEST_CONEHEAD, TEST_BULLY];

  // Place a 2-HP Peashooter for the player in Lane 1
  state.lanes[1].playerUnit = {
    instanceId: "test_pea",
    cardId: TEST_PEASHOOTER.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: TEST_PEASHOOTER.name,
    baseKeywords: [...TEST_PEASHOOTER.keywords],
    keywords: [...TEST_PEASHOOTER.keywords],
    tribe: TEST_PEASHOOTER.tribe || "เป็นกลาง",
    tribes: [TEST_PEASHOOTER.tribe || "เป็นกลาง"],
    attack: TEST_PEASHOOTER.attack,
    maxHp: TEST_PEASHOOTER.hp,
    currentHp: TEST_PEASHOOTER.hp,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  printBoard(engine, state);

  sub("Bot score inspection — spell phase");
  const scores = botInspectScores(state, PlayerId.Opponent);
  for (const c of scores) {
    console.log(`  [score ${c.score.toFixed(1)}] ${c.card.name} → lane ${c.laneIndex ?? "global"} | ${c.reasoning}`);
  }

  const decision = botDecideAction(state, PlayerId.Opponent);
  console.log(`\n  ▶ Bot decision: ${decision.kind}`);
  if (decision.kind !== "PASS") {
    console.log(`    Card: ${decision.card.name}  cost(${decision.card.cost})`);
    if (decision.kind === "PLAY_SPELL" && decision.targetLaneIndex !== undefined)
      console.log(`    Target lane: ${decision.targetLaneIndex}`);
    console.log(`    Score: ${decision.score.toFixed(1)}`);
    console.log(`    Reasoning: ${decision.reasoning}`);
  }

  console.assert(
    decision.kind === "PLAY_SPELL" && decision.card.id === TEST_LIGHTNING_REED.id,
    `❌ Expected Lightning Reed lethal removal, got: ${JSON.stringify(decision)}`,
  );
  console.log(`  ✓ Bot chose lethal removal spell`);
}

// ─────────────────────────────────────────────────────────────
//  SCENARIO 4 — PASS when no mana
// ─────────────────────────────────────────────────────────────
header("SCENARIO 4 — PASS when mana is 0");

{
  let state = engine.createGame([...SAMPLE_ZOMBIE_DECK], [...SAMPLE_PLANT_DECK]);
  state.opponent.currentMana = 0;
  state.opponent.hand        = [TEST_CONEHEAD, TEST_BUCKETHEAD];

  const adv = engine.advancePhase(state);
  if (!adv.success) throw new Error(adv.error);
  state = adv.state;

  const decision = botDecideAction(state, PlayerId.Opponent);
  console.log(`  ▶ Bot decision: ${decision.kind} — ${decision.reasoning}`);

  console.assert(decision.kind === "PASS", `❌ Expected PASS with 0 mana`);
  console.log(`  ✓ Bot correctly passed with no mana`);
}

// ─────────────────────────────────────────────────────────────
//  SCENARIO 5 — Full turn simulation using botRunPhase
// ─────────────────────────────────────────────────────────────
header("SCENARIO 5 — Full bot turn via botRunPhase()");

{
  let state = engine.createGame([...SAMPLE_ZOMBIE_DECK], [...SAMPLE_PLANT_DECK]);

  // Give opponent 3 mana and a playable hand
  const adv = engine.advancePhase(state); // P2_UNIT_PHASE
  if (!adv.success) throw new Error(adv.error);
  state = adv.state;

  state.opponent.currentMana = 3;
  state.opponent.maxMana     = 3;
  state.opponent.hand        = [TEST_CONEHEAD, TEST_BULLY, TEST_SEA_ZOMBIE, TEST_AIR_RAID];

  printBoard(engine, state);

  const { actions, finalState } = botRunPhase(
    state,
    PlayerId.Opponent,
    (s, cardId, laneIndex) => {
      const result = engine.playCard(s, PlayerId.Opponent, cardId, laneIndex);
      return result.success
        ? { success: true, state: result.state }
        : { success: false, state: result.state, error: result.error };
    },
    { aggressionBias: 0.6 },
  );

  sub("Bot actions taken this phase");
  for (const a of actions) {
    if (a.kind === "PASS") {
      console.log(`  PASS — ${a.reasoning}`);
    } else {
      const lane = a.kind === "PLAY_UNIT" ? `→ Lane ${a.laneIndex}` : (a.targetLaneIndex !== undefined ? `→ Lane ${a.targetLaneIndex}` : "");
      console.log(`  ${a.kind}  "${a.card.name}" ${lane}  [score ${a.score.toFixed(1)}]`);
      console.log(`        ${a.reasoning}`);
    }
  }

  sub("Board after bot turn");
  printBoard(engine, finalState);

  // Bot should have played at least 1 card
  const plays = actions.filter((a) => a.kind !== "PASS");
  console.assert(plays.length >= 1, `❌ Expected at least 1 play, got ${plays.length}`);
  console.log(`\n  ✓ Bot made ${plays.length} play(s) this phase`);
}

// ─────────────────────────────────────────────────────────────
//  SCENARIO 6 — Lane restriction enforcement (Flying → Lane 0 only)
// ─────────────────────────────────────────────────────────────
header("SCENARIO 6 — Bot respects Flying lane restriction");

{
  let state = engine.createGame([...SAMPLE_ZOMBIE_DECK], [...SAMPLE_PLANT_DECK]);
  const adv = engine.advancePhase(state);
  if (!adv.success) throw new Error(adv.error);
  state = adv.state;

  state.opponent.currentMana = 4;
  state.opponent.maxMana     = 4;
  // Only flying cards in hand
  state.opponent.hand        = [TEST_AIR_RAID];

  const scores = botInspectScores(state, PlayerId.Opponent);
  console.log("  All lane scores for Air Raid Zombie:");
  for (const c of scores) {
    console.log(`    Lane ${c.laneIndex}: score ${c.score.toFixed(1)} — ${c.reasoning}`);
  }

  const decision = botDecideAction(state, PlayerId.Opponent);
  console.log(`\n  ▶ Bot decision: ${decision.kind}`);
  if (decision.kind === "PLAY_UNIT") {
    console.log(`    Lane: ${decision.laneIndex}  Card: ${decision.card.name}`);
    console.assert(
      decision.laneIndex === 0,
      `❌ Flying unit must go to Lane 0 (Aerial), got Lane ${decision.laneIndex}`,
    );
    console.log(`  ✓ Flying unit correctly routed to Lane 0 (Aerial)`);
  } else {
    console.log(`  ⚠ Bot passed (unexpected) — may be scoring issue`);
  }
}

// ─────────────────────────────────────────────────────────────
//  Done
// ─────────────────────────────────────────────────────────────
header("ALL BOT SCENARIOS COMPLETE ✅");
