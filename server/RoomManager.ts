// ============================================================
//  server/RoomManager.ts — In-Memory Room & Matchmaking Registry
// ============================================================

import { v4 as uuidv4 } from "uuid";
import { GameRoom } from "./types";
import { GameSession } from "./GameSession";

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, { roomId: string; role: "p1" | "p2" }> = new Map();
  private sessions: Map<string, GameSession> = new Map();
  private matchmakingQueue: Array<{ socketId: string; playerName: string }> = [];

  // ── Room Creation & Lookup ───────────────────────────────────

  public createRoom(socketId: string, playerName = "Player 1"): { room: GameRoom; role: "p1"; reconnectToken: string } {
    // Generate a user-friendly 6-character room code
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    const reconnectToken = uuidv4();

    const room: GameRoom = {
      roomId,
      createdAt: Date.now(),
      status: "LOBBY",
      players: {
        p1: {
          socketId,
          playerName,
          role: "p1",
          reconnectToken,
          ready: false,
          connected: true,
        },
      },
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(socketId, { roomId, role: "p1" });
    this.sessions.set(roomId, new GameSession(room));

    return { room, role: "p1", reconnectToken };
  }

  public joinRoom(
    roomId: string,
    socketId: string,
    playerName = "Player 2",
  ): { success: boolean; room?: GameRoom; role?: "p1" | "p2"; reconnectToken?: string; error?: string } {
    const cleanId = roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanId);

    if (!room) {
      return { success: false, error: `Room ${cleanId} not found.` };
    }

    if (room.status !== "LOBBY") {
      return { success: false, error: `Room ${cleanId} is already in progress.` };
    }

    if (room.players.p1?.socketId === socketId) {
      return { success: true, room, role: "p1", reconnectToken: room.players.p1.reconnectToken };
    }

    if (room.players.p2?.socketId === socketId) {
      return { success: true, room, role: "p2", reconnectToken: room.players.p2.reconnectToken };
    }

    if (!room.players.p2) {
      const reconnectToken = uuidv4();
      room.players.p2 = {
        socketId,
        playerName,
        role: "p2",
        reconnectToken,
        ready: false,
        connected: true,
      };
      this.socketToRoom.set(socketId, { roomId: cleanId, role: "p2" });
      return { success: true, room, role: "p2", reconnectToken };
    }

    return { success: false, error: `Room ${cleanId} is already full.` };
  }

  // ── Quick Matchmaking Queue ──────────────────────────────────

  public matchmake(
    socketId: string,
    playerName = "Challenger",
  ): { success: boolean; room: GameRoom; role: "p1" | "p2"; reconnectToken: string } {
    // Check if an existing open lobby is looking for a 2nd player
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.status === "LOBBY" && room.players.p1 && !room.players.p2) {
        if (room.players.p1.socketId !== socketId) {
          const joinRes = this.joinRoom(roomId, socketId, playerName);
          if (joinRes.success && joinRes.room && joinRes.reconnectToken) {
            return { success: true, room: joinRes.room, role: "p2", reconnectToken: joinRes.reconnectToken };
          }
        }
      }
    }

    // Otherwise create a fresh room
    const { room, role, reconnectToken } = this.createRoom(socketId, playerName);
    return { success: true, room, role, reconnectToken };
  }

  // ── Accessors ────────────────────────────────────────────────

  public getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  public getSession(roomId: string): GameSession | undefined {
    return this.sessions.get(roomId.toUpperCase());
  }

  public getPlayerRole(socketId: string): { roomId: string; role: "p1" | "p2" } | undefined {
    return this.socketToRoom.get(socketId);
  }

  public listAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  public listPublicRooms(): Array<{ roomId: string; status: string; p1Name?: string; p2Name?: string }> {
    const list: Array<{ roomId: string; status: string; p1Name?: string; p2Name?: string }> = [];
    for (const [roomId, r] of this.rooms.entries()) {
      list.push({
        roomId,
        status: r.status,
        p1Name: r.players.p1?.playerName,
        p2Name: r.players.p2?.playerName,
      });
    }
    return list;
  }

  // ── Disconnect & Reconnect ───────────────────────────────────

  public handleDisconnect(
    socketId: string,
    onForfeit: (room: GameRoom, forfeitRole: "p1" | "p2") => void,
  ): { room?: GameRoom; role?: "p1" | "p2" } {
    const meta = this.socketToRoom.get(socketId);
    if (!meta) return {};

    const { roomId, role } = meta;
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const player = role === "p1" ? room.players.p1 : room.players.p2;
    if (player) {
      player.connected = false;
    }

    // If game is in progress, start 30s forfeit countdown
    if (room.status === "IN_GAME" || room.status === "MULLIGAN") {
      if (!room.disconnectTimers) room.disconnectTimers = {};
      room.disconnectTimers[role] = setTimeout(() => {
        onForfeit(room, role);
      }, 30000);
    } else if (room.status === "LOBBY") {
      // In lobby, immediately remove player
      if (role === "p1") {
        this.cleanupRoom(roomId);
      } else {
        delete room.players.p2;
        this.socketToRoom.delete(socketId);
      }
    }

    return { room, role };
  }

  public handleReconnect(
    socketId: string,
    roomId: string,
    role: "p1" | "p2",
    reconnectToken?: string,
  ): { success: boolean; error?: string } {
    const cleanId = roomId.toUpperCase();
    const room = this.rooms.get(cleanId);
    if (!room) return { success: false, error: `Room ${cleanId} not found.` };

    if (room.status === "FINISHED") {
      return { success: false, error: "Match has already concluded." };
    }

    const player = role === "p1" ? room.players.p1 : room.players.p2;
    if (!player) return { success: false, error: `Player slot ${role} not found in room ${cleanId}.` };

    // Validate reconnect token: mandatory when assigned to slot
    if (player.reconnectToken) {
      if (!reconnectToken || player.reconnectToken !== reconnectToken) {
        return { success: false, error: "Invalid reconnect token." };
      }
    }

    // Clear old socket mapping if socketId has changed
    if (player.socketId && player.socketId !== socketId) {
      this.socketToRoom.delete(player.socketId);
    }

    player.socketId = socketId;
    player.connected = true;

    // Clear forfeit timer if any
    if (room.disconnectTimers && room.disconnectTimers[role]) {
      clearTimeout(room.disconnectTimers[role]!);
      delete room.disconnectTimers[role];
    }

    this.socketToRoom.set(socketId, { roomId: cleanId, role });
    return { success: true };
  }

  public cleanupRoom(roomId: string): void {
    const cleanId = roomId.toUpperCase();
    const room = this.rooms.get(cleanId);
    if (!room) return;

    if (room.players.p1?.socketId) this.socketToRoom.delete(room.players.p1.socketId);
    if (room.players.p2?.socketId) this.socketToRoom.delete(room.players.p2.socketId);

    if (room.disconnectTimers?.p1) clearTimeout(room.disconnectTimers.p1);
    if (room.disconnectTimers?.p2) clearTimeout(room.disconnectTimers.p2);

    this.sessions.delete(cleanId);
    this.rooms.delete(cleanId);
  }
}
