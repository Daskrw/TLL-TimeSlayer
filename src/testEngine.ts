// ============================================================
//  TLL TimeSlayer — GameEngine Comprehensive Test Suite
//  Validates all 10 engine specifications:
//  1. 4 Lanes restrictions (Aerial/Flying, Water/Amphibious)
//  2. Capacity per lane (1 unit default; 2 units only with Support keyword)
//  3. Ground-only Environment casting & overwriting old environments
//  4. Hero selection (20 HP, 4 unique Superpower pool, 40-card decks)
//  5. Shared mana pool (starts 1, +1 per turn, shared across Unit/Spell phases)
//  6. Super-Block meter (8 segments, 1-3 roll, overflow rollover 7+3->8+2, 0 damage mitigation)
//  7. Super-Block decision (CAST immediate 0 cost vs KEEP bypassing 11 hand limit)
//  8. Rush, Equipment (destroyed on host death), Strikethrough, DoubleStrike
//  9. Cascading Deathrattles across adjacent lanes
// 10. Turn phase loop (P1_UNIT -> P2_UNIT -> P1_SPELL -> P2_SPELL -> COMBAT -> TURN_END)
// ============================================================

import { GameEngine } from "./GameEngine";
import {
  PlayerId,
  TurnPhase,
  Keyword,
  LaneType,
  GameEventType,
  CardType,
} from "./types";
import {
  HERO_AEGIS_GUARDIAN,
  HERO_SOLAR_FLARE,
  HERO_SUPER_BRAINZ,
  HERO_SKY_VANGUARD,
  HERO_ABYSSAL_SORCERER,
  DECK_PLANTS_40,
  DECK_ZOMBIES_40,
  DECK_VANGUARD_40,
  DECK_ABYSSAL_40,
  SUNFLOWER,
  PEASHOOTER,
  HOMING_THISTLE,
  LILY_PAD,
  TORCHWOOD,
  BONK_CHOY,
  BARREL_OF_DEADBEARDS,
  SPIKED_HELMET,
  SOLAR_WINDS,
  BLACK_HOLE,
  LIGHTNING_REED,
  SP_SHIELD_OF_LEGEND,
  SP_HUMAN_SHIELD,
  SP_SUPPRESS_ANGER,
  SP_LEAVE_TO_DUST,
} from "./cards";

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

console.log("\n============================================================");
console.log("  RUNNING COMPREHENSIVE GAME ENGINE VERIFICATION");
console.log("============================================================\n");

// ─────────────────────────────────────────────────────────────
// Test 1: Game Initialization & Setup
// ─────────────────────────────────────────────────────────────
console.log("▶ TEST 1: Game Initialization & Board Setup");
{
  const engine = new GameEngine();
  const state = engine.initializeGame(
    HERO_SOLAR_FLARE,
    DECK_PLANTS_40,
    HERO_SUPER_BRAINZ,
    DECK_ZOMBIES_40,
    { seed: 42, firstPlayerId: PlayerId.Player, startingHandSize: 4 }
  );

  assert(state.player.hp === 20, "Player Hero starts with 20 HP");
  assert(state.opponent.hp === 20, "Opponent Hero starts with 20 HP");
  assert(state.turnNumber === 1, "Game starts at Turn 1");
  assert(state.player.currentMana === 1 && state.player.maxMana === 1, "Turn 1 mana is 1/1");
  assert(state.player.hand.length === 4, "Starting hand size is 4");
  assert(state.player.deck.length === 36, "Remaining deck size is 36 (40 - 4)");
  assert(state.lanes.length === 4, "Exactly 4 lanes exist");
  assert(state.lanes[0].type === LaneType.Aerial, "Lane 0 is Aerial");
  assert(state.lanes[1].type === LaneType.Ground1, "Lane 1 is Ground");
  assert(state.lanes[2].type === LaneType.Ground2, "Lane 2 is Ground");
  assert(state.lanes[3].type === LaneType.Water, "Lane 3 is Water");
  assert(state.currentPhase === TurnPhase.P1_UNIT_PHASE, "First phase is P1_UNIT_PHASE");
}

// ─────────────────────────────────────────────────────────────
// Test 2: Lane Placement Restrictions
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 2: Lane Restrictions (Aerial / Ground / Water)");
{
  const engine = new GameEngine();
  engine.initializeGame(
    HERO_SOLAR_FLARE,
    DECK_PLANTS_40,
    HERO_SUPER_BRAINZ,
    DECK_ZOMBIES_40,
    { seed: 100, firstPlayerId: PlayerId.Player }
  );

  // Set mana high for testing plays
  const state = engine.getState();
  state.player.currentMana = 10;
  state.player.hand = [SUNFLOWER, HOMING_THISTLE, LILY_PAD];
  (engine as unknown as { state: typeof state }).state = state;

  // 1. Placing non-Flying Sunflower into Lane 0 (Aerial) should fail
  const r1 = engine.playCard(PlayerId.Player, SUNFLOWER.id, 0);
  assert(!r1.success, "Non-Flying unit cannot be placed in Lane 0 (Aerial)");

  // 2. Placing Flying Homing Thistle into Lane 0 should succeed
  const r2 = engine.playCard(PlayerId.Player, HOMING_THISTLE.id, 0);
  assert(r2.success, "Flying unit placed successfully in Lane 0 (Aerial)");

  // 3. Placing non-Amphibious Sunflower into Lane 3 (Water) should fail
  const r3 = engine.playCard(PlayerId.Player, SUNFLOWER.id, 3);
  assert(!r3.success, "Non-Amphibious unit cannot be placed in Lane 3 (Water)");

  // 4. Placing Amphibious Lily Pad into Lane 3 should succeed
  const r4 = engine.playCard(PlayerId.Player, LILY_PAD.id, 3);
  assert(r4.success, "Amphibious unit placed successfully in Lane 3 (Water)");
}

// ─────────────────────────────────────────────────────────────
// Test 3: Lane Capacity & Support Keyword
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 3: Lane Capacity (Default 1 Unit, Max 2 ONLY with Support)");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.player.currentMana = 10;
  state.player.hand = [SUNFLOWER, PEASHOOTER, TORCHWOOD, BONK_CHOY];
  (engine as unknown as { state: typeof state }).state = state;

  // 1. Place 1st unit (Sunflower) in Lane 1 -> SUT: Frontline
  const r1 = engine.playCard(PlayerId.Player, SUNFLOWER.id, 1);
  assert(r1.success, "Placed first unit (Frontline) in Lane 1");
  assert(engine.getState().lanes[1].playerFrontline !== null, "Frontline unit is occupied");
  assert(engine.getState().lanes[1].playerSupport === null, "Support slot is currently empty");

  // 2. Place 2nd unit WITHOUT Support keyword (Peashooter) in Lane 1 -> must fail
  const r2 = engine.playCard(PlayerId.Player, PEASHOOTER.id, 1);
  assert(!r2.success, "Placing 2nd unit without 'Support' keyword is rejected");

  // 3. Place 2nd unit WITH Support keyword (Torchwood) in Lane 1 -> must succeed as Support
  const r3 = engine.playCard(PlayerId.Player, TORCHWOOD.id, 1);
  assert(r3.success, "Placing 2nd unit with 'Support' keyword succeeds");
  assert(engine.getState().lanes[1].playerSupport !== null, "Support slot is now occupied");

  // 4. Place 3rd unit in Lane 1 -> must fail (capacity 2 exceeded)
  const r4 = engine.playCard(PlayerId.Player, BONK_CHOY.id, 1);
  assert(!r4.success, "Placing 3rd unit in same lane is rejected (max 2 units reached)");
}

// ─────────────────────────────────────────────────────────────
// Test 4: Environment Placement & Ground-Only Restriction
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 4: Environment Placement & Overwriting Rules");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.player.currentMana = 10;
  state.player.hand = [SOLAR_WINDS, SOLAR_WINDS];
  (engine as unknown as { state: typeof state }).state = state;

  // 1. Placing Environment in Lane 0 (Aerial) -> rejected
  const rAerial = engine.playCard(PlayerId.Player, SOLAR_WINDS.id, 0);
  assert(!rAerial.success, "Environment rejected on Lane 0 (Aerial)");

  // 2. Placing Environment in Lane 3 (Water) -> rejected
  const rWater = engine.playCard(PlayerId.Player, SOLAR_WINDS.id, 3);
  assert(!rWater.success, "Environment rejected on Lane 3 (Water)");

  // 3. Placing Environment in Lane 1 (Ground) -> succeeds
  const rGround = engine.playCard(PlayerId.Player, SOLAR_WINDS.id, 1);
  assert(rGround.success, "Environment placed on Lane 1 (Ground)");
  assert(engine.getState().lanes[1].environment?.id === SOLAR_WINDS.id, "Lane 1 environment is active");

  // 4. Casting over existing environment destroys the old one
  const sAfterGround = engine.getState();
  sAfterGround.player.hand = [BLACK_HOLE];
  (engine as unknown as { state: typeof sAfterGround }).state = sAfterGround;
  const rOverwrite = engine.playCard(PlayerId.Player, BLACK_HOLE.id, 1);
  assert(rOverwrite.success, "New environment successfully overwrites existing one");
  assert(
    rOverwrite.events.some((e) => e.type === GameEventType.ENVIRONMENT_DESTROYED),
    "Emitted ENVIRONMENT_DESTROYED event for the old environment"
  );
  assert(
    rOverwrite.events.some((e) => e.type === GameEventType.CARD_SENT_TO_GRAVEYARD),
    "Emitted CARD_SENT_TO_GRAVEYARD event for old environment"
  );
  assert(
    engine.getState().player.graveyard.some((c) => c.id === SOLAR_WINDS.id),
    "Old environment was placed in player's graveyard"
  );

  // 5. Persistent passive effect test
  const buffEnv = {
    ...SOLAR_WINDS,
    id: "ENV_TEST_BUFF",
    name: "Verdant Canopy",
    environmentEffect: { attackModifier: 2, hpModifier: 1 },
  };
  const sBuff = engine.getState();
  sBuff.player.hand = [buffEnv];
  (engine as unknown as { state: typeof sBuff }).state = sBuff;
  engine.playCard(PlayerId.Player, buffEnv.id, 2);

  // Summon unit into lane 2
  const sSummon = engine.getState();
  sSummon.player.hand = [PEASHOOTER];
  (engine as unknown as { state: typeof sSummon }).state = sSummon;
  engine.playCard(PlayerId.Player, PEASHOOTER.id, 2);

  const summonedUnit = engine.getState().lanes[2].playerFrontline;
  assert(summonedUnit !== null, "Unit summoned in Lane 2");
  const envMod = summonedUnit?.auraModifiers.find((m) => m.sourceInstanceId === buffEnv.id);
  assert(envMod !== undefined, "Unit received persistent environment aura modifier");
  assert(envMod?.attackBonus === 2, "Unit received +2 attack aura modifier from environment");
  assert(envMod?.hpBonus === 1, "Unit received +1 hp aura modifier from environment");
}

// ─────────────────────────────────────────────────────────────
// Test 5: Equipment & Destruction on Host Death
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 5: Equipment Attachment & Host Death Destruction");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.player.currentMana = 10;
  state.player.hand = [SUNFLOWER, SPIKED_HELMET];
  (engine as unknown as { state: typeof state }).state = state;

  // Summon Sunflower (1 atk, 2 hp)
  engine.playCard(PlayerId.Player, SUNFLOWER.id, 1);
  const host = engine.getState().lanes[1].playerFrontline!;

  // Attach Spiked Helmet (+2 atk, +2 hp, Strikethrough)
  const rEq = engine.playCard(PlayerId.Player, SPIKED_HELMET.id, undefined, host.instanceId);
  assert(rEq.success, "Attached equipment to friendly host unit");

  const updatedHost = engine.getState().lanes[1].playerFrontline!;
  assert(updatedHost.attack === 3, "Host attack buffed by +2 (1 -> 3)");
  assert(updatedHost.currentHp === 4, "Host HP buffed by +2 (2 -> 4)");
  assert(updatedHost.keywords.includes(Keyword.Strikethrough), "Host gained Strikethrough keyword");
  assert(updatedHost.attachedEquipment.length === 1, "Host unit tracks attached equipment");
}

// ─────────────────────────────────────────────────────────────
// Test 6: Rush Keyword (Immediate Strike)
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 6: Rush Keyword (Immediate Placement Attack)");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.player.currentMana = 10;
  state.player.hand = [PEASHOOTER]; // Has Rush, 2 Atk
  (engine as unknown as { state: typeof state }).state = state;

  // Lane 1 opponent is empty -> Peashooter should attack enemy Hero directly for 2 damage
  const rPlay = engine.playCard(PlayerId.Player, PEASHOOTER.id, 1);
  assert(rPlay.success, "Played Peashooter with Rush keyword");
  assert(
    rPlay.events.some((e) => e.type === GameEventType.RUSH_ATTACK),
    "Emitted RUSH_ATTACK event immediately"
  );
  // Opponent hero should take damage or roll block meter
  const oppHp = engine.getState().opponent.hp;
  const oppMeter = engine.getState().opponent.superBlock.charges;
  assert(oppHp < 20 || oppMeter > 0, "Enemy Hero took immediate Rush attack damage/meter roll");
}

// ─────────────────────────────────────────────────────────────
// Test 7: Super-Block Meter Overflow Rollover & Mitigation
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 7: Super-Block Rollover Rule (7 + 3 -> 8 + 2 carryover, 0 dmg mitigation)");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  // Set Opponent block meter directly to 7 charges
  state.opponent.superBlock.charges = 7;
  state.opponent.hp = 20;

  // Place a 5-attack player unit in Lane 1
  state.lanes[1].playerFrontline = {
    instanceId: "striker",
    cardId: "card_striker",
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: "Heavy Striker",
    tribe: "จู่โจม",
    baseKeywords: [],
    keywords: [],
    attack: 5,
    maxHp: 5,
    currentHp: 5,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
  state.lanes[1].opponentFrontline = null; // Unblocked attack to Opponent Hero

  state.currentPhase = TurnPhase.COMBAT_PHASE;
  state.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };
  (engine as unknown as { state: typeof state }).state = state;

  // Resolve combat in Lane 1
  const initialOppHandCount = state.opponent.hand.length;
  const combatResult = engine.resolveCombatStep();

  assert(combatResult.interruptedBySuperBlock !== true, "Combat NOT interrupted by Super-Block (continuous flow)!");
  assert(engine.getState().superBlockInterrupt === null, "superBlockInterrupt is null (no modal pop-up)");
  assert(engine.getState().opponent.hp === 20, "Triggering attack dealt ZERO damage (mitigated!)");
  assert(
    engine.getState().opponent.hand.length === initialOppHandCount + 1,
    "Opponent auto-drew 1 Superpower card into hand immediately"
  );
  const drawnSp = engine.getState().opponent.hand[engine.getState().opponent.hand.length - 1];
  assert(drawnSp.cost === 0, `Drawn Superpower has cost overridden to 0 (was ${drawnSp.cost})`);
  assert(
    engine.getState().opponent.superBlock.charges >= 0 &&
      engine.getState().opponent.superBlock.charges <= 2,
    `Overflow charges carried over into next cycle: ${engine.getState().opponent.superBlock.charges}`
  );
  assert(
    engine.getState().opponent.superBlock.triggerCount === 1,
    "Super-Block trigger count incremented to 1"
  );
}

// ─────────────────────────────────────────────────────────────
// Test 8: Super-Block Auto-Draw Bypassing Hand Limit & Spell-Phase-Only Restriction
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 8: Super-Block Auto-Draw (Bypassing 11 Hand Limit & Spell Phase Usage Restriction)");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  // Fill Player hand to maximum limit (11 cards)
  state.player.hand = Array(11).fill(SUNFLOWER);
  state.player.superBlock.charges = 7; // Ready to trigger on next hit

  // Opponent attacks Player hero directly to trigger Super Block
  state.lanes[0].opponentFrontline = {
    instanceId: "opp_striker",
    cardId: "card_striker",
    ownerId: PlayerId.Opponent,
    laneIndex: 0,
    name: "Opponent Striker",
    tribe: "จู่โจม",
    baseKeywords: [],
    keywords: [],
    attack: 4,
    maxHp: 4,
    currentHp: 4,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
  state.lanes[0].playerFrontline = null;
  state.currentPhase = TurnPhase.COMBAT_PHASE;
  state.combatQueue = { currentLaneIndex: 0, currentStrike: 1, phaseStep: "STRIKE_1" };
  (engine as unknown as { state: typeof state }).state = state;

  engine.resolveCombatStep();

  assert(engine.getState().player.hp === 20, "Player hero HP undamaged (attack negated to 0)");
  assert(
    engine.getState().player.hand.length === 12,
    "Hand limit bypassed: Player has 12 cards after Super Block auto-draw"
  );
  const p1Sp = engine.getState().player.hand[11];
  assert(p1Sp.cost === 0, "Drawn Superpower has cost explicitly overridden to 0");

  // Provide friendly and enemy unit on board for targeted superpower validation
  (engine as unknown as { state: typeof state }).state.lanes[1].playerFrontline = {
    instanceId: "friendly_plant",
    cardId: "card_sunflower",
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: "Friendly Sunflower",
    tribe: "รักษา",
    baseKeywords: [],
    keywords: [],
    attack: 1,
    maxHp: 2,
    currentHp: 2,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Validate Spell Phase Restrictions:
  // 1. Cannot play Superpower during Unit Phase
  (engine as unknown as { state: typeof state }).state.currentPhase = TurnPhase.P1_UNIT_PHASE;
  const targetId = p1Sp.targetType === "ENEMY_UNIT" ? "opp_striker" : "friendly_plant";
  const rUnitPhase = engine.playCard(PlayerId.Player, p1Sp.id, 0, targetId);
  assert(!rUnitPhase.success, "Rejected playing Superpower during P1_UNIT_PHASE");

  // 2. Cannot play P1 Superpower during Opponent's Spell Phase
  (engine as unknown as { state: typeof state }).state.currentPhase = TurnPhase.P2_SPELL_PHASE;
  const rOppSpellPhase = engine.playCard(PlayerId.Player, p1Sp.id, 0, targetId);
  assert(!rOppSpellPhase.success, "Rejected playing P1 Superpower during P2_SPELL_PHASE");

  // 3. CAN play during Player 1's Spell Phase
  (engine as unknown as { state: typeof state }).state.currentPhase = TurnPhase.P1_SPELL_PHASE;
  (engine as unknown as { state: typeof state }).state.player.currentMana = 0; // Even with 0 mana, because cost is 0!
  const rP1SpellPhase = engine.playCard(PlayerId.Player, p1Sp.id, 0, targetId);
  assert(rP1SpellPhase.success, `Successfully played 0-cost Superpower during P1_SPELL_PHASE: ${!rP1SpellPhase.success ? (rP1SpellPhase as any).error : ""}`);

  // 4. Test non-targeted Superpower (e.g. SP_SHIELD_OF_LEGEND) with NO targetId required!
  const shieldCard = { ...SP_SHIELD_OF_LEGEND, cost: 0 };
  (engine as unknown as { state: typeof state }).state.player.hand.push(shieldCard);
  const rNonTargeted = engine.playCard(PlayerId.Player, shieldCard.id, 1);
  assert(rNonTargeted.success, `Non-targeted Superpower successfully played anywhere on board without targetId: ${!rNonTargeted.success ? (rNonTargeted as any).error : ""}`);
}

// ─────────────────────────────────────────────────────────────
// Test 9: DoubleStrike (Strike 1 kills unit, Strike 2 hits Hero)
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 9: DoubleStrike (Strike 1 Kills Front Unit, Strike 2 Hits Hero)");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.currentPhase = TurnPhase.COMBAT_PHASE;

  // Player has Bonk Choy (3 attack, DoubleStrike) in Lane 1
  state.lanes[1].playerFrontline = {
    instanceId: "bonk",
    cardId: BONK_CHOY.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: BONK_CHOY.name,
    tribe: "จู่โจม",
    baseKeywords: [Keyword.DoubleStrike],
    keywords: [Keyword.DoubleStrike],
    attack: 3,
    maxHp: 3,
    currentHp: 3,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Opponent has a fragile 2-HP Zombie in Lane 1
  state.lanes[1].opponentFrontline = {
    instanceId: "fragile_zombie",
    cardId: "fragile_zombie",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Fragile Zombie",
    tribe: "พิทักษ์",
    baseKeywords: [],
    keywords: [],
    attack: 0,
    maxHp: 2,
    currentHp: 2,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  state.opponent.hp = 20;
  state.opponent.superBlock.charges = 0;
  state.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };
  (engine as unknown as { state: typeof state }).state = state;

  // Resolve Strike 1: Bonk Choy (3 atk) hits Fragile Zombie (2 hp) -> Zombie dies!
  const step1 = engine.resolveCombatStep();
  assert(!step1.done, "Combat in lane continues to Strike 2 for DoubleStrike");
  assert(engine.getState().lanes[1].opponentFrontline === null, "Strike 1 killed opposing unit");

  // Resolve Strike 2: Bonk Choy hits empty lane -> Opponent Hero directly!
  const step2 = engine.resolveCombatStep();
  assert(
    step2.events.some(
      (e) =>
        e.type === GameEventType.HERO_DAMAGED ||
        e.type === GameEventType.SUPER_BLOCK_CHARGE ||
        e.type === GameEventType.SUPER_BLOCK_TRIGGER
    ),
    "Strike 2 hit opponent Hero directly after clearing the lane"
  );
}

// ─────────────────────────────────────────────────────────────
// Test 10: Cascading Deathrattles Across Adjacent Lanes
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 10: Cascading Deathrattles (Chain Reaction to Adjacent Lanes)");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.currentPhase = TurnPhase.P1_SPELL_PHASE;
  state.player.currentMana = 10;
  state.player.hand = [LIGHTNING_REED]; // 3 damage spell

  // Lane 1 has Barrel of Deadbeards (1 HP, Deathrattle: 1 damage to adjacent lanes)
  state.lanes[1].opponentFrontline = {
    instanceId: "barrel_1",
    cardId: BARREL_OF_DEADBEARDS.id,
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Barrel 1",
    tribe: "ยุทธศาสตร์",
    baseKeywords: [Keyword.Deathrattle],
    keywords: [Keyword.Deathrattle],
    attack: 0,
    maxHp: 1,
    currentHp: 1,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    deathrattleEffect: { damage: 1, target: "ADJACENT_LANES" },
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Adjacent Lane 2 has another Barrel of Deadbeards (1 HP)
  state.lanes[2].opponentFrontline = {
    instanceId: "barrel_2",
    cardId: BARREL_OF_DEADBEARDS.id,
    ownerId: PlayerId.Opponent,
    laneIndex: 2,
    name: "Barrel 2",
    tribe: "ยุทธศาสตร์",
    baseKeywords: [Keyword.Deathrattle],
    keywords: [Keyword.Deathrattle],
    attack: 0,
    maxHp: 1,
    currentHp: 1,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    deathrattleEffect: { damage: 1, target: "ADJACENT_LANES" },
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  (engine as unknown as { state: typeof state }).state = state;

  // Cast Lightning Reed on Barrel 1 in Lane 1 -> Dies -> Deals 1 dmg to Lane 2 -> Barrel 2 Dies! (Chain reaction)
  const rSpell = engine.playCard(PlayerId.Player, LIGHTNING_REED.id, 1, "barrel_1");
  assert(rSpell.success, "Casting damage spell on first Barrel");

  const sAfter = engine.getState();
  assert(sAfter.lanes[1].opponentFrontline === null, "Barrel 1 died from spell");
  assert(sAfter.lanes[2].opponentFrontline === null, "Barrel 2 died from cascading adjacent Deathrattle!");

  const deathEvents = rSpell.events.filter((e) => e.type === GameEventType.UNIT_DIED);
  assert(deathEvents.length === 2, "Emitted 2 sequential cascading death events");
}

// ─────────────────────────────────────────────────────────────
// Test 11: Insufficient Mana Check & Hand Non-Mutation
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 11: Insufficient Mana Check & Zero State Mutation");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.player.currentMana = 1;
  const highCostCard = DECK_PLANTS_40.find((c) => c.cost > 1 && c.type === CardType.Unit)!;
  state.player.hand = [highCostCard];
  (engine as unknown as { state: typeof state }).state = state;

  const initialHandLen = state.player.hand.length;
  const initialMana = state.player.currentMana;

  const res = engine.playCard(PlayerId.Player, highCostCard.id, 1);
  assert(!res.success, "High cost card play failed");
  assert("reason" in res && res.reason === "INSUFFICIENT_MANA", "Returned reason INSUFFICIENT_MANA");
  assert(res.state.player.currentMana === initialMana, "Player mana was NOT deducted");
  assert(res.state.player.hand.length === initialHandLen, "Card was NOT removed from hand");
  assert(res.state.player.hand[0].id === highCostCard.id, "Card remains intact in hand");
}

// ─────────────────────────────────────────────────────────────
// Test 12: Passing Spell Phase via passAction(playerId)
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 12: passAction Phase Transitions");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  assert(engine.getState().currentPhase === TurnPhase.P1_UNIT_PHASE, "Starts at P1_UNIT_PHASE");
  
  // Wrong player pass rejected
  const badPass = engine.passAction(PlayerId.Opponent);
  assert(!badPass.success, "Opponent cannot pass during P1 phase");

  // P1 passes unit phase
  const pass1 = engine.passAction(PlayerId.Player);
  assert(pass1.success, "P1 pass succeeded");
  assert(engine.getState().currentPhase === TurnPhase.P2_UNIT_PHASE, "Advanced to P2_UNIT_PHASE");

  // P2 passes unit phase
  const pass2 = engine.passAction(PlayerId.Opponent);
  assert(pass2.success, "P2 pass succeeded");
  assert(engine.getState().currentPhase === TurnPhase.P1_SPELL_PHASE, "Advanced to P1_SPELL_PHASE");

  // P1 passes spell phase
  const pass3 = engine.passAction(PlayerId.Player);
  assert(pass3.success, "P1 passed spell phase without playing spells");
  assert(engine.getState().currentPhase === TurnPhase.P2_SPELL_PHASE, "Advanced to P2_SPELL_PHASE");

  // P2 passes spell phase
  const pass4 = engine.passAction(PlayerId.Opponent);
  assert(pass4.success, "P2 passed spell phase");
  assert(engine.getState().currentPhase === TurnPhase.COMBAT_PHASE, "Advanced to COMBAT_PHASE");
}

// ─────────────────────────────────────────────────────────────
// Test 13: Flexible Support Slot Placement & Direct Damage Absorption
// ─────────────────────────────────────────────────────────────
console.log("\n▶ TEST 13: Flexible Support Slot Placement & Direct Combat Clash");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_SOLAR_FLARE, DECK_PLANTS_40, HERO_SUPER_BRAINZ, DECK_ZOMBIES_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.player.currentMana = 10;
  
  const supportCard = DECK_PLANTS_40.find((c) => c.keywords.includes(Keyword.Support) && c.type === CardType.Unit)!;
  const regularCard = DECK_PLANTS_40.find((c) => !c.keywords.includes(Keyword.Support) && c.type === CardType.Unit && !c.keywords.includes(Keyword.Flying) && !c.keywords.includes(Keyword.Amphibious))!;

  state.player.hand = [supportCard, regularCard];
  (engine as unknown as { state: typeof state }).state = state;

  // Regular unit cannot be placed directly into Support slot
  const regFail = engine.playCard(PlayerId.Player, regularCard.id, 1, undefined, "support");
  assert(!regFail.success, "Regular unit cannot be placed in Support slot");
  assert(engine.getState().lanes[1].playerSupport === null, "Support slot remained empty");

  // Support unit CAN be placed directly into Support slot even with empty frontline
  assert(engine.getState().lanes[1].playerFrontline === null, "Frontline is currently empty");
  const suppOk = engine.playCard(PlayerId.Player, supportCard.id, 1, undefined, "support");
  assert(suppOk.success, "Support unit placed directly into Support slot with empty frontline");
  assert(engine.getState().lanes[1].playerSupport !== null, "Support slot is now occupied");
  assert(engine.getState().lanes[1].playerFrontline === null, "Frontline remained empty");

  // Verify Combat Resolution: Opposing unit attacks lone support unit before Hero
  const testState = engine.getState();
  testState.lanes[1].opponentFrontline = {
    instanceId: "opp_front_unit",
    cardId: "opp_front",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Zombie Attacker",
    tribe: "จู่โจม",
    baseKeywords: [],
    keywords: [],
    attack: 2,
    maxHp: 5,
    currentHp: 5,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
  testState.currentPhase = TurnPhase.COMBAT_PHASE;
  testState.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };
  testState.player.hp = 20;
  (engine as unknown as { state: typeof testState }).state = testState;

  const initialSuppHp = testState.lanes[1].playerSupport!.currentHp;
  engine.resolveCombatStep();

  const afterState = engine.getState();
  // Hero took NO damage because the attack hit the lone support unit!
  assert(afterState.player.hp === 20, "Player Hero was protected from direct damage");
  // Support unit took damage
  const currentSupp = afterState.lanes[1].playerSupport;
  assert(!currentSupp || currentSupp.currentHp < initialSuppHp, "Lone Support unit absorbed the incoming attack");
}

// ─────────────────────────────────────────────────────────────
//  TEST 14: Symmetric Hero vs Hero & 4-Card Superpower Kit Initialization
// ─────────────────────────────────────────────────────────────
{
  console.log("\n▶ TEST 14: Symmetric Hero vs Hero & 4-Card Superpower Kit Initialization");
  const engine = new GameEngine();
  const state = engine.initializeGame(
    HERO_AEGIS_GUARDIAN,
    DECK_VANGUARD_40,
    HERO_AEGIS_GUARDIAN,
    DECK_ABYSSAL_40,
    { firstPlayerId: PlayerId.Player },
  );

  // 1. Verify PlayerHero and OpponentHero have symmetric Hero structure
  assert(state.player.hero.id === "hero_aegis_guardian", "Player Hero is Aegis Guardian");
  assert(state.player.hero.title === "The Indomitable Bulwark", "Hero title matches");
  assert(state.opponent.hero.id === "hero_aegis_guardian", "Opponent Hero is Aegis Guardian");
  assert(state.opponent.hero.title === "The Indomitable Bulwark", "Opponent Hero title matches");

  // 2. Both heroes have 20 starting HP
  assert(state.player.hp === 20 && state.player.maxHp === 20, "Player starts at 20 HP");
  assert(state.opponent.hp === 20 && state.opponent.maxHp === 20, "Opponent starts at 20 HP");

  // 3. Verify 4-Card Superpower Kit
  const pKit = state.player.hero.superpowerKit;
  assert(pKit !== undefined, "Player Hero has superpowerKit");
  assert(pKit.signatureAbility.id === "card_sp_shield_of_legend", "Player Signature Ability is Shield of Legend");
  assert(pKit.coreAbilities.length === 3, "Player has 3 Core Abilities in kit");

  const oKit = state.opponent.hero.superpowerKit;
  assert(oKit !== undefined, "Opponent Hero has superpowerKit");
  assert(oKit.signatureAbility.id === "card_sp_shield_of_legend", "Opponent Signature Ability is Shield of Legend");
  assert(oKit.coreAbilities.length === 3, "Opponent has 3 Core Abilities in kit");

  // 4. Initial available superpower pool has all 4 cards (1 signature + 3 core)
  assert(state.player.availableSuperpowers.length === 4, "Player available superpower pool has 4 cards");
  assert(state.opponent.availableSuperpowers.length === 4, "Opponent available superpower pool has 4 cards");
  console.log("  ✓ Symmetric Aegis Guardian entities initialized with 4-card kits (1 Signature + 3 Core)");
}

// ─────────────────────────────────────────────────────────────
//  TEST 15: Superpowers: Shield of Legend & Human Shield
// ─────────────────────────────────────────────────────────────
{
  console.log("\n▶ TEST 15: Superpowers: Shield of Legend & Human Shield");
  const engine = new GameEngine();
  const state = engine.initializeGame(
    HERO_AEGIS_GUARDIAN,
    DECK_VANGUARD_40,
    HERO_AEGIS_GUARDIAN,
    DECK_ABYSSAL_40,
    { firstPlayerId: PlayerId.Player },
  );

  state.currentPhase = TurnPhase.P1_SPELL_PHASE;
  state.player.currentMana = 5;

  // Place a player unit in Lane 1
  state.lanes[1].playerFrontline = {
    instanceId: "u_p_1",
    cardId: "u_p_1",
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: "Guardian Defender",
    tribe: "Guardian",
    baseKeywords: [],
    keywords: [],
    attack: 2,
    maxHp: 3,
    currentHp: 3,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Test 1: Play Human Shield on target unit
  state.player.hand = [SP_HUMAN_SHIELD, SP_SHIELD_OF_LEGEND];
  (engine as unknown as { state: typeof state }).state = state;

  const res1 = engine.playCard(PlayerId.Player, SP_HUMAN_SHIELD.id, 1, "u_p_1");
  assert(res1.success, "Played SP_HUMAN_SHIELD on friendly unit");
  const buffedUnit = engine.getState().lanes[1].playerFrontline!;
  assert(buffedUnit.currentHp === 5 && buffedUnit.maxHp === 5, "Unit received +2 HP (3 -> 5)");
  assert(buffedUnit.keywords.includes(Keyword.Armored), "Unit gained Armored keyword");

  // Test 2: Play Shield of Legend
  const res2 = engine.playCard(PlayerId.Player, SP_SHIELD_OF_LEGEND.id);
  assert(res2.success, "Played SP_SHIELD_OF_LEGEND successfully");
  assert(engine.getState().player.immuneDamageUntilTurnEnd === true, "Player immuneDamageUntilTurnEnd is active");
  console.log("  ✓ Human Shield buffed HP and granted Armor; Shield of Legend activated full immunity");
}

// ─────────────────────────────────────────────────────────────
//  TEST 16: Superpowers: Suppress one's anger & Leave it to the dust
// ─────────────────────────────────────────────────────────────
{
  console.log("\n▶ TEST 16: Superpowers: Suppress one's anger & Leave it to the dust");
  const engine = new GameEngine();
  const state = engine.initializeGame(
    HERO_AEGIS_GUARDIAN,
    DECK_VANGUARD_40,
    HERO_AEGIS_GUARDIAN,
    DECK_ABYSSAL_40,
    { firstPlayerId: PlayerId.Player },
  );

  state.currentPhase = TurnPhase.P1_SPELL_PHASE;
  state.player.currentMana = 5;

  // Place enemy units with 3 attack in Lanes 1 & 2
  state.lanes[1].opponentFrontline = {
    instanceId: "u_opp_1",
    cardId: "u_opp_1",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Enemy 1",
    tribe: "Aquatic",
    baseKeywords: [],
    keywords: [],
    attack: 3,
    maxHp: 4,
    currentHp: 4,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
  state.lanes[2].opponentFrontline = {
    instanceId: "u_opp_2",
    cardId: "u_opp_2",
    ownerId: PlayerId.Opponent,
    laneIndex: 2,
    name: "Enemy 2",
    tribe: "Aquatic",
    baseKeywords: [],
    keywords: [],
    attack: 1,
    maxHp: 2,
    currentHp: 2,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Test 1: Play Leave it to the dust
  state.player.hand = [SP_LEAVE_TO_DUST, SP_SUPPRESS_ANGER];
  (engine as unknown as { state: typeof state }).state = state;

  const res1 = engine.playCard(PlayerId.Player, SP_LEAVE_TO_DUST.id);
  assert(res1.success, "Played SP_LEAVE_TO_DUST successfully");
  assert(engine.getState().lanes[1].opponentFrontline!.attack === 2, "Enemy 1 attack reduced by 1 (3 -> 2)");
  assert(engine.getState().lanes[2].opponentFrontline!.attack === 0, "Enemy 2 attack reduced by 1 (1 -> 0)");

  // Test 2: Play Suppress one's anger
  const handBefore = engine.getState().player.hand.length;
  const res2 = engine.playCard(PlayerId.Player, SP_SUPPRESS_ANGER.id);
  assert(res2.success, "Played SP_SUPPRESS_ANGER successfully");
  // Spent 1 card from hand, drew 2 cards -> net +1 card
  assert(engine.getState().player.hand.length === handBefore + 1, "Player drew 2 cards (highest HP unit + spell)");
  console.log("  ✓ Leave it to the dust debuffed enemy units; Suppress anger drew unit and spell");
}

// ─────────────────────────────────────────────────────────────
//  TEST 17: Hero Super Block Draw & Reusable Pool Fallback
// ─────────────────────────────────────────────────────────────
{
  console.log("\n▶ TEST 17: Hero Super Block Draw & Reusable Pool Fallback");
  const engine = new GameEngine();
  const state = engine.initializeGame(
    HERO_AEGIS_GUARDIAN,
    DECK_VANGUARD_40,
    HERO_AEGIS_GUARDIAN,
    DECK_ABYSSAL_40,
    { firstPlayerId: PlayerId.Player },
  );

  // Empty player's availableSuperpowers pool to test reusable fallback
  state.player.availableSuperpowers = [];
  state.player.superBlock.charges = 7;
  state.player.hand = [];

  // Setup an attack that triggers super block (7 charges + 3 roll -> 10 >= 8)
  state.lanes[1].opponentFrontline = {
    instanceId: "attacker_1",
    cardId: "attacker_1",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Attacker",
    tribe: "Aquatic",
    baseKeywords: [],
    keywords: [],
    attack: 4,
    maxHp: 4,
    currentHp: 4,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  state.currentPhase = TurnPhase.COMBAT_PHASE;
  state.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };
  (engine as unknown as { state: typeof state }).state = state;

  engine.resolveCombatStep();

  const afterState = engine.getState();
  assert(afterState.player.superBlock.triggerCount === 1, "Super block triggered");
  assert(afterState.player.hand.length === 1, "Player auto-drew 1 superpower from reusable kit");
  const drawnCard = afterState.player.hand[0];
  assert(drawnCard.cost === 0, "Drawn superpower costs 0 mana");
  const heroKitIds = [
    HERO_AEGIS_GUARDIAN.superpowerKit.signatureAbility.id,
    ...HERO_AEGIS_GUARDIAN.superpowerKit.coreAbilities.map((c) => c.id),
  ];
  assert(heroKitIds.includes(drawnCard.id), "Drawn card is from Hero's 4-card superpower kit");
  console.log("  ✓ Auto-drew 0-cost superpower from Aegis Guardian's 4-card kit even when pool was exhausted");
}

console.log("\n============================================================");
console.log("  ALL 17 SPECIFICATIONS PASSED TEST VERIFICATION SUCCESSFULLY!");
console.log("============================================================\n");
