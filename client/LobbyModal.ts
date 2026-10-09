// ============================================================
//  client/LobbyModal.ts — Pre-Game Lobby & Mode Selection Modal
// ============================================================

import gsap from "gsap";
import { networkService } from "./NetworkService";

export type GameMode = "LOCAL_BOT" | "ONLINE_PVP";

export interface LobbyModalCallbacks {
  onStartLocalMatch: () => void;
  onOnlineRoomReady: (roomId: string, role: "p1" | "p2") => void;
  onClose?: () => void;
}

export class LobbyModal {
  private container!: HTMLElement;
  private modeSelectPill!: HTMLElement;
  private onlineLobbyOverlay!: HTMLElement;
  private currentMode: GameMode = "LOCAL_BOT";
  private callbacks: LobbyModalCallbacks;

  private currentCreatedRoomId: string | null = null;
  private statusTextEl!: HTMLElement;
  private roomCodeBadgeEl!: HTMLElement;
  private btnCopyCodeEl!: HTMLButtonElement;
  private btnCopyLinkEl!: HTMLButtonElement;
  private joinInputEl!: HTMLInputElement;
  private joinErrorEl!: HTMLElement;
  private btnCreateEl!: HTMLButtonElement;
  private btnJoinEl!: HTMLButtonElement;
  private btnCloseEl!: HTMLButtonElement;
  private bannerEl!: HTMLElement;
  private btnLocalEl!: HTMLButtonElement;
  private btnOnlineEl!: HTMLButtonElement;
  private hasTransitionedToMatch = false;

  constructor(callbacks: LobbyModalCallbacks) {
    this.callbacks = callbacks;
    this.injectStyles();
    this.buildUI();
    this.bindEvents();
    this.checkUrlForRoomCode();
  }

  public getMode(): GameMode {
    return this.currentMode;
  }

  // ── CSS Injection ───────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById("lobby-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "lobby-modal-styles";
    style.textContent = `
      /* ─── Mode Switcher Bar (HUD / Header) ─────────────────── */
      #mode-switcher-container {
        position: fixed;
        top: 60px;
        left: 22px;
        z-index: 100;
        display: flex;
        align-items: center;
        background: rgba(14, 10, 32, 0.85);
        border: 1px solid rgba(140, 100, 255, 0.35);
        border-radius: 99px;
        padding: 4px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(120, 80, 255, 0.2);
        backdrop-filter: blur(12px);
        user-select: none;
      }
      .mode-toggle-btn {
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border: none;
        border-radius: 99px;
        background: transparent;
        color: #a594c9;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mode-toggle-btn:hover {
        color: #ffffff;
      }
      .mode-toggle-btn.active {
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        color: #ffffff;
        box-shadow: 0 2px 12px rgba(124, 58, 237, 0.6);
      }
      .mode-toggle-btn.online.active {
        background: linear-gradient(135deg, #0284c7, #2563eb);
        box-shadow: 0 2px 12px rgba(37, 99, 235, 0.6);
      }

      /* ─── Online Pre-Game Lobby Modal ───────────────────────── */
      #online-lobby-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at 50% 20%, rgba(20, 15, 45, 0.96), rgba(5, 3, 16, 0.99));
        backdrop-filter: blur(24px);
        z-index: 210;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        user-select: none;
        box-sizing: border-box;
      }
      #online-lobby-overlay.visible {
        display: flex;
      }
      .lobby-modal-card {
        background: linear-gradient(165deg, rgba(26, 18, 54, 0.95), rgba(12, 8, 28, 0.98));
        border: 2px solid rgba(140, 100, 255, 0.45);
        border-radius: 24px;
        width: 100%;
        max-width: 680px;
        padding: 32px 36px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(120, 80, 255, 0.25);
        display: flex;
        flex-direction: column;
        gap: 24px;
        position: relative;
      }
      .lobby-close-btn {
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #cbd5e1;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .lobby-close-btn:hover {
        background: rgba(239, 68, 68, 0.25);
        border-color: #ef4444;
        color: #ffffff;
      }
      .lobby-header {
        text-align: center;
      }
      .lobby-badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.35);
        padding: 4px 14px;
        border-radius: 99px;
        margin-bottom: 8px;
        box-shadow: 0 0 16px rgba(56, 189, 248, 0.2);
      }
      .lobby-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 30px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 0 0 20px rgba(180, 140, 255, 0.5);
        margin-bottom: 4px;
      }
      .lobby-subtitle {
        font-size: 13px;
        color: #c4b9e8;
      }

      /* ─── 2-Column Action Grid ─────────────────────────────── */
      .lobby-actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }
      .lobby-box {
        background: rgba(14, 10, 32, 0.7);
        border: 1px solid rgba(140, 100, 255, 0.3);
        border-radius: 16px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        align-items: center;
        text-align: center;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      }
      .lobby-box-title {
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .lobby-box-desc {
        font-size: 12px;
        color: #9d8ec7;
        line-height: 1.4;
      }
      .room-code-display {
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 32px;
        font-weight: 900;
        letter-spacing: 0.25em;
        color: #ffd066;
        text-shadow: 0 0 16px rgba(255, 208, 102, 0.6);
        background: rgba(255, 208, 102, 0.08);
        border: 1.5px dashed rgba(255, 208, 102, 0.45);
        padding: 8px 16px;
        border-radius: 12px;
        width: 100%;
        box-sizing: border-box;
      }
      .lobby-btn-row {
        display: flex;
        gap: 8px;
        width: 100%;
      }
      .lobby-btn {
        flex: 1;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        transition: all 0.18s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .lobby-btn-primary {
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);
      }
      .lobby-btn-primary:hover {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        transform: translateY(-2px);
        box-shadow: 0 6px 18px rgba(37, 99, 235, 0.6);
      }
      .lobby-btn-gold {
        background: linear-gradient(135deg, #d97706, #b45309);
        color: #fef3c7;
        box-shadow: 0 4px 14px rgba(217, 119, 6, 0.45);
      }
      .lobby-btn-gold:hover {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        transform: translateY(-2px);
      }
      .lobby-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0;
      }
      .lobby-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff;
      }
      .lobby-input {
        width: 100%;
        padding: 12px 14px;
        background: rgba(0, 0, 0, 0.5);
        border: 1.5px solid rgba(140, 100, 255, 0.4);
        border-radius: 10px;
        color: #ffffff;
        font-family: 'Consolas', monospace;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.15em;
        text-align: center;
        text-transform: uppercase;
        box-sizing: border-box;
      }
      .lobby-input:focus {
        outline: none;
        border-color: #38bdf8;
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.4);
      }
      .lobby-input::placeholder {
        color: rgba(255, 255, 255, 0.25);
        letter-spacing: 0.05em;
        font-size: 14px;
      }

      /* ─── Status & Waiting Banner ─────────────────────────── */
      .lobby-status-banner {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        font-size: 13px;
        color: #cbd5e1;
      }
      .waiting-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(56, 189, 248, 0.2);
        border-top-color: #38bdf8;
        border-radius: 50%;
        animation: lobby-spin 0.9s linear infinite;
      }
      @keyframes lobby-spin {
        to { transform: rotate(360deg); }
      }
      .lobby-error {
        color: #f87171;
        font-size: 12px;
        font-weight: 700;
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build DOM ────────────────────────────────────────────────

  private buildUI(): void {
    // Clean up duplicate elements if any exist
    document.getElementById("mode-switcher-container")?.remove();
    document.getElementById("online-lobby-overlay")?.remove();

    // 1. Mode Switcher (Pinned to top left)
    const switcher = document.createElement("div");
    switcher.id = "mode-switcher-container";
    switcher.innerHTML = `
      <button class="mode-toggle-btn active" id="btn-mode-local">🤖 Single Player (vs Bot)</button>
      <button class="mode-toggle-btn online" id="btn-mode-online">⚔️ Online 1v1 (PvP)</button>
    `;
    document.body.appendChild(switcher);
    this.modeSelectPill = switcher;
    this.btnLocalEl = switcher.querySelector("#btn-mode-local") as HTMLButtonElement;
    this.btnOnlineEl = switcher.querySelector("#btn-mode-online") as HTMLButtonElement;

    // 2. Online Lobby Modal
    const overlay = document.createElement("div");
    overlay.id = "online-lobby-overlay";
    overlay.innerHTML = `
      <div class="lobby-modal-card">
        <button class="lobby-close-btn" id="btn-close-lobby" title="Close Lobby">✕</button>
        <div class="lobby-header">
          <div class="lobby-badge">Multiplayer Arena</div>
          <div class="lobby-title">1v1 ONLINE LOBBY</div>
          <div class="lobby-subtitle">Battle live opponents authoritatively with realtime combat animations</div>
        </div>

        <div class="lobby-actions-grid">
          <!-- Create Room -->
          <div class="lobby-box">
            <div class="lobby-box-title">👑 Host Room</div>
            <div class="lobby-box-desc">Generate a private 6-character room code to invite a friend.</div>
            <div class="room-code-display" id="lobby-code-display">------</div>
            <div class="lobby-btn-row">
              <button class="lobby-btn lobby-btn-gold" id="btn-create-room">Create Room</button>
              <button class="lobby-btn lobby-btn-secondary" id="btn-copy-code" style="display:none;">📋 Copy</button>
              <button class="lobby-btn lobby-btn-secondary" id="btn-copy-link" style="display:none;">🔗 Link</button>
            </div>
          </div>

          <!-- Join Room -->
          <div class="lobby-box">
            <div class="lobby-box-title">🚪 Join Battle</div>
            <div class="lobby-box-desc">Enter your friend's 6-character room code to enter the arena.</div>
            <input type="text" class="lobby-input" id="lobby-join-input" maxlength="6" placeholder="ROOM CODE" />
            <div class="lobby-error" id="lobby-join-error">Room not found.</div>
            <button class="lobby-btn lobby-btn-primary" id="btn-join-room" style="width:100%;">Join Room</button>
          </div>
        </div>

        <!-- Waiting Status -->
        <div class="lobby-status-banner" id="lobby-status-banner" style="display:none;">
          <div class="waiting-spinner"></div>
          <div id="lobby-status-text">Waiting for opponent to connect and select champion...</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.onlineLobbyOverlay = overlay;

    // Directly bind sub-elements from this instance
    this.statusTextEl = overlay.querySelector("#lobby-status-text") as HTMLElement;
    this.roomCodeBadgeEl = overlay.querySelector("#lobby-code-display") as HTMLElement;
    this.btnCreateEl = overlay.querySelector("#btn-create-room") as HTMLButtonElement;
    this.btnCopyCodeEl = overlay.querySelector("#btn-copy-code") as HTMLButtonElement;
    this.btnCopyLinkEl = overlay.querySelector("#btn-copy-link") as HTMLButtonElement;
    this.joinInputEl = overlay.querySelector("#lobby-join-input") as HTMLInputElement;
    this.joinErrorEl = overlay.querySelector("#lobby-join-error") as HTMLElement;
    this.btnJoinEl = overlay.querySelector("#btn-join-room") as HTMLButtonElement;
    this.btnCloseEl = overlay.querySelector("#btn-close-lobby") as HTMLButtonElement;
    this.bannerEl = overlay.querySelector("#lobby-status-banner") as HTMLElement;
  }

  // ── Event Bindings ───────────────────────────────────────────

  private bindEvents(): void {
    this.btnLocalEl.addEventListener("click", () => {
      this.setMode("LOCAL_BOT");
    });

    this.btnOnlineEl.addEventListener("click", () => {
      this.setMode("ONLINE_PVP");
    });

    this.btnCloseEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hideModal(true);
      networkService.isOnlineMode = false;
      if (this.callbacks.onClose) {
        this.callbacks.onClose();
      } else {
        this.setMode("LOCAL_BOT");
      }
    });

    // Create Room Button
    this.btnCreateEl.addEventListener("click", async () => {
      console.log("[LobbyModal] Create Room clicked");
      this.btnCreateEl.disabled = true;
      this.btnCreateEl.textContent = "Connecting...";

      try {
        const connected = await networkService.connect();
        if (!connected) {
          throw new Error("Could not connect to WebSocket game server at " + networkService.getServerUrl());
        }

        const res = await networkService.createRoom();
        if (res.success && res.roomId) {
          console.log("[LobbyModal] Room created:", res.roomId);
          this.currentCreatedRoomId = res.roomId;
          this.roomCodeBadgeEl.textContent = res.roomId;
          this.btnCopyCodeEl.style.display = "flex";
          this.btnCopyLinkEl.style.display = "flex";
          this.btnCreateEl.style.display = "none";

          this.bannerEl.style.display = "flex";
          this.statusTextEl.textContent = `Room created (${res.roomId})! Share code with your opponent.`;
        } else {
          throw new Error(res.error || "Failed to create room.");
        }
      } catch (err: any) {
        console.error("[LobbyModal] Create room error:", err);
        this.btnCreateEl.disabled = false;
        this.btnCreateEl.textContent = "Create Room";
        alert(err.message || "Failed to create room. Is server running on port 3001?");
      }
    });

    // Copy Code
    this.btnCopyCodeEl.addEventListener("click", () => {
      if (this.currentCreatedRoomId) {
        navigator.clipboard.writeText(this.currentCreatedRoomId);
        const prev = this.btnCopyCodeEl.textContent;
        this.btnCopyCodeEl.textContent = "Copied!";
        setTimeout(() => (this.btnCopyCodeEl.textContent = prev), 1500);
      }
    });

    // Copy Link
    this.btnCopyLinkEl.addEventListener("click", () => {
      if (this.currentCreatedRoomId) {
        const link = `${window.location.origin}/?room=${this.currentCreatedRoomId}`;
        navigator.clipboard.writeText(link);
        const prev = this.btnCopyLinkEl.textContent;
        this.btnCopyLinkEl.textContent = "Copied Link!";
        setTimeout(() => (this.btnCopyLinkEl.textContent = prev), 1500);
      }
    });

    // Join Room Button
    this.btnJoinEl.addEventListener("click", async () => {
      const code = this.joinInputEl.value.trim().toUpperCase();
      if (code.length < 3) {
        this.showJoinError("Please enter a valid room code.");
        return;
      }

      console.log("[LobbyModal] Joining room:", code);
      this.btnJoinEl.disabled = true;
      this.btnJoinEl.textContent = "Joining...";

      try {
        const connected = await networkService.connect();
        if (!connected) {
          throw new Error("Could not connect to WebSocket game server at " + networkService.getServerUrl());
        }

        const res = await networkService.joinRoom(code);
        if (res.success) {
          console.log("[LobbyModal] Joined room successfully:", code);
          this.hasTransitionedToMatch = true;
          this.hideJoinError();
          this.hideModal();
          networkService.isOnlineMode = true;
          this.callbacks.onOnlineRoomReady(code, networkService.myRole || "p2");
        } else {
          throw new Error(res.error || "Room not found or game already in progress.");
        }
      } catch (err: any) {
        console.error("[LobbyModal] Join room error:", err);
        this.btnJoinEl.disabled = false;
        this.btnJoinEl.textContent = "Join Room";
        this.showJoinError(err.message || "Room not found or connection failed.");
      }
    });

    // Network Service Room State Listener (subscribe without overwriting other listeners)
    networkService.onRoomState((data) => {
      if (this.hasTransitionedToMatch) return;
      if (data.p1 && data.p2) {
        // Both connected! Transition into Hero Selection
        this.hasTransitionedToMatch = true;
        this.statusTextEl.textContent = `Opponent connected! Entering match...`;
        setTimeout(() => {
          this.hideModal();
          networkService.isOnlineMode = true;
          this.callbacks.onOnlineRoomReady(data.roomId, networkService.myRole || "p1");
        }, 400);
      }
    });
  }

  // ── Mode Switch Logic ────────────────────────────────────────

  public setMode(mode: GameMode): void {
    this.currentMode = mode;
    const btnLocal = document.getElementById("btn-mode-local");
    const btnOnline = document.getElementById("btn-mode-online");

    if (mode === "LOCAL_BOT") {
      btnLocal?.classList.add("active");
      btnOnline?.classList.remove("active");
      this.hideModal();
      networkService.isOnlineMode = false;
      this.callbacks.onStartLocalMatch();
    } else {
      btnOnline?.classList.add("active");
      btnLocal?.classList.remove("active");
      this.showModal();
    }
  }

  private keydownListener?: (e: KeyboardEvent) => void;

  private setupListeners(): void {
    this.removeListeners();
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.hideModal(true);
        networkService.isOnlineMode = false;
        if (this.callbacks.onClose) {
          this.callbacks.onClose();
        } else if ((window as any).screenController) {
          (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
        }
      }
    };
    window.addEventListener("keydown", this.keydownListener);
  }

  private removeListeners(): void {
    if (this.keydownListener) {
      window.removeEventListener("keydown", this.keydownListener);
      this.keydownListener = undefined;
    }
  }

  public showModal(): void {
    this.hasTransitionedToMatch = false;
    this.setupListeners();
    this.onlineLobbyOverlay.style.pointerEvents = "auto";
    this.onlineLobbyOverlay.style.display = "flex";
    this.onlineLobbyOverlay.classList.add("visible");
    const card = this.onlineLobbyOverlay.querySelector(".lobby-modal-card");
    if (card) {
      gsap.killTweensOf(card);
      gsap.fromTo(
        card,
        { opacity: 0, scale: 0.92, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: "back.out(1.4)" },
      );
    }
  }

  public hideModal(triggerCallback: boolean = false): void {
    this.removeListeners();
    this.onlineLobbyOverlay.classList.remove("visible");
    this.onlineLobbyOverlay.style.display = "none";
    this.onlineLobbyOverlay.style.pointerEvents = "none";
    const card = this.onlineLobbyOverlay.querySelector(".lobby-modal-card");
    if (card) {
      gsap.killTweensOf(card);
      (card as HTMLElement).style.opacity = "1";
    }
    if (triggerCallback && this.callbacks.onClose) {
      this.callbacks.onClose();
    }
  }

  public setWaitingStatus(text: string, showSpinner = true): void {
    const banner = document.getElementById("lobby-status-banner");
    if (banner) {
      banner.style.display = "flex";
      this.statusTextEl.textContent = text;
      const spinner = banner.querySelector(".waiting-spinner") as HTMLElement;
      if (spinner) spinner.style.display = showSpinner ? "block" : "none";
    }
  }

  private showJoinError(msg: string): void {
    this.joinErrorEl.textContent = msg;
    this.joinErrorEl.style.display = "block";
  }

  private hideJoinError(): void {
    this.joinErrorEl.style.display = "none";
  }

  private checkUrlForRoomCode(): void {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get("room");
    if (roomCode) {
      this.joinInputEl.value = roomCode.toUpperCase();
      this.setMode("ONLINE_PVP");
    }
  }
}
