// ============================================================
//  client/NetworkService.ts — Authoritative Socket.io Game Bridge
// ============================================================

import { io, Socket } from "socket.io-client";
import { Card, GameEvent, Hero, PlayerId } from "../src/types";
import { RoomStatus, SanitizedGameState } from "../server/types";

export interface NetworkServiceEvents {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onRoomState?: (data: {
    roomId: string;
    status: RoomStatus;
    p1?: { name: string; ready: boolean; lockedIn?: boolean; heroName?: string };
    p2?: { name: string; ready: boolean; lockedIn?: boolean; heroName?: string };
  }) => void;
  onMatchInitialized?: (data: {
    roomId: string;
    p1Data: { name: string; hero?: Hero; hp?: number; maxHp?: number };
    p2Data: { name: string; hero?: Hero; hp?: number; maxHp?: number };
    startingPhase: TurnPhase;
    initialState?: SanitizedGameState;
  }) => void;
  onMulliganStarted?: (data: {
    roomId: string;
    initialHand: Card[];
    opponentHandCount: number;
  }) => void;
  onGameStarted?: (data: {
    roomId: string;
    role: "p1" | "p2";
    yourPlayerId?: "P1" | "P2";
    state: SanitizedGameState;
  }) => void;
  onPhaseChanged?: (newPhase: TurnPhase) => void;
  onSyncGameState?: (data: {
    state: SanitizedGameState;
    events: GameEvent[];
  }) => void;
  onActionRejected?: (reason: string) => void;
  onCombatStep?: (data: {
    laneIndex: number;
    strikeNumber: number;
    events: GameEvent[];
    state: SanitizedGameState;
    done: boolean;
  }) => void;
  onOpponentDisconnected?: (countdownSec: number) => void;
  onGameOver?: (winner: PlayerId | "DRAW", reason?: string) => void;
  onSyncError?: (message: string) => void;
  onActionLogged?: (data: {
    id: string;
    playerId: "P1" | "P2" | string;
    role?: "p1" | "p2";
    playerName?: string;
    card: any;
    targetLane?: number | null;
    timestamp: number;
  }) => void;
  onChat?: (data: { sender: string; text: string; timestamp: number }) => void;
}

export class NetworkService {
  private static instance: NetworkService;
  private socket: Socket | null = null;
  private serverUrl: string;
  private listeners: NetworkServiceEvents = {};

  public roomId: string | null = null;
  public myRole: "p1" | "p2" | null = null;
  public myPlayerId: "P1" | "P2" | null = null;
  public isConnected = false;
  public isOnlineMode = false;
  public playerName = "Player";

  private constructor() {
    if (typeof window !== "undefined") {
      const isViteDev =
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1") &&
        window.location.port === "5299";

      // On Vite dev server (port 5299), connect to backend on 3001 or through Vite proxy.
      // In production / Railway / single-service deployment, auto-detect window.location.origin.
      this.serverUrl = isViteDev
        ? `http://${window.location.hostname}:3001`
        : window.location.origin;
    } else {
      this.serverUrl = "http://localhost:3001";
    }
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public getMyPlayerId(): "P1" | "P2" | null {
    return this.myPlayerId;
  }

  public static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  public setEventListeners(listeners: NetworkServiceEvents): void {
    this.listeners = { ...this.listeners, ...listeners };
  }

  // ── Connection ───────────────────────────────────────────────

  public connect(url?: string): Promise<boolean> {
    if (url) this.serverUrl = url;

    return new Promise((resolve) => {
      if (this.socket && this.socket.connected) {
        this.isConnected = true;
        return resolve(true);
      }

      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }

      console.log(`[NetworkService] Attempting connection to ${this.serverUrl}...`);

      const socket = io(this.serverUrl, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 6000,
        transports: ["websocket", "polling"],
      });
      this.socket = socket;

      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.warn(`[NetworkService] Connection timeout to ${this.serverUrl}`);
          resolve(false);
        }
      }, 7000);

      socket.on("connect", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.log(`[NetworkService] Connected to server: ${this.serverUrl} (${socket.id})`);
        this.isConnected = true;
        this.listeners.onConnected?.();
        resolve(true);
      });

      socket.on("connect_error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.warn(`[NetworkService] Connection error:`, err.message);
        this.isConnected = false;
        resolve(false);
      });

      socket.on("disconnect", () => {
        this.isConnected = false;
        this.listeners.onDisconnected?.();
      });

      this.bindSocketEvents();
    });
  }

  private bindSocketEvents(): void {
    if (!this.socket) return;

    // Room state update
    this.socket.on("room_state", (data) => {
      this.listeners.onRoomState?.(data);
    });

    // MATCH_INITIALIZED (Two-sided readiness gate synchronized start)
    this.socket.on("MATCH_INITIALIZED" as any, (data: any) => {
      console.log(`[NetworkService] Received MATCH_INITIALIZED for room ${data?.roomId}:`, data);
      this.listeners.onMatchInitialized?.(data);
    });

    // Mulligan phase initiation
    this.socket.on("mulligan_started", (data) => {
      this.listeners.onMulliganStarted?.(data);
    });

    // Game officially starts (supports both MATCH_START and game_started)
    const handleGameStart = (data: any) => {
      const role = data.role || (data.yourPlayerId?.toLowerCase() === "p2" ? "p2" : "p1");
      const yourPlayerId: "P1" | "P2" = data.yourPlayerId || (role === "p2" ? "P2" : "P1");
      this.myRole = role;
      this.myPlayerId = yourPlayerId;
      console.log(`[Client] Assigned Role: ${yourPlayerId} (${role})`);
      const payload = {
        roomId: data.roomId || this.roomId || "",
        role,
        yourPlayerId,
        state: data.initialState || data.state,
      };
      this.listeners.onGameStarted?.(payload);
    };

    this.socket.on("MATCH_START" as any, handleGameStart);
    this.socket.on("game_started", handleGameStart);

    // PHASE_CHANGED
    this.socket.on("PHASE_CHANGED" as any, (data: { newPhase: TurnPhase }) => {
      console.log(`[Client] Received PHASE_CHANGED: ${data.newPhase}`);
      this.listeners.onPhaseChanged?.(data.newPhase);
    });

    // SYNC_GAME_STATE (supports both event names)
    const handleSync = (data: { state: SanitizedGameState; events: GameEvent[] }) => {
      this.listeners.onSyncGameState?.(data);
    };
    this.socket.on("game_state_update", handleSync);
    this.socket.on("SYNC_GAME_STATE", handleSync);

    // ACTION_REJECTED (supports both event names)
    const handleReject = (data: { reason: string }) => {
      this.listeners.onActionRejected?.(data.reason);
    };
    this.socket.on("action_rejected", handleReject);
    this.socket.on("ACTION_REJECTED", handleReject);

    // EVENT_COMBAT_STEP (supports both event names)
    const handleCombatStep = (data: any) => {
      this.listeners.onCombatStep?.(data);
    };
    this.socket.on("combat_step", handleCombatStep);
    this.socket.on("EVENT_COMBAT_STEP", handleCombatStep);

    // OPPONENT_DISCONNECTED (supports both event names)
    this.socket.on("opponent_disconnected", ({ countdownSec }) => {
      this.listeners.onOpponentDisconnected?.(countdownSec);
    });
    this.socket.on("OPPONENT_DISCONNECTED", (data: any) => {
      this.listeners.onOpponentDisconnected?.(data?.countdownSec ?? 0);
    });

    // GAME_OVER
    this.socket.on("game_over", ({ winner, reason }) => {
      this.listeners.onGameOver?.(winner, reason);
    });

    // SYNC_ERROR
    this.socket.on("SYNC_ERROR" as any, (data: { message: string }) => {
      console.error(`[NetworkService] SYNC_ERROR received:`, data);
      this.listeners.onSyncError?.(data?.message || "Match sync error on server.");
    });

    // EVENT_ACTION_LOGGED (Centralized Action History Broadcasting)
    const handleActionLogged = (data: any) => {
      console.log(`[NetworkService] Received EVENT_ACTION_LOGGED:`, data);
      this.listeners.onActionLogged?.(data);
    };
    this.socket.on("EVENT_ACTION_LOGGED" as any, handleActionLogged);
    this.socket.on("action_logged" as any, handleActionLogged);

    // In-game chat
    this.socket.on("chat_broadcast", (data) => {
      this.listeners.onChat?.(data);
    });
  }

  // ── Room & Lobby Actions ─────────────────────────────────────

  public createRoom(playerName?: string): Promise<{ success: boolean; roomId?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: "Not connected to server." });
      }

      const name = playerName || this.playerName;
      this.socket.emit("create_room", { playerName: name }, (res: any) => {
        if (res.success) {
          this.roomId = res.roomId;
          this.myRole = "p1";
          resolve({ success: true, roomId: res.roomId });
        } else {
          resolve({ success: false, error: "Failed to create room." });
        }
      });
    });
  }

  public joinRoom(roomId: string, playerName?: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: "Not connected to server." });
      }

      const cleanCode = roomId.trim().toUpperCase();
      const name = playerName || this.playerName;

      this.socket.emit("join_room", { roomId: cleanCode, playerName: name }, (res: any) => {
        if (res.success) {
          this.roomId = res.roomId || cleanCode;
          this.myRole = res.role || "p2";
          resolve({ success: true });
        } else {
          resolve({ success: false, error: res.error || "Failed to join room." });
        }
      });
    });
  }

  public matchmake(playerName?: string): Promise<{ success: boolean; roomId?: string; role?: "p1" | "p2" }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false });
      }

      const name = playerName || this.playerName;
      this.socket.emit("matchmake", { playerName: name }, (res: any) => {
        if (res.success) {
          this.roomId = res.roomId;
          this.myRole = res.role;
          resolve({ success: true, roomId: res.roomId, role: res.role });
        } else {
          resolve({ success: false });
        }
      });
    });
  }

  public submitLoadout(hero: Hero, deck: Card[]): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) return resolve(false);

      this.socket.emit("submit_loadout", { roomId: this.roomId, hero, deck }, (res: any) => {
        resolve(res?.success ?? false);
      });
    });
  }

  public lockInPlayer(hero: Hero, deck: Card[]): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) return resolve(false);

      const payload = {
        roomId: this.roomId,
        heroId: hero.id,
        deckCardIds: deck.map((c) => c.id),
        hero,
        deck,
      };

      this.socket.emit("PLAYER_LOCK_IN" as any, payload, (res: any) => {
        if (res?.success) {
          resolve(true);
        } else {
          // Fallback to submit_loadout
          this.socket?.emit("submit_loadout", { roomId: this.roomId, hero, deck }, (res2: any) => {
            resolve(res2?.success ?? false);
          });
        }
      });
    });
  }

  public submitMulligan(replacedCardIds: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) return resolve(false);

      this.socket.emit("submit_mulligan", { roomId: this.roomId, replacedCardIds }, (res: any) => {
        resolve(res?.success ?? false);
      });
    });
  }

  // ── In-Game Gameplay Actions ─────────────────────────────────

  /**
   * Dispatches card play action to the authoritative server.
   * Emits both ACTION_PLAY_CARD and play_card for total interoperability.
   */
  public playCard(
    cardId: string,
    laneIndex?: number,
    targetId?: string,
    slotType?: "frontline" | "support",
  ): Promise<{ success: boolean; error?: string; events?: GameEvent[] }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) {
        return resolve({ success: false, error: "Not in active online match." });
      }

      const payload = {
        roomId: this.roomId,
        cardId,
        laneIndex,
        targetId,
        slotType,
      };

      this.socket.emit("ACTION_PLAY_CARD", payload, (res: any) => {
        resolve(res || { success: true });
      });
    });
  }

  /**
   * Dispatches pass phase action to the authoritative server.
   * Emits both ACTION_PASS_PHASE and pass_turn for total interoperability.
   */
  public passPhase(): Promise<{ success: boolean; error?: string; events?: GameEvent[] }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) {
        return resolve({ success: false, error: "Not in active online match." });
      }

      this.socket.emit("ACTION_PASS_PHASE", { roomId: this.roomId }, (res: any) => {
        resolve(res || { success: true });
      });
    });
  }

  public sendChat(text: string): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit("chat_message", { roomId: this.roomId, text });
  }

  public leaveMatch(): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit("leave_room", { roomId: this.roomId });
    this.roomId = null;
    this.myRole = null;
    this.isOnlineMode = false;
  }
}

export const networkService = NetworkService.getInstance();
