// ============================================================
//  server/GameSession.ts — Authoritative Match Session Runner
// ============================================================

import {
  Card,
  GameEvent,
  GameState,
  Hero,
  PlayerId,
  PlayerState,
  TurnPhase,
} from "../src/types";
import { GameEngine } from "../src/GameEngine";
import { GameRoom, SanitizedGameState, SanitizedOpponentState } from "./types";
import { AVAILABLE_HEROES, DECK_VANGUARD_40, DECK_ABYSSAL_40 } from "../src/cards";

export class GameSession {
  private room: GameRoom;
  private engine: GameEngine;
  private mulliganTimer: NodeJS.Timeout | null = null;
  private onMulliganCompleteCb?: () => void;

  constructor(room: GameRoom) {
    this.room = room;
    this.engine = new GameEngine({
      startingHp: 20,
      enableMulligan: true,
      startingHandSize: 4,
    });
    this.room.engine = this.engine;
  }

  public getEngine(): GameEngine {
    return this.engine;
  }

  public getState(): GameState {
    return this.engine.getState();
  }

  // ── Loadout & Initialization ─────────────────────────────────

  public submitLoadout(role: "p1" | "p2", hero: Hero, deck: Card[]): boolean {
    const slot = role === "p1" ? this.room.players.p1 : this.room.players.p2;
    if (!slot) return false;

    slot.hero = hero;
    slot.deck = deck;
    slot.ready = true;
    slot.lockedIn = true;
    slot.isLockedIn = true;

    // If both players have submitted, initialize game
    if (
      (this.room.players.p1?.isLockedIn || this.room.players.p1?.ready) &&
      (this.room.players.p2?.isLockedIn || this.room.players.p2?.ready)
    ) {
      this.initGame();
      return true;
    }
    return false;
  }

  public initGame(): void {
    const p1 = this.room.players.p1!;
    const p2 = this.room.players.p2!;

    const p1Hero = (p1.hero && p1.hero.superpowerKit) ? p1.hero : AVAILABLE_HEROES[0];
    const p1Deck = p1.deck && p1.deck.length > 0 ? p1.deck : [...DECK_VANGUARD_40];
    const p2Hero = (p2.hero && p2.hero.superpowerKit) ? p2.hero : AVAILABLE_HEROES[0];
    const p2Deck = p2.deck && p2.deck.length > 0 ? p2.deck : [...DECK_ABYSSAL_40];

    this.engine.initializeGame(
      p1Hero,
      p1Deck,
      p2Hero,
      p2Deck,
      { seed: Date.now(), firstPlayerId: PlayerId.Player },
    );

    this.room.status = "MULLIGAN";
  }

  // ── Mulligan ─────────────────────────────────────────────────

  public startMulliganTimer(onComplete: () => void): void {
    this.clearMulliganTimer();
    this.onMulliganCompleteCb = onComplete;
    console.log(`[Server] Starting 15s Mulligan fallback timer for room ${this.room.roomId}`);
    this.mulliganTimer = setTimeout(() => {
      this.handleMulliganTimeout();
    }, 15000);
  }

  public clearMulliganTimer(): void {
    if (this.mulliganTimer) {
      clearTimeout(this.mulliganTimer);
      this.mulliganTimer = null;
    }
  }

  private handleMulliganTimeout(): void {
    this.clearMulliganTimer();
    if (this.room.status !== "MULLIGAN") return;
    console.log(`[Server] 15s Mulligan timer expired for room ${this.room.roomId} -> Auto-confirming unconfirmed hands`);
    const ms = this.engine.getState().mulliganState;
    if (ms) {
      if (!ms.p1Confirmed) {
        this.engine.confirmMulligan(PlayerId.Player, []);
      }
      if (!ms.p2Confirmed) {
        this.engine.confirmMulligan(PlayerId.Opponent, []);
      }
    }
    this.room.status = "IN_GAME";
    this.onMulliganCompleteCb?.();
  }

  public submitMulligan(role: "p1" | "p2", replacedCardIds: string[]): { success: boolean; error?: string } {
    if (this.room.status !== "MULLIGAN") {
      return { success: false, error: "Match is not in Mulligan phase." };
    }

    const playerId = role === "p1" ? PlayerId.Player : PlayerId.Opponent;
    const res = this.engine.confirmMulligan(playerId, replacedCardIds);

    if (!res.success) {
      return { success: false, error: res.error };
    }

    const state = this.engine.getState();
    // Once both players confirm, phase leaves MULLIGAN
    if (state.currentPhase !== TurnPhase.MULLIGAN) {
      this.clearMulliganTimer();
      this.room.status = "IN_GAME";
    }

    return { success: true };
  }

  // ── In-Game Actions ──────────────────────────────────────────

  public playCard(
    role: "p1" | "p2",
    cardId: string,
    laneIndex?: number,
    targetId?: string,
    slotType?: "frontline" | "support",
  ) {
    if (this.room.status !== "IN_GAME") {
      return { success: false as const, state: this.getState(), error: "Match is not currently in progress." };
    }

    const playerId = role === "p1" ? PlayerId.Player : PlayerId.Opponent;
    const res = this.engine.playCard(playerId, cardId, laneIndex, targetId, slotType);

    if (res.success && res.state.isGameOver) {
      this.room.status = "FINISHED";
      this.room.winner = res.state.winner ?? undefined;
    }

    return res;
  }

  public passTurn(role: "p1" | "p2") {
    if (this.room.status !== "IN_GAME") {
      return { success: false as const, state: this.getState(), error: "Match is not currently in progress." };
    }

    const playerId = role === "p1" ? PlayerId.Player : PlayerId.Opponent;
    const res = this.engine.passAction(playerId);

    if (res.success && res.state.isGameOver) {
      this.room.status = "FINISHED";
      this.room.winner = res.state.winner ?? undefined;
    }

    return res;
  }

  /**
   * Automatically executes all combat steps when phase is COMBAT_PHASE,
   * advances into TURN_END and new turn, and checks win conditions.
   */
  public executeFullCombat(): {
    allEvents: GameEvent[];
    stepResults: Array<{ laneIndex: number; strikeNumber: number; events: GameEvent[]; done: boolean }>;
    finalState: GameState;
  } {
    const allEvents: GameEvent[] = [];
    const stepResults: Array<{ laneIndex: number; strikeNumber: number; events: GameEvent[]; done: boolean }> = [];

    let combatDone = false;
    let guard = 20;

    while (!combatDone && !this.engine.getState().isGameOver && guard > 0) {
      guard--;
      const step = this.engine.resolveCombatStep();
      allEvents.push(...step.events);
      stepResults.push({
        laneIndex: step.laneIndex,
        strikeNumber: 1,
        events: step.events,
        done: step.done,
      });
      combatDone = step.done;
    }

    // Advance past COMBAT_PHASE into TURN_END and next turn's unit phase
    const state = this.engine.getState();
    if (state.currentPhase === TurnPhase.COMBAT_PHASE && !state.isGameOver) {
      const adv1 = this.engine.advancePhase(); // -> TURN_END
      if (adv1.success) allEvents.push(...adv1.events);
      const adv2 = this.engine.advancePhase(); // -> P1_UNIT_PHASE (new turn)
      if (adv2.success) allEvents.push(...adv2.events);
    }

    const finalState = this.engine.getState();
    if (finalState.isGameOver) {
      this.room.status = "FINISHED";
      this.room.winner = finalState.winner ?? undefined;
    }

    return { allEvents, stepResults, finalState };
  }

  // ── State Sanitization (Fog of War) ──────────────────────────

  public getSanitizedState(role: "p1" | "p2"): SanitizedGameState {
    const state = this.engine.getState();
    const isP1 = role === "p1";
    const myPlayerId = isP1 ? PlayerId.Player : PlayerId.Opponent;

    const selfRaw: PlayerState = isP1 ? state.player : state.opponent;
    const oppRaw: PlayerState = isP1 ? state.opponent : state.player;

    const sanitizedOpponent: SanitizedOpponentState = {
      id: oppRaw.id,
      hero: oppRaw.hero,
      hp: oppRaw.hp,
      maxHp: oppRaw.maxHp,
      handCount: oppRaw.hand.length,
      deckCount: oppRaw.deck.length,
      graveyard: [...oppRaw.graveyard],
      currentMana: oppRaw.currentMana,
      maxMana: oppRaw.maxMana,
      superBlock: { ...oppRaw.superBlock },
      availableSuperpowersCount: oppRaw.availableSuperpowers.length,
      fatigueCount: oppRaw.fatigueCount,
    };

    const isMyTurn = isP1
      ? (state.currentPhase === TurnPhase.P1_UNIT_PHASE || state.currentPhase === TurnPhase.P1_SPELL_PHASE)
      : (state.currentPhase === TurnPhase.P2_UNIT_PHASE || state.currentPhase === TurnPhase.P2_SPELL_PHASE);

    let mulliganHand: Card[] | undefined = undefined;
    if (state.mulliganState) {
      mulliganHand = isP1
        ? state.mulliganState.p1MulliganHand
        : state.mulliganState.p2MulliganHand;
    }

    const p1Raw: PlayerState = state.player;
    const p2Raw: PlayerState = state.opponent;

    return {
      turnNumber: state.turnNumber,
      firstPlayerId: state.firstPlayerId,
      activePlayerId: state.activePlayerId,
      currentPhase: state.currentPhase,
      lanes: state.lanes,
      p1Hero: p1Raw.hero,
      p2Hero: p2Raw.hero,
      p1BlockMeter: { ...p1Raw.superBlock },
      p2BlockMeter: { ...p2Raw.superBlock },
      p1Graveyard: [...p1Raw.graveyard],
      p2Graveyard: [...p2Raw.graveyard],
      selfGraveyardCount: selfRaw.graveyard.length,
      oppGraveyardCount: oppRaw.graveyard.length,
      self: {
        ...selfRaw,
        hand: [...selfRaw.hand],
        deck: [...selfRaw.deck],
        graveyard: [...selfRaw.graveyard],
      },
      opponent: sanitizedOpponent,
      myRole: role,
      yourPlayerId: isP1 ? "P1" : "P2",
      myPlayerId,
      isMyTurn,
      winner: state.winner,
      isGameOver: state.isGameOver,
      ...(mulliganHand ? { mulliganHand } : {}),
    };
  }
}
