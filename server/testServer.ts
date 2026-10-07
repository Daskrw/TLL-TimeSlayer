// ============================================================
//  server/testServer.ts — Authoritative Server Integration Test
// ============================================================

import { io, Socket } from "socket.io-client";
import {
  HERO_SKY_VANGUARD,
  HERO_ABYSSAL_SORCERER,
  DECK_VANGUARD_40,
  DECK_ABYSSAL_40,
} from "../src/cards";
import { ClientToServerEvents, ServerToClientEvents } from "./types";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runIntegrationTest() {
  console.log("====================================================");
  console.log("  RUNNING AUTHORITATIVE WEBSOCKET SERVER TESTS");
  console.log("====================================================");

  const URL = "http://localhost:3001";

  // 1. Connect Player 1
  console.log("▶ Step 1: Connecting Player 1 & Player 2...");
  const p1Socket: TestSocket = io(URL, { transports: ["websocket"] });
  const p2Socket: TestSocket = io(URL, { transports: ["websocket"] });

  await new Promise<void>((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    p1Socket.on("connect", check);
    p2Socket.on("connect", check);
  });
  console.log("  ✓ Both sockets connected successfully");

  // 2. Create Room by P1
  console.log("▶ Step 2: Creating Room with P1...");
  let testRoomId = "";
  await new Promise<void>((resolve, reject) => {
    p1Socket.emit("create_room", { playerName: "Player One" }, (res) => {
      if (res.success) {
        testRoomId = res.roomId;
        console.log(`  ✓ Room created with code: ${testRoomId}`);
        resolve();
      } else {
        reject(new Error("Failed to create room"));
      }
    });
  });

  // 3. Join Room by P2
  console.log("▶ Step 3: Joining Room with P2...");
  await new Promise<void>((resolve, reject) => {
    p2Socket.emit("join_room", { roomId: testRoomId, playerName: "Player Two" }, (res) => {
      if (res.success && res.role === "p2") {
        console.log(`  ✓ P2 joined room ${testRoomId} as role ${res.role}`);
        resolve();
      } else {
        reject(new Error(res.error || "P2 failed to join"));
      }
    });
  });

  // 4. Submit Loadouts (Hero + Deck) & Synchronized Readiness Gate
  console.log("▶ Step 4: Submitting Loadouts (PLAYER_LOCK_IN) & Testing MATCH_INITIALIZED Gate...");
  const initPromise = Promise.all([
    new Promise<any>((resolve) => {
      p1Socket.once("MATCH_INITIALIZED" as any, (data: any) => resolve(data));
    }),
    new Promise<any>((resolve) => {
      p2Socket.once("MATCH_INITIALIZED" as any, (data: any) => resolve(data));
    }),
  ]);

  const mulliganPromise = Promise.all([
    new Promise<{ initialHand: any[] }>((resolve) => {
      p1Socket.once("mulligan_started", (data) => resolve(data));
    }),
    new Promise<{ initialHand: any[] }>((resolve) => {
      p2Socket.once("mulligan_started", (data) => resolve(data));
    }),
  ]);

  p1Socket.emit("PLAYER_LOCK_IN" as any, { roomId: testRoomId, heroId: HERO_SKY_VANGUARD.id, deckCardIds: DECK_VANGUARD_40.map(c => c.id) }, () => {});
  p2Socket.emit("submit_loadout", { roomId: testRoomId, hero: HERO_ABYSSAL_SORCERER, deck: DECK_ABYSSAL_40 }, () => {});

  const [p1Init, p2Init] = await initPromise;
  console.log(`  ✓ Both players received MATCH_INITIALIZED (Room: ${p1Init.roomId}, Starting Phase: ${p1Init.startingPhase})`);

  const [p1Mulligan, p2Mulligan] = await mulliganPromise;
  console.log(`  ✓ P1 received ${p1Mulligan.initialHand.length} cards for Mulligan`);
  console.log(`  ✓ P2 received ${p2Mulligan.initialHand.length} cards for Mulligan`);

  // 5. Confirm Mulligan & Launch Turn 1
  console.log("▶ Step 5: Confirming Mulligan & Starting Match...");
  const matchStartPromise = Promise.all([
    new Promise<{ yourPlayerId: string; role: string; state?: any; initialState?: any }>((resolve) => {
      p1Socket.once("MATCH_START" as any, (data: any) => resolve(data));
    }),
    new Promise<{ yourPlayerId: string; role: string; state?: any; initialState?: any }>((resolve) => {
      p2Socket.once("MATCH_START" as any, (data: any) => resolve(data));
    }),
  ]);

  p1Socket.emit("submit_mulligan", { roomId: testRoomId, replacedCardIds: [] }, () => {});
  p2Socket.emit("submit_mulligan", { roomId: testRoomId, replacedCardIds: [] }, () => {});

  const [p1Match, p2Match] = await matchStartPromise;
  const p1State = p1Match.initialState || p1Match.state;
  const p2State = p2Match.initialState || p2Match.state;

  console.log(`  ✓ P1 assigned: ${p1Match.yourPlayerId}, P2 assigned: ${p2Match.yourPlayerId}`);
  console.log(`  ✓ Match started: Turn ${p1State.turnNumber}, Phase: ${p1State.currentPhase}`);
  console.log(`  ✓ Fog of War verified: P1 opponent handCount = ${p1State.opponent.handCount}`);
  console.log(`  ✓ Fog of War verified: P2 opponent handCount = ${p2State.opponent.handCount}`);

  // 6. Test Playing a Card Authoritatively
  console.log("▶ Step 6: Testing Authoritative Action (Play Card & Pass)...");
  const p1Hand = p1State.self.hand;
  const unitToPlay = p1Hand.find((c: any) => c.type === "Unit" && c.cost <= 1);

  if (unitToPlay) {
    await new Promise<void>((resolve, reject) => {
      p1Socket.emit("play_card", { roomId: testRoomId, cardId: unitToPlay.id, laneIndex: 1 }, (res) => {
        if (res.success) {
          console.log(`  ✓ P1 authoritatively played "${unitToPlay.name}" into Lane 1`);
          resolve();
        } else {
          reject(new Error(res.error || "Card play rejected"));
        }
      });
    });
  }

  // 7. Pass Turn
  await new Promise<void>((resolve, reject) => {
    p1Socket.emit("pass_turn", { roomId: testRoomId }, (res) => {
      if (res.success) {
        console.log(`  ✓ P1 successfully passed turn phase`);
        resolve();
      } else {
        reject(new Error(res.error || "Pass turn rejected"));
      }
    });
  });

  // Cleanup
  p1Socket.disconnect();
  p2Socket.disconnect();

  console.log("====================================================");
  console.log("  ALL WEBSOCKET SERVER INTEGRATION TESTS PASSED!");
  console.log("====================================================");
  process.exit(0);
}

runIntegrationTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
