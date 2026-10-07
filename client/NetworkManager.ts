// ============================================================
//  client/NetworkManager.ts — Client-Side WebSocket Game Client
//  Connects to the Authoritative Node.js Server via Socket.io
// ============================================================

import { io, Socket } from "socket.io-client";
import { Card, GameEvent, Hero, PlayerId } from "../src/types";
import {
  ClientToServerEvents,
  RoomStatus,
  SanitizedGameState,
  ServerToClientEvents,
} from "../server/types";

export type SocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface NetworkCallbacks {
  onRoomState?: (data: {
    roomId: string;
    status: RoomStatus;
    p1?: { name: string; ready: boolean; heroName?: string };
    p2?: { name: string; ready: boolean; heroName?: string };
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
  onStateUpdate?: (data: {
    state: SanitizedGameState;
    events: GameEvent[];
  }) => void;
  onActionRejected?: (reason: string) => void;
  onGameOver?: (winner: PlayerId | "DRAW", reason?: string) => void;
  onOpponentDisconnected?: (countdownSec: number) => void;
  onOpponentReconnected?: () => void;
  onChat?: (data: { sender: string; text: string; timestamp: number }) => void;
}

export class NetworkManager {
  private static instance: NetworkManager;
  private socket: SocketClient | null = null;
  private serverUrl: string;
  private callbacks: NetworkCallbacks = {};

  public roomId: string | null = null;
  public myRole: "p1" | "p2" | null = null;
  public myPlayerId: "P1" | "P2" | null = null;
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

  public static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }

  public setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // ── Connection ───────────────────────────────────────────────

  public connect(url?: string): Promise<boolean> {
    if (url) this.serverUrl = url;

    return new Promise((resolve) => {
      if (this.socket && this.socket.connected) {
        return resolve(true);
      }

      this.socket = io(this.serverUrl, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ["websocket", "polling"],
      }) as SocketClient;

      this.socket.on("connect", () => {
        console.log(`[NetworkManager] Connected to authoritative game server at ${this.serverUrl}`);
        resolve(true);
      });

      this.socket.on("connect_error", (err) => {
        console.warn(`[NetworkManager] Connection failed to ${this.serverUrl}:`, err.message);
        resolve(false);
      });

      // P0 Fix #4: On auto-reconnect, re-register with the server so it
      // can resend the current game state and restart the turn timer.
      this.socket.on("connect", () => {
        if (this.roomId && this.myRole) {
          console.log(`[NetworkManager] Auto-reconnect detected. Re-registering as ${this.myRole} in room ${this.roomId}`);
          (this.socket as any).emit(
            "reconnect_player",
            { roomId: this.roomId, role: this.myRole },
            (res: { success: boolean; error?: string }) => {
              if (res?.success) {
                console.log(`[NetworkManager] Reconnect acknowledged by server.`);
              } else {
                console.warn(`[NetworkManager] Reconnect rejected:`, res?.error);
              }
            },
          );
        }
      });

      this.setupListeners();
    });
  }

  /** Manually re-register with the server after a detected state loss. */
  public reconnectToRoom(): void {
    if (!this.socket || !this.roomId || !this.myRole) return;
    (this.socket as any).emit(
      "reconnect_player",
      { roomId: this.roomId, role: this.myRole },
      (res: { success: boolean; error?: string }) => {
        if (res?.success) {
          console.log(`[NetworkManager] Manual reconnect acknowledged.`);
        } else {
          console.warn(`[NetworkManager] Manual reconnect rejected:`, res?.error);
        }
      },
    );
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on("room_state", (data) => {
      this.callbacks.onRoomState?.(data);
    });

    this.socket.on("mulligan_started", (data) => {
      this.callbacks.onMulliganStarted?.(data);
    });

    const handleGameStart = (data: any) => {
      const role = data.role || (data.yourPlayerId?.toLowerCase() === "p2" ? "p2" : "p1");
      const yourPlayerId: "P1" | "P2" = data.yourPlayerId || (role === "p2" ? "P2" : "P1");
      this.myRole = role;
      this.myPlayerId = yourPlayerId;
      console.log(`[NetworkManager] Assigned Role: ${yourPlayerId} (${role})`);
      const payload = {
        roomId: data.roomId || this.roomId || "",
        role,
        yourPlayerId,
        state: data.initialState || data.state,
      };
      this.callbacks.onGameStarted?.(payload);
    };

    (this.socket as any).on("MATCH_START", handleGameStart);
    this.socket.on("game_started", handleGameStart);

    (this.socket as any).on("PHASE_CHANGED", (data: { newPhase: TurnPhase }) => {
      console.log(`[NetworkManager] Received PHASE_CHANGED: ${data.newPhase}`);
      this.callbacks.onPhaseChanged?.(data.newPhase);
    });

    this.socket.on("game_state_update", (data) => {
      this.callbacks.onStateUpdate?.(data);
    });

    this.socket.on("action_rejected", ({ reason }) => {
      this.callbacks.onActionRejected?.(reason);
    });

    this.socket.on("game_over", ({ winner, reason }) => {
      this.callbacks.onGameOver?.(winner, reason);
    });

    this.socket.on("opponent_disconnected", ({ countdownSec }) => {
      this.callbacks.onOpponentDisconnected?.(countdownSec);
    });

    this.socket.on("opponent_reconnected", () => {
      this.callbacks.onOpponentReconnected?.();
    });

    this.socket.on("chat_broadcast", (data) => {
      this.callbacks.onChat?.(data);
    });
  }

  // ── Lobby & Matchmaking Actions ──────────────────────────────

  public createRoom(playerName?: string): Promise<{ success: boolean; roomId?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: "Not connected to server." });
      }

      const name = playerName || this.playerName;
      this.socket.emit("create_room", { playerName: name }, (res) => {
        if (res.success) {
          this.roomId = res.roomId;
          this.myRole = "p1";
          resolve({ success: true, roomId: res.roomId });
        } else {
          resolve({ success: false, error: "Could not create room." });
        }
      });
    });
  }

  public joinRoom(roomId: string, playerName?: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: "Not connected to server." });
      }

      const name = playerName || this.playerName;
      this.socket.emit("join_room", { roomId, playerName: name }, (res) => {
        if (res.success && res.roomId) {
          this.roomId = res.roomId;
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
      this.socket.emit("matchmake", { playerName: name }, (res) => {
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

  // ── In-Match Gameplay Actions ────────────────────────────────

  public submitLoadout(hero: Hero, deck: Card[]): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) return resolve(false);

      this.socket.emit("submit_loadout", { roomId: this.roomId, hero, deck }, (res) => {
        resolve(res.success);
      });
    });
  }

  public submitMulligan(replacedCardIds: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) return resolve(false);

      this.socket.emit("submit_mulligan", { roomId: this.roomId, replacedCardIds }, (res) => {
        resolve(res.success);
      });
    });
  }

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

      this.socket.emit(
        "play_card",
        {
          roomId: this.roomId,
          cardId,
          ...(laneIndex !== undefined ? { laneIndex } : {}),
          ...(targetId !== undefined ? { targetId } : {}),
          ...(slotType !== undefined ? { slotType } : {}),
        },
        (res) => {
          resolve(res);
        },
      );
    });
  }

  public passTurn(): Promise<{ success: boolean; error?: string; events?: GameEvent[] }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.roomId) {
        return resolve({ success: false, error: "Not in active online match." });
      }

      this.socket.emit("pass_turn", { roomId: this.roomId }, (res) => {
        resolve(res);
      });
    });
  }

  public sendChat(text: string): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit("chat_message", { roomId: this.roomId, text });
  }

  public leaveRoom(): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit("leave_room", { roomId: this.roomId });
    this.roomId = null;
    this.myRole = null;
  }
}

export const net = NetworkManager.getInstance();
