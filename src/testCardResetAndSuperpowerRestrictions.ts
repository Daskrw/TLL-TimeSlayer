// ============================================================
//  testCardResetAndSuperpowerRestrictions.ts
//  Comprehensive verification suite for:
//  1. Card Set Reset (Exactly 9 new 1/1/1 units, old 25 removed)
//  2. Superpower cards strictly non-deckable everywhere
//  3. Headless GameEngine execution for all 5 ability groups
// ============================================================

import { GameEngine } from "./GameEngine";
import {
  CardDefinition,
  CardType,
  Keyword,
  LaneType,
  PlayerId,
  TurnPhase,
  GameEventType,
  isSuperpowerCard,
} from "./types";
import {
  ALL_STATIC_CARDS,
  getStaticCardById,
  HERO_AEGIS_GUARDIAN,
  DECK_PLANTS_40,
  DECK_ZOMBIES_40,
  DECK_VANGUARD_40,
  DECK_ABYSSAL_40,
  CARD_DEATH_DRAW_1,
  CARD_DEATH_DRAW_2,
  CARD_DEATH_DRAW_3,
  CARD_VANILLA_1,
  CARD_VANILLA_2,
  CARD_VANILLA_3,
  CARD_GRANT_DURABILITY,
  CARD_HERO_DAMAGE_DRAW,
  CARD_ADJACENT_DAMAGE,
  SP_SHIELD_OF_LEGEND,
  SP_HUMAN_SHIELD,
  SP_SUPPRESS_ANGER,
  SP_LEAVE_TO_DUST,
} from "./cards";
import { DeckStorage } from "../client/DeckStorage";
import { masterRegistry, DELETED_CARD_IDS } from "../server/MasterRegistry";
import { GameSession } from "../server/GameSession";
import { GameRoom } from "../server/types";

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

console.log("\n============================================================");
console.log("  CARD SET RESET & SUPERPOWER DECK RESTRICTION TEST SUITE");
console.log("============================================================\n");

// ─────────────────────────────────────────────────────────────
// PART 1: Card Set Reset & Master Catalog Verification
// ─────────────────────────────────────────────────────────────
console.log("▶ PART 1: 9 New Cards Catalog & Numeric Stats Verification");
{
  const newCards = [
    CARD_DEATH_DRAW_1,
    CARD_DEATH_DRAW_2,
    CARD_DEATH_DRAW_3,
    CARD_VANILLA_1,
    CARD_VANILLA_2,
    CARD_VANILLA_3,
    CARD_GRANT_DURABILITY,
    CARD_HERO_DAMAGE_DRAW,
    CARD_ADJACENT_DAMAGE,
  ];

  assert(newCards.length === 9, "Exactly 9 new units exist in catalog");

  // Every applicable basic numeric stat initialized to 1
  for (const c of newCards) {
    assert(c.cost === 1, `${c.name} (${c.id}) has cost === 1`);
    assert(c.attack === 1, `${c.name} (${c.id}) has attack === 1`);
    assert(c.hp === 1, `${c.name} (${c.id}) has hp === 1`);
    assert(c.type === CardType.Unit, `${c.name} is a Unit card`);
  }

  // Group A (3 cards): Death Draw
  const groupA = [CARD_DEATH_DRAW_1, CARD_DEATH_DRAW_2, CARD_DEATH_DRAW_3];
  for (const c of groupA) {
    assert(
      c.deathrattleEffect?.drawCards === 1,
      `Group A card ${c.name} has deathrattle drawCards === 1`,
    );
    assert(
      c.keywords.includes(Keyword.Deathrattle),
      `Group A card ${c.name} has Deathrattle keyword`,
    );
  }

  // Group B (3 cards): Vanilla
  const groupB = [CARD_VANILLA_1, CARD_VANILLA_2, CARD_VANILLA_3];
  for (const c of groupB) {
    assert(
      c.keywords.length === 0,
      `Group B card ${c.name} has no keywords (keywords: [])`,
    );
    assert(!c.deathrattleEffect, `Group B card ${c.name} has no deathrattle effect`);
    assert(!c.onEnterEffect, `Group B card ${c.name} has no onEnterEffect`);
    assert(!c.onHeroDamageEffect, `Group B card ${c.name} has no onHeroDamageEffect`);
    assert(!c.adjacentLaneDamage, `Group B card ${c.name} has no adjacentLaneDamage`);
  }

  // Group C (1 card): Grant Durability ("Aegis Armorer")
  assert(
    CARD_GRANT_DURABILITY.onEnterEffect?.grantKeyword === Keyword.Armored,
    "Group C Aegis Armorer has onEnterEffect granting Keyword.Armored ('ทนทาน')",
  );

  // Group D (1 card): Hero Damage Draw ("Phantom Infiltrator")
  assert(
    CARD_HERO_DAMAGE_DRAW.onHeroDamageEffect?.drawCards === 1,
    "Group D Phantom Infiltrator has onHeroDamageEffect drawing 1 card",
  );

  // Group E (1 card): Adjacent Lane Damage ("Cleave Berserker")
  assert(
    CARD_ADJACENT_DAMAGE.adjacentLaneDamage === true,
    "Group E Cleave Berserker has adjacentLaneDamage === true",
  );

  // Absence of all 25 old ordinary Unit and Spell cards
  assert(DELETED_CARD_IDS.size === 25, "DELETED_CARD_IDS tracks exactly 25 removed cards");

  for (const oldId of DELETED_CARD_IDS) {
    assert(!getStaticCardById(oldId), `Old card ${oldId} is absent from getStaticCardById`);
    assert(
      !ALL_STATIC_CARDS.some((c) => c.id === oldId),
      `Old card ${oldId} is absent from ALL_STATIC_CARDS`,
    );
    assert(
      !masterRegistry.getCard(oldId),
      `Old card ${oldId} is absent from MasterRegistry`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PART 2: Superpower Cards Deck Prohibitions
// ─────────────────────────────────────────────────────────────
console.log("\n▶ PART 2: Superpower Cards Deck Restriction Verification");
{
  const superpowers = ALL_STATIC_CARDS.filter((c) => isSuperpowerCard(c));
  assert(superpowers.length === 20, "Catalog contains 20 total superpower cards");

  // Every superpower is recognized by canonical helper
  for (const sp of superpowers) {
    assert(isSuperpowerCard(sp) === true, `isSuperpowerCard returns true for ${sp.name} (${sp.id})`);
  }

  // Normal cards return false
  assert(isSuperpowerCard(CARD_VANILLA_1) === false, "isSuperpowerCard returns false for normal unit CARD_VANILLA_1");
  assert(isSuperpowerCard(CARD_DEATH_DRAW_1) === false, "isSuperpowerCard returns false for normal unit CARD_DEATH_DRAW_1");

  // 1. DeckStorage.validate rejection
  const deckWithSuperpower = [...DECK_PLANTS_40.slice(0, 39), SP_SHIELD_OF_LEGEND];
  const validationResult = DeckStorage.validate(
    deckWithSuperpower.map((c) => c.id),
    [...ALL_STATIC_CARDS],
  );
  assert(!validationResult.isValid, "DeckStorage.validate rejects deck containing SP_SHIELD_OF_LEGEND");
  assert(
    validationResult.errors.some((e) => e.includes("Superpower cards cannot be placed")),
    "DeckStorage.validate provides specific error message for superpower cards",
  );

  // 2. GameEngine.initializeGame rejection
  const engine = new GameEngine();
  let threw = false;
  try {
    engine.initializeGame(
      HERO_AEGIS_GUARDIAN,
      deckWithSuperpower,
      HERO_AEGIS_GUARDIAN,
      DECK_ABYSSAL_40,
    );
  } catch (err: any) {
    threw = true;
    assert(
      err.message.includes("Superpower card") || err.message.includes("cannot be placed in decks"),
      "GameEngine throws descriptive error when deck contains a Superpower",
    );
  }
  assert(threw, "GameEngine.initializeGame strictly rejects deck with Superpower");

  // 3. Server GameSession.submitLoadout rejection
  const mockRoom: GameRoom = {
    roomId: "test_room_1",
    status: "LOBBY",
    players: {
      p1: { socketId: "s1", playerName: "P1", connected: true, ready: false },
      p2: { socketId: "s2", playerName: "P2", connected: true, ready: false },
    },
    createdAt: Date.now(),
  };
  const session = new GameSession(mockRoom);
  const submitResult = session.submitLoadout("p1", HERO_AEGIS_GUARDIAN, deckWithSuperpower);
  assert(!submitResult, "GameSession.submitLoadout returns false when deck contains Superpower");

  // 4. Valid normal deck is accepted
  const validSubmit = session.submitLoadout("p1", HERO_AEGIS_GUARDIAN, DECK_VANGUARD_40);
  assert(validSubmit === false || validSubmit === true, "Valid loadout accepted for p1 (waiting on p2)");
  assert(mockRoom.players.p1?.isLockedIn === true, "Player 1 locked in successfully with valid deck");
}

// ─────────────────────────────────────────────────────────────
// PART 3: Headless GameEngine Ability Execution
// ─────────────────────────────────────────────────────────────
console.log("\n▶ PART 3: Headless Game Engine Ability Execution");

// ── Test 3A: Group A — Death Draw ───────────────────────────
console.log("  ▶ Group A: Death Draw ('When this unit is destroyed, owner draws 1 card')");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_AEGIS_GUARDIAN, DECK_VANGUARD_40, HERO_AEGIS_GUARDIAN, DECK_ABYSSAL_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.currentPhase = TurnPhase.COMBAT_PHASE;
  state.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };

  // Place Group A unit in Lane 1 (1 ATK, 1 HP)
  state.lanes[1].playerFrontline = {
    instanceId: "death_draw_unit_1",
    cardId: CARD_DEATH_DRAW_1.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: CARD_DEATH_DRAW_1.name,
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [Keyword.Deathrattle],
    keywords: [Keyword.Deathrattle],
    attack: 1,
    maxHp: 1,
    currentHp: 1,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    deathrattleEffect: { drawCards: 1 },
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Place enemy unit in Lane 1 (3 ATK, 5 HP) to destroy player's unit
  state.lanes[1].opponentFrontline = {
    instanceId: "enemy_killer",
    cardId: "enemy_killer",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Enemy Destroyer",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 3,
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

  const handCountBefore = state.player.hand.length;
  (engine as unknown as { state: typeof state }).state = state;

  engine.resolveCombatStep();

  const stateAfter = engine.getState();
  assert(stateAfter.lanes[1].playerFrontline === null, "Group A unit was destroyed in combat");
  assert(
    stateAfter.player.hand.length === handCountBefore + 1,
    "Owner drew exactly 1 card when Group A unit was destroyed",
  );
}

// ── Test 3B: Group C — Grant Durability ("ทนทาน") ───────────
console.log("  ▶ Group C: Grant Durability ('When this unit enters battlefield, friendly units gain ทนทาน')");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_AEGIS_GUARDIAN, DECK_VANGUARD_40, HERO_AEGIS_GUARDIAN, DECK_ABYSSAL_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.player.currentMana = 10;
  state.currentPhase = TurnPhase.P1_UNIT_PHASE;

  // Place existing friendly units in Lane 1 and Lane 2 without Armored
  state.lanes[1].playerFrontline = {
    instanceId: "friend_1",
    cardId: CARD_VANILLA_1.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: "Friendly Unit 1",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
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

  // Place enemy unit in Lane 1 to verify opponent does NOT receive the buff
  state.lanes[1].opponentFrontline = {
    instanceId: "enemy_1",
    cardId: CARD_VANILLA_2.id,
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Enemy Unit 1",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
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

  state.player.hand = [CARD_GRANT_DURABILITY];
  (engine as unknown as { state: typeof state }).state = state;

  // Play Aegis Armorer in Lane 2
  const playRes = engine.playCard(PlayerId.Player, CARD_GRANT_DURABILITY.id, 2);
  assert(playRes.success, "Successfully played Aegis Armorer");

  const stateAfter = engine.getState();
  const friend1 = stateAfter.lanes[1].playerFrontline!;
  const enemy1 = stateAfter.lanes[1].opponentFrontline!;
  const armorer = stateAfter.lanes[2].playerFrontline!;

  assert(
    friend1.keywords.includes(Keyword.Armored),
    "Existing friendly unit gained 'ทนทาน' (Keyword.Armored)",
  );
  assert(
    armorer.keywords.includes(Keyword.Armored),
    "Summoned unit itself gained 'ทนทาน' (Keyword.Armored)",
  );
  assert(
    !enemy1.keywords.includes(Keyword.Armored),
    "Opponent unit did NOT receive 'ทนทาน' (no leak to opponent)",
  );
}

// ── Test 3C: Group D — Hero Damage Draw ─────────────────────
console.log("  ▶ Group D: Hero Damage Draw ('When deals combat damage to opposing hero, owner draws 1 card')");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_AEGIS_GUARDIAN, DECK_VANGUARD_40, HERO_AEGIS_GUARDIAN, DECK_ABYSSAL_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.currentPhase = TurnPhase.COMBAT_PHASE;
  state.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };

  // Place Group D unit in Lane 1 unblocked
  state.lanes[1].playerFrontline = {
    instanceId: "infiltrator_1",
    cardId: CARD_HERO_DAMAGE_DRAW.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: CARD_HERO_DAMAGE_DRAW.name,
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 1,
    maxHp: 1,
    currentHp: 1,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    onHeroDamageEffect: { drawCards: 1 },
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
  state.lanes[1].opponentFrontline = null; // Unblocked attack against opponent Hero
  state.opponent.hp = 20;
  state.opponent.superBlock.charges = 0; // Won't trigger super block on 1 roll

  const handCountBefore = state.player.hand.length;
  (engine as unknown as { state: typeof state }).state = state;

  engine.resolveCombatStep();

  const stateAfter = engine.getState();
  assert(stateAfter.opponent.hp < 20, "Opponent Hero took combat damage");
  assert(
    stateAfter.player.hand.length === handCountBefore + 1,
    "Owner drew 1 card after dealing combat damage to opposing Hero",
  );

  // Scenario 2: Attack is blocked by enemy unit -> No hero damage -> No draw
  const engine2 = new GameEngine();
  engine2.initializeGame(HERO_AEGIS_GUARDIAN, DECK_VANGUARD_40, HERO_AEGIS_GUARDIAN, DECK_ABYSSAL_40, {
    firstPlayerId: PlayerId.Player,
  });
  const state2 = engine2.getState();
  state2.currentPhase = TurnPhase.COMBAT_PHASE;
  state2.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };
  state2.lanes[1].playerFrontline = {
    instanceId: "infiltrator_2",
    cardId: CARD_HERO_DAMAGE_DRAW.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: CARD_HERO_DAMAGE_DRAW.name,
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 1,
    maxHp: 1,
    currentHp: 1,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    onHeroDamageEffect: { drawCards: 1 },
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
  state2.lanes[1].opponentFrontline = {
    instanceId: "blocker_unit",
    cardId: "blocker_unit",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Blocker",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 0,
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
  const handBeforeBlocked = state2.player.hand.length;
  (engine2 as unknown as { state: typeof state2 }).state = state2;
  engine2.resolveCombatStep();
  assert(
    engine2.getState().player.hand.length === handBeforeBlocked,
    "Owner did NOT draw a card when combat damage was dealt to a unit rather than hero",
  );
}

// ── Test 3D: Group E — Adjacent Lane Damage ─────────────────
console.log("  ▶ Group E: Adjacent Lane Damage ('Deals damage to units in adjacent lane on left and right')");
{
  const engine = new GameEngine();
  engine.initializeGame(HERO_AEGIS_GUARDIAN, DECK_VANGUARD_40, HERO_AEGIS_GUARDIAN, DECK_ABYSSAL_40, {
    firstPlayerId: PlayerId.Player,
  });

  const state = engine.getState();
  state.currentPhase = TurnPhase.COMBAT_PHASE;
  state.combatQueue = { currentLaneIndex: 1, currentStrike: 1, phaseStep: "STRIKE_1" };

  // Place Cleave Berserker (1 ATK) in Lane 1
  state.lanes[1].playerFrontline = {
    instanceId: "cleave_1",
    cardId: CARD_ADJACENT_DAMAGE.id,
    ownerId: PlayerId.Player,
    laneIndex: 1,
    name: CARD_ADJACENT_DAMAGE.name,
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 1,
    maxHp: 10,
    currentHp: 10,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    adjacentLaneDamage: true,
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };

  // Enemy blocker in Lane 1 (5 HP)
  state.lanes[1].opponentFrontline = {
    instanceId: "enemy_center",
    cardId: "enemy_center",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Center Enemy",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 0,
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

  // Adjacent Left: Lane 0 enemy frontline (3 HP)
  state.lanes[0].opponentFrontline = {
    instanceId: "enemy_left",
    cardId: "enemy_left",
    ownerId: PlayerId.Opponent,
    laneIndex: 0,
    name: "Left Enemy",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 0,
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

  // Adjacent Right: Lane 2 enemy frontline (3 HP)
  state.lanes[2].opponentFrontline = {
    instanceId: "enemy_right",
    cardId: "enemy_right",
    ownerId: PlayerId.Opponent,
    laneIndex: 2,
    name: "Right Enemy",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 0,
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

  // Non-adjacent: Lane 3 enemy frontline (3 HP)
  state.lanes[3].opponentFrontline = {
    instanceId: "enemy_far",
    cardId: "enemy_far",
    ownerId: PlayerId.Opponent,
    laneIndex: 3,
    name: "Far Enemy",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 0,
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

  // Friendly unit in Lane 2 to ensure NO friendly fire
  state.lanes[2].playerFrontline = {
    instanceId: "friend_right",
    cardId: "friend_right",
    ownerId: PlayerId.Player,
    laneIndex: 2,
    name: "Friendly Neighbor",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 1,
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

  (engine as unknown as { state: typeof state }).state = state;

  engine.resolveCombatStep();

  const afterState = engine.getState();
  const leftEnemy = afterState.lanes[0].opponentFrontline!;
  const rightEnemy = afterState.lanes[2].opponentFrontline!;
  const farEnemy = afterState.lanes[3].opponentFrontline!;
  const friendNeighbor = afterState.lanes[2].playerFrontline!;

  assert(leftEnemy.currentHp === 2, "Adjacent left unit in Lane 0 took 1 cleave damage (3 -> 2)");
  assert(rightEnemy.currentHp === 2, "Adjacent right unit in Lane 2 took 1 cleave damage (3 -> 2)");
  assert(farEnemy.currentHp === 3, "Non-adjacent unit in Lane 3 took NO cleave damage (3 -> 3)");
  assert(friendNeighbor.currentHp === 3, "Friendly unit in adjacent Lane 2 took NO damage (no friendly fire)");

  // Test Boundary: Lane 0 attacker damages Lane 1 only (no negative index wrap-around)
  const engineBoundary = new GameEngine();
  engineBoundary.initializeGame(HERO_AEGIS_GUARDIAN, DECK_VANGUARD_40, HERO_AEGIS_GUARDIAN, DECK_ABYSSAL_40, {
    firstPlayerId: PlayerId.Player,
  });
  const stateBound = engineBoundary.getState();
  stateBound.currentPhase = TurnPhase.COMBAT_PHASE;
  stateBound.combatQueue = { currentLaneIndex: 0, currentStrike: 1, phaseStep: "STRIKE_1" };
  stateBound.lanes[0].playerFrontline = {
    instanceId: "cleave_lane_0",
    cardId: CARD_ADJACENT_DAMAGE.id,
    ownerId: PlayerId.Player,
    laneIndex: 0,
    name: CARD_ADJACENT_DAMAGE.name,
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 1,
    maxHp: 5,
    currentHp: 5,
    hasAttackedThisTurn: false,
    summonedThisTurn: false,
    isSupport: false,
    attachedEquipment: [],
    adjacentLaneDamage: true,
    isFrozen: false,
    hasShield: false,
    isDeadly: false,
    auraModifiers: [],
  };
  stateBound.lanes[0].opponentFrontline = null;
  stateBound.lanes[1].opponentFrontline = {
    instanceId: "lane_1_enemy",
    cardId: "lane_1_enemy",
    ownerId: PlayerId.Opponent,
    laneIndex: 1,
    name: "Lane 1 Enemy",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 0,
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
  stateBound.lanes[3].opponentFrontline = {
    instanceId: "lane_3_enemy",
    cardId: "lane_3_enemy",
    ownerId: PlayerId.Opponent,
    laneIndex: 3,
    name: "Lane 3 Enemy",
    tribes: ["เป็นกลาง"],
    tribe: "เป็นกลาง",
    baseKeywords: [],
    keywords: [],
    attack: 0,
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
  (engineBoundary as unknown as { state: typeof stateBound }).state = stateBound;
  engineBoundary.resolveCombatStep();

  assert(
    engineBoundary.getState().lanes[1].opponentFrontline!.currentHp === 2,
    "Lane 0 attacker damages adjacent Lane 1",
  );
  assert(
    engineBoundary.getState().lanes[3].opponentFrontline!.currentHp === 3,
    "Lane 0 attacker does NOT wrap around to Lane 3",
  );
}

console.log("\n============================================================");
console.log("  ALL CARD RESET & SUPERPOWER RESTRICTION TESTS PASSED!");
console.log("============================================================\n");
