// ============================================================
//  server/index.ts — Authoritative Node.js WebSocket Game Server
//  P0 HARDENED: Locked CORS, admin secret guard, turn timer,
//               reconnect state restore.
// ============================================================

import express, { Request, Response, NextFunction } from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server, Socket } from "socket.io";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
import { RoomManager } from "./RoomManager";
import { ClientToServerEvents, ServerToClientEvents } from "./types";
import { CardType, PlayerId, TurnPhase } from "../src/types";
import { masterRegistry } from "./MasterRegistry";
import {
  AVAILABLE_HEROES,
  HERO_SKY_VANGUARD,
  HERO_ABYSSAL_SORCERER,
  DECK_VANGUARD_40,
  DECK_ABYSSAL_40,
  getStaticCardById,
} from "../src/cards";
import { upsertHeroToSupabase, deleteHeroFromSupabase } from "../src/supabaseClient";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// ── P0 FIX #1: CORS Origin Whitelist ─────────────────────────
// In production, set CLIENT_ORIGIN env var to your domain(s).
// Multiple origins can be supplied as a comma-separated list.
const rawOrigins = process.env.CLIENT_ORIGIN || "";
const allowedOrigins: string[] = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .concat([
    "http://localhost:5299",
    "http://127.0.0.1:5299",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ])
  .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

console.log(`[Server] Allowed CORS origins: ${allowedOrigins.join(", ")}`);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // 1. Same-origin / direct navigation (no Origin header)
    if (!origin) return callback(null, true);

    // 2. Whitelisted origins
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // 3. In single-service production (e.g. Railway) without explicit CLIENT_ORIGIN set
    if (!process.env.CLIENT_ORIGIN) return callback(null, true);

    console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
    callback(new Error(`CORS policy: origin '${origin}' is not allowed.`));
  },
  credentials: true,
  methods: ["GET", "POST"],
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ── P0 FIX #2: Admin Secret Middleware ───────────────────────
// All /api/admin/* routes require a bearer token matching ADMIN_SECRET env var.
// In development (no ADMIN_SECRET set), access is open with a console warning.
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    // Dev mode: no secret configured — allow but warn once
    if (!(requireAdminAuth as any)._warnedOnce) {
      console.warn(
        "[Security] ADMIN_SECRET is not set. Admin endpoints are open to all. " +
        "Set ADMIN_SECRET in your .env for production.",
      );
      (requireAdminAuth as any)._warnedOnce = true;
    }
    return next();
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (token !== ADMIN_SECRET) {
    res.status(401).json({ success: false, error: "Unauthorized: invalid admin token." });
    return;
  }
  next();
}

// ── Static Asset Serving for Custom Uploads ────────────────────
const UPLOADS_DIR = path.resolve(CURRENT_DIR, "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use("/uploads", express.static(UPLOADS_DIR));

const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || !process.env.CLIENT_ORIGIN) {
        callback(null, true);
      } else {
        console.warn(`[Socket.io CORS] Blocked origin: ${origin}`);
        callback(new Error(`CORS policy: origin '${origin}' is not allowed.`));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const roomManager = new RoomManager();

// ── P0 FIX #3: Per-Phase Turn Timer ───────────────────────────
// 90 seconds per active player phase. When it fires, the server
// automatically passes on behalf of the timed-out player.
const TURN_TIMEOUT_MS = 90_000;
const turnTimers = new Map<string, NodeJS.Timeout>(); // roomId → timer

function clearTurnTimer(roomId: string): void {
  const t = turnTimers.get(roomId);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(roomId);
  }
}

function startTurnTimer(roomId: string): void {
  clearTurnTimer(roomId);

  const t = setTimeout(() => {
    turnTimers.delete(roomId);
    const session = roomManager.getSession(roomId);
    const room = roomManager.getRoom(roomId);
    if (!session || !room || room.status !== "IN_GAME") return;

    const state = session.getState();
    // Determine who is the active player and auto-pass for them
    const activeRole: "p1" | "p2" =
      state.currentPhase === TurnPhase.P1_UNIT_PHASE ||
      state.currentPhase === TurnPhase.P1_SPELL_PHASE
        ? "p1"
        : "p2";

    console.log(`[TurnTimer] Room ${roomId}: ${activeRole} timed out. Auto-passing.`);
    io.to(roomId).emit("action_rejected" as any, {
      reason: `Turn time limit reached. ${activeRole === "p1" ? "Player 1" : "Player 2"}'s turn auto-passed.`,
    });

    const res = session.passTurn(activeRole);
    if (res.success) {
      broadcastStateUpdate(roomId, res.events);

      const currState = session.getState();
      if (currState.currentPhase === TurnPhase.COMBAT_PHASE && !currState.isGameOver) {
        const { allEvents, stepResults } = session.executeFullCombat();
        for (const step of stepResults) {
          (io.to(roomId) as any).emit("EVENT_COMBAT_STEP", step);
        }
        broadcastStateUpdate(roomId, allEvents);
      }

      // Restart timer for next player's phase
      if (!session.getState().isGameOver) {
        startTurnTimer(roomId);
      }
    }
  }, TURN_TIMEOUT_MS);

  turnTimers.set(roomId, t);
}

// ── REST Endpoints ─────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSec: Math.floor(process.uptime()),
    timestamp: Date.now(),
    activeRooms: roomManager.listPublicRooms().length,
  });
});

app.get("/api/rooms", (_req, res) => {
  res.json({ rooms: roomManager.listPublicRooms() });
});

// ── Master Catalog & Admin Storage API ────────────────────────

app.get("/api/catalog", (_req, res) => {
  const catalog = masterRegistry.getCatalog();
  res.json({
    success: true,
    ...catalog,
  });
});

// All /api/admin/* routes are guarded by requireAdminAuth middleware.
app.post("/api/admin/update-card", requireAdminAuth, (req, res): void => {
  try {
    const { id, patch, card } = req.body;
    const cardId = id || card?.id;
    if (!cardId) {
      res.status(400).json({ success: false, error: "Card id is required" });
      return;
    }
    const updated = masterRegistry.updateCard(cardId, patch || card);
    io.emit("CATALOG_UPDATED" as any, { type: "card", card: updated, updatedAt: Date.now() });
    console.log(`[Admin] Card updated & persisted: ${updated.name} (${updated.id})`);
    res.json({ success: true, card: updated });
  } catch (err: any) {
    console.error("[Admin Error] update-card failed:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to update card" });
  }
});

app.post("/api/admin/update-hero", requireAdminAuth, async (req, res): Promise<void> => {
  try {
    const { id, hero } = req.body;
    const heroId = id || hero?.id;
    if (!heroId || !hero) {
      res.status(400).json({ success: false, error: "Hero definition is required" });
      return;
    }
    const updated = masterRegistry.updateHero(heroId, hero);

    // Sync to Supabase PostgreSQL database
    try {
      await upsertHeroToSupabase(updated);
    } catch (sbErr) {
      console.warn("[Server] Supabase sync warning during update-hero:", sbErr);
    }

    io.emit("CATALOG_UPDATED" as any, { type: "hero", hero: updated, updatedAt: Date.now() });
    console.log(`[Admin] Hero updated & persisted: ${updated.name} (${updated.id})`);
    res.json({ success: true, hero: updated });
  } catch (err: any) {
    console.error("[Admin Error] update-hero failed:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to update hero" });
  }
});

app.post("/api/admin/delete-hero", requireAdminAuth, async (req, res): Promise<void> => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ success: false, error: "Hero id is required" });
      return;
    }
    masterRegistry.deleteHero(id);

    // Delete from Supabase PostgreSQL database
    try {
      await deleteHeroFromSupabase(id);
    } catch (sbErr) {
      console.warn("[Server] Supabase delete warning during delete-hero:", sbErr);
    }

    io.emit("CATALOG_UPDATED" as any, { type: "hero_deleted", id, updatedAt: Date.now() });
    console.log(`[Admin] Hero deleted/reset: ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Admin Error] delete-hero failed:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to delete hero" });
  }
});

app.post("/api/admin/upload-asset", requireAdminAuth, (req, res) => {
  try {
    const { filename, dataUrl } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ success: false, error: "dataUrl is required" });
    }

    // Determine extension
    let ext = "png";
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
    if (match && match[1]) {
      ext = match[1] === "jpeg" ? "jpg" : match[1].replace("+xml", "");
    } else if (filename && filename.includes(".")) {
      ext = filename.split(".").pop() || "png";
    }

    const base64Data = dataUrl.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const cleanName = (filename || "art")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .slice(0, 30);
    const uniqueFilename = `${cleanName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const targetPath = path.join(UPLOADS_DIR, uniqueFilename);

    fs.writeFileSync(targetPath, buffer);
    const hostedUrl = `/uploads/${uniqueFilename}`;

    console.log(`[Upload] Custom asset saved to ${targetPath} -> Hosted URL: ${hostedUrl}`);
    return res.json({ success: true, url: hostedUrl, filename: uniqueFilename });
  } catch (err: any) {
    console.error("[Upload Error]", err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to save asset" });
  }
});

app.post("/api/admin/reset-catalog", requireAdminAuth, (_req, res) => {
  try {
    masterRegistry.reseedDefaults();
    io.emit("CATALOG_UPDATED" as any, { type: "reset", updatedAt: Date.now() });
    res.json({ success: true, message: "Catalog reset to defaults successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Reset failed" });
  }
});

// ── State Serialization (POJO) Helper ─────────────────────────

function serializeGameState<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── Match Launch Helper ────────────────────────────────────────

function launchMatch(roomId: string): void {
  const room = roomManager.getRoom(roomId);
  const session = roomManager.getSession(roomId);
  if (!room || !session) return;

  room.status = "IN_GAME";

  const p1SocketId = room.players.p1?.socketId;
  const p2SocketId = room.players.p2?.socketId;
  if (!p1SocketId || !p2SocketId) return;

  const p1State = session.getSanitizedState("p1");
  const p2State = session.getSanitizedState("p2");

  console.log(`[Server] Emitting MATCH_START to P1 and P2 for room ${roomId}`);

  io.to(p1SocketId).emit("MATCH_START" as any, {
    yourPlayerId: "P1",
    role: "p1",
    roomId,
    initialState: serializeGameState(p1State),
  });
  io.to(p1SocketId).emit("game_started", {
    roomId,
    role: "p1",
    state: serializeGameState(p1State),
  });

  io.to(p2SocketId).emit("MATCH_START" as any, {
    yourPlayerId: "P2",
    role: "p2",
    roomId,
    initialState: serializeGameState(p2State),
  });
  io.to(p2SocketId).emit("game_started", {
    roomId,
    role: "p2",
    state: serializeGameState(p2State),
  });

  const currPhase = session.getState().currentPhase;
  io.to(roomId).emit("PHASE_CHANGED" as any, { newPhase: currPhase });
  console.log(`[Server] Match officially in progress for ${roomId} (Current Phase: ${currPhase})`);
}

// ── Broadcast State Helper ─────────────────────────────────────
// Also resets the turn timer for the next active phase.

function broadcastStateUpdate(roomId: string, events: any[] = []): void {
  const room = roomManager.getRoom(roomId);
  const session = roomManager.getSession(roomId);
  if (!room || !session) return;

  const p1SocketId = room.players.p1?.socketId;
  const p2SocketId = room.players.p2?.socketId;

  if (p1SocketId) {
    const p1State = session.getSanitizedState("p1");
    io.to(p1SocketId).emit("game_state_update", serializeGameState({
      state: p1State,
      events,
    }));
    (io.to(p1SocketId) as any).emit("SYNC_GAME_STATE", serializeGameState({
      state: p1State,
      events,
    }));
  }

  if (p2SocketId) {
    const p2State = session.getSanitizedState("p2");
    io.to(p2SocketId).emit("game_state_update", serializeGameState({
      state: p2State,
      events,
    }));
    (io.to(p2SocketId) as any).emit("SYNC_GAME_STATE", serializeGameState({
      state: p2State,
      events,
    }));
  }

  const state = session.getState();
  const currentPhase = state.currentPhase;
  io.to(roomId).emit("PHASE_CHANGED" as any, { newPhase: currentPhase });

  if (state.isGameOver) {
    clearTurnTimer(roomId);
    const winner = state.winner;
    if (winner) {
      io.to(roomId).emit("game_over", { winner });
    }
  } else if (
    room.status === "IN_GAME" &&
    (
      currentPhase === TurnPhase.P1_UNIT_PHASE ||
      currentPhase === TurnPhase.P1_SPELL_PHASE ||
      currentPhase === TurnPhase.P2_UNIT_PHASE ||
      currentPhase === TurnPhase.P2_SPELL_PHASE
    )
  ) {
    // P0 Fix #3: Reset the 90s turn timer every time a new player phase begins.
    startTurnTimer(roomId);
  } else {
    clearTurnTimer(roomId);
  }
}

// ── WebSocket Connection Router ────────────────────────────────

io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // 1. Create Room
  socket.on("create_room", ({ playerName }, callback) => {
    const { room, role } = roomManager.createRoom(socket.id, playerName || "Player 1");
    socket.join(room.roomId);

    callback({
      success: true,
      roomId: room.roomId,
      role,
    });

    console.log(`[Server] Player P1 connected & created room ${room.roomId} (${playerName || "Player 1"}) [${socket.id}]`);
  });

  // 2. Join Room
  socket.on("join_room", ({ roomId, playerName }, callback) => {
    const res = roomManager.joinRoom(roomId, socket.id, playerName || "Player 2");
    if (!res.success || !res.room) {
      return callback({ success: false, error: res.error });
    }

    socket.join(res.room.roomId);

    callback({
      success: true,
      roomId: res.room.roomId,
      role: res.role,
    });

    console.log(`[Server] Player P2 connected & joined room ${res.room.roomId} (${playerName || "Player 2"}) [${socket.id}]`);

    // Notify all participants of updated room state
    io.to(res.room.roomId).emit("room_state", {
      roomId: res.room.roomId,
      status: res.room.status,
      p1: res.room.players.p1
        ? {
            name: res.room.players.p1.playerName,
            ready: res.room.players.p1.ready,
            heroName: res.room.players.p1.hero?.name,
          }
        : undefined,
      p2: res.room.players.p2
        ? {
            name: res.room.players.p2.playerName,
            ready: res.room.players.p2.ready,
            heroName: res.room.players.p2.hero?.name,
          }
        : undefined,
    });

    console.log(`[Room] ${playerName || "Player 2"} (${socket.id}) joined ${res.room.roomId}`);
  });

  // 3. Matchmake (Quick Match)
  socket.on("matchmake", ({ playerName }, callback) => {
    const { room, role } = roomManager.matchmake(socket.id, playerName || "Challenger");
    socket.join(room.roomId);

    callback({
      success: true,
      roomId: room.roomId,
      role,
    });

    io.to(room.roomId).emit("room_state", {
      roomId: room.roomId,
      status: room.status,
      p1: room.players.p1
        ? {
            name: room.players.p1.playerName,
            ready: room.players.p1.ready,
            heroName: room.players.p1.hero?.name,
          }
        : undefined,
      p2: room.players.p2
        ? {
            name: room.players.p2.playerName,
            ready: room.players.p2.ready,
            heroName: room.players.p2.hero?.name,
          }
        : undefined,
    });
  });

  // 4. Submit Loadout / Player Lock In (Hero + Deck)
  const onLoadoutSubmitted = (
    { roomId, heroId, deckCardIds, hero, deck }: any,
    callback?: any,
  ) => {
    let targetRoomId = typeof roomId === "string" ? roomId.trim().toUpperCase() : "";
    let meta = roomManager.getPlayerRole(socket.id);
    if (!targetRoomId && meta) {
      targetRoomId = meta.roomId;
    }

    let room = targetRoomId ? roomManager.getRoom(targetRoomId) : undefined;
    if (!room && meta) {
      room = roomManager.getRoom(meta.roomId);
      targetRoomId = meta.roomId;
    }

    // Fallback: search all active rooms for this socket ID
    if (!room) {
      for (const r of roomManager.listAllRooms()) {
        if (r.players.p1?.socketId === socket.id || r.players.p2?.socketId === socket.id) {
          room = r;
          targetRoomId = r.roomId;
          break;
        }
      }
    }

    if (!room || !targetRoomId) {
      console.warn(`[SyncGate] Socket ${socket.id} attempted to lock in but room ${targetRoomId || "(empty)"} was not found.`);
      return callback?.({ success: false, error: "Not a participant in this room." });
    }

    const session = roomManager.getSession(targetRoomId);
    if (!session) {
      console.warn(`[SyncGate] Session not found for room ${targetRoomId}`);
      return callback?.({ success: false, error: "Session not found." });
    }

    // Determine player role
    const role: "p1" | "p2" = room.players.p1?.socketId === socket.id ? "p1" : "p2";

    // Ensure socket is in the socket.io room
    socket.join(targetRoomId);

    // Resolve Hero
    let actualHero: any = hero;
    if (!actualHero && heroId) {
      const regHero = masterRegistry.getHero(heroId);
      actualHero = regHero || AVAILABLE_HEROES.find((h) => h.id === heroId) || AVAILABLE_HEROES[0];
    }
    if (!actualHero) {
      actualHero = role === "p1" ? HERO_SKY_VANGUARD : HERO_ABYSSAL_SORCERER;
    }

    // Resolve Deck
    let actualDeck: any[] = deck;
    if ((!actualDeck || actualDeck.length === 0) && deckCardIds && deckCardIds.length > 0) {
      actualDeck = deckCardIds
        .map((cid: string) => masterRegistry.getCard(cid) || getStaticCardById(cid))
        .filter(Boolean);
    }
    if (!actualDeck || actualDeck.length === 0) {
      actualDeck = role === "p1" ? [...DECK_VANGUARD_40] : [...DECK_ABYSSAL_40];
    }

    // Mark player ready and locked in
    const slot = role === "p1" ? room.players.p1 : room.players.p2;
    if (slot) {
      slot.hero = actualHero;
      slot.deck = actualDeck;
      slot.deckCardIds = deckCardIds;
      slot.ready = true;
      slot.lockedIn = true;
      slot.isLockedIn = true;
    }

    console.log(
      `[SyncGate] Player ${role.toUpperCase()} (${socket.id}) locked in for room ${targetRoomId}. P1: ${!!room.players.p1?.isLockedIn}, P2: ${!!room.players.p2?.isLockedIn}`,
    );

    callback?.({ success: true });

    io.to(targetRoomId).emit("room_state", {
      roomId: targetRoomId,
      status: room.status,
      p1: room.players.p1
        ? {
            name: room.players.p1.playerName,
            ready: room.players.p1.ready,
            lockedIn: room.players.p1.isLockedIn ?? room.players.p1.lockedIn ?? room.players.p1.ready,
            heroName: room.players.p1.hero?.name,
          }
        : undefined,
      p2: room.players.p2
        ? {
            name: room.players.p2.playerName,
            ready: room.players.p2.ready,
            lockedIn: room.players.p2.isLockedIn ?? room.players.p2.lockedIn ?? room.players.p2.ready,
            heroName: room.players.p2.hero?.name,
          }
        : undefined,
    });

    // Immediate match triggering check
    if (
      (room.players.p1?.isLockedIn || room.players.p1?.ready) &&
      (room.players.p2?.isLockedIn || room.players.p2?.ready)
    ) {
      console.log(`[SyncGate] Both players ready! Initializing GameEngine for room: ${targetRoomId}`);

      try {
        session.initGame();

        const p1SocketId = room.players.p1?.socketId;
        const p2SocketId = room.players.p2?.socketId;

        const p1Sanitized = session.getSanitizedState("p1");
        const p2Sanitized = session.getSanitizedState("p2");

        // Broadcast MATCH_INITIALIZED to BOTH sockets in the room
        io.to(targetRoomId).emit("MATCH_INITIALIZED" as any, {
          roomId: targetRoomId,
          startingPhase: session.getState().currentPhase,
          p1Data: {
            name: room.players.p1?.playerName || "Player 1",
            hero: p1Sanitized.self.hero,
            hp: p1Sanitized.self.hp,
            maxHp: p1Sanitized.self.maxHp,
          },
          p2Data: {
            name: room.players.p2?.playerName || "Player 2",
            hero: p2Sanitized.self.hero,
            hp: p2Sanitized.self.hp,
            maxHp: p2Sanitized.self.maxHp,
          },
          p1State: p1Sanitized,
          p2State: p2Sanitized,
          initialState: p1Sanitized,
        });

        // Deliver opening Mulligan hands to each player
        if (p1SocketId) {
          io.to(p1SocketId).emit("mulligan_started", {
            roomId: targetRoomId,
            initialHand: p1Sanitized.mulliganHand || [],
            opponentHandCount: p1Sanitized.opponent.handCount,
          });
        }

        if (p2SocketId) {
          io.to(p2SocketId).emit("mulligan_started", {
            roomId: targetRoomId,
            initialHand: p2Sanitized.mulliganHand || [],
            opponentHandCount: p2Sanitized.opponent.handCount,
          });
        }

        console.log(`[SyncGate] Match Initialized & Mulligan started for ${targetRoomId}`);

        // Start 15s automatic Mulligan fallback timer
        session.startMulliganTimer(() => {
          launchMatch(targetRoomId);
        });
      } catch (err: any) {
        console.error("[SyncGate Error] Failed to initialize engine:", err);
        io.to(targetRoomId).emit("SYNC_ERROR" as any, {
          message: "Engine initialization failed on server: " + (err?.message || String(err)),
        });
      }
    }
  };

  socket.on("submit_loadout", onLoadoutSubmitted);
  socket.on("PLAYER_LOCK_IN" as any, onLoadoutSubmitted);

  // 5. Submit Mulligan
  socket.on("submit_mulligan", ({ roomId, replacedCardIds }, callback) => {
    const meta = roomManager.getPlayerRole(socket.id);
    if (!meta || meta.roomId !== roomId) {
      return callback({ success: false, error: "Not a participant in this room." });
    }

    const session = roomManager.getSession(roomId);
    if (!session) {
      return callback({ success: false, error: "Session not found." });
    }

    console.log(`[Server] Action received from ${meta.role.toUpperCase()}: SUBMIT_MULLIGAN (${(replacedCardIds || []).length} cards replaced) in ${roomId}`);
    const res = session.submitMulligan(meta.role, replacedCardIds);
    if (!res.success) {
      return callback({ success: false, error: res.error });
    }

    callback({ success: true });

    const room = roomManager.getRoom(roomId)!;
    // Once both confirmed, status is IN_GAME: Launch full match
    if (room.status === "IN_GAME") {
      launchMatch(roomId);
    }
  });

  // 6. Play Card (supports play_card and ACTION_PLAY_CARD)
  const onPlayCard = ({ roomId, cardId, laneIndex, targetId, slotType }: any, callback?: any) => {
    const meta = roomManager.getPlayerRole(socket.id);
    const rId = roomId || meta?.roomId;
    if (!meta || meta.roomId !== rId) {
      socket.emit("action_rejected", { reason: "Not a participant in this room." });
      (socket as any).emit("ACTION_REJECTED", { reason: "Not a participant in this room." });
      return callback?.({ success: false, error: "Not a participant in this room." });
    }

    const session = roomManager.getSession(rId);
    if (!session) {
      socket.emit("action_rejected", { reason: "Session not found." });
      (socket as any).emit("ACTION_REJECTED", { reason: "Session not found." });
      return callback?.({ success: false, error: "Session not found." });
    }

    console.log(`[Server] Action received from ${meta.role.toUpperCase()}: PLAY_CARD (cardId: ${cardId}, laneIndex: ${laneIndex}) in ${rId}`);
    
    // Resolve card metadata for history broadcasting prior to engine play
    const room = roomManager.getRoom(rId);
    const playerSlot = meta.role === "p1" ? room?.players.p1 : room?.players.p2;
    const senderName = playerSlot?.playerName || (meta.role === "p1" ? "Player 1" : "Player 2");
    const rawP = meta.role === "p1" ? session.getState().player : session.getState().opponent;
    const playedCard = rawP.hand.find((c: any) => c.id === cardId) || rawP.deck.find((c: any) => c.id === cardId) || masterRegistry.getCard(cardId) || getStaticCardById(cardId);

    const res = session.playCard(meta.role, cardId, laneIndex, targetId, slotType);
    if (!res.success) {
      socket.emit("action_rejected", { reason: res.error || "Illegal card play." });
      (socket as any).emit("ACTION_REJECTED", { reason: res.error || "Illegal card play." });
      return callback?.({ success: false, error: res.error });
    }

    const historyEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      playerId: meta.role === "p1" ? "P1" : "P2",
      role: meta.role,
      playerName: senderName,
      card: playedCard ? {
        id: playedCard.id,
        name: playedCard.name,
        cost: playedCard.cost,
        type: playedCard.type,
        imageUrl: (playedCard as any).portraitUrl || (playedCard as any).imageUrl || "",
        tribes: playedCard.tribes || (playedCard.tribe ? [playedCard.tribe] : ["เป็นกลาง"]),
        tribe: playedCard.tribe || (playedCard.tribes?.[0] ?? "Neutral"),
      } : { id: cardId, name: cardId, cost: 0, type: CardType.Unit, tribes: ["Neutral"], tribe: "Neutral" },
      targetLane: laneIndex !== undefined && laneIndex !== null ? laneIndex : null,
      timestamp: Date.now(),
    };

    io.to(rId).emit("EVENT_ACTION_LOGGED", historyEntry);
    io.to(rId).emit("action_logged", historyEntry);

    callback?.({ success: true, events: res.events });
    broadcastStateUpdate(rId, res.events);
  };
  socket.on("play_card", onPlayCard);
  (socket as any).on("ACTION_PLAY_CARD", onPlayCard);

  // 7. Pass Turn / Phase (supports pass_turn and ACTION_PASS_PHASE)
  const onPassPhase = ({ roomId }: any = {}, callback?: any) => {
    const meta = roomManager.getPlayerRole(socket.id);
    const rId = roomId || meta?.roomId;
    if (!meta || meta.roomId !== rId) {
      socket.emit("action_rejected", { reason: "Not a participant in this room." });
      (socket as any).emit("ACTION_REJECTED", { reason: "Not a participant in this room." });
      return callback?.({ success: false, error: "Not a participant in this room." });
    }

    const session = roomManager.getSession(rId);
    if (!session) {
      socket.emit("action_rejected", { reason: "Session not found." });
      (socket as any).emit("ACTION_REJECTED", { reason: "Session not found." });
      return callback?.({ success: false, error: "Session not found." });
    }

    console.log(`[Server] Action received from ${meta.role.toUpperCase()}: PASS_TURN in ${rId}`);
    const res = session.passTurn(meta.role);
    if (!res.success) {
      socket.emit("action_rejected", { reason: res.error || "Cannot pass right now." });
      (socket as any).emit("ACTION_REJECTED", { reason: res.error || "Cannot pass right now." });
      return callback?.({ success: false, error: res.error });
    }

    callback?.({ success: true, events: res.events });
    broadcastStateUpdate(rId, res.events);

    // If transitioned into COMBAT_PHASE: Automatically resolve authoritative combat
    const currState = session.getState();
    if (currState.currentPhase === TurnPhase.COMBAT_PHASE && !currState.isGameOver) {
      const { allEvents, stepResults } = session.executeFullCombat();
      for (const step of stepResults) {
        (io.to(rId) as any).emit("EVENT_COMBAT_STEP", step);
      }
      broadcastStateUpdate(rId, allEvents);
    }
  };
  socket.on("pass_turn", onPassPhase);
  (socket as any).on("ACTION_PASS_PHASE", onPassPhase);

  // 8. In-Game Chat
  socket.on("chat_message", ({ roomId, text }) => {
    const meta = roomManager.getPlayerRole(socket.id);
    if (!meta || meta.roomId !== roomId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const senderName =
      (meta.role === "p1" ? room.players.p1?.playerName : room.players.p2?.playerName) || "Player";

    io.to(roomId).emit("chat_broadcast", {
      sender: senderName,
      text: text.slice(0, 200), // Cap length
      timestamp: Date.now(),
    });
  });

  // 9. Leave Room
  socket.on("leave_room", ({ roomId }) => {
    socket.leave(roomId);
    roomManager.cleanupRoom(roomId);
  });

  // 10. Reconnect — re-deliver full sanitized game state
  // P0 Fix #4: Client sends 'reconnect_player' with roomId+role to re-sync.
  (socket as any).on("reconnect_player", ({ roomId, role }: { roomId: string; role: "p1" | "p2" }, callback?: any) => {
    const cleanId = (roomId || "").trim().toUpperCase();
    const success = roomManager.handleReconnect(socket.id, cleanId, role);

    if (!success) {
      console.warn(`[Reconnect] Failed for socket ${socket.id} → room ${cleanId} role ${role}`);
      callback?.({ success: false, error: "Room or player slot not found." });
      return;
    }

    socket.join(cleanId);
    console.log(`[Reconnect] ${role.toUpperCase()} rejoined room ${cleanId} (${socket.id})`);

    // Notify opponent the player is back
    socket.to(cleanId).emit("opponent_reconnected");

    // Re-send full sanitized state immediately so the client can resume
    const session = roomManager.getSession(cleanId);
    const room = roomManager.getRoom(cleanId);
    if (session && room) {
      const sanitized = session.getSanitizedState(role);
      socket.emit("game_state_update", serializeGameState({
        state: sanitized,
        events: [],
      }));
      (socket as any).emit("SYNC_GAME_STATE", serializeGameState({
        state: sanitized,
        events: [],
      }));
      (socket as any).emit("PHASE_CHANGED", { newPhase: session.getState().currentPhase });
      console.log(`[Reconnect] Resent state to ${role.toUpperCase()} in room ${cleanId}`);
    }

    callback?.({ success: true });
  });

  // 11. Disconnection Handling & Forfeit Grace Period
  socket.on("disconnect", () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    roomManager.handleDisconnect(socket.id, (room, forfeitRole) => {
      // 30-second forfeit timer fired!
      console.log(`[Forfeit] ${forfeitRole} timed out in ${room.roomId}. Awarding victory.`);
      clearTurnTimer(room.roomId);
      const winningPlayerId = forfeitRole === "p1" ? PlayerId.Opponent : PlayerId.Player;
      io.to(room.roomId).emit("game_over", {
        winner: winningPlayerId,
        reason: "Opponent abandoned match.",
      });
      roomManager.cleanupRoom(room.roomId);
    });

    const meta = roomManager.getPlayerRole(socket.id);
    if (meta) {
      socket.to(meta.roomId).emit("opponent_disconnected", { countdownSec: 30 });
    }
  });
});

// ── Serve Frontend SPA in Production / Single-Service Mode ────
const clientBuildPath = path.resolve(process.cwd(), "dist-client");
if (process.env.NODE_ENV === "production" || fs.existsSync(clientBuildPath)) {
  console.log(`[Server] Serving client assets from: ${clientBuildPath}`);
  app.use(express.static(clientBuildPath));

  // Fallback routing for SPA (Single Page Application) — Express 5 compatible
  app.use((req: Request, res: Response, next: NextFunction): void => {
    // Allow API, WebSocket, and upload routes to pass through
    if (
      req.path.startsWith("/api") ||
      req.path.startsWith("/socket.io") ||
      req.path.startsWith("/health") ||
      req.path.startsWith("/uploads")
    ) {
      return next();
    }
    if (req.method === "GET") {
      const indexFile = path.join(clientBuildPath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
        return;
      }
    }
    next();
  });
}

// ── Server Start ───────────────────────────────────────────────

server.listen(PORT, "0.0.0.0", () => {
  console.log(`====================================================`);
  console.log(`  TLL TimeSlayer — Authoritative Game Server`);
  console.log(`  Listening on: http://0.0.0.0:${PORT}`);
  console.log(`  Health Check: http://0.0.0.0:${PORT}/health`);
  console.log(`====================================================`);
});
