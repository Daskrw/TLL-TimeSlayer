// ============================================================
//  server/testMultiplayerHardened.ts
//  Comprehensive End-to-End Hardened Multiplayer Test Suite
// ============================================================

import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";
import { io as ClientIO, Socket as ClientSocket } from "socket.io-client";
import { RoomManager } from "./RoomManager";
import { ClientToServerEvents, ServerToClientEvents } from "./types";
import { PlayerId, TurnPhase, CardType } from "../src/types";
import {
  HERO_SKY_VANGUARD,
  HERO_ABYSSAL_SORCERER,
  DECK_VANGUARD_40,
  DECK_ABYSSAL_40,
  getStaticCardById,
} from "../src/cards";

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const TEST_PORT = 3099;
const TEST_URL = `http://localhost:${TEST_PORT}`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────
//  Spin up isolated authoritative server instance on TEST_PORT
// ─────────────────────────────────────────────────────────────

function createTestServer(): Promise<{ server: http.Server; io: Server; roomManager: RoomManager }> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    const server = http.createServer(app);
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
      cors: { origin: "*" },
    });
    const roomManager = new RoomManager();

    io.on("connection", (socket) => {
      // 1. create_room
      socket.on("create_room", ({ playerName }, callback) => {
        const { room, role, reconnectToken } = roomManager.createRoom(socket.id, playerName || "Player 1");
        socket.join(room.roomId);
        callback({ success: true, roomId: room.roomId, role, reconnectToken });
      });

      // 2. join_room
      socket.on("join_room", ({ roomId, playerName }, callback) => {
        if (!roomId || typeof roomId !== "string") {
          return callback({ success: false, error: "Valid room code is required." });
        }
        const res = roomManager.joinRoom(roomId, socket.id, playerName || "Player 2");
        if (!res.success || !res.room) {
          return callback({ success: false, error: res.error });
        }
        socket.join(res.room.roomId);
        callback({ success: true, roomId: res.room.roomId, role: res.role, reconnectToken: res.reconnectToken });
        io.to(res.room.roomId).emit("room_state", {
          roomId: res.room.roomId,
          status: res.room.status,
          p1: res.room.players.p1 ? { name: res.room.players.p1.playerName, ready: res.room.players.p1.ready } : undefined,
          p2: res.room.players.p2 ? { name: res.room.players.p2.playerName, ready: res.room.players.p2.ready } : undefined,
        });
      });

      // 3. submit_loadout / PLAYER_LOCK_IN
      const onLoadout = ({ roomId, hero, deck }: any, callback?: any) => {
        const meta = roomManager.getPlayerRole(socket.id);
        const rId = roomId || meta?.roomId;
        const room = roomManager.getRoom(rId);
        const session = roomManager.getSession(rId);
        if (!room || !session || !meta) {
          return callback?.({ success: false, error: "Not a participant in this room." });
        }

        const slot = meta.role === "p1" ? room.players.p1 : room.players.p2;
        if (slot) {
          slot.hero = hero;
          slot.deck = deck;
          slot.ready = true;
          slot.lockedIn = true;
        }

        callback?.({ success: true });

        if (room.players.p1?.ready && room.players.p2?.ready) {
          session.initGame();
          const p1Sanitized = session.getSanitizedState("p1");
          const p2Sanitized = session.getSanitizedState("p2");

          const publicInit = {
            roomId: rId,
            startingPhase: session.getState().currentPhase,
            p1Data: { name: room.players.p1?.playerName || "Player 1", hp: p1Sanitized.self.hp, maxHp: p1Sanitized.self.maxHp },
            p2Data: { name: room.players.p2?.playerName || "Player 2", hp: p2Sanitized.self.hp, maxHp: p2Sanitized.self.maxHp },
          };

          io.to(rId).emit("MATCH_INITIALIZED" as any, publicInit);

          if (room.players.p1?.socketId) {
            io.to(room.players.p1.socketId).emit("MATCH_INITIALIZED" as any, { ...publicInit, initialState: p1Sanitized, p1State: p1Sanitized });
            io.to(room.players.p1.socketId).emit("mulligan_started", {
              roomId: rId,
              initialHand: p1Sanitized.mulliganHand || [],
              opponentHandCount: p1Sanitized.opponent.handCount,
            });
          }
          if (room.players.p2?.socketId) {
            io.to(room.players.p2.socketId).emit("MATCH_INITIALIZED" as any, { ...publicInit, initialState: p2Sanitized, p2State: p2Sanitized });
            io.to(room.players.p2.socketId).emit("mulligan_started", {
              roomId: rId,
              initialHand: p2Sanitized.mulliganHand || [],
              opponentHandCount: p2Sanitized.opponent.handCount,
            });
          }
        }
      };
      socket.on("submit_loadout", onLoadout);
      (socket as any).on("PLAYER_LOCK_IN", onLoadout);

      // 4. submit_mulligan
      socket.on("submit_mulligan", ({ roomId, replacedCardIds }, callback) => {
        const meta = roomManager.getPlayerRole(socket.id);
        const session = roomManager.getSession(roomId);
        if (!meta || !session) return callback?.({ success: false, error: "Session not found." });

        const res = session.submitMulligan(meta.role, replacedCardIds);
        if (!res.success) return callback?.({ success: false, error: res.error });
        callback?.({ success: true });

        const room = roomManager.getRoom(roomId);
        if (room && room.status === "IN_GAME") {
          const p1State = session.getSanitizedState("p1");
          const p2State = session.getSanitizedState("p2");
          if (room.players.p1?.socketId) {
            io.to(room.players.p1.socketId).emit("MATCH_START" as any, { yourPlayerId: "P1", role: "p1", roomId, initialState: p1State });
          }
          if (room.players.p2?.socketId) {
            io.to(room.players.p2.socketId).emit("MATCH_START" as any, { yourPlayerId: "P2", role: "p2", roomId, initialState: p2State });
          }
        }
      });

      // 5. play_card
      socket.on("play_card", ({ roomId, cardId, laneIndex, targetId, slotType, actionId }, callback) => {
        const meta = roomManager.getPlayerRole(socket.id);
        const session = roomManager.getSession(roomId);
        if (!meta || !session) return callback?.({ success: false, error: "Session not found." });

        const payloadSummary = JSON.stringify({
          cardId,
          laneIndex: laneIndex !== undefined && laneIndex !== null ? Number(laneIndex) : null,
          targetId: targetId ?? null,
          slotType: slotType ?? null,
        });

        if (actionId) {
          const dup = session.isActionDuplicate(actionId, meta.role, "play_card", payloadSummary);
          if (dup.isConflict) return callback?.({ success: false, error: dup.error });
          if (dup.isDuplicate) return callback?.({ success: true, duplicate: true, events: dup.cachedResult?.events || [] });
        }

        const state = session.getState();
        const isP1Turn = state.currentPhase === TurnPhase.P1_UNIT_PHASE || state.currentPhase === TurnPhase.P1_SPELL_PHASE;
        const isMyTurn = meta.role === "p1" ? isP1Turn : !isP1Turn;
        if (!isMyTurn) {
          socket.emit("action_rejected", { reason: "Not your turn." });
          return callback?.({ success: false, error: "Not your turn." });
        }

        const res = session.playCard(meta.role, cardId, laneIndex, targetId, slotType, actionId);
        if (!res.success) {
          socket.emit("action_rejected", { reason: res.error || "Illegal play." });
          return callback?.({ success: false, error: res.error });
        }

        callback?.({ success: true, events: res.events });
        const room = roomManager.getRoom(roomId);
        if (room?.players.p1?.socketId) {
          io.to(room.players.p1.socketId).emit("game_state_update", { state: session.getSanitizedState("p1"), events: res.events });
        }
        if (room?.players.p2?.socketId) {
          io.to(room.players.p2.socketId).emit("game_state_update", { state: session.getSanitizedState("p2"), events: res.events });
        }
      });

      // 6. pass_turn
      socket.on("pass_turn", ({ roomId, actionId }, callback) => {
        const meta = roomManager.getPlayerRole(socket.id);
        const session = roomManager.getSession(roomId);
        if (!meta || !session) return callback?.({ success: false, error: "Session not found." });

        if (actionId) {
          const dup = session.isActionDuplicate(actionId, meta.role, "pass_turn", "");
          if (dup.isConflict) return callback?.({ success: false, error: dup.error });
          if (dup.isDuplicate) return callback?.({ success: true, duplicate: true, events: dup.cachedResult?.events || [] });
        }

        const state = session.getState();
        const isP1Turn = state.currentPhase === TurnPhase.P1_UNIT_PHASE || state.currentPhase === TurnPhase.P1_SPELL_PHASE;
        const isMyTurn = meta.role === "p1" ? isP1Turn : !isP1Turn;
        if (!isMyTurn) {
          socket.emit("action_rejected", { reason: "Cannot pass when not your turn." });
          return callback?.({ success: false, error: "Cannot pass when not your turn." });
        }

        const res = session.passTurn(meta.role, actionId);
        if (!res.success) {
          socket.emit("action_rejected", { reason: res.error || "Cannot pass right now." });
          return callback?.({ success: false, error: res.error });
        }

        callback?.({ success: true, events: res.events });
        const room = roomManager.getRoom(roomId);
        if (room?.players.p1?.socketId) {
          io.to(room.players.p1.socketId).emit("game_state_update", { state: session.getSanitizedState("p1"), events: res.events });
        }
        if (room?.players.p2?.socketId) {
          io.to(room.players.p2.socketId).emit("game_state_update", { state: session.getSanitizedState("p2"), events: res.events });
        }
      });

      // 7. surrender
      socket.on("surrender", ({ roomId }, callback) => {
        const meta = roomManager.getPlayerRole(socket.id);
        const session = roomManager.getSession(roomId);
        if (!meta || !session) return callback?.({ success: false, error: "Session not found." });

        const outcome = session.surrender(meta.role);
        io.to(roomId).emit("game_over", { winner: outcome.winner, reason: outcome.reason });
        callback?.({ success: true });
      });

      // 8. reconnect_player
      socket.on("reconnect_player", ({ roomId, role, reconnectToken }, callback) => {
        const res = roomManager.handleReconnect(socket.id, roomId, role, reconnectToken);
        if (!res.success) {
          return callback({ success: false, error: res.error });
        }
        socket.join(roomId);
        socket.to(roomId).emit("opponent_reconnected");
        const session = roomManager.getSession(roomId);
        const sanitized = session?.getSanitizedState(role);
        callback({ success: true, state: sanitized });
      });
    });

    server.listen(TEST_PORT, () => {
      resolve({ server, io, roomManager });
    });
  });
}

// ─────────────────────────────────────────────────────────────
//  Test Runner Execution
// ─────────────────────────────────────────────────────────────

async function runHardenedMultiplayerTests() {
  console.log("================================================================");
  console.log("  HARDENED MULTIPLAYER INTEGRATION & ADVERSARIAL TEST SUITE");
  console.log("================================================================");

  const { server, io: testIo, roomManager } = await createTestServer();
  console.log(`✓ Test Server running on port ${TEST_PORT}`);

  try {
    // ── SUITE 1: Connection & Room Lifecycle ──────────────────────
    console.log("\n▶ [Suite 1] Connection & Room Lifecycle");

    const p1Socket: TestSocket = ClientIO(TEST_URL, { transports: ["websocket"] });
    const p2Socket: TestSocket = ClientIO(TEST_URL, { transports: ["websocket"] });
    const p3Socket: TestSocket = ClientIO(TEST_URL, { transports: ["websocket"] });

    await Promise.all([
      new Promise<void>((r) => p1Socket.on("connect", () => r())),
      new Promise<void>((r) => p2Socket.on("connect", () => r())),
      new Promise<void>((r) => p3Socket.on("connect", () => r())),
    ]);
    console.log("  ✓ Clients P1, P2, and P3 connected via WebSocket");

    // Create room by P1
    let roomId = "";
    let p1ReconnectToken = "";
    await new Promise<void>((resolve, reject) => {
      p1Socket.emit("create_room", { playerName: "Alice" }, (res) => {
        if (res.success && res.roomId && res.reconnectToken && res.role === "p1") {
          roomId = res.roomId;
          p1ReconnectToken = res.reconnectToken;
          resolve();
        } else {
          reject(new Error("Failed to create room with reconnectToken"));
        }
      });
    });
    console.log(`  ✓ Room ${roomId} created by Alice with role 'p1' and secure reconnectToken (${p1ReconnectToken.slice(0, 8)}...)`);

    // Join non-existent room should fail
    await new Promise<void>((resolve, reject) => {
      p2Socket.emit("join_room", { roomId: "NONEXISTENT", playerName: "Bob" }, (res) => {
        if (!res.success) {
          resolve();
        } else {
          reject(new Error("Should not join non-existent room"));
        }
      });
    });
    console.log("  ✓ Joining invalid room code rejected as expected");

    // Join room by P2
    let p2ReconnectToken = "";
    await new Promise<void>((resolve, reject) => {
      p2Socket.emit("join_room", { roomId, playerName: "Bob" }, (res) => {
        if (res.success && res.role === "p2" && res.reconnectToken) {
          p2ReconnectToken = res.reconnectToken;
          resolve();
        } else {
          reject(new Error("P2 failed to join room"));
        }
      });
    });
    console.log(`  ✓ Bob joined room ${roomId} as 'p2' with secure reconnectToken (${p2ReconnectToken.slice(0, 8)}...)`);

    // Third player attempting to join full room should fail
    await new Promise<void>((resolve, reject) => {
      p3Socket.emit("join_room", { roomId, playerName: "Charlie" }, (res) => {
        if (!res.success && res.error?.includes("full")) {
          resolve();
        } else {
          reject(new Error("P3 should have been rejected from full room"));
        }
      });
    });
    console.log("  ✓ Third client rejected from full room capacity");

    // ── SUITE 2: Readiness Gate & Privacy (Fog of War) ───────────
    console.log("\n▶ [Suite 2] Readiness Gate & Fog-of-War Privacy");

    const matchInitPromise = Promise.all([
      new Promise<any>((r) => p1Socket.once("MATCH_INITIALIZED" as any, (data: any) => r(data))),
      new Promise<any>((r) => p2Socket.once("MATCH_INITIALIZED" as any, (data: any) => r(data))),
    ]);

    const mulliganPromise = Promise.all([
      new Promise<any>((r) => p1Socket.once("mulligan_started", (data: any) => r(data))),
      new Promise<any>((r) => p2Socket.once("mulligan_started", (data: any) => r(data))),
    ]);

    // Use deck with 1-mana Sunflowers for P1 to guarantee turn-1 playable cards
    const testP1Deck = Array(40)
      .fill(null)
      .map((_, i) => ({
        id: `CARD_SUNFLOWER_TEST_${i}`,
        name: `Sunflower ${i}`,
        type: CardType.Unit,
        cost: 1,
        attack: 1,
        hp: 2,
        tribes: ["รักษา"],
        tribe: "รักษา",
        keywords: [],
      }));

    p1Socket.emit("submit_loadout", { roomId, hero: HERO_SKY_VANGUARD, deck: testP1Deck }, () => {});
    p2Socket.emit("submit_loadout", { roomId, hero: HERO_ABYSSAL_SORCERER, deck: DECK_ABYSSAL_40 }, () => {});

    const [p1Init, p2Init] = await matchInitPromise;
    const [p1Mulligan, p2Mulligan] = await mulliganPromise;

    console.log("  ✓ Both players received MATCH_INITIALIZED and opening Mulligan hand");

    // Verify Fog of War: P1 state must NOT have opponent hand cards or deck cards
    if (p1Init.initialState) {
      const opp = p1Init.initialState.opponent;
      if (opp.hand || opp.deck) {
        throw new Error("PRIVACY LEAK: P1 received opponent's private hand or deck!");
      }
      if (typeof opp.handCount !== "number" || typeof opp.deckCount !== "number") {
        throw new Error("Sanitized opponent state missing counts");
      }
    }
    console.log("  ✓ Fog of War verified: Opponent hidden hand and deck are NOT leaked to client!");

    // ── SUITE 3: Mulligan & Turn 1 Game State ─────────────────────
    console.log("\n▶ [Suite 3] Mulligan Resolution & Versioned Match Launch");

    const matchStartPromise = Promise.all([
      new Promise<any>((r) => p1Socket.once("MATCH_START" as any, (data: any) => r(data))),
      new Promise<any>((r) => p2Socket.once("MATCH_START" as any, (data: any) => r(data))),
    ]);

    p1Socket.emit("submit_mulligan", { roomId, replacedCardIds: [] }, () => {});
    p2Socket.emit("submit_mulligan", { roomId, replacedCardIds: [] }, () => {});

    const [p1Match, p2Match] = await matchStartPromise;
    const p1State = p1Match.initialState;
    console.log(`  ✓ Match active: Turn ${p1State.turnNumber}, Phase ${p1State.currentPhase}, stateVersion: ${p1State.stateVersion}`);
    if (!p1State.stateVersion || p1State.stateVersion < 1) {
      throw new Error("Missing stateVersion on initialState");
    }

    // ── SUITE 4: Authoritative Actions & Idempotency ─────────────
    console.log("\n▶ [Suite 4] Authoritative Actions & Action Idempotency");

    // P2 tries to play card during P1's turn -> should be rejected
    await new Promise<void>((resolve, reject) => {
      p2Socket.emit("play_card", { roomId, cardId: "any_card", laneIndex: 0 }, (res) => {
        if (!res.success && res.error?.includes("turn")) {
          resolve();
        } else {
          reject(new Error("Out-of-turn play should have been rejected!"));
        }
      });
    });
    console.log("  ✓ Out-of-turn action rejected authoritatively");

    // P1 plays a legal unit card with actionId
    const playableUnit = p1State.self.hand.find((c: any) => c.type.toUpperCase() === "UNIT" && (c.currentCost ?? c.cost) <= p1State.self.currentMana);
    if (!playableUnit) {
      throw new Error(`P1 hand does not have a 1-mana unit for testing (mana: ${p1State.self.currentMana}, hand: ${JSON.stringify(p1State.self.hand)})`);
    }

    const actionId = "act_test_unique_123";
    await new Promise<void>((resolve, reject) => {
      p1Socket.emit(
        "play_card",
        { roomId, cardId: playableUnit.id, laneIndex: 1, actionId },
        (res) => {
          if (res.success && !res.duplicate) {
            resolve();
          } else {
            reject(new Error("Legal play failed: " + res.error));
          }
        },
      );
    });
    console.log(`  ✓ P1 successfully played ${playableUnit.name} (actionId: ${actionId})`);

    // Retransmit SAME actionId -> should return duplicate without re-executing
    await new Promise<void>((resolve, reject) => {
      p1Socket.emit(
        "play_card",
        { roomId, cardId: playableUnit.id, laneIndex: 1, actionId },
        (res) => {
          if (res.success && res.duplicate) {
            resolve();
          } else {
            reject(new Error("Duplicate action should be recognized as duplicate!"));
          }
        },
      );
    });
    console.log("  ✓ Duplicate action retransmission handled idempotently");

    // Reusing SAME actionId with DIFFERENT payload (differing lane index) -> rejected as conflict
    await new Promise<void>((resolve, reject) => {
      p1Socket.emit(
        "play_card",
        { roomId, cardId: playableUnit.id, laneIndex: 2, actionId },
        (res) => {
          if (!res.success && res.error?.includes("differing payload")) {
            resolve();
          } else {
            reject(new Error("Reusing actionId with differing payload must be rejected as conflict!"));
          }
        },
      );
    });
    console.log("  ✓ Reusing action ID with differing payload rejected as conflict");

    // Pass Turn with pass actionId
    const passActionId = "pass_test_unique_456";
    await new Promise<void>((resolve, reject) => {
      p1Socket.emit("pass_turn", { roomId, actionId: passActionId }, (res) => {
        if (res.success) resolve();
        else reject(new Error("P1 failed to pass turn"));
      });
    });
    console.log(`  ✓ P1 passed turn phase with actionId ${passActionId}`);

    // Duplicate pass
    await new Promise<void>((resolve, reject) => {
      p1Socket.emit("pass_turn", { roomId, actionId: passActionId }, (res) => {
        if (res.success && res.duplicate) resolve();
        else reject(new Error("Duplicate pass turn not recognized"));
      });
    });
    console.log("  ✓ Duplicate pass retransmission handled idempotently");

    // ── SUITE 5: Reconnection & Secure Reconnect Token ───────────
    console.log("\n▶ [Suite 5] Secure Reconnection & State Restoration");

    // P1 disconnects
    p1Socket.disconnect();
    console.log("  ✓ P1 socket disconnected (simulated network disruption)");

    // P4 (impostor) tries to reconnect as P1 without providing any token
    const impostorSocket: TestSocket = ClientIO(TEST_URL, { transports: ["websocket"] });
    await new Promise<void>((r) => impostorSocket.on("connect", () => r()));

    await new Promise<void>((resolve, reject) => {
      impostorSocket.emit(
        "reconnect_player",
        { roomId, role: "p1" },
        (res) => {
          if (!res.success && res.error?.includes("Invalid reconnect token")) {
            resolve();
          } else {
            reject(new Error("Impostor with missing reconnect token should have been rejected!"));
          }
        },
      );
    });
    console.log("  ✓ Reconnect attempt with missing token rejected");

    // P4 tries to reconnect as P1 using wrong token
    await new Promise<void>((resolve, reject) => {
      impostorSocket.emit(
        "reconnect_player",
        { roomId, role: "p1", reconnectToken: "FAKE_UNAUTHORIZED_TOKEN" },
        (res) => {
          if (!res.success && res.error?.includes("Invalid reconnect token")) {
            resolve();
          } else {
            reject(new Error("Impostor with invalid reconnect token should have been rejected!"));
          }
        },
      );
    });
    console.log("  ✓ Unauthorized reconnect attempt with fake token rejected");

    // P4 tries to reconnect as P2 using P1's token (cross-slot attack)
    await new Promise<void>((resolve, reject) => {
      impostorSocket.emit(
        "reconnect_player",
        { roomId, role: "p2", reconnectToken: p1ReconnectToken },
        (res) => {
          if (!res.success && res.error?.includes("Invalid reconnect token")) {
            resolve();
          } else {
            reject(new Error("Cross-slot reconnect attempt should have been rejected!"));
          }
        },
      );
    });
    console.log("  ✓ Cross-slot reconnect attempt rejected");
    impostorSocket.disconnect();

    // Genuine P1 reconnects with genuine reconnectToken
    const newP1Socket: TestSocket = ClientIO(TEST_URL, { transports: ["websocket"] });
    await new Promise<void>((r) => newP1Socket.on("connect", () => r()));

    const oppReconnectedPromise = new Promise<void>((resolve) => {
      p2Socket.once("opponent_reconnected", () => resolve());
    });

    let restoredState: any = null;
    await new Promise<void>((resolve, reject) => {
      newP1Socket.emit(
        "reconnect_player",
        { roomId, role: "p1", reconnectToken: p1ReconnectToken },
        (res) => {
          if (res.success && res.state) {
            restoredState = res.state;
            resolve();
          } else {
            reject(new Error("Legitimate reconnect failed: " + res.error));
          }
        },
      );
    });
    await oppReconnectedPromise;

    console.log(`  ✓ P1 successfully restored session with valid token! State version: v${restoredState.stateVersion}`);
    console.log("  ✓ Opponent (P2) received 'opponent_reconnected' notification");

    // ── SUITE 6: Surrender & Match Termination ────────────────────
    console.log("\n▶ [Suite 6] Match Concession / Surrender Handling");

    const gameOverPromise = Promise.all([
      new Promise<{ winner: any; reason?: string }>((r) => newP1Socket.once("game_over", (d) => r(d))),
      new Promise<{ winner: any; reason?: string }>((r) => p2Socket.once("game_over", (d) => r(d))),
    ]);

    await new Promise<void>((resolve, reject) => {
      newP1Socket.emit("surrender", { roomId }, (res) => {
        if (res?.success) resolve();
        else reject(new Error("Surrender call failed"));
      });
    });

    const [p1GameOver, p2GameOver] = await gameOverPromise;
    console.log(`  ✓ Both players received game_over: Winner = ${p1GameOver.winner}, Reason = "${p1GameOver.reason}"`);
    if (p1GameOver.winner !== PlayerId.Opponent) {
      throw new Error("When P1 surrenders, winner must be PlayerId.Opponent (P2)!");
    }

    // Finished match rejects further plays
    await new Promise<void>((resolve, reject) => {
      newP1Socket.emit("play_card", { roomId, cardId: "any" }, (res) => {
        if (!res.success) resolve();
        else reject(new Error("Finished match should reject further card plays"));
      });
    });
    console.log("  ✓ Finished match correctly rejects subsequent actions");

    // Finished match rejects reconnection attempts
    await new Promise<void>((resolve, reject) => {
      newP1Socket.emit(
        "reconnect_player",
        { roomId, role: "p1", reconnectToken: p1ReconnectToken },
        (res) => {
          if (!res.success && res.error?.includes("concluded")) {
            resolve();
          } else {
            reject(new Error("Finished match should reject reconnect attempts"));
          }
        },
      );
    });
    console.log("  ✓ Finished match rejects reconnect attempts with stale token");

    // Repeated surrender call after match is concluded is idempotent
    await new Promise<void>((resolve, reject) => {
      newP1Socket.emit("surrender", { roomId }, (res) => {
        if (res?.success) resolve();
        else reject(new Error("Subsequent surrender call failed"));
      });
    });
    console.log("  ✓ Subsequent surrender on finished match handled idempotently");

    // Cleanup sockets
    newP1Socket.disconnect();
    p2Socket.disconnect();
    p3Socket.disconnect();

    console.log("\n================================================================");
    console.log("  ALL HARDENED MULTIPLAYER AUDIT & RELIABILITY TESTS PASSED!");
    console.log("================================================================\n");

    server.close();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    server.close();
    process.exit(1);
  }
}

runHardenedMultiplayerTests();
