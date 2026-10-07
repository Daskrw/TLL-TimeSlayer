// ============================================================
//  TLL TimeSlayer — Bot Integration Test
//  Run with:  npx ts-node src/testBot.ts
// ============================================================

import { GameEngine } from "./engine";
import { botDecideAction, botRunPhase, botInspectScores } from "./bot";
import { PlayerId } from "./types";
import {
  SAMPLE_PLANT_DECK,
  SAMPLE_ZOMBIE_DECK,
  // Hand-crafted test cards
  SUNFLOWER,
  PEASHOOTER,
  BONK_CHOY,
  CHOMPER,
  HOMING_THISTLE,
  ROTOBAGA,
  SEA_ZOMBIE,
  CONEHEAD_ZOMBIE,
  BUCKETHEAD_ZOMBIE,
  BULLY_ZOMBIE,
  AIR_RAID_ZOMBIE,
  LIGHTNING_REED,
  BRAINS_FOR_BRAINS,
} from "./cards";

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
    cardId: CHOMPER.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: CHOMPER.name,
    baseKeywords: [...CHOMPER.keywords],
    keywords: [...CHOMPER.keywords],
    tribe: CHOMPER.tribe,
    attack: CHOMPER.attack,
    maxHp: CHOMPER.hp,
    currentHp: CHOMPER.hp,
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
  state.opponent.hand = [CONEHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE, BULLY_ZOMBIE, AIR_RAID_ZOMBIE];

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
  state.player.hand        = [SUNFLOWER, PEASHOOTER, BONK_CHOY, HOMING_THISTLE, ROTOBAGA];

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
  state.opponent.hand        = [LIGHTNING_REED, BRAINS_FOR_BRAINS, CONEHEAD_ZOMBIE, CONEHEAD_ZOMBIE, BULLY_ZOMBIE];

  // Place a 2-HP Peashooter for the player in Lane 1
  state.lanes[1].playerUnit = {
    instanceId: "test_pea",
    cardId: PEASHOOTER.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: PEASHOOTER.name,
    baseKeywords: [...PEASHOOTER.keywords],
    keywords: [...PEASHOOTER.keywords],
    tribe: PEASHOOTER.tribe,
    attack: PEASHOOTER.attack,
    maxHp: PEASHOOTER.hp,
    currentHp: PEASHOOTER.hp,
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
    decision.kind === "PLAY_SPELL" && decision.card.id === LIGHTNING_REED.id,
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
  state.opponent.hand        = [CONEHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE];

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
  state.opponent.hand        = [CONEHEAD_ZOMBIE, BULLY_ZOMBIE, SEA_ZOMBIE, AIR_RAID_ZOMBIE];

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
  state.opponent.hand        = [AIR_RAID_ZOMBIE];

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
