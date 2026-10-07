// ============================================================
//  TLL TimeSlayer — Headless GameEngine
//  100% deterministic, event-driven, strictly typed.
// ============================================================

import {
  Card,
  CardType,
  Keyword,
  LaneType,
  PlayerId,
  TurnPhase,
  Hero,
  UnitInstance,
  LaneState,
  PlayerState,
  GameState,
  GameEvent,
  GameEventType,
  CombatEvent,
  CombatStepResult,
  ActionResult,
  EngineConfig,
  SpellEffect,
  MulliganState,
  AuraModifier,
  StatusEffectType,
} from "./types";
import { createCardInstance } from "./cardInstance";
import { getStaticCardById } from "./cards";

export function isSuperpowerCard(card: Card | { id: string; type?: CardType; tribe?: string; tribes?: readonly string[] }): boolean {
  return (
    card.type === CardType.HeroAbility ||
    card.tribe === "Superpower" ||
    (card.tribes && card.tribes.includes("Superpower")) ||
    card.id.startsWith("SP_")
  );
}

// ─────────────────────────────────────────────────────────────
//  Deterministic PRNG (Mulberry32)
// ─────────────────────────────────────────────────────────────

function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
//  Deep Clone Utility for Immutability & Event Logs
// ─────────────────────────────────────────────────────────────

function cloneUnit(u: UnitInstance | null): UnitInstance | null {
  if (!u) return null;
  return {
    ...u,
    keywords: [...u.keywords],
    attachedEquipment: [...u.attachedEquipment],
    baseKeywords: [...u.baseKeywords],
    auraModifiers: u.auraModifiers.map((m) => ({ ...m })),
  };
}

function cloneLane(lane: LaneState): LaneState {
  const playerFrontline = cloneUnit(lane.playerFrontline);
  const playerSupport = cloneUnit(lane.playerSupport);
  const opponentFrontline = cloneUnit(lane.opponentFrontline);
  const opponentSupport = cloneUnit(lane.opponentSupport);

  const l: LaneState = {
    index: lane.index,
    type: lane.type,
    playerFrontline,
    playerSupport,
    opponentFrontline,
    opponentSupport,
    environment: lane.environment ? { ...lane.environment } : null,
    environmentOwnerId: lane.environmentOwnerId ?? null,
    get playerUnit() {
      return this.playerFrontline ?? this.playerSupport;
    },
    set playerUnit(val: UnitInstance | null) {
      this.playerFrontline = val;
    },
    get opponentUnit() {
      return this.opponentFrontline ?? this.opponentSupport;
    },
    set opponentUnit(val: UnitInstance | null) {
      this.opponentFrontline = val;
    },
  };
  return l;
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    id: p.id,
    hero: p.hero,
    hp: p.hp,
    maxHp: p.maxHp,
    hand: p.hand.map((c) => createCardInstance(c)),
    deck: p.deck.map((c) => createCardInstance(c)),
    graveyard: p.graveyard.map((c) => createCardInstance(c)),
    currentMana: p.currentMana,
    maxMana: p.maxMana,
    superBlock: { ...p.superBlock },
    availableSuperpowers: p.availableSuperpowers.map((c) => createCardInstance(c)),
    fatigueCount: p.fatigueCount,
  };
}

function cloneGameState(s: GameState): GameState {
  return {
    turnNumber: s.turnNumber,
    firstPlayerId: s.firstPlayerId,
    activePlayerId: s.activePlayerId,
    currentPhase: s.currentPhase,
    lanes: [
      cloneLane(s.lanes[0]),
      cloneLane(s.lanes[1]),
      cloneLane(s.lanes[2]),
      cloneLane(s.lanes[3]),
    ],
    player: clonePlayer(s.player),
    opponent: clonePlayer(s.opponent),
    superBlockInterrupt: s.superBlockInterrupt
      ? { ...s.superBlockInterrupt, superpower: { ...s.superBlockInterrupt.superpower } }
      : null,
    combatQueue: s.combatQueue ? { ...s.combatQueue } : null,
    eventLog: [...s.eventLog],
    winner: s.winner,
    isGameOver: s.isGameOver,
    mulliganState: s.mulliganState
      ? {
          p1MulliganHand: s.mulliganState.p1MulliganHand.map((c) => ({ ...c })),
          p2MulliganHand: s.mulliganState.p2MulliganHand.map((c) => ({ ...c })),
          p1Confirmed: s.mulliganState.p1Confirmed,
          p2Confirmed: s.mulliganState.p2Confirmed,
        }
      : null,
  };
}

// ─────────────────────────────────────────────────────────────
//  GameEngine Core Class
// ─────────────────────────────────────────────────────────────

export interface InitializeOptions {
  seed?: number;
  firstPlayerId?: PlayerId;
  startingHandSize?: number;
}

export class GameEngine {
  private config: Required<EngineConfig>;
  private prng: () => number;
  private seq = 0;
  private state!: GameState;

  constructor(config: EngineConfig = {}) {
    const seed = 1337;
    const defaultRng = config.random ?? createMulberry32(seed);

    this.config = {
      random: defaultRng,
      startingHp: config.startingHp ?? 20,
      startingHandSize: config.startingHandSize ?? 4,
      maxHandSize: config.maxHandSize ?? 11,
      maxSuperBlocks: config.maxSuperBlocks ?? 3,
      enableMulligan: config.enableMulligan ?? false,
    };
    this.prng = this.config.random;
  }

  // ── Event Generation ─────────────────────────────────────────

  private emit(
    events: GameEvent[],
    type: GameEventType,
    message: string,
    payload: Record<string, unknown> = {},
  ): GameEvent {
    this.seq += 1;
    const ev: GameEvent = {
      type,
      message,
      payload,
      seq: this.seq,
    };
    events.push(ev);
    return ev;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.prng() * (i + 1));
      const tmp = a[i]!;
      a[i] = a[j]!;
      a[j] = tmp;
    }
    return a;
  }

  // ── Public API ───────────────────────────────────────────────

  public getState(): GameState {
    return cloneGameState(this.state);
  }

  // ─────────────────────────────────────────────────────────────
  //  Mulligan
  // ─────────────────────────────────────────────────────────────

  /**
   * Submits a mulligan decision for one player.
   * - Cards listed in cardIdsToReplace are shuffled back into the deck.
   * - An equal number of new cards are drawn from the top of the deck.
   * - Once both players have confirmed, transitions to Turn 1.
   */
  public confirmMulligan(
    playerId: PlayerId,
    cardIdsToReplace: string[],
  ): ActionResult {
    const s = cloneGameState(this.state);
    const events: GameEvent[] = [];

    if (s.currentPhase !== TurnPhase.MULLIGAN || s.mulliganState === null) {
      return {
        success: false,
        state: this.getState(),
        error: "No active Mulligan phase.",
      };
    }

    const ms = s.mulliganState;
    const isP1 = playerId === PlayerId.Player;

    if (isP1 && ms.p1Confirmed) {
      return { success: false, state: this.getState(), error: "Player 1 already confirmed their mulligan." };
    }
    if (!isP1 && ms.p2Confirmed) {
      return { success: false, state: this.getState(), error: "Player 2 already confirmed their mulligan." };
    }

    const player = isP1 ? s.player : s.opponent;
    const mulliganHand = isP1 ? ms.p1MulliganHand : ms.p2MulliganHand;

    // Validate requested card IDs exist in the mulligan hand (accounting for duplicates)
    const checkRemaining = [...mulliganHand.map((c) => c.id)];
    for (const cardId of cardIdsToReplace) {
      const idx = checkRemaining.indexOf(cardId);
      if (idx === -1) {
        return {
          success: false,
          state: this.getState(),
          error: `Card "${cardId}" not found in ${playerId}'s mulligan hand.`,
        };
      }
      checkRemaining.splice(idx, 1);
    }

    // Separate kept and replaced cards by matching each replacement item once
    const toReplaceRemaining = [...cardIdsToReplace];
    const keptCards: Card[] = [];
    const returnedCards: Card[] = [];

    for (const c of mulliganHand) {
      const idx = toReplaceRemaining.indexOf(c.id);
      if (idx !== -1) {
        returnedCards.push(c);
        toReplaceRemaining.splice(idx, 1);
      } else {
        keptCards.push(c);
      }
    }

    // Return replaced cards to deck and re-shuffle that portion
    player.deck = this.shuffle([...player.deck, ...returnedCards]);

    // Draw replacements
    const replacements: Card[] = [];
    for (let i = 0; i < returnedCards.length; i++) {
      if (player.deck.length > 0) {
        replacements.push(player.deck.shift()!);
      }
    }

    // Final mulligan hand is kept + fresh draws
    const finalHand = [...keptCards, ...replacements];

    // Update mulligan hand in state
    if (isP1) {
      ms.p1MulliganHand = finalHand;
      ms.p1Confirmed = true;
    } else {
      ms.p2MulliganHand = finalHand;
      ms.p2Confirmed = true;
    }

    this.emit(events, GameEventType.MULLIGAN_CONFIRMED, `${playerId} confirmed mulligan (swapped ${returnedCards.length} card(s)).`, {
      playerId,
      swapped: returnedCards.length,
      kept: keptCards.length,
    });

    // Check if both players have confirmed
    if (ms.p1Confirmed && ms.p2Confirmed) {
      // Move final mulligan hands into real player hands
      s.player.hand = [...ms.p1MulliganHand];
      s.opponent.hand = [...ms.p2MulliganHand];
      s.mulliganState = null;

      // Transition to Turn 1
      const nextPhase =
        s.firstPlayerId === PlayerId.Player
          ? TurnPhase.P1_UNIT_PHASE
          : TurnPhase.P2_UNIT_PHASE;
      s.currentPhase = nextPhase;

      this.emit(events, GameEventType.MULLIGAN_COMPLETE, "Mulligan complete. Turn 1 begins!", {});
      this.emit(events, GameEventType.TURN_STARTED, "Turn 1 begins.", { turnNumber: 1 });
      this.emit(events, GameEventType.PHASE_CHANGED, `Phase changed to ${nextPhase}.`, { phase: nextPhase });
    }

    s.eventLog.push(...events);
    this.state = s;
    return { success: true, state: this.getState(), events };
  }

  // ─────────────────────────────────────────────────────────────
  //  Aura Engine
  // ─────────────────────────────────────────────────────────────

  /**
   * Recalculates all AuraModifiers across the entire board.
   * Called after: unit summon, unit death, equipment attach, turn end.
   * Never mutates base stats; only writes to unitInstance.auraModifiers[].
   */
  public recalculateAuras(s: GameState, events: GameEvent[]): void {
    // Collect all live units
    const allUnits: UnitInstance[] = [];
    for (const lane of s.lanes) {
      for (const u of [lane.playerFrontline, lane.playerSupport, lane.opponentFrontline, lane.opponentSupport]) {
        if (u) allUnits.push(u);
      }
    }

    // Reset all aura modifiers first
    for (const u of allUnits) {
      u.auraModifiers = [];
    }

    // For each aura-emitting unit, determine affected units and record modifiers
    for (const source of allUnits) {
      if (!source.auraEffect) continue;
      const aura = source.auraEffect;

      let targets: UnitInstance[] = [];

      if (aura.range === "SAME_LANE") {
        const lane = s.lanes[source.laneIndex];
        targets = [lane.playerFrontline, lane.playerSupport, lane.opponentFrontline, lane.opponentSupport]
          .filter((u): u is UnitInstance => u !== null && u.instanceId !== source.instanceId && u.ownerId === source.ownerId);
      } else if (aura.range === "ADJACENT_LANES") {
        const adjacentIndices = [source.laneIndex - 1, source.laneIndex + 1].filter((i) => i >= 0 && i <= 3);
        for (const idx of adjacentIndices) {
          const lane = s.lanes[idx];
          const laneUnits = [lane.playerFrontline, lane.playerSupport, lane.opponentFrontline, lane.opponentSupport]
            .filter((u): u is UnitInstance => u !== null && u.ownerId === source.ownerId);
          targets.push(...laneUnits);
        }
      } else if (aura.range === "ALL_FRIENDLY") {
        targets = allUnits.filter((u) => u.ownerId === source.ownerId && u.instanceId !== source.instanceId);
      }

      // Apply tribe filter if present
      if (aura.tribeFilter) {
        targets = targets.filter((u) => (u.tribes && u.tribes.includes(aura.tribeFilter!)) || u.tribe === aura.tribeFilter);
      }

      // Write AuraModifier records onto targets
      for (const target of targets) {
        const mod: AuraModifier = {
          sourceInstanceId: source.instanceId,
          attackBonus: aura.attackBonus ?? 0,
          hpBonus: aura.hpBonus ?? 0,
        };
        target.auraModifiers.push(mod);
      }
    }

    // For each lane with an active environment, apply persistent passive benefits to standing units
    for (const lane of s.lanes) {
      if (!lane.environment?.environmentEffect) continue;
      const eff = lane.environment.environmentEffect;
      if (!eff.attackModifier && !eff.hpModifier) continue;

      const laneUnits = [
        lane.playerFrontline,
        lane.playerSupport,
        lane.opponentFrontline,
        lane.opponentSupport,
      ].filter((u): u is UnitInstance => u !== null);

      for (const target of laneUnits) {
        const matchesTribe = !eff.buffTribe || (target.tribes && target.tribes.includes(eff.buffTribe)) || target.tribe === eff.buffTribe;
        if (matchesTribe) {
          const mod: AuraModifier = {
            sourceInstanceId: lane.environment.id,
            attackBonus: eff.attackModifier ?? 0,
            hpBonus: eff.hpModifier ?? 0,
          };
          target.auraModifiers.push(mod);
        }
      }
    }

    this.emit(events, GameEventType.AURA_RECALCULATED, "Aura modifiers recalculated.", {
      auraSourceCount: allUnits.filter((u) => u.auraEffect).length,
    });
  }

  /**
   * Initializes a brand-new game.
   * - 40-card decks shuffled deterministically.
   * - First-player priority randomized or specified.
   * - 4 standard lanes: Lane 0 (Aerial), 1 & 2 (Ground), 3 (Water).
   * - Draws starting hand.
   */
  public initializeGame(
    p1Hero: Hero,
    p1Deck: Card[],
    p2Hero: Hero,
    p2Deck: Card[],
    options: InitializeOptions = {},
  ): GameState {
    if (options.seed !== undefined) {
      this.prng = createMulberry32(options.seed);
    }
    this.seq = 0;
    const events: GameEvent[] = [];

    // Deep clone and decouple all card instances for both decks
    const p1DecoupledDeck = p1Deck.map((c) => createCardInstance(c));
    const p2DecoupledDeck = p2Deck.map((c) => createCardInstance(c));

    // Shuffle 40-card decks
    const p1DeckShuffled = this.shuffle(p1DecoupledDeck);
    const p2DeckShuffled = this.shuffle(p2DecoupledDeck);

    // Randomize first player if not specified
    const firstPlayerId =
      options.firstPlayerId ??
      (this.prng() < 0.5 ? PlayerId.Player : PlayerId.Opponent);

    const initialHandSize = options.startingHandSize ?? this.config.startingHandSize;

    // Draw initial hands
    const p1Hand = p1DeckShuffled.splice(0, initialHandSize);
    const p2Hand = p2DeckShuffled.splice(0, initialHandSize);

    function extractSuperpowers(hero: Hero): Card[] {
      const sps: Card[] = [];
      if (hero.superpowerKit) {
        if (hero.superpowerKit.signatureAbility) sps.push(hero.superpowerKit.signatureAbility);
        if (Array.isArray(hero.superpowerKit.coreAbilities)) {
          for (const a of hero.superpowerKit.coreAbilities) {
            if (a) sps.push(a);
          }
        }
      }
      if (sps.length === 0 && Array.isArray(hero.superpowers)) {
        for (const a of hero.superpowers) {
          if (a) sps.push(a);
        }
      }
      return sps.filter(Boolean);
    }

    const p1Superpowers = extractSuperpowers(p1Hero).map((c) => createCardInstance(c));
    const p2Superpowers = extractSuperpowers(p2Hero).map((c) => createCardInstance(c));

    const p1Hp = p1Hero.maxHp ?? p1Hero.startingHp ?? this.config.startingHp;
    const p2Hp = p2Hero.maxHp ?? p2Hero.startingHp ?? this.config.startingHp;

    const p1State: PlayerState = {
      id: PlayerId.Player,
      hero: p1Hero,
      hp: p1Hp,
      maxHp: p1Hp,
      hand: p1Hand,
      deck: p1DeckShuffled,
      graveyard: [],
      currentMana: 1,
      maxMana: 1,
      superBlock: { charges: 0, triggerCount: 0, superBlockTriggered: false },
      availableSuperpowers: [...p1Superpowers],
      fatigueCount: 0,
    };

    const p2State: PlayerState = {
      id: PlayerId.Opponent,
      hero: p2Hero,
      hp: p2Hp,
      maxHp: p2Hp,
      hand: p2Hand,
      deck: p2DeckShuffled,
      graveyard: [],
      currentMana: 1,
      maxMana: 1,
      superBlock: { charges: 0, triggerCount: 0, superBlockTriggered: false },
      availableSuperpowers: [...p2Superpowers],
      fatigueCount: 0,
    };

    const lanes: [LaneState, LaneState, LaneState, LaneState] = [
      createLaneState(0, LaneType.Aerial),
      createLaneState(1, LaneType.Ground1),
      createLaneState(2, LaneType.Ground2),
      createLaneState(3, LaneType.Water),
    ];

    const initialPhase =
      firstPlayerId === PlayerId.Player
        ? TurnPhase.P1_UNIT_PHASE
        : TurnPhase.P2_UNIT_PHASE;

    // If mulligan is enabled, override initial phase and build mulligan state
    const useMulligan = this.config.enableMulligan ?? false;
    let mulliganState: MulliganState | null = null;
    let startPhase = initialPhase;

    if (useMulligan) {
      // Draw 4 cards into temp mulligan hands (already done above as p1Hand/p2Hand)
      mulliganState = {
        p1MulliganHand: [...p1Hand],
        p2MulliganHand: [...p2Hand],
        p1Confirmed: false,
        p2Confirmed: false,
      };
      // During mulligan the real hands are empty — cards live in mulliganState
      p1State.hand = [];
      p2State.hand = [];
      startPhase = TurnPhase.MULLIGAN;
    }

    this.state = {
      turnNumber: 1,
      firstPlayerId,
      activePlayerId: firstPlayerId,
      currentPhase: startPhase,
      lanes,
      player: p1State,
      opponent: p2State,
      superBlockInterrupt: null,
      combatQueue: null,
      eventLog: [],
      winner: null,
      isGameOver: false,
      mulliganState,
    };

    this.emit(events, GameEventType.GAME_INITIALIZED, "Game initialized.", {
      firstPlayerId,
      initialPhase: startPhase,
      p1Hero: p1Hero.name,
      p2Hero: p2Hero.name,
    });

    if (useMulligan) {
      this.emit(events, GameEventType.MULLIGAN_STARTED, "Mulligan phase began. Both players may swap cards.", {
        p1HandSize: mulliganState!.p1MulliganHand.length,
        p2HandSize: mulliganState!.p2MulliganHand.length,
      });
    } else {
      this.emit(events, GameEventType.TURN_STARTED, "Turn 1 begins.", { turnNumber: 1 });
    }
    this.emit(events, GameEventType.PHASE_CHANGED, `Phase changed to ${startPhase}.`, {
      phase: startPhase,
    });

    this.state.eventLog = events;
    return cloneGameState(this.state);
  }

  /**
   * Plays a card from the active player's hand.
   * Handles:
   * - Shared mana pool deduction.
   * - Lane capacity (1 unit default; 2 units only with Support keyword).
   * - Lane type restrictions (Lane 0 Aerial requires Flying; Lane 3 Water requires Amphibious).
   * - Environments (Ground lanes 1 & 2 only; overwriting destroys old).
   * - Equipment (attached directly to friendly unit).
   * - Rush keyword (attacks opposing unit or enemy Hero immediately on placement).
   */
  public playCard(
    playerId: PlayerId,
    cardId: string,
    laneIndex?: number,
    targetInstanceId?: string,
    slotType?: "frontline" | "support",
  ): ActionResult {
    const s = cloneGameState(this.state);
    const events: GameEvent[] = [];

    if (s.isGameOver) {
      return { success: false, state: this.getState(), error: "Game is already over." };
    }

    if (s.superBlockInterrupt !== null) {
      return {
        success: false,
        state: this.getState(),
        error: "Cannot play cards while a Super-Block decision is pending.",
      };
    }

    // ── Phase Validation ─────────────────────────────────────────
    const currentPhase = s.currentPhase;
    const isP1 = playerId === PlayerId.Player;

    if (currentPhase === TurnPhase.P1_UNIT_PHASE && !isP1) {
      return { success: false, state: this.getState(), error: "It is Player 1's Unit Phase." };
    }
    if (currentPhase === TurnPhase.P2_UNIT_PHASE && isP1) {
      return { success: false, state: this.getState(), error: "It is Player 2's Unit Phase." };
    }
    if (currentPhase === TurnPhase.P1_SPELL_PHASE && !isP1) {
      return { success: false, state: this.getState(), error: "It is Player 1's Spell Phase." };
    }
    if (currentPhase === TurnPhase.P2_SPELL_PHASE && isP1) {
      return { success: false, state: this.getState(), error: "It is Player 2's Spell Phase." };
    }
    if (currentPhase === TurnPhase.COMBAT_PHASE || currentPhase === TurnPhase.TURN_END) {
      return { success: false, state: this.getState(), error: "Cannot play cards during Combat or Turn End." };
    }

    const player = isP1 ? s.player : s.opponent;
    const cardIdx = player.hand.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) {
      return { success: false, state: this.getState(), error: `Card ${cardId} not in hand.` };
    }

    const card = player.hand[cardIdx]!;

    // ── Superpower / Hero Ability Usage Restrictions ──────────────
    // Superpower cards can ONLY be cast during that player's SPELL_PHASE:
    // P1_SPELL_PHASE for Player 1, P2_SPELL_PHASE for Player 2.
    const isSuperpower =
      card.type === CardType.HeroAbility ||
      card.tribe === "Superpower" ||
      card.id.startsWith("SP_");

    const isPlayerSpellPhase = isP1
      ? currentPhase === TurnPhase.P1_SPELL_PHASE
      : currentPhase === TurnPhase.P2_SPELL_PHASE;

    if (isSuperpower && !isPlayerSpellPhase) {
      return {
        success: false,
        state: this.getState(),
        error: `Superpower cards can only be cast during your Spell Phase. Current phase: ${currentPhase}.`,
      };
    }

    // Phase / card type compatibility
    const isUnitPhase =
      currentPhase === TurnPhase.P1_UNIT_PHASE || currentPhase === TurnPhase.P2_UNIT_PHASE;
    const isSpellPhase =
      currentPhase === TurnPhase.P1_SPELL_PHASE || currentPhase === TurnPhase.P2_SPELL_PHASE;

    if (isUnitPhase && (card.type === CardType.Spell || isSuperpower)) {
      return {
        success: false,
        state: this.getState(),
        error: `Spells and Superpowers cannot be cast during Unit Phase; "${card.name}" must be played during Spell Phase.`,
      };
    }
    if (isSpellPhase && card.type === CardType.Unit && !isSuperpower) {
      return {
        success: false,
        state: this.getState(),
        error: `Spell Phase does not accept Unit cards; play units during Unit Phase.`,
      };
    }

    // ── Unified Targeting Validation ──────────────────────────────
    const targetType = card.targetType ?? "NONE";
    const opponent = isP1 ? s.opponent : s.player;

    if (targetType === "FRIENDLY_UNIT" || targetType === "SINGLE_UNIT") {
      if (!targetInstanceId) {
        return { success: false, state: this.getState(), error: `"${card.name}" requires a target unit (targetInstanceId missing).` };
      }
      const tUnit = this.findUnitById(s, targetInstanceId);
      if (!tUnit) {
        return { success: false, state: this.getState(), error: `Target unit "${targetInstanceId}" not found on board.` };
      }
      if (targetType === "FRIENDLY_UNIT" && tUnit.ownerId !== playerId) {
        return { success: false, state: this.getState(), error: `"${card.name}" must target a friendly unit.` };
      }
    }

    if (targetType === "ENEMY_UNIT") {
      if (!targetInstanceId) {
        return { success: false, state: this.getState(), error: `"${card.name}" requires an enemy unit target.` };
      }
      const tUnit = this.findUnitById(s, targetInstanceId);
      if (!tUnit || tUnit.ownerId === playerId) {
        return { success: false, state: this.getState(), error: `"${card.name}" must target an enemy unit.` };
      }
    }

    if (targetType === "ENEMY_HERO" && targetInstanceId) {
      // targetInstanceId may carry a heroId string for clarity, just validate concept
    }

    // ── Mana Pool Check ──────────────────────────────────────────
    if (card.cost > player.currentMana) {
      return {
        success: false,
        state: this.getState(),
        error: `Not enough mana: "${card.name}" costs ${card.cost}, but only ${player.currentMana} available.`,
        reason: "INSUFFICIENT_MANA",
      };
    }

    // ── Placement & Capacity Validation (Before any state mutation) ──
    let isSupportPlacement = false;

    if (card.type === CardType.Unit) {
      if (laneIndex === undefined || laneIndex < 0 || laneIndex > 3) {
        return { success: false, state: this.getState(), error: "Unit placement requires a valid laneIndex (0-3)." };
      }

      const lane = s.lanes[laneIndex];

      // Lane restriction validation
      const hasAerial = card.keywords.some((k) => k === Keyword.Aerial || (k as string) === "อากาศยาน" || (k as string) === "FLYING");
      const hasNaval = card.keywords.some((k) => k === Keyword.Naval || (k as string) === "กองเรือ" || (k as string) === "AMPHIBIOUS");
      const hasSupport = card.keywords.some((k) => k === Keyword.Support || (k as string) === "สนับสนุน" || (k as string) === "SUPPORT");

      if (lane.type === LaneType.Aerial && !hasAerial) {
        return { success: false, state: this.getState(), error: `Lane 0 (Aerial) requires the 'อากาศยาน' (Aerial) keyword.` };
      }
      if (lane.type === LaneType.Water && !hasNaval) {
        return { success: false, state: this.getState(), error: `Lane 3 (Water) requires the 'กองเรือ' (Naval/Amphibious) keyword.` };
      }
      if (card.laneTypeRestriction && card.laneTypeRestriction !== lane.type) {
        return { success: false, state: this.getState(), error: `"${card.name}" cannot be placed in ${lane.type}.` };
      }

      // Flexible Support Slot Placement
      const frontline = isP1 ? lane.playerFrontline : lane.opponentFrontline;
      const support = isP1 ? lane.playerSupport : lane.opponentSupport;

      if (slotType === "support") {
        if (!hasSupport) {
          return {
            success: false,
            state: this.getState(),
            error: `"${card.name}" does not have the 'สนับสนุน' (Support) keyword and cannot be placed into the Support slot.`,
          };
        }
        if (support !== null) {
          return {
            success: false,
            state: this.getState(),
            error: `Lane ${laneIndex} Support slot is already occupied.`,
          };
        }
        isSupportPlacement = true;
      } else if (slotType === "frontline") {
        if (frontline !== null) {
          return {
            success: false,
            state: this.getState(),
            error: `Lane ${laneIndex} Frontline slot is already occupied.`,
          };
        }
        isSupportPlacement = false;
      } else {
        // Auto-assign: frontline if empty, else support if unit has Support keyword
        if (frontline === null) {
          isSupportPlacement = false;
        } else if (support === null) {
          if (!hasSupport) {
            return {
              success: false,
              state: this.getState(),
              error: `Lane ${laneIndex} already has a unit. Only units with the 'สนับสนุน' (Support) keyword can share a lane.`,
            };
          }
          isSupportPlacement = true;
        } else {
          return {
            success: false,
            state: this.getState(),
            error: `Lane ${laneIndex} is at maximum capacity (2 units).`,
          };
        }
      }
    } else if (card.type === CardType.Environment) {
      if (laneIndex === undefined || (laneIndex !== 1 && laneIndex !== 2)) {
        return {
          success: false,
          state: this.getState(),
          error: "Environment cards can only be placed on Ground lanes (Lane 1 or Lane 2).",
        };
      }
    } else if (card.type === CardType.Equipment) {
      if (!targetInstanceId) {
        return { success: false, state: this.getState(), error: "Equipment cards require a target friendly unit instance." };
      }

      const targetUnit = this.findUnitById(s, targetInstanceId);
      if (!targetUnit || targetUnit.ownerId !== playerId) {
        return { success: false, state: this.getState(), error: "Target friendly unit not found." };
      }
    }

    // Suppress unused variable warning; used in targeting branch above
    void opponent;

    // ── ALL PRE-CHECKS PASSED: NOW MUTATE STATE ──────────────────
    // Deduct mana
    const manaBefore = player.currentMana;
    player.currentMana -= card.cost;
    this.emit(events, GameEventType.MANA_CHANGED, `${playerId} spent ${card.cost} mana.`, {
      playerId,
      manaBefore,
      manaAfter: player.currentMana,
    });

    // Remove from hand
    player.hand.splice(cardIdx, 1);
    this.emit(events, GameEventType.CARD_PLAYED, `${playerId} played "${card.name}".`, {
      playerId,
      cardId: card.id,
      cardName: card.name,
      cardType: card.type,
      cost: card.cost,
    });

    // ── Execute Card Type Logic ──────────────────────────────────
    if (card.type === CardType.Unit) {
      const targetLane = laneIndex!;
      const lane = s.lanes[targetLane];

      const tribes = card.tribes && card.tribes.length > 0 ? [...card.tribes] : (card.tribe ? [card.tribe] : ["เป็นกลาง"]);
      const unitInstance: UnitInstance = {
        instanceId: `unit_${Date.now()}_${Math.floor(this.prng() * 100000)}`,
        cardId: card.id,
        ownerId: playerId,
        laneIndex: targetLane,
        name: card.name,
        tribes,
        tribe: tribes[0] || card.tribe || "เป็นกลาง",
        baseKeywords: [...card.keywords],
        keywords: [...card.keywords],
        attack: card.attack,
        maxHp: card.hp,
        currentHp: card.hp,
        hasAttackedThisTurn: false,
        summonedThisTurn: true,
        isSupport: isSupportPlacement,
        attachedEquipment: [],
        isFrozen: false,
        hasShield: false,
        isDeadly: false,
        auraModifiers: [],
        ...(card.deathrattleEffect ? { deathrattleEffect: card.deathrattleEffect } : {}),
        ...(card.auraEffect ? { auraEffect: card.auraEffect } : {}),
      };

      if (isP1) {
        if (!isSupportPlacement) lane.playerFrontline = unitInstance;
        else lane.playerSupport = unitInstance;
      } else {
        if (!isSupportPlacement) lane.opponentFrontline = unitInstance;
        else lane.opponentSupport = unitInstance;
      }

      this.emit(events, GameEventType.UNIT_SUMMONED, `${playerId} summoned "${unitInstance.name}" into Lane ${targetLane} (${isSupportPlacement ? "Support" : "Frontline"}).`, {
        playerId,
        instanceId: unitInstance.instanceId,
        cardId: card.id,
        name: unitInstance.name,
        laneIndex: targetLane,
        isSupport: isSupportPlacement,
        attack: unitInstance.attack,
        hp: unitInstance.currentHp,
      });

      // Recalculate auras after new unit placement
      this.recalculateAuras(s, events);

      // Rush Keyword Execution: attacks immediately upon placement
      const hasRush = unitInstance.keywords.some((k) => k === Keyword.Rush || (k as string) === "จู่โจม" || (k as string) === "RUSH");
      if (hasRush) {
        this.emit(events, GameEventType.RUSH_ATTACK, `"${unitInstance.name}" activates Rush (จู่โจม)!`, {
          instanceId: unitInstance.instanceId,
          laneIndex: targetLane,
        });
        this.resolveSingleAttacker(s, unitInstance, targetLane, events);
      }
    } else if (card.type === CardType.Environment) {
      const envLane = laneIndex!;
      const lane = s.lanes[envLane];
      if (lane.environment !== null) {
        const oldEnv = lane.environment;
        const oldOwnerId = lane.environmentOwnerId ?? (playerId === PlayerId.Player ? PlayerId.Opponent : PlayerId.Player);
        const oldOwnerState = oldOwnerId === PlayerId.Player ? s.player : s.opponent;
        if (!isSuperpowerCard(oldEnv)) {
          oldOwnerState.graveyard.push(createCardInstance(oldEnv));
          this.emit(events, GameEventType.CARD_SENT_TO_GRAVEYARD, `Environment "${oldEnv.name}" was sent to ${oldOwnerId}'s graveyard.`, {
            playerId: oldOwnerId,
            cardId: oldEnv.id,
            cardName: oldEnv.name,
          });
        }
        this.emit(events, GameEventType.ENVIRONMENT_DESTROYED, `Previous environment "${oldEnv.name}" was destroyed in Lane ${envLane}.`, {
          laneIndex: envLane,
          environmentId: oldEnv.id,
          name: oldEnv.name,
        });
      }

      lane.environment = card;
      lane.environmentOwnerId = playerId;
      this.emit(events, GameEventType.ENVIRONMENT_PLACED, `Environment "${card.name}" placed in Lane ${envLane}.`, {
        playerId,
        laneIndex: envLane,
        environmentId: card.id,
        name: card.name,
      });

      // Recalculate persistent passive environment benefits
      this.recalculateAuras(s, events);
    } else if (card.type === CardType.Equipment) {
      if (!targetInstanceId) {
        return { success: false, state: this.getState(), error: "Equipment cards require a target friendly unit instance." };
      }

      const targetUnit = this.findUnitById(s, targetInstanceId);
      if (!targetUnit || targetUnit.ownerId !== playerId) {
        return { success: false, state: this.getState(), error: "Target friendly unit not found." };
      }

      const eff = card.equipmentEffect ?? { attackBonus: 0, hpBonus: 0 };
      targetUnit.attack += eff.attackBonus;
      targetUnit.maxHp += eff.hpBonus;
      targetUnit.currentHp += eff.hpBonus;
      if (eff.grantedKeywords) {
        for (const kw of eff.grantedKeywords) {
          if (!targetUnit.keywords.includes(kw)) targetUnit.keywords.push(kw);
        }
      }
      // Apply status from equipment
      if (eff.grantedStatus) {
        this.applyStatusEffect(targetUnit, eff.grantedStatus, events);
      }
      targetUnit.attachedEquipment.push(card);

      this.emit(events, GameEventType.EQUIPMENT_ATTACHED, `Attached "${card.name}" to "${targetUnit.name}" (+${eff.attackBonus}/+${eff.hpBonus}).`, {
        playerId,
        equipmentId: card.id,
        targetInstanceId,
        attackBonus: eff.attackBonus,
        hpBonus: eff.hpBonus,
      });

      // Recalculate auras (aura source stats may have changed)
      this.recalculateAuras(s, events);
    } else if (card.type === CardType.Spell || card.type === CardType.HeroAbility) {
      if (card.spellEffect) {
        this.resolveSpellEffect(s, playerId, card.spellEffect, laneIndex, targetInstanceId, events);
      }
      // Spent regular spells go to graveyard (Hero Superpowers are banished/disposed permanently)
      if (!isSuperpowerCard(card)) {
        player.graveyard.push(createCardInstance(card));
        this.emit(events, GameEventType.CARD_SENT_TO_GRAVEYARD, `"${card.name}" was sent to ${playerId}'s graveyard.`, {
          playerId,
          cardId: card.id,
        });
      }
    }

    this.checkDeaths(s, events);
    this.checkWinLoss(s, events);

    s.eventLog.push(...events);
    this.state = s;
    return { success: true, state: this.getState(), events };
  }

  /**
   * Responds to an active SUPER_BLOCK_INTERRUPT.
   * - 'CAST': Casts the presented Superpower immediately for 0 cost.
   * - 'KEEP': Adds the Superpower to player hand, bypassing hand limit (11+ allowed).
   */
  public handleSuperBlockDecision(
    playerId: PlayerId,
    action: "CAST" | "KEEP",
    targetLaneIndex?: number,
    targetInstanceId?: string,
  ): ActionResult {
    const s = cloneGameState(this.state);
    const events: GameEvent[] = [];

    if (!s.superBlockInterrupt || !s.superBlockInterrupt.active) {
      return { success: false, state: this.getState(), error: "No Super-Block interrupt is active." };
    }
    if (s.superBlockInterrupt.playerId !== playerId) {
      return { success: false, state: this.getState(), error: `Only ${s.superBlockInterrupt.playerId} can resolve this Super-Block.` };
    }

    const superpower = s.superBlockInterrupt.superpower;
    const player = playerId === PlayerId.Player ? s.player : s.opponent;

    if (action === "CAST") {
      this.emit(events, GameEventType.SUPER_BLOCK_RESOLVED, `${playerId} chose to CAST "${superpower.name}" immediately for 0 cost!`, {
        playerId,
        action,
        superpowerId: superpower.id,
      });

      if (superpower.type === CardType.Unit) {
        if (targetLaneIndex !== undefined && targetLaneIndex >= 0 && targetLaneIndex <= 3) {
          const lane = s.lanes[targetLaneIndex];
          const isP1 = playerId === PlayerId.Player;
          const frontline = isP1 ? lane.playerFrontline : lane.opponentFrontline;
          const support = isP1 ? lane.playerSupport : lane.opponentSupport;

          let isSupport = false;
          if (!frontline) isSupport = false;
          else if (!support && superpower.keywords.includes(Keyword.Support)) isSupport = true;

          const tribes = superpower.tribes && superpower.tribes.length > 0 ? [...superpower.tribes] : (superpower.tribe ? [superpower.tribe] : ["เป็นกลาง"]);
          const unit: UnitInstance = {
            instanceId: `super_${Date.now()}_${Math.floor(this.prng() * 100000)}`,
            cardId: superpower.id,
            ownerId: playerId,
            laneIndex: targetLaneIndex,
            name: superpower.name,
            tribes,
            tribe: tribes[0] || superpower.tribe || "เป็นกลาง",
            baseKeywords: [...superpower.keywords],
            keywords: [...superpower.keywords],
            attack: superpower.attack,
            maxHp: superpower.hp,
            currentHp: superpower.hp,
            hasAttackedThisTurn: false,
            summonedThisTurn: true,
            isSupport,
            attachedEquipment: [],
            isFrozen: false,
            hasShield: false,
            isDeadly: false,
            auraModifiers: [],
          };

          if (isP1) {
            if (!isSupport) lane.playerFrontline = unit;
            else lane.playerSupport = unit;
          } else {
            if (!isSupport) lane.opponentFrontline = unit;
            else lane.opponentSupport = unit;
          }
          this.emit(events, GameEventType.UNIT_SUMMONED, `Summoned Superpower unit "${unit.name}".`, {
            instanceId: unit.instanceId,
            laneIndex: targetLaneIndex,
          });
        }
      } else if (superpower.spellEffect) {
        this.resolveSpellEffect(s, playerId, superpower.spellEffect, targetLaneIndex, targetInstanceId, events);
      }
    } else {
      // KEEP: Bypasses hand limit
      player.hand.push(superpower);
      this.emit(events, GameEventType.SUPER_BLOCK_RESOLVED, `${playerId} kept "${superpower.name}" in hand (bypassing hand limit).`, {
        playerId,
        action,
        superpowerId: superpower.id,
        handSize: player.hand.length,
      });
      this.emit(events, GameEventType.CARD_DRAWN, `Added "${superpower.name}" to hand.`, {
        playerId,
        cardId: superpower.id,
      });
    }

    s.superBlockInterrupt = null;
    this.checkDeaths(s, events);
    this.checkWinLoss(s, events);

    s.eventLog.push(...events);
    this.state = s;
    return { success: true, state: this.getState(), events };
  }

  /**
   * Resolves a single step of the combat phase (e.g. Lane 0 -> Lane 3).
   * Emits detailed event logs suitable for 3D animation synchronization.
   * If a Super-Block is triggered, pauses and yields control.
   */
  public resolveCombatStep(): CombatStepResult {
    const s = cloneGameState(this.state);
    const events: CombatEvent[] = [];

    if (s.isGameOver) {
      return { done: true, laneIndex: 3, events, state: this.getState() };
    }

    if (s.superBlockInterrupt !== null) {
      return {
        done: false,
        laneIndex: s.combatQueue?.currentLaneIndex ?? 0,
        events,
        state: this.getState(),
        interruptedBySuperBlock: true,
      };
    }

    if (s.currentPhase !== TurnPhase.COMBAT_PHASE) {
      return { done: true, laneIndex: 3, events, state: this.getState() };
    }

    if (!s.combatQueue) {
      s.combatQueue = {
        currentLaneIndex: 0,
        currentStrike: 1,
        phaseStep: "STRIKE_1",
      };
    }

    const laneIdx = s.combatQueue.currentLaneIndex;
    if (laneIdx >= 4) {
      s.combatQueue = null;
      s.eventLog.push(...events);
      this.state = s;
      return { done: true, laneIndex: 3, events, state: this.getState() };
    }

    const lane = s.lanes[laneIdx];
    const strike = s.combatQueue.currentStrike;

    if (strike === 1) {
      this.emit(events, GameEventType.COMBAT_LANE_STARTED, `Combat beginning in Lane ${laneIdx} (${lane.type}).`, {
        laneIndex: laneIdx,
        strike: 1,
      });
    }

    // ── Execute Clash in Current Lane ────────────────────────────
    this.resolveLaneClash(s, laneIdx, strike, events);

    // Check if Super-Block occurred during this strike
    if (s.superBlockInterrupt !== null) {
      s.eventLog.push(...events);
      this.state = s;
      return {
        done: false,
        laneIndex: laneIdx,
        events,
        state: this.getState(),
        interruptedBySuperBlock: true,
      };
    }

    // Check for DoubleStrike / Overkill units surviving into Strike 2
    if (strike === 1) {
      const pUnits = [lane.playerFrontline, lane.playerSupport].filter(Boolean) as UnitInstance[];
      const oUnits = [lane.opponentFrontline, lane.opponentSupport].filter(Boolean) as UnitInstance[];
      const hasDoubleStrike = [...pUnits, ...oUnits].some((u) =>
        u.keywords.some((k) => k === Keyword.Overkill || (k as string) === "โจมตีต่อเนื่อง" || (k as string) === "DOUBLE_STRIKE")
      );

      if (hasDoubleStrike) {
        s.combatQueue.currentStrike = 2;
        s.combatQueue.phaseStep = "STRIKE_2";
        s.eventLog.push(...events);
        this.state = s;
        return { done: false, laneIndex: laneIdx, events, state: this.getState() };
      }
    }

    // Strike done for this lane — advance to next lane
    this.emit(events, GameEventType.COMBAT_LANE_ENDED, `Combat ended in Lane ${laneIdx}.`, {
      laneIndex: laneIdx,
    });

    s.combatQueue.currentLaneIndex += 1;
    s.combatQueue.currentStrike = 1;
    s.combatQueue.phaseStep = "STRIKE_1";

    const done = s.combatQueue.currentLaneIndex >= 4;
    if (done) {
      s.combatQueue = null;
    }

    this.checkWinLoss(s, events);
    s.eventLog.push(...events);
    this.state = s;

    return {
      done,
      laneIndex: laneIdx,
      events,
      state: this.getState(),
    };
  }

  /**
   * Dedicated action to pass or skip an active turn phase (Unit or Spell phase).
   * Advances the engine state immediately to the next phase.
   */
  public passAction(playerId: PlayerId): ActionResult {
    const s = this.state;
    if (s.isGameOver) {
      return { success: false, state: this.getState(), error: "Game is already over." };
    }
    if (s.superBlockInterrupt !== null) {
      return {
        success: false,
        state: this.getState(),
        error: "Cannot pass while a Super-Block decision is pending.",
      };
    }

    const isP1 = playerId === PlayerId.Player;
    const isPlayerPhase =
      (s.currentPhase === TurnPhase.P1_UNIT_PHASE && isP1) ||
      (s.currentPhase === TurnPhase.P2_UNIT_PHASE && !isP1) ||
      (s.currentPhase === TurnPhase.P1_SPELL_PHASE && isP1) ||
      (s.currentPhase === TurnPhase.P2_SPELL_PHASE && !isP1);

    if (!isPlayerPhase) {
      return {
        success: false,
        state: this.getState(),
        error: `It is not ${playerId}'s active phase to pass. Current phase: ${s.currentPhase}.`,
      };
    }

    return this.advancePhase();
  }

  /**
   * Advances the finite state machine to the next phase:
   * P1_UNIT_PHASE -> P2_UNIT_PHASE -> P1_SPELL_PHASE -> P2_SPELL_PHASE -> COMBAT_PHASE -> TURN_END.
   * At TURN_END: draws 1 card, increments turn number, increases max mana (+1) and replenishes.
   */
  public advancePhase(): ActionResult {
    const s = cloneGameState(this.state);
    const events: GameEvent[] = [];

    if (s.isGameOver) {
      return { success: false, state: this.getState(), error: "Game is already over." };
    }

    if (s.superBlockInterrupt !== null) {
      return {
        success: false,
        state: this.getState(),
        error: "Cannot advance phase while a Super-Block decision is pending.",
      };
    }

    const prevPhase = s.currentPhase;
    let nextPhase: TurnPhase;

    switch (prevPhase) {
      case TurnPhase.P1_UNIT_PHASE:
        nextPhase = TurnPhase.P2_UNIT_PHASE;
        s.activePlayerId = PlayerId.Opponent;
        break;
      case TurnPhase.P2_UNIT_PHASE:
        nextPhase = TurnPhase.P1_SPELL_PHASE;
        s.activePlayerId = PlayerId.Player;
        break;
      case TurnPhase.P1_SPELL_PHASE:
        nextPhase = TurnPhase.P2_SPELL_PHASE;
        s.activePlayerId = PlayerId.Opponent;
        break;
      case TurnPhase.P2_SPELL_PHASE:
        nextPhase = TurnPhase.COMBAT_PHASE;
        s.activePlayerId = s.firstPlayerId;
        s.combatQueue = {
          currentLaneIndex: 0,
          currentStrike: 1,
          phaseStep: "STRIKE_1",
        };
        break;
      case TurnPhase.COMBAT_PHASE:
        nextPhase = TurnPhase.TURN_END;
        s.combatQueue = null;
        break;
      case TurnPhase.TURN_END:
        // Transition to next turn
        return this.startNextTurn(s, events);
      default:
        nextPhase = TurnPhase.P1_UNIT_PHASE;
    }

    s.currentPhase = nextPhase;
    this.emit(events, GameEventType.PHASE_CHANGED, `Phase transitioned from ${prevPhase} to ${nextPhase}.`, {
      prevPhase,
      nextPhase,
    });

    s.eventLog.push(...events);
    this.state = s;
    return { success: true, state: this.getState(), events };
  }

  // ── Combat Internal Logic ────────────────────────────────────

  private resolveLaneClash(
    s: GameState,
    laneIdx: number,
    strikeNumber: 1 | 2,
    events: CombatEvent[],
  ): void {
    const lane = s.lanes[laneIdx];
    const playerAttackers = [lane.playerFrontline, lane.playerSupport].filter(Boolean) as UnitInstance[];
    const opponentAttackers = [lane.opponentFrontline, lane.opponentSupport].filter(Boolean) as UnitInstance[];

    // In Strike 2, only units with DoubleStrike / Overkill attack
    // Also filter out frozen units (they skip their attack this strike)
    const canAttackInStrike = (u: UnitInstance) => {
      if (strikeNumber === 1) return true;
      return u.keywords.some((k) => k === Keyword.Overkill || (k as string) === "โจมตีต่อเนื่อง" || (k as string) === "DOUBLE_STRIKE");
    };

    const activePlayerAttackers = playerAttackers.filter((u) => {
      if (u.isFrozen && strikeNumber === 1) {
        u.isFrozen = false; // Unfreeze after skipping
        this.emit(events, GameEventType.STATUS_FREEZE_SKIPPED, `"${u.name}" is Frozen and skips its attack!`, {
          instanceId: u.instanceId,
        });
        return false;
      }
      return canAttackInStrike(u);
    });
    const activeOpponentAttackers = opponentAttackers.filter((u) => {
      if (u.isFrozen && strikeNumber === 1) {
        u.isFrozen = false;
        this.emit(events, GameEventType.STATUS_FREEZE_SKIPPED, `"${u.name}" is Frozen and skips its attack!`, {
          instanceId: u.instanceId,
        });
        return false;
      }
      return canAttackInStrike(u);
    });

    // Queue of pending damages to apply simultaneously
    interface PendingDamage {
      targetType: "UNIT" | "HERO";
      unit?: UnitInstance;
      heroPlayerId?: PlayerId;
      damage: number;
      attackerId: string;
      attackerName: string;
      attackerOwnerId?: PlayerId;
      attackerHasLifesteal?: boolean;
      isStrikethrough: boolean;
      attackerIsDeadly: boolean;
    }

    const pendingDamages: PendingDamage[] = [];

    const getEffectiveAtk = (unit: UnitInstance): number => {
      const bonus = unit.auraModifiers ? unit.auraModifiers.reduce((acc, m) => acc + m.attackBonus, 0) : 0;
      return Math.max(0, unit.attack + bonus);
    };

    // 1. Calculate Player units attacking Opponent side
    for (const u of activePlayerAttackers) {
      const atk = getEffectiveAtk(u);
      if (atk <= 0) continue;
      this.emit(events, GameEventType.UNIT_ATTACKED, `"${u.name}" attacks in Lane ${laneIdx} (Strike ${strikeNumber}).`, {
        attackerId: u.instanceId,
        attack: atk,
        laneIndex: laneIdx,
        strikeNumber,
      });

      const oppFront = lane.opponentFrontline;
      const oppSupp = lane.opponentSupport;
      const hasStrikethrough = u.keywords.some((k) => k === Keyword.Strikethrough || (k as string) === "เกลียดชังตำนาน" || (k as string) === "STRIKETHROUGH");
      const hasLifesteal = u.keywords.some((k) => k === Keyword.Lifesteal || (k as string) === "กลืนชีพ" || (k as string) === "LIFESTEAL");

      if (hasStrikethrough) {
        if (oppFront) {
          pendingDamages.push({ targetType: "UNIT", unit: oppFront, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: true, attackerIsDeadly: u.isDeadly });
        }
        if (oppSupp) {
          pendingDamages.push({ targetType: "UNIT", unit: oppSupp, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: true, attackerIsDeadly: u.isDeadly });
        }
        pendingDamages.push({ targetType: "HERO", heroPlayerId: PlayerId.Opponent, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: true, attackerIsDeadly: false });
        this.emit(events, GameEventType.STRIKETHROUGH_HIT, `"${u.name}" strikes through (เกลียดชังตำนาน) to enemy hero for ${atk} damage!`, {
          attackerId: u.instanceId,
          damage: atk,
        });
      } else {
        if (oppFront) {
          pendingDamages.push({ targetType: "UNIT", unit: oppFront, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: false, attackerIsDeadly: u.isDeadly });
        } else if (oppSupp) {
          pendingDamages.push({ targetType: "UNIT", unit: oppSupp, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: false, attackerIsDeadly: u.isDeadly });
        } else {
          pendingDamages.push({ targetType: "HERO", heroPlayerId: PlayerId.Opponent, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: false, attackerIsDeadly: false });
        }
      }
    }

    // 2. Calculate Opponent units attacking Player side (Simultaneous!)
    for (const u of activeOpponentAttackers) {
      const atk = getEffectiveAtk(u);
      if (atk <= 0) continue;
      this.emit(events, GameEventType.UNIT_ATTACKED, `"${u.name}" attacks in Lane ${laneIdx} (Strike ${strikeNumber}).`, {
        attackerId: u.instanceId,
        attack: atk,
        laneIndex: laneIdx,
        strikeNumber,
      });

      const plFront = lane.playerFrontline;
      const plSupp = lane.playerSupport;
      const hasStrikethrough = u.keywords.some((k) => k === Keyword.Strikethrough || (k as string) === "เกลียดชังตำนาน" || (k as string) === "STRIKETHROUGH");
      const hasLifesteal = u.keywords.some((k) => k === Keyword.Lifesteal || (k as string) === "กลืนชีพ" || (k as string) === "LIFESTEAL");

      if (hasStrikethrough) {
        if (plFront) {
          pendingDamages.push({ targetType: "UNIT", unit: plFront, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: true, attackerIsDeadly: u.isDeadly });
        }
        if (plSupp) {
          pendingDamages.push({ targetType: "UNIT", unit: plSupp, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: true, attackerIsDeadly: u.isDeadly });
        }
        pendingDamages.push({ targetType: "HERO", heroPlayerId: PlayerId.Player, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: true, attackerIsDeadly: false });
        this.emit(events, GameEventType.STRIKETHROUGH_HIT, `"${u.name}" strikes through (เกลียดชังตำนาน) to player hero for ${atk} damage!`, {
          attackerId: u.instanceId,
          damage: atk,
        });
      } else {
        if (plFront) {
          pendingDamages.push({ targetType: "UNIT", unit: plFront, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: false, attackerIsDeadly: u.isDeadly });
        } else if (plSupp) {
          pendingDamages.push({ targetType: "UNIT", unit: plSupp, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: false, attackerIsDeadly: u.isDeadly });
        } else {
          pendingDamages.push({ targetType: "HERO", heroPlayerId: PlayerId.Player, damage: atk, attackerId: u.instanceId, attackerName: u.name, attackerOwnerId: u.ownerId, attackerHasLifesteal: hasLifesteal, isStrikethrough: false, attackerIsDeadly: false });
        }
      }
    }

    // 3. Apply Damages simultaneously
    for (const dmg of pendingDamages) {
      let dealt = 0;
      if (dmg.targetType === "UNIT" && dmg.unit) {
        dealt = this.applyDamageToUnit(dmg.unit, dmg.damage, events, dmg.attackerIsDeadly);
      } else if (dmg.targetType === "HERO" && dmg.heroPlayerId) {
        dealt = this.applyDamageToHero(s, dmg.heroPlayerId, dmg.damage, dmg.attackerId, laneIdx, events);
        if (s.superBlockInterrupt !== null) {
          break;
        }
      }

      // Lifesteal (กลืนชีพ) trigger
      if (dmg.attackerHasLifesteal && dmg.attackerOwnerId && dealt > 0) {
        const ownerState = dmg.attackerOwnerId === PlayerId.Player ? s.player : s.opponent;
        const oldHp = ownerState.hp;
        ownerState.hp = Math.min(ownerState.maxHp, ownerState.hp + dealt);
        const healed = ownerState.hp - oldHp;
        if (healed > 0) {
          this.emit(events, GameEventType.HERO_HEALED, `"${dmg.attackerName}" with Lifesteal (กลืนชีพ) healed ${dmg.attackerOwnerId} for ${healed} HP (${oldHp} -> ${ownerState.hp}/${ownerState.maxHp}).`, {
            playerId: dmg.attackerOwnerId,
            amount: healed,
            currentHp: ownerState.hp,
          });
        }
      }
    }

    // 4. Resolve casualties and deathrattle cascades
    this.checkDeaths(s, events);
  }

  private resolveSingleAttacker(
    s: GameState,
    u: UnitInstance,
    laneIdx: number,
    events: GameEvent[],
  ): void {
    const isP1 = u.ownerId === PlayerId.Player;
    const lane = s.lanes[laneIdx];
    const oppFront = isP1 ? lane.opponentFrontline : lane.playerFrontline;
    const oppSupp = isP1 ? lane.opponentSupport : lane.playerSupport;
    const enemyHeroId = isP1 ? PlayerId.Opponent : PlayerId.Player;
    const bonus = u.auraModifiers ? u.auraModifiers.reduce((acc, m) => acc + m.attackBonus, 0) : 0;
    const atk = Math.max(0, u.attack + bonus);

    if (u.keywords.includes(Keyword.Strikethrough)) {
      if (oppFront) {
        oppFront.currentHp -= atk;
        this.emit(events, GameEventType.UNIT_DAMAGED, `"${oppFront.name}" took ${atk} damage from Rush.`, {
          instanceId: oppFront.instanceId,
          damage: atk,
        });
      }
      if (oppSupp) {
        oppSupp.currentHp -= atk;
        this.emit(events, GameEventType.UNIT_DAMAGED, `"${oppSupp.name}" took ${atk} damage from Rush.`, {
          instanceId: oppSupp.instanceId,
          damage: atk,
        });
      }
      this.applyDamageToHero(s, enemyHeroId, atk, u.instanceId, laneIdx, events);
    } else {
      if (oppFront) {
        oppFront.currentHp -= atk;
        this.emit(events, GameEventType.UNIT_DAMAGED, `"${oppFront.name}" took ${atk} damage from Rush.`, {
          instanceId: oppFront.instanceId,
          damage: atk,
        });
      } else if (oppSupp) {
        oppSupp.currentHp -= atk;
        this.emit(events, GameEventType.UNIT_DAMAGED, `"${oppSupp.name}" took ${atk} damage from Rush.`, {
          instanceId: oppSupp.instanceId,
          damage: atk,
        });
      } else {
        // Direct to hero
        this.applyDamageToHero(s, enemyHeroId, atk, u.instanceId, laneIdx, events);
      }
    }
  }

  // ── Hero Damage & Super Block Roll ───────────────────────────

  private applyDamageToHero(
    s: GameState,
    targetHeroId: PlayerId,
    damage: number,
    attackerId: string,
    _laneIndex: number,
    events: GameEvent[],
  ): number {
    if (damage <= 0) return 0;
    const targetPlayer = targetHeroId === PlayerId.Player ? s.player : s.opponent;
    const meter = targetPlayer.superBlock;

    // Check if meter is eligible for charging (max 3 triggers per game)
    if (meter.triggerCount < this.config.maxSuperBlocks) {
      // Roll 1 to 3 charges deterministically
      const roll = 1 + Math.floor(this.prng() * 3);
      const total = meter.charges + roll;

      this.emit(events, GameEventType.SUPER_BLOCK_CHARGE, `${targetHeroId} rolled +${roll} Super-Block charges (${meter.charges} -> ${total}/8).`, {
        playerId: targetHeroId,
        roll,
        chargesBefore: meter.charges,
        totalCalculated: total,
      });

      if (total >= 8) {
        // Overflow rule: triggers Super-Block, negates damage to 0, overflow carries over
        const carryOver = total - 8;
        meter.charges = carryOver;
        meter.triggerCount += 1;
        meter.superBlockTriggered = true;

        // Auto-Draw Superpower Card:
        // Select 1 random Superpower/Hero Ability card from pool and override cost to 0
        let superpower: Card;
        if (targetPlayer.availableSuperpowers.length > 0) {
          const spIdx = Math.floor(this.prng() * targetPlayer.availableSuperpowers.length);
          superpower = { ...targetPlayer.availableSuperpowers.splice(spIdx, 1)[0]!, cost: 0 };
        } else {
          const kitPool = targetPlayer.hero.superpowerKit
            ? [targetPlayer.hero.superpowerKit.signatureAbility, ...targetPlayer.hero.superpowerKit.coreAbilities]
            : (targetPlayer.hero.superpowers || []);
          const baseSp = kitPool[Math.floor(this.prng() * kitPool.length)]!;
          superpower = { ...baseSp, cost: 0 };
        }

        // Hand Limit Bypass: add directly to hand even if at or over 11 cards
        targetPlayer.hand.push(superpower);

        this.emit(events, GameEventType.SUPER_BLOCK_TRIGGER, `SUPER BLOCK ACTIVATED! ${targetHeroId} negates the attack to 0! Drew Superpower "${superpower.name}" (0 Cost). ${carryOver} charges carried over.`, {
          playerId: targetHeroId,
          roll,
          overflowCarriedOver: carryOver,
          triggerCount: meter.triggerCount,
          superpowerId: superpower.id,
          superpowerName: superpower.name,
          cost: 0,
        });

        this.emit(events, GameEventType.CARD_DRAWN, `${targetHeroId} drew Superpower "${superpower.name}" (0 Cost) directly into hand.`, {
          playerId: targetHeroId,
          cardId: superpower.id,
          cardName: superpower.name,
          cost: 0,
          bypassedHandLimit: targetPlayer.hand.length > 11,
        });

        // Triggering attack deals ZERO damage (damage mitigated to 0)
        // No interrupt! Combat flow continues smoothly lane by lane
        return 0;
      } else {
        meter.charges = total;
      }
    }

    // Normal Hero damage
    targetPlayer.hp -= damage;
    this.emit(events, GameEventType.HERO_DAMAGED, `${targetHeroId} took ${damage} damage (HP: ${targetPlayer.hp}/${targetPlayer.maxHp}).`, {
      playerId: targetHeroId,
      damage,
      currentHp: targetPlayer.hp,
      attackerId,
    });
    return damage;
  }

  // ── Casualties & Cascading Deathrattles ───────────────────────

  private checkDeaths(s: GameState, events: GameEvent[]): void {
    let deathsOccurred = false;

    do {
      deathsOccurred = false;
      const deadUnits: { unit: UnitInstance; laneIndex: number; isSupport: boolean }[] = [];

      for (let l = 0; l < 4; l++) {
        const lane = s.lanes[l];
        if (lane.playerFrontline && lane.playerFrontline.currentHp <= 0) {
          deadUnits.push({ unit: lane.playerFrontline, laneIndex: l, isSupport: false });
          lane.playerFrontline = null;
        }
        if (lane.playerSupport && lane.playerSupport.currentHp <= 0) {
          deadUnits.push({ unit: lane.playerSupport, laneIndex: l, isSupport: true });
          lane.playerSupport = null;
        }
        if (lane.opponentFrontline && lane.opponentFrontline.currentHp <= 0) {
          deadUnits.push({ unit: lane.opponentFrontline, laneIndex: l, isSupport: false });
          lane.opponentFrontline = null;
        }
        if (lane.opponentSupport && lane.opponentSupport.currentHp <= 0) {
          deadUnits.push({ unit: lane.opponentSupport, laneIndex: l, isSupport: true });
          lane.opponentSupport = null;
        }
      }

      if (deadUnits.length > 0) {
        deathsOccurred = true;

        for (const item of deadUnits) {
          const u = item.unit;
          this.emit(events, GameEventType.UNIT_DIED, `"${u.name}" was destroyed in Lane ${item.laneIndex}.`, {
            instanceId: u.instanceId,
            ownerId: u.ownerId,
            laneIndex: item.laneIndex,
          });

          // Equipment destroyed on host death
          for (const eq of u.attachedEquipment) {
            this.emit(events, GameEventType.EQUIPMENT_DESTROYED, `Attached equipment "${eq.name}" destroyed with host "${u.name}".`, {
              equipmentId: eq.id,
              hostInstanceId: u.instanceId,
            });
          }

          // Send unit's card definition to graveyard (excluding superpowers)
          const ownerState = u.ownerId === PlayerId.Player ? s.player : s.opponent;
          const unitTribes = u.tribes && u.tribes.length > 0 ? [...u.tribes] : (u.tribe ? [u.tribe] : ["เป็นกลาง"]);
          const masterCard = getStaticCardById(u.cardId);
          const unitCardRef: Card = masterCard
            ? createCardInstance(masterCard)
            : {
                id: u.cardId,
                name: u.name,
                type: CardType.Unit,
                cost: 0,
                attack: u.attack,
                hp: u.maxHp,
                tribes: unitTribes,
                tribe: unitTribes[0] || u.tribe || "เป็นกลาง",
                keywords: [...u.keywords],
              };

          if (!isSuperpowerCard(unitCardRef)) {
            ownerState.graveyard.push(unitCardRef);
            this.emit(events, GameEventType.CARD_SENT_TO_GRAVEYARD, `"${u.name}" was sent to ${u.ownerId}'s graveyard.`, {
              ownerId: u.ownerId,
              cardId: u.cardId,
            });
          }

          // Trigger Deathrattle (and cascade)
          if (u.keywords.includes(Keyword.Deathrattle) && u.deathrattleEffect) {
            const eff = u.deathrattleEffect;
            this.emit(events, GameEventType.DEATHRATTLE_TRIGGER, `"${u.name}" triggered Deathrattle!`, {
              instanceId: u.instanceId,
              effect: eff,
            });

            if (eff.damage && eff.target === "ADJACENT_LANES") {
              const adjacentIndices = [item.laneIndex - 1, item.laneIndex + 1].filter(
                (idx) => idx >= 0 && idx <= 3,
              );
              for (const adjIdx of adjacentIndices) {
                const adjLane = s.lanes[adjIdx];
                const targets = [
                  adjLane.playerFrontline,
                  adjLane.playerSupport,
                  adjLane.opponentFrontline,
                  adjLane.opponentSupport,
                ].filter(Boolean) as UnitInstance[];

                for (const target of targets) {
                  target.currentHp -= eff.damage;
                  this.emit(events, GameEventType.UNIT_DAMAGED, `Deathrattle cascade hit "${target.name}" in Lane ${adjIdx} for ${eff.damage} damage!`, {
                    targetInstanceId: target.instanceId,
                    damage: eff.damage,
                    remainingHp: target.currentHp,
                  });
                }
              }
            } else if (eff.damage && eff.target === "ENEMY_HERO") {
              const enemyId = u.ownerId === PlayerId.Player ? PlayerId.Opponent : PlayerId.Player;
              this.applyDamageToHero(s, enemyId, eff.damage, u.instanceId, item.laneIndex, events);
            }
          }
        }
      }
    } while (deathsOccurred);

    // Recalculate auras whenever units may have died
    this.recalculateAuras(s, events);
  }

  // ── Turn End & Mana Replenishment ────────────────────────────

  private startNextTurn(s: GameState, events: GameEvent[]): ActionResult {
    this.emit(events, GameEventType.TURN_ENDED, `Turn ${s.turnNumber} ended.`, { turnNumber: s.turnNumber });

    s.turnNumber += 1;
    // Shared mana pool increases by +1 each turn and fully refills
    const newMaxMana = Math.min(10, s.turnNumber);
    s.player.maxMana = newMaxMana;
    s.player.currentMana = newMaxMana;
    s.opponent.maxMana = newMaxMana;
    s.opponent.currentMana = newMaxMana;

    this.emit(events, GameEventType.MANA_CHANGED, `Mana increased and refilled to ${newMaxMana}/${newMaxMana}.`, {
      turnNumber: s.turnNumber,
      maxMana: newMaxMana,
    });

    // Reset unit turn attack flags
    for (const lane of s.lanes) {
      const units = [
        lane.playerFrontline,
        lane.playerSupport,
        lane.opponentFrontline,
        lane.opponentSupport,
      ].filter(Boolean) as UnitInstance[];
      for (const u of units) {
        u.hasAttackedThisTurn = false;
        u.summonedThisTurn = false;
      }

      // Environment turn-end passive effect
      if (lane.environment?.environmentEffect?.damagePerTurnEnd) {
        const dmg = lane.environment.environmentEffect.damagePerTurnEnd;
        for (const u of units) {
          u.currentHp -= dmg;
          this.emit(events, GameEventType.UNIT_DAMAGED, `Environment "${lane.environment.name}" dealt ${dmg} turn-end damage to "${u.name}".`, {
            instanceId: u.instanceId,
            damage: dmg,
          });
        }
      }
    }

    this.checkDeaths(s, events);

    // Draw 1 card at Turn End (respecting hand limit: 11 cards)
    this.drawCardForPlayer(s.player, events);
    this.drawCardForPlayer(s.opponent, events);

    // Phase resets to First-Player's Unit Phase
    const nextPhase =
      s.firstPlayerId === PlayerId.Player
        ? TurnPhase.P1_UNIT_PHASE
        : TurnPhase.P2_UNIT_PHASE;

    s.currentPhase = nextPhase;
    s.activePlayerId = s.firstPlayerId;

    this.emit(events, GameEventType.TURN_STARTED, `Turn ${s.turnNumber} begins.`, {
      turnNumber: s.turnNumber,
      firstPlayerId: s.firstPlayerId,
    });
    this.emit(events, GameEventType.PHASE_CHANGED, `Phase set to ${nextPhase}.`, {
      phase: nextPhase,
    });

    this.checkWinLoss(s, events);

    s.eventLog.push(...events);
    this.state = s;
    return { success: true, state: this.getState(), events };
  }

  private drawCardForPlayer(player: PlayerState, events: GameEvent[]): void {
    if (player.deck.length === 0) {
      // Fatigue: no cards left to draw — deal unpreventable damage
      player.fatigueCount += 1;
      player.hp -= player.fatigueCount;
      this.emit(events, GameEventType.FATIGUE_DAMAGE, `${player.id} has no cards left! Fatigue deals ${player.fatigueCount} damage (HP: ${player.hp}/${player.maxHp}).`, {
        playerId: player.id,
        fatigueCount: player.fatigueCount,
        currentHp: player.hp,
      });
      return;
    }

    const drawn = player.deck.shift()!;

    if (player.hand.length >= this.config.maxHandSize) {
      // Hand limit reached (11 cards) -> Card is burned
      if (!isSuperpowerCard(drawn)) {
        player.graveyard.push(createCardInstance(drawn));
      }
      this.emit(events, GameEventType.CARD_BURNED, `${player.id} reached hand limit (11). "${drawn.name}" was burned!`, {
        playerId: player.id,
        cardId: drawn.id,
        cardName: drawn.name,
      });
    } else {
      player.hand.push(drawn);
      this.emit(events, GameEventType.CARD_DRAWN, `${player.id} drew "${drawn.name}".`, {
        playerId: player.id,
        cardId: drawn.id,
        cardName: drawn.name,
        handSize: player.hand.length,
      });
    }
  }

  private resolveSpellEffect(
    s: GameState,
    playerId: PlayerId,
    eff: SpellEffect,
    laneIndex?: number,
    targetInstanceId?: string,
    events: GameEvent[] = [],
  ): void {
    const player = playerId === PlayerId.Player ? s.player : s.opponent;
    const enemyPlayer = playerId === PlayerId.Player ? s.opponent : s.player;
    const isP1 = playerId === PlayerId.Player;

    // 1. Signature Hero A: Damage equal to the number of units on board
    if (eff.damagePerUnitOnBoard) {
      let unitCount = 0;
      for (const lane of s.lanes) {
        if (lane.playerFrontline) unitCount++;
        if (lane.playerSupport) unitCount++;
        if (lane.opponentFrontline) unitCount++;
        if (lane.opponentSupport) unitCount++;
      }
      this.applyDamageToHero(s, enemyPlayer.id, unitCount, "spell", laneIndex ?? 0, events);
    }

    // 2. Signature Hero B: Damage all non-water units on board
    if (eff.damageAllNonWater !== undefined && eff.damageAllNonWater > 0) {
      const dmg = eff.damageAllNonWater;
      for (const lane of s.lanes) {
        const units = [
          lane.playerFrontline,
          lane.playerSupport,
          lane.opponentFrontline,
          lane.opponentSupport,
        ].filter(Boolean) as UnitInstance[];

        for (const u of units) {
          if (!u.keywords.includes(Keyword.Amphibious) && lane.type !== LaneType.Water) {
            this.applyDamageToUnit(u, dmg, events);
          }
        }
      }
    }

    // 3. Regular targeted or AOE damage
    if (eff.damage && targetInstanceId) {
      const u = this.findUnitById(s, targetInstanceId);
      if (u) {
        this.applyDamageToUnit(u, eff.damage, events);
      }
    } else if (eff.damage && laneIndex !== undefined) {
      const lane = s.lanes[laneIndex];
      const targets = [
        lane.playerFrontline,
        lane.playerSupport,
        lane.opponentFrontline,
        lane.opponentSupport,
      ].filter(Boolean) as UnitInstance[];
      for (const u of targets) {
        this.applyDamageToUnit(u, eff.damage, events);
      }
    } else if (eff.damage) {
      // Face damage to enemy hero
      this.applyDamageToHero(s, enemyPlayer.id, eff.damage, "spell", laneIndex ?? 0, events);
    }

    // 4. Heal
    if (eff.heal) {
      player.hp = Math.min(player.maxHp, player.hp + eff.heal);
      this.emit(events, GameEventType.HERO_HEALED, `${playerId} healed for ${eff.heal} HP.`, {
        playerId,
        heal: eff.heal,
        hp: player.hp,
      });
    }

    // 5. Draw Cards
    if (eff.drawCards) {
      for (let i = 0; i < eff.drawCards; i++) {
        this.drawCardForPlayer(player, events);
      }
    }

    // 6. Buff Attack & HP
    if ((eff.buffAttack || eff.buffHp) && targetInstanceId) {
      const u = this.findUnitById(s, targetInstanceId);
      if (u) {
        if (eff.buffAttack) u.attack += eff.buffAttack;
        if (eff.buffHp) {
          u.maxHp += eff.buffHp;
          u.currentHp += eff.buffHp;
        }
        this.emit(events, GameEventType.UNIT_BUFFED, `"${u.name}" was buffed (+${eff.buffAttack ?? 0}/+${eff.buffHp ?? 0}).`, {
          targetInstanceId,
          attackBonus: eff.buffAttack ?? 0,
          hpBonus: eff.buffHp ?? 0,
          currentAtk: u.attack,
          currentHp: u.currentHp,
        });
      }
    }

    // 7. Grant Keyword (e.g. Flying)
    if (eff.grantKeyword && targetInstanceId) {
      const u = this.findUnitById(s, targetInstanceId);
      if (u && !u.keywords.includes(eff.grantKeyword)) {
        u.keywords.push(eff.grantKeyword);
      }
    }

    // 8. Freeze Lane (Hero A Core 3)
    if (eff.freezeLane && laneIndex !== undefined) {
      const lane = s.lanes[laneIndex];
      const enemyUnits = isP1
        ? [lane.opponentFrontline, lane.opponentSupport].filter(Boolean) as UnitInstance[]
        : [lane.playerFrontline, lane.playerSupport].filter(Boolean) as UnitInstance[];
      for (const u of enemyUnits) {
        this.applyStatusEffect(u, "FROZEN", events);
      }
    }

    // 9. Apply status effect to target unit
    if (eff.applyStatus && targetInstanceId) {
      const u = this.findUnitById(s, targetInstanceId);
      if (u) this.applyStatusEffect(u, eff.applyStatus, events);
    }

    // 10. Summon Unit (Hero B Core 3: Water Elemental)
    if (eff.summonCardId) {
      let targetLaneIndex = -1;
      let isSupport = false;

      // Prefer Lane 3 (Water Lane) if open on player's side
      const waterLane = s.lanes[3];
      const frontline = isP1 ? waterLane.playerFrontline : waterLane.opponentFrontline;
      const support = isP1 ? waterLane.playerSupport : waterLane.opponentSupport;

      if (!frontline) {
        targetLaneIndex = 3;
        isSupport = false;
      } else if (!support) {
        targetLaneIndex = 3;
        isSupport = true;
      } else {
        // Find any other open lane
        for (let i = 0; i < s.lanes.length; i++) {
          const l = s.lanes[i];
          const fl = isP1 ? l.playerFrontline : l.opponentFrontline;
          const sp = isP1 ? l.playerSupport : l.opponentSupport;
          if (!fl) {
            targetLaneIndex = i;
            isSupport = false;
            break;
          } else if (!sp) {
            targetLaneIndex = i;
            isSupport = true;
            break;
          }
        }
      }

      if (targetLaneIndex !== -1) {
        const lane = s.lanes[targetLaneIndex];
        const spawnedUnit: UnitInstance = {
          instanceId: `unit_summon_${Date.now()}_${Math.floor(this.prng() * 100000)}`,
          cardId: eff.summonCardId,
          ownerId: playerId,
          laneIndex: targetLaneIndex,
          name: "Water Elemental",
          tribes: ["ยุทธศาสตร์"],
          tribe: "ยุทธศาสตร์",
          baseKeywords: [Keyword.Amphibious],
          keywords: [Keyword.Amphibious],
          attack: 2,
          maxHp: 2,
          currentHp: 2,
          hasAttackedThisTurn: false,
          summonedThisTurn: true,
          isSupport,
          attachedEquipment: [],
          isFrozen: false,
          hasShield: false,
          isDeadly: false,
          auraModifiers: [],
        };

        if (isP1) {
          if (!isSupport) lane.playerFrontline = spawnedUnit;
          else lane.playerSupport = spawnedUnit;
        } else {
          if (!isSupport) lane.opponentFrontline = spawnedUnit;
          else lane.opponentSupport = spawnedUnit;
        }

        this.emit(events, GameEventType.UNIT_SUMMONED, `${playerId} conjured "Water Elemental" (2/2 Amphibious) into Lane ${targetLaneIndex}.`, {
          playerId,
          instanceId: spawnedUnit.instanceId,
          cardId: spawnedUnit.cardId,
          name: spawnedUnit.name,
          laneIndex: targetLaneIndex,
          isSupport,
          attack: spawnedUnit.attack,
          hp: spawnedUnit.currentHp,
        });

        this.recalculateAuras(s, events);
      }
    }
  }

  public findUnitById(s: GameState, instanceId: string): UnitInstance | null {
    for (const lane of s.lanes) {
      if (lane.playerFrontline?.instanceId === instanceId) return lane.playerFrontline;
      if (lane.playerSupport?.instanceId === instanceId) return lane.playerSupport;
      if (lane.opponentFrontline?.instanceId === instanceId) return lane.opponentFrontline;
      if (lane.opponentSupport?.instanceId === instanceId) return lane.opponentSupport;
    }
    return null;
  }

  private checkWinLoss(s: GameState, events: GameEvent[]): void {
    if (s.isGameOver) return;
    const p1Dead = s.player.hp <= 0;
    const p2Dead = s.opponent.hp <= 0;

    if (p1Dead && p2Dead) {
      s.isGameOver = true;
      s.winner = "DRAW";
      this.emit(events, GameEventType.GAME_OVER, "Game over: DRAW! Both heroes fell simultaneously.", {
        winner: "DRAW",
      });
    } else if (p1Dead) {
      s.isGameOver = true;
      s.winner = PlayerId.Opponent;
      this.emit(events, GameEventType.GAME_OVER, `Game over: ${PlayerId.Opponent} wins!`, {
        winner: PlayerId.Opponent,
      });
    } else if (p2Dead) {
      s.isGameOver = true;
      s.winner = PlayerId.Player;
      this.emit(events, GameEventType.GAME_OVER, `Game over: ${PlayerId.Player} wins!`, {
        winner: PlayerId.Player,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Status Effect Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Apply a status effect to a unit and emit the corresponding event.
   */
  private applyStatusEffect(
    unit: UnitInstance,
    status: StatusEffectType,
    events: GameEvent[],
  ): void {
    switch (status) {
      case "FROZEN":
        unit.isFrozen = true;
        this.emit(events, GameEventType.STATUS_FROZEN, `"${unit.name}" is now Frozen and will skip its next attack.`, {
          instanceId: unit.instanceId,
        });
        break;
      case "SHIELD":
        unit.hasShield = true;
        this.emit(events, GameEventType.STATUS_SHIELD_GAINED, `"${unit.name}" gained a Shield (absorbs next hit).`, {
          instanceId: unit.instanceId,
        });
        break;
      case "DEADLY":
        unit.isDeadly = true;
        this.emit(events, GameEventType.STATUS_DEADLY_APPLIED, `"${unit.name}" is now Deadly (any hit kills target unit).`, {
          instanceId: unit.instanceId,
        });
        break;
    }
  }

  /**
   * Apply damage to a unit, respecting Shield (absorbs first hit) and Deadly (kills on any hit).
   * Returns the actual damage dealt (0 if shield absorbed).
   */
  private applyDamageToUnit(
    unit: UnitInstance,
    rawDamage: number,
    events: GameEvent[],
    attackerIsDeadly = false,
  ): number {
    if (rawDamage <= 0) return 0;

    // Shield absorbs the hit
    if (unit.hasShield) {
      unit.hasShield = false;
      this.emit(events, GameEventType.STATUS_SHIELD_BROKEN, `"${unit.name}"'s Shield absorbed the hit!`, {
        instanceId: unit.instanceId,
      });
      return 0;
    }

    // Armored (ทนทาน): Reduces incoming attack damage by 1 (minimum 0)
    let damageToApply = rawDamage;
    if (unit.keywords.some((k) => k === Keyword.Armored || (k as string) === "ทนทาน" || (k as string) === "ARMORED")) {
      damageToApply = Math.max(0, damageToApply - 1);
    }

    // Deadly: any non-zero damage kills instantly
    const effectiveDamage = attackerIsDeadly ? unit.currentHp : damageToApply;
    unit.currentHp -= effectiveDamage;
    this.emit(events, GameEventType.UNIT_DAMAGED, `"${unit.name}" took ${effectiveDamage} damage (remaining: ${unit.currentHp}).`, {
      instanceId: unit.instanceId,
      damage: effectiveDamage,
      currentHp: unit.currentHp,
    });
    return effectiveDamage;
  }
}

// ─────────────────────────────────────────────────────────────
//  Internal Helper: Lane Factory
// ─────────────────────────────────────────────────────────────

function createLaneState(index: number, type: LaneType): LaneState {
  return {
    index,
    type,
    playerFrontline: null,
    playerSupport: null,
    opponentFrontline: null,
    opponentSupport: null,
    environment: null,
    environmentOwnerId: null,
    get playerUnit() {
      return this.playerFrontline ?? this.playerSupport;
    },
    set playerUnit(val: UnitInstance | null) {
      this.playerFrontline = val;
    },
    get opponentUnit() {
      return this.opponentFrontline ?? this.opponentSupport;
    },
    set opponentUnit(val: UnitInstance | null) {
      this.opponentFrontline = val;
    },
  };
}
