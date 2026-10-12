# TLL TimeSlayer — Multiplayer Recovery Guarantees & Lifecycle Specification

## Overview

TLL TimeSlayer uses an authoritative Node.js/Express server with in-memory room management (`RoomManager`), in-memory match state execution (`GameSession` / `GameEngine`), and Socket.IO for low-latency bidirectional game networking.

This document defines the exact recovery guarantees, match state survival semantics, and user-facing failure behaviors across all failure and lifecycle scenarios.

---

## Recovery Guarantees Matrix

| Scenario | Supported by Current Implementation | Match State Survives | Limitations & Requirements | User-Facing Behavior When Recovery Impossible |
|---|---|---|---|---|
| **Page Refresh** | **Yes** | **Yes** | Client must remain within the same browser tab (`sessionStorage` persistence). Reconnection must occur within the 30-second forfeit grace period. Valid `reconnectToken` is required. | If the token is expired, corrupted, or the room is already cleaned up, the client is redirected to the Main Menu with an error: *"Match has already concluded or session expired."* |
| **Temporary Network Loss** | **Yes** | **Yes** | Socket.IO automatic transport recovery reconnects within 30 seconds. Server pauses match progression and starts a 30s forfeit countdown timer. | Opponent sees *"Opponent disconnected (reconnect window: 30s)"*. If reconnect fails before the 30s window expires, the match is forfeited and the connected player is awarded victory. |
| **Browser / Tab Closed & Reopened** | **No** | **No** (for that client) | `sessionStorage` is isolated per browser tab lifetime. A newly opened tab or closed/reopened tab does not retain the `reconnectToken`. | The client opens to the Main Menu with no active match. The server marks the abandoned seat as disconnected; after 30 seconds, the abandoned seat forfeits to the opponent. |
| **Server Process Restart or Crash** | **No** | **No** | **In-memory state is completely lost.** Matches and rooms are held in `RoomManager` memory and are NOT serialized to persistent storage (PostgreSQL/Supabase). | Client receives Socket.IO disconnect. Upon transport reconnection, attempts to reconnect fail with *"Room [ID] not found."* Client returns to Main Menu with an error toast indicating server restarted. |
| **Deployment Restart** (e.g. Railway deploy) | **No** | **No** | Any rolling deploy or redeploy replaces the running process, terminating all active in-memory matches immediately. | In-progress games are terminated. Clients experience transport reconnection to the fresh instance where all prior room IDs are unknown. |
| **Multiple Server Instances / Horizontal Scaling** | **No** | **No** (cross-node) | Current architecture uses local Node.js process memory without Redis pub/sub or sticky session load balancing. Requests hitting an alternate instance fail room lookup. | Connecting to an alternate instance returns *"Room not found."* Multi-instance deployment requires single-instance pinning or sticky sessions + external state adapter. |

---

## Lifecycle Details & Security Guarantees

### 1. Reconnect Token Architecture
- Upon room creation (`p1`) or room joining (`p2`), the server assigns a cryptographically random UUID v4 `reconnectToken` to each player slot.
- The `reconnectToken` is returned strictly to the authorized player via direct socket callback and stored in the client's `sessionStorage`.
- Opponent players never receive each other's `reconnectToken` (excluded from all public room broadcasts and `MATCH_INITIALIZED` payloads).
- Reconnection requires matching `roomId`, authenticated `role` ("p1" or "p2"), and valid `reconnectToken`. Requests omitting the token, supplying an invalid token, or attempting cross-slot spoofing are rejected with `"Invalid reconnect token"`.

### 2. Action Idempotency & Conflict Rejection
- State-mutating client actions (`play_card`, `pass_turn`) transmit a client-generated `actionId`.
- The server tracks processed actions with sender role, action type, and payload summary in a bounded LRU-style cache (capped at 200 entries per session).
- **Exact duplicate retransmission** (identical `actionId` and identical payload): returns cached results with `{ duplicate: true }` without reapplying game engine state mutations.
- **Action ID conflict** (identical `actionId` reused with differing payload, role, or action type): strictly rejected with `{ error: "Action ID reused with differing payload or role." }`.

### 3. Disconnect vs. Leave vs. Surrender
- **Temporary Disconnect**: Triggered by transport loss or page refresh. Does not forfeit immediately. A 30-second countdown is started; if the player returns with their `reconnectToken`, the forfeit timer is cancelled and full sanitized state (v`stateVersion`) is restored.
- **Intentional Leave / Explicit Surrender**: Triggered via `leave_room` or `surrender`. Immediately awards victory to the opponent, triggers `game_over`, clears turn and forfeit timers, and schedules room cleanup after a 15-second visual cooldown.
- **Concluded Match Protection**: Concluded matches (`room.status === "FINISHED"`) cannot be modified or reclaimed. Reconnection attempts to finished matches are rejected with `"Match has already concluded."` Subsequent surrender calls are idempotent and do not emit duplicate game over events.
