// ============================================================
//  client/MainMenu.ts — Atmospheric Main Hub & Navigation
// ============================================================

import gsap from "gsap";
import { audioManager } from "./AudioManager";

export interface MainMenuCallbacks {
  onPlaySinglePlayer: () => void;
  onPlayOnline1v1: () => void;
  onOpenDeckBuilder: () => void;
  onOpenCardCatalog: () => void;
  onOpenAdminCMS: () => void;
  onOpenSettings: () => void;
}

export class MainMenu {
  private container!: HTMLElement;
  private callbacks: MainMenuCallbacks;
  private serverStatusEl!: HTMLElement;
  private isVisible = true;

  constructor(callbacks: MainMenuCallbacks) {
    this.callbacks = callbacks;
    this.injectStyles();
    this.buildUI();
    this.bindEvents();
    this.checkServerHealth();
  }

  public show(): void {
    this.isVisible = true;
    gsap.killTweensOf(this.container);
    this.container.style.opacity = "1";
    this.container.style.display = "flex";
    this.container.classList.add("visible");

    // Dynamic Entrance Animation
    const title = this.container.querySelector(".mm-title-group")!;
    const cards = this.container.querySelectorAll(".mm-action-card")!;
    const footer = this.container.querySelector(".mm-footer")!;

    if (title) {
      gsap.killTweensOf(title);
      gsap.fromTo(
        title,
        { opacity: 0, y: -40, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" },
      );
    }

    if (cards && cards.length > 0) {
      gsap.killTweensOf(cards);
      gsap.fromTo(
        cards,
        { opacity: 0, x: -30, scale: 0.96 },
        { opacity: 1, x: 0, scale: 1, duration: 0.45, stagger: 0.08, ease: "back.out(1.4)", delay: 0.15 },
      );
    }

    if (footer) {
      gsap.killTweensOf(footer);
      gsap.fromTo(
        footer,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", delay: 0.35 },
      );
    }
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.pointerEvents = "none";
    gsap.killTweensOf(this.container);
    gsap.to(this.container, {
      opacity: 0,
      duration: 0.2,
      ease: "power2.inOut",
      onComplete: () => {
        if (!this.isVisible) {
          this.container.classList.remove("visible");
          this.container.style.display = "none";
        }
      },
    });
  }

  // ── CSS Injection ───────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById("main-menu-styles")) return;
    const style = document.createElement("style");
    style.id = "main-menu-styles";
    style.textContent = `
      #main-menu-container {
        position: fixed;
        inset: 0;
        z-index: 150;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 40px 48px;
        box-sizing: border-box;
        pointer-events: none;
        user-select: none;
      }
      #main-menu-container.visible {
        display: flex;
      }

      /* Subtle Vignette & Dark Tint around edges */
      #main-menu-container::before {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 30% 50%, rgba(10, 6, 26, 0.4) 0%, rgba(4, 2, 14, 0.85) 100%);
        pointer-events: none;
        z-index: -1;
      }

      /* Top Branding / Logo */
      .mm-title-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-top: 10px;
        pointer-events: auto;
      }
      .mm-emblem-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #ffd066;
        background: rgba(255, 208, 102, 0.12);
        border: 1px solid rgba(255, 208, 102, 0.35);
        padding: 5px 18px;
        border-radius: 99px;
        box-shadow: 0 0 20px rgba(255, 208, 102, 0.25);
        margin-bottom: 12px;
      }
      .mm-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 54px;
        font-weight: 900;
        letter-spacing: 0.12em;
        background: linear-gradient(135deg, #ffffff 0%, #ffd066 35%, #a855f7 70%, #60a5fa 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 28px rgba(168, 85, 247, 0.5));
        line-height: 1.1;
      }
      .mm-subtitle {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #c4b5fd;
        margin-top: 6px;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
      }

      /* Center/Left Action Hub */
      .mm-action-hub {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 420px;
        margin-left: 20px;
        pointer-events: auto;
      }
      .mm-action-card {
        background: linear-gradient(135deg, rgba(22, 14, 48, 0.85), rgba(10, 6, 24, 0.9));
        border: 1.5px solid rgba(140, 100, 255, 0.3);
        border-radius: 18px;
        padding: 14px 20px;
        display: flex;
        align-items: center;
        gap: 16px;
        cursor: pointer;
        backdrop-filter: blur(16px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(120, 80, 255, 0.12);
        transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        overflow: hidden;
      }
      .mm-action-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        bottom: 0;
        background: var(--card-accent, #7c3aed);
        opacity: 0.6;
        transition: width 0.2s;
      }
      .mm-action-card:hover {
        transform: translateX(8px) translateY(-2px);
        border-color: var(--card-accent, #c084fc);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.7), 0 0 28px var(--card-glow, rgba(140, 100, 255, 0.45));
      }
      .mm-action-card:hover::before {
        width: 8px;
        opacity: 1;
      }
      .mm-action-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        flex-shrink: 0;
        transition: transform 0.2s;
      }
      .mm-action-card:hover .mm-action-icon {
        transform: scale(1.1);
        background: var(--card-icon-bg, rgba(140, 100, 255, 0.2));
      }
      .mm-action-content {
        flex: 1;
        min-width: 0;
      }
      .mm-action-top {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }
      .mm-action-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 16px;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: 0.04em;
      }
      .mm-action-badge {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 2px 7px;
        border-radius: 99px;
        background: rgba(255, 255, 255, 0.1);
        color: var(--card-accent, #ffd066);
      }
      .mm-action-desc {
        font-size: 12px;
        color: #9d8ec7;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Thematic card accents */
      .card-bot {
        --card-accent: #38bdf8;
        --card-glow: rgba(56, 189, 248, 0.4);
        --card-icon-bg: rgba(56, 189, 248, 0.2);
      }
      .card-pvp {
        --card-accent: #f59e0b;
        --card-glow: rgba(245, 158, 11, 0.4);
        --card-icon-bg: rgba(245, 158, 11, 0.2);
      }
      .card-deck {
        --card-accent: #a855f7;
        --card-glow: rgba(168, 85, 247, 0.4);
        --card-icon-bg: rgba(168, 85, 247, 0.2);
      }
      .card-catalog {
        --card-accent: #10b981;
        --card-glow: rgba(16, 185, 129, 0.4);
        --card-icon-bg: rgba(16, 185, 129, 0.2);
      }
      .card-settings {
        --card-accent: #94a3b8;
        --card-glow: rgba(148, 163, 184, 0.4);
        --card-icon-bg: rgba(148, 163, 184, 0.2);
      }
      .card-cms {
        --card-accent: #ec4899;
        --card-glow: rgba(236, 72, 153, 0.4);
        --card-icon-bg: rgba(236, 72, 153, 0.2);
      }

      /* Footer Bar */
      .mm-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: auto;
        padding-top: 10px;
      }
      .mm-version {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: rgba(200, 185, 255, 0.55);
        background: rgba(0, 0, 0, 0.4);
        padding: 6px 14px;
        border-radius: 99px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .mm-shortcuts-hint {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.35);
        letter-spacing: 0.05em;
      }
      .mm-shortcuts-hint kbd {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 2px 6px;
        color: #e2e8f0;
        font-family: monospace;
      }
      .mm-server-badge {
        font-size: 12px;
        font-weight: 700;
        color: #4ade80;
        background: rgba(34, 197, 94, 0.12);
        border: 1px solid rgba(34, 197, 94, 0.3);
        padding: 6px 16px;
        border-radius: 99px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 0 16px rgba(34, 197, 94, 0.2);
      }
      .mm-server-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 8px #22c55e;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build UI ─────────────────────────────────────────────────

  private buildUI(): void {
    const container = document.createElement("div");
    container.id = "main-menu-container";
    container.innerHTML = `
      <!-- Top Branding -->
      <div class="mm-title-group">
        <div class="mm-emblem-badge">
          <span>⚔️</span><span>EARLY ACCESS CCG</span><span>⏳</span>
        </div>
        <div class="mm-title">TIME SLAYER</div>
        <div class="mm-subtitle">Tactical CCG of Temporal Warfare</div>
      </div>

      <!-- Action Hub -->
      <div class="mm-action-hub">
        <!-- 1. Play vs Bot (Single Player) -->
        <div class="mm-action-card card-bot" id="mm-btn-bot">
          <div class="mm-action-icon">🤖</div>
          <div class="mm-action-content">
            <div class="mm-action-top">
              <div class="mm-action-title">Single Player</div>
              <span class="mm-action-badge">vs Bot AI</span>
            </div>
            <div class="mm-action-desc">Battle tactical bot champions across 4 elemental lanes</div>
          </div>
        </div>

        <!-- 2. Online 1v1 (Multiplayer) -->
        <div class="mm-action-card card-pvp" id="mm-btn-pvp">
          <div class="mm-action-icon">⚔️</div>
          <div class="mm-action-content">
            <div class="mm-action-top">
              <div class="mm-action-title">Online 1v1</div>
              <span class="mm-action-badge">Multiplayer</span>
            </div>
            <div class="mm-action-desc">Host or join real-time room codes for authoritative duel</div>
          </div>
        </div>

        <!-- 3. Deck Builder -->
        <div class="mm-action-card card-deck" id="mm-btn-deck">
          <div class="mm-action-icon">🛠️</div>
          <div class="mm-action-content">
            <div class="mm-action-top">
              <div class="mm-action-title">Deck Builder</div>
              <span class="mm-action-badge">40 Cards</span>
            </div>
            <div class="mm-action-desc">Craft, validate, and persist custom battle decks</div>
          </div>
        </div>

        <!-- 4. Card Catalog -->
        <div class="mm-action-card card-catalog" id="mm-btn-catalog">
          <div class="mm-action-icon">📖</div>
          <div class="mm-action-content">
            <div class="mm-action-top">
              <div class="mm-action-title">Card Catalog</div>
              <span class="mm-action-badge">Lore &amp; Art</span>
            </div>
            <div class="mm-action-desc">Explore units, spells, equipment, environments &amp; keywords</div>
          </div>
        </div>

        <!-- 5. Settings -->
        <div class="mm-action-card card-settings" id="mm-btn-settings">
          <div class="mm-action-icon">⚙️</div>
          <div class="mm-action-content">
            <div class="mm-action-top">
              <div class="mm-action-title">Settings</div>
              <span class="mm-action-badge">Options</span>
            </div>
            <div class="mm-action-desc">Configure graphics performance, shadows, and audio volume</div>
          </div>
        </div>

        <!-- 6. Admin CMS -->
        <div class="mm-action-card card-cms" id="mm-btn-cms">
          <div class="mm-action-icon">👑</div>
          <div class="mm-action-content">
            <div class="mm-action-top">
              <div class="mm-action-title">Admin CMS</div>
              <span class="mm-action-badge">Live Editor</span>
            </div>
            <div class="mm-action-desc">Live card stats, hero creation, and artwork management</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="mm-footer">
        <div class="mm-version">v0.9.0-alpha · Three.js Engine</div>
        <div class="mm-shortcuts-hint">Quick Shortcuts: <kbd>Ctrl+Shift+A</kbd> CMS · <kbd>Esc</kbd> Menu</div>
        <div class="mm-server-badge" id="mm-server-status">
          <div class="mm-server-dot"></div>
          <span>Server: Online (3001)</span>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    this.container = container;
    this.serverStatusEl = container.querySelector("#mm-server-status") as HTMLElement;
  }

  // ── Event Handlers ───────────────────────────────────────────

  private bindEvents(): void {
    const btnBot = this.container.querySelector("#mm-btn-bot")!;
    const btnPvp = this.container.querySelector("#mm-btn-pvp")!;
    const btnDeck = this.container.querySelector("#mm-btn-deck")!;
    const btnCatalog = this.container.querySelector("#mm-btn-catalog")!;
    const btnSettings = this.container.querySelector("#mm-btn-settings")!;
    const btnCms = this.container.querySelector("#mm-btn-cms")!;

    const cards = [btnBot, btnPvp, btnDeck, btnCatalog, btnSettings, btnCms];
    cards.forEach((card) => {
      card.addEventListener("mouseenter", () => audioManager.playHover());
    });

    btnBot.addEventListener("click", (e) => {
      e.stopPropagation();
      audioManager.playClick();
      this.callbacks.onPlaySinglePlayer();
    });

    btnPvp.addEventListener("click", (e) => {
      e.stopPropagation();
      audioManager.playClick();
      this.callbacks.onPlayOnline1v1();
    });

    btnDeck.addEventListener("click", (e) => {
      e.stopPropagation();
      audioManager.playClick();
      this.callbacks.onOpenDeckBuilder();
    });

    btnCatalog.addEventListener("click", (e) => {
      e.stopPropagation();
      audioManager.playClick();
      this.callbacks.onOpenCardCatalog();
    });

    btnSettings.addEventListener("click", (e) => {
      e.stopPropagation();
      audioManager.playClick();
      this.callbacks.onOpenSettings();
    });

    btnCms.addEventListener("click", (e) => {
      e.stopPropagation();
      audioManager.playClick();
      this.callbacks.onOpenAdminCMS();
    });
  }

  private async checkServerHealth(): Promise<void> {
    try {
      const res = await fetch("http://localhost:3001/health");
      if (res.ok) {
        this.serverStatusEl.innerHTML = `
          <div class="mm-server-dot"></div>
          <span>Server: Ready (3001)</span>
        `;
      }
    } catch {
      this.serverStatusEl.innerHTML = `
        <div class="mm-server-dot" style="background:#eab308;box-shadow:0 0 8px #eab308;"></div>
        <span style="color:#fde047;">Server: Connecting...</span>
      `;
    }
  }
}
