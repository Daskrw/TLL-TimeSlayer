// ============================================================
//  server/types.ts — Authoritative CCG Server Types & Protocol
// ============================================================

import {
  Card,
  CardDefinition,
  CardType,
  GameEvent,
  GameState,
  Hero,
  LaneState,
  PlayerId,
  PlayerState,
  SuperBlockMeter,
  TurnPhase,
} from "../src/types";
import { GameEngine } from "../src/GameEngine";

export type RoomStatus = "LOBBY" | "MULLIGAN" | "IN_GAME" | "FINISHED";

export interface PlayerSlot {
  socketId: string;
  playerName: string;
  role?: "p1" | "p2" | "P1" | "P2";
  hero?: Hero;
  deck?: Card[];
  deckCardIds?: string[];
  ready: boolean;
  lockedIn?: boolean;
  isLockedIn?: boolean;
  connected: boolean;
}

export interface GameRoom {
  roomId: string;
  createdAt: number;
  status: RoomStatus;
  players: {
    p1?: PlayerSlot;
    p2?: PlayerSlot;
  };
  engine?: GameEngine;
  disconnectTimers?: {
    p1?: NodeJS.Timeout;
    p2?: NodeJS.Timeout;
  };
  winner?: PlayerId | "DRAW";
}

// ─────────────────────────────────────────────────────────────
//  Fog of War / Sanitized Game State
// ─────────────────────────────────────────────────────────────

export interface SanitizedOpponentState {
  id: PlayerId;
  hero: Hero;
  hp: number;
  maxHp: number;
  handCount: number;
  deckCount: number;
  graveyard: Card[];
  currentMana: number;
  maxMana: number;
  superBlock: SuperBlockMeter;
  availableSuperpowersCount: number;
  fatigueCount: number;
}

export interface SanitizedGameState {
  turnNumber: number;
  firstPlayerId: PlayerId;
  activePlayerId: PlayerId;
  currentPhase: TurnPhase;
  lanes: [LaneState, LaneState, LaneState, LaneState];
  p1Hero?: Hero;
  p2Hero?: Hero;
  p1BlockMeter?: SuperBlockMeter;
  p2BlockMeter?: SuperBlockMeter;
  p1Graveyard?: Card[];
  p2Graveyard?: Card[];
  selfGraveyardCount?: number;
  oppGraveyardCount?: number;
  self: PlayerState;
  opponent: SanitizedOpponentState;
  myRole: "p1" | "p2";
  yourPlayerId?: "P1" | "P2";
  myPlayerId: PlayerId;
  isMyTurn: boolean;
  winner: PlayerId | "DRAW" | null;
  isGameOver: boolean;
  mulliganHand?: Card[];
}

// ─────────────────────────────────────────────────────────────
//  Socket.io Wire Protocol
// ─────────────────────────────────────────────────────────────

export interface ActionLoggedPayload {
  id: string;
  playerId: "P1" | "P2" | string;
  role?: "p1" | "p2";
  playerName?: string;
  card: {
    id: string;
    name: string;
    cost: number;
    type: CardType;
    imageUrl?: string;
    tribe?: string;
  };
  targetLane?: number | null;
  timestamp: number;
}

export interface ClientToServerEvents {
  create_room: (
    data: { playerName?: string },
    callback: (res: { success: boolean; roomId: string; role: "p1" }) => void,
  ) => void;

  join_room: (
    data: { roomId: string; playerName?: string },
    callback: (res: { success: boolean; error?: string; role?: "p1" | "p2"; roomId?: string }) => void,
  ) => void;

  matchmake: (
    data: { playerName?: string },
    callback: (res: { success: boolean; roomId: string; role: "p1" | "p2" }) => void,
  ) => void;

  submit_loadout: (
    data: { roomId: string; hero: Hero; deck: Card[] },
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;

  PLAYER_LOCK_IN: (
    data: {
      roomId?: string;
      heroId?: string;
      deckCardIds?: string[];
      hero?: Hero;
      deck?: Card[];
    },
    callback?: (res: { success: boolean; error?: string }) => void,
  ) => void;

  submit_mulligan: (
    data: { roomId: string; replacedCardIds: string[] },
    callback: (res: { success: boolean; error?: string }) => void,
  ) => void;

  play_card: (
    data: {
      roomId: string;
      cardId: string;
      laneIndex?: number;
      targetId?: string;
      slotType?: "frontline" | "support";
    },
    callback: (res: { success: boolean; error?: string; events?: GameEvent[] }) => void,
  ) => void;

  pass_turn: (
    data: { roomId: string },
    callback: (res: { success: boolean; error?: string; events?: GameEvent[] }) => void,
  ) => void;

  leave_room: (data: { roomId: string }) => void;

  chat_message: (data: { roomId: string; text: string }) => void;
}

export interface ServerToClientEvents {
  room_state: (data: {
    roomId: string;
    status: RoomStatus;
    p1?: { name: string; ready: boolean; lockedIn?: boolean; heroName?: string };
    p2?: { name: string; ready: boolean; lockedIn?: boolean; heroName?: string };
  }) => void;

  MATCH_INITIALIZED: (data: {
    roomId: string;
    p1Data: { name: string; hero?: Hero; hp?: number; maxHp?: number };
    p2Data: { name: string; hero?: Hero; hp?: number; maxHp?: number };
    startingPhase: TurnPhase;
    initialState?: SanitizedGameState;
    p1State?: SanitizedGameState;
    p2State?: SanitizedGameState;
  }) => void;

  mulligan_started: (data: {
    roomId: string;
    initialHand: Card[];
    opponentHandCount: number;
  }) => void;

  game_started: (data: {
    roomId: string;
    role: "p1" | "p2";
    state: SanitizedGameState;
  }) => void;

  MATCH_START: (data: {
    yourPlayerId: "P1" | "P2";
    role: "p1" | "p2";
    roomId: string;
    initialState: SanitizedGameState;
  }) => void;

  PHASE_CHANGED: (data: {
    newPhase: TurnPhase;
  }) => void;

  game_state_update: (data: {
    state: SanitizedGameState;
    events: GameEvent[];
  }) => void;

  SYNC_GAME_STATE: (data: {
    state: SanitizedGameState;
    events: GameEvent[];
  }) => void;

  EVENT_ACTION_LOGGED: (data: ActionLoggedPayload) => void;
  action_logged: (data: ActionLoggedPayload) => void;

  combat_step: (data: {
    laneIndex: number;
    strikeNumber: number;
    events: GameEvent[];
    state: SanitizedGameState;
    done: boolean;
  }) => void;

  EVENT_COMBAT_STEP: (data: {
    laneIndex: number;
    strikeNumber: number;
    events: GameEvent[];
    state: SanitizedGameState;
    done: boolean;
  }) => void;

  action_rejected: (data: { reason: string }) => void;

  game_over: (data: {
    winner: PlayerId | "DRAW";
    reason?: string;
  }) => void;

  opponent_disconnected: (data: { countdownSec: number }) => void;

  opponent_reconnected: () => void;

  SYNC_ERROR: (data: { message: string }) => void;

  chat_broadcast: (data: { sender: string; text: string; timestamp: number }) => void;
}
