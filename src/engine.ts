// ============================================================
//  TLL TimeSlayer — GameEngine
//  Orchestrates all turn phases, card plays, and combat.
// ============================================================

import {
  ActionResult,
  CardDefinition,
  CardType,
  EngineConfig,
  GameEvent,
  GameEventType,
  GameState,
  Hero,
  Keyword,
  Lane,
  PlayerId,
  PlayerState,
  SuperBlockMeter,
  TurnPhase,
} from "./types";
import {
  DEFAULT_HERO_HP,
  DEFAULT_MAX_HAND_SIZE,
  DEFAULT_STARTING_HAND,
  LANE_COUNT,
  LANE_LABELS,
  LANE_TYPES,
  MAX_SUPER_BLOCKS,
  PHASE_ORDER,
} from "./constants";
import { resolveCombat } from "./combat";
import {
  cloneState,
  computeNewMaxMana,
  createUnitInstance,
  getPlayerState,
  isLaneLegal,
  isSpellPhase,
  isUnitPhase,
  makeEvent,
  phaseToPlayerId,
  resetSeq,
  shuffleArray,
} from "./utils";

// ─────────────────────────────────────────────────────────────
//  Internal Helpers
// ─────────────────────────────────────────────────────────────

function buildInitialSuperBlock(): SuperBlockMeter {
  return {
    charges: 0,
    triggerCount: 0,
    superBlockTriggered: false,
  };
}

import {
  SP_SKY_STRIKE,
  SP_AERIAL_SURGE,
  SP_TAILWIND_DRAFT,
  SP_GLACIAL_GALE,
} from "./cards";

const DEFAULT_HERO: Hero = {
  id: "HERO_DEFAULT",
  name: "Hero",
  title: "The Time Slayer",
  description: "A mysterious chronomancer battling through temporal rifts.",
  portraitUrl: "",
  maxHp: 20,
  superpowerKit: {
    signatureAbility: SP_SKY_STRIKE,
    coreAbilities: [SP_AERIAL_SURGE, SP_TAILWIND_DRAFT, SP_GLACIAL_GALE],
  },
  tribeSynergies: [],
  startingHp: 20,
  superpowers: [],
};

function buildPlayerState(
  id: PlayerId,
  deck: CardDefinition[],
  startingHp: number,
  startingHandSize: number,
): PlayerState {
  const shuffled = [...deck];
  const hand = shuffled.splice(0, startingHandSize);
  return {
    id,
    hero: DEFAULT_HERO,
    hp: startingHp,
    maxHp: startingHp,
    hand,
    deck: shuffled,
    graveyard: [],
    currentMana: 0,
    maxMana: 0,
    superBlock: buildInitialSuperBlock(),
    availableSuperpowers: [],
    fatigueCount: 0,
  };
}

function buildInitialLanes(): [Lane, Lane, Lane, Lane] {
  return LANE_TYPES.map((type, index) => ({
    index,
    type,
    playerFrontline: null,
    playerSupport: null,
    opponentFrontline: null,
    opponentSupport: null,
    environment: null,
    playerUnit: null,
    opponentUnit: null,
  })) as [Lane, Lane, Lane, Lane];
}

// ─────────────────────────────────────────────────────────────
//  GameEngine Class
// ─────────────────────────────────────────────────────────────

export class GameEngine {
  private readonly rng: () => number;
  private readonly startingHp: number;
  private readonly startingHandSize: number;
  private readonly maxHandSize: number;
  private readonly maxSuperBlocks: number;

  constructor(config: EngineConfig = {}) {
    this.rng              = config.random            ?? Math.random;
    this.startingHp       = config.startingHp        ?? DEFAULT_HERO_HP;
    this.startingHandSize = config.startingHandSize  ?? DEFAULT_STARTING_HAND;
    this.maxHandSize      = config.maxHandSize        ?? DEFAULT_MAX_HAND_SIZE;
    this.maxSuperBlocks   = config.maxSuperBlocks     ?? MAX_SUPER_BLOCKS;
  }

  // ─────────────────────────────────────────────────────────
  //  Game Initialisation
  // ─────────────────────────────────────────────────────────

  /**
   * Create a fresh GameState from the two players' deck lists.
   * Decks are shuffled, opening hands are dealt, first player is
   * randomised, and Turn 1 mana is granted.
   */
  createGame(
    playerDeck: CardDefinition[],
    opponentDeck: CardDefinition[],
  ): GameState {
    resetSeq();

    const shuffledPlayerDeck   = shuffleArray(this.rng, playerDeck);
    const shuffledOpponentDeck = shuffleArray(this.rng, opponentDeck);

    const player   = buildPlayerState(PlayerId.Player,   shuffledPlayerDeck,   this.startingHp, this.startingHandSize);
    const opponent = buildPlayerState(PlayerId.Opponent, shuffledOpponentDeck, this.startingHp, this.startingHandSize);

    // Randomise first player
    const goesFirst: PlayerId = this.rng() < 0.5 ? PlayerId.Player : PlayerId.Opponent;

    // Grant turn-1 mana
    player.maxMana    = 1;
    player.currentMana = 1;
    opponent.maxMana    = 1;
    opponent.currentMana = 1;

    const initEvents: GameEvent[] = [
      makeEvent(
        GameEventType.TURN_STARTED,
        `Turn 1 begins. ${goesFirst} goes first.`,
        { turnNumber: 1, firstPlayer: goesFirst },
      ),
      makeEvent(
        GameEventType.PHASE_CHANGED,
        `Phase: ${TurnPhase.P1_UNIT_PHASE}`,
        { phase: TurnPhase.P1_UNIT_PHASE },
      ),
    ];

    return {
      turnNumber: 1,
      firstPlayerId: goesFirst,
      activePlayerId: goesFirst,
      currentPhase: TurnPhase.P1_UNIT_PHASE,
      lanes: buildInitialLanes(),
      player,
      opponent,
      superBlockInterrupt: null,
      combatQueue: null,
      eventLog: initEvents,
      winner: null,
      isGameOver: false,
      mulliganState: null,
    };
  }

  // ─────────────────────────────────────────────────────────
  //  playCard
  // ─────────────────────────────────────────────────────────

  /**
   * Play a card from a player's hand.
   *
   * For Unit cards: requires a laneIndex.
   * For Spell/HeroAbility: laneIndex is optional (spell targeting handled externally).
   * For Equipment/Environment: laneIndex may be required depending on targeting.
   *
   * Validation:
   *   - Correct phase for the calling player.
   *   - Card exists in hand.
   *   - Sufficient mana.
   *   - Lane is valid and not occupied (for units).
   */
  playCard(
    state: GameState,
    playerId: PlayerId,
    cardId: string,
    laneIndex?: number,
  ): ActionResult {
    resetSeq();

    if (state.isGameOver) {
      return { success: false, state, error: "Game is already over." };
    }

    // ── Phase check ───────────────────────────────────────────
    const phaseOwner = phaseToPlayerId(state.currentPhase);
    if (phaseOwner !== playerId) {
      return {
        success: false,
        state,
        error: `It is not ${playerId}'s turn to play cards in phase ${state.currentPhase}.`,
      };
    }

    const isUnit  = isUnitPhase(state.currentPhase);
    const isSpell = isSpellPhase(state.currentPhase);

    // ── Locate card in hand ───────────────────────────────────
    const playerSnap = getPlayerState(state, playerId);
    const cardIndex  = playerSnap.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, state, error: `Card "${cardId}" not found in ${playerId}'s hand.` };
    }
    const card = playerSnap.hand[cardIndex];

    // ── Phase / card-type compatibility ──────────────────────
    if (isUnit && card.type !== CardType.Unit) {
      return {
        success: false,
        state,
        error: `Phase ${state.currentPhase} only accepts Unit cards; "${card.name}" is a ${card.type}.`,
      };
    }
    if (isSpell && (card.type !== CardType.Spell && card.type !== CardType.HeroAbility)) {
      return {
        success: false,
        state,
        error: `Phase ${state.currentPhase} only accepts Spell/HeroAbility cards; "${card.name}" is a ${card.type}.`,
      };
    }

    // ── Mana check ────────────────────────────────────────────
    if (card.cost > playerSnap.currentMana) {
      return {
        success: false,
        state,
        error: `Not enough mana: "${card.name}" costs ${card.cost}, but ${playerId} only has ${playerSnap.currentMana}.`,
      };
    }

    // Clone state for safe mutation
    const next = cloneState(state);
    const events: GameEvent[] = [];

    const playerMut = playerId === PlayerId.Player ? next.player : next.opponent;

    // Spend mana
    const manaBefore = playerMut.currentMana;
    playerMut.currentMana -= card.cost;

    events.push(
      makeEvent(
        GameEventType.CARD_PLAYED,
        `${playerId} plays "${card.name}" (cost ${card.cost}). Mana: ${manaBefore} → ${playerMut.currentMana}.`,
        { playerId, cardId, cardName: card.name, cost: card.cost, manaBefore, manaAfter: playerMut.currentMana },
      ),
    );

    // Remove card from hand
    playerMut.hand.splice(
      playerMut.hand.findIndex((c) => c.id === cardId),
      1,
    );

    // ── Unit placement ────────────────────────────────────────
    if (card.type === CardType.Unit) {
      if (laneIndex === undefined) {
        return { success: false, state, error: `Unit card "${card.name}" requires a laneIndex.` };
      }
      if (laneIndex < 0 || laneIndex >= LANE_COUNT) {
        return { success: false, state, error: `laneIndex ${laneIndex} is out of bounds (0-${LANE_COUNT - 1}).` };
      }
      if (!isLaneLegal(card, laneIndex)) {
        const laneType = LANE_TYPES[laneIndex];
        return {
          success: false,
          state,
          error: `"${card.name}" cannot be placed in ${laneType} (lane ${laneIndex}).`,
        };
      }

      const targetLane = next.lanes[laneIndex];
      const slotKey    = playerId === PlayerId.Player ? "playerUnit" : "opponentUnit";
      if (targetLane[slotKey] !== null) {
        return {
          success: false,
          state,
          error: `Lane ${laneIndex} (${LANE_LABELS[laneIndex]}) already has a ${playerId} unit.`,
        };
      }

      const unit = createUnitInstance(card, playerId, laneIndex);
      targetLane[slotKey] = unit;

      events.push(
        makeEvent(
          GameEventType.UNIT_SUMMONED,
          `${unit.name} (${playerId}) summoned to ${LANE_LABELS[laneIndex]}${unit.keywords.includes(Keyword.Rush) ? " with Rush!" : "."}`,
          {
            instanceId: unit.instanceId,
            cardId: card.id,
            laneIndex,
            laneType: LANE_TYPES[laneIndex],
            keywords: unit.keywords,
          },
        ),
      );
    }

    // ── Spell / HeroAbility ───────────────────────────────────
    // Spells go to graveyard immediately; their effects are resolved
    // by external effect handlers (future system).
    if (card.type === CardType.Spell || card.type === CardType.HeroAbility) {
      playerMut.graveyard.push(card);
      // TODO: dispatch to spell effect registry
    }

    // Append events to log
    next.eventLog = [...next.eventLog, ...events];

    return { success: true, state: next, events };
  }

  // ─────────────────────────────────────────────────────────
  //  resolveCombat (public delegate)
  // ─────────────────────────────────────────────────────────

  /**
   * Resolve the combat phase.
   * Must be called when currentPhase === COMBAT_PHASE.
   */
  resolveCombat(state: GameState): ActionResult {
    resetSeq();

    if (state.isGameOver) {
      return { success: false, state, error: "Game is already over." };
    }
    if (state.currentPhase !== TurnPhase.COMBAT_PHASE) {
      return {
        success: false,
        state,
        error: `resolveCombat() called in wrong phase: ${state.currentPhase}. Expected COMBAT_PHASE.`,
      };
    }

    const { newState, events } = resolveCombat(state, this.rng, this.maxSuperBlocks);
    return { success: true, state: newState, events };
  }

  // ─────────────────────────────────────────────────────────
  //  advancePhase
  // ─────────────────────────────────────────────────────────

  /**
   * Advance the FSM to the next turn phase.
   *
   * TURN_END → P1_UNIT_PHASE triggers:
   *   - Turn counter increment.
   *   - Mana ramp for both players.
   *   - Full mana refill.
   *   - Card draw for both players (1 per turn; discard if hand is full).
   *   - summoning-sickness reset.
   */
  advancePhase(state: GameState): ActionResult {
    resetSeq();

    if (state.isGameOver) {
      return { success: false, state, error: "Game is already over." };
    }

    const currentIndex = PHASE_ORDER.indexOf(state.currentPhase);
    if (currentIndex === -1) {
      return { success: false, state, error: `Unknown phase: ${state.currentPhase}.` };
    }

    const next = cloneState(state);
    const events: GameEvent[] = [];

    const isLastPhase = currentIndex === PHASE_ORDER.length - 1;

    if (isLastPhase) {
      // ── TURN_END → new turn ──────────────────────────────────
      next.turnNumber += 1;

      // ── Mana ramp ────────────────────────────────────────────
      for (const pState of [next.player, next.opponent]) {
        const prevMax      = pState.maxMana;
        pState.maxMana     = computeNewMaxMana(pState.maxMana);
        pState.currentMana = pState.maxMana;

        events.push(
          makeEvent(
            GameEventType.MANA_CHANGED,
            `${pState.id} mana: ${prevMax} → ${pState.maxMana} (full).`,
            { playerId: pState.id, prevMax, newMax: pState.maxMana },
          ),
        );
      }

      // ── Card draw (1 per turn per player) ────────────────────
      for (const pState of [next.player, next.opponent]) {
        if (pState.deck.length === 0) {
          events.push(
            makeEvent(
              GameEventType.CARD_DISCARDED,
              `${pState.id} has no cards left to draw!`,
              { playerId: pState.id },
            ),
          );
          continue;
        }

        const drawn = pState.deck.shift()!;

        if (pState.hand.length >= this.maxHandSize) {
          pState.graveyard.push(drawn);
          events.push(
            makeEvent(
              GameEventType.CARD_DISCARDED,
              `${pState.id} draws "${drawn.name}" but hand is full — discarded.`,
              { playerId: pState.id, cardId: drawn.id, cardName: drawn.name },
            ),
          );
        } else {
          pState.hand.push(drawn);
          events.push(
            makeEvent(
              GameEventType.CARD_DRAWN,
              `${pState.id} draws "${drawn.name}" (hand: ${pState.hand.length}).`,
              { playerId: pState.id, cardId: drawn.id, cardName: drawn.name, handSize: pState.hand.length },
            ),
          );
        }
      }

      // ── Reset summoning sickness on all units ─────────────────
      for (const lane of next.lanes) {
        if (lane.playerUnit)   lane.playerUnit.summonedThisTurn   = false;
        if (lane.opponentUnit) lane.opponentUnit.summonedThisTurn = false;
      }

      // ── Alternate/keep priority (simple: alternate each turn) ──
      next.activePlayerId =
        next.turnNumber % 2 === 1 ? PlayerId.Player : PlayerId.Opponent;

      // ── Reset super-block trigger flag ────────────────────────
      next.player.superBlock   = { ...next.player.superBlock,   superBlockTriggered: false };
      next.opponent.superBlock = { ...next.opponent.superBlock, superBlockTriggered: false };

      // ── Advance to first phase of new turn ────────────────────
      next.currentPhase = PHASE_ORDER[0];

      events.push(
        makeEvent(
          GameEventType.TURN_STARTED,
          `Turn ${next.turnNumber} begins. ${next.activePlayerId} has initiative.`,
          { turnNumber: next.turnNumber, activePlayerId: next.activePlayerId },
        ),
      );
    } else {
      // ── Normal phase advance ───────────────────────────────────
      next.currentPhase = PHASE_ORDER[currentIndex + 1];
    }

    events.push(
      makeEvent(
        GameEventType.PHASE_CHANGED,
        `Phase: ${next.currentPhase}`,
        { phase: next.currentPhase, turnNumber: next.turnNumber },
      ),
    );

    next.eventLog = [...next.eventLog, ...events];

    return { success: true, state: next, events };
  }

  // ─────────────────────────────────────────────────────────
  //  drawCard  (utility — for effects that grant extra draws)
  // ─────────────────────────────────────────────────────────

  /**
   * Draw one card from the player's deck to hand.
   * Overdrawn cards (hand full) go to the graveyard.
   */
  drawCard(state: GameState, playerId: PlayerId): ActionResult {
    resetSeq();

    const next   = cloneState(state);
    const pState = playerId === PlayerId.Player ? next.player : next.opponent;
    const events: GameEvent[] = [];

    if (pState.deck.length === 0) {
      events.push(
        makeEvent(
          GameEventType.CARD_DISCARDED,
          `${playerId} attempts to draw but the deck is empty!`,
          { playerId },
        ),
      );
      next.eventLog = [...next.eventLog, ...events];
      return { success: true, state: next, events };
    }

    const drawn = pState.deck.shift()!;

    if (pState.hand.length >= this.maxHandSize) {
      pState.graveyard.push(drawn);
      events.push(
        makeEvent(
          GameEventType.CARD_DISCARDED,
          `${playerId} draws "${drawn.name}" but hand is full (${pState.hand.length}/${this.maxHandSize}) — discarded.`,
          { playerId, cardId: drawn.id, cardName: drawn.name },
        ),
      );
    } else {
      pState.hand.push(drawn);
      events.push(
        makeEvent(
          GameEventType.CARD_DRAWN,
          `${playerId} draws "${drawn.name}" (hand: ${pState.hand.length}).`,
          { playerId, cardId: drawn.id, cardName: drawn.name, handSize: pState.hand.length },
        ),
      );
    }

    next.eventLog = [...next.eventLog, ...events];
    return { success: true, state: next, events };
  }

  // ─────────────────────────────────────────────────────────
  //  getValidLanes  (query helper for UI layer)
  // ─────────────────────────────────────────────────────────

  /**
   * Returns an array of lane indices where the given card can legally
   * be placed by the given player.  Returns empty array for non-units.
   */
  getValidLanes(
    state: GameState,
    playerId: PlayerId,
    card: CardDefinition,
  ): number[] {
    if (card.type !== CardType.Unit) return [];

    const valid: number[] = [];
    const slotKey = playerId === PlayerId.Player ? "playerUnit" : "opponentUnit";

    for (let i = 0; i < LANE_COUNT; i++) {
      if (state.lanes[i][slotKey] !== null) continue; // Occupied
      if (isLaneLegal(card, i)) valid.push(i);
    }

    return valid;
  }
}
