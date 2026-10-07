// ============================================================
//  GraveyardModal.ts — Interactive Graveyard Inspector Modal
//
//  Displays all fallen cards in a player or opponent graveyard,
//  ordered newest-to-oldest, with live hover card inspector.
// ============================================================

import { Card, CardType } from "../src/types";
import { TRIBE_CSS } from "./visualConstants";

export class GraveyardModal {
  private container!: HTMLElement;
  private titleEl!: HTMLElement;
  private countPillEl!: HTMLElement;
  private gridEl!: HTMLElement;
  private previewPanel!: HTMLElement;
  private emptyStateEl!: HTMLElement;

  private isVisible = false;
  private styleInjected = false;
  private keydownListener?: (e: KeyboardEvent) => void;

  constructor() {
    this.injectStyles();
    this.buildDOM();
  }

  // ── CSS Injection ───────────────────────────────────────────

  private injectStyles(): void {
    if (this.styleInjected || document.getElementById("graveyard-modal-styles")) return;
    this.styleInjected = true;
    const style = document.createElement("style");
    style.id = "graveyard-modal-styles";
    style.textContent = `
      #graveyard-modal-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(ellipse at 50% 20%, rgba(18, 12, 38, 0.95), rgba(4, 2, 12, 0.98));
        backdrop-filter: blur(20px);
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
        padding: 24px;
        user-select: none;
      }
      #graveyard-modal-overlay.visible {
        display: flex;
        opacity: 1;
      }
      .gy-container {
        width: 900px;
        max-width: 95vw;
        max-height: 85vh;
        background: linear-gradient(165deg, rgba(26, 18, 52, 0.92), rgba(10, 6, 24, 0.96));
        border: 2px solid rgba(139, 92, 246, 0.45);
        border-radius: 20px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(139, 92, 246, 0.25);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .gy-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 26px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(14, 8, 30, 0.7);
      }
      .gy-header-left {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .gy-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #f5f3ff;
      }
      .gy-count-pill {
        background: rgba(139, 92, 246, 0.2);
        border: 1px solid rgba(167, 139, 250, 0.4);
        padding: 4px 14px;
        border-radius: 99px;
        font-size: 12px;
        font-weight: 800;
        color: #ddd6fe;
        letter-spacing: 0.05em;
      }
      .gy-close-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(30, 20, 60, 0.6);
        color: #d8c8ff;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }
      .gy-close-btn:hover {
        background: rgba(239, 68, 68, 0.4);
        border-color: #ef4444;
        color: #ffffff;
        transform: scale(1.08);
      }
      .gy-body {
        display: flex;
        flex: 1;
        overflow: hidden;
        min-height: 380px;
      }
      .gy-card-list {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 16px;
        align-content: start;
      }
      .gy-card-item {
        background: rgba(20, 14, 42, 0.85);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 12px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
      }
      .gy-card-item:hover, .gy-card-item.selected {
        border-color: #a78bfa;
        background: rgba(46, 16, 101, 0.6);
        transform: translateY(-3px) scale(1.03);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 14px rgba(167, 139, 250, 0.4);
      }
      .gy-card-cost {
        position: absolute;
        top: 6px;
        left: 6px;
        width: 22px;
        height: 22px;
        background: linear-gradient(135deg, #0284c7, #0369a1);
        border-radius: 50%;
        border: 1px solid #38bdf8;
        color: #ffffff;
        font-size: 11px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gy-card-type-icon {
        font-size: 26px;
        margin-top: 10px;
      }
      .gy-card-name {
        font-size: 12px;
        font-weight: 700;
        color: #f5f3ff;
        text-align: center;
        line-height: 1.2;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gy-card-stats {
        display: flex;
        gap: 8px;
        font-size: 11px;
        font-weight: 800;
      }
      .gy-card-atk { color: #f87171; }
      .gy-card-hp { color: #4ade80; }
      .gy-card-order-badge {
        position: absolute;
        bottom: 4px;
        right: 6px;
        font-size: 9px;
        color: rgba(200, 180, 255, 0.4);
        font-weight: 700;
      }
      .gy-preview-panel {
        width: 280px;
        background: rgba(10, 6, 22, 0.8);
        border-left: 1px solid rgba(255, 255, 255, 0.08);
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        overflow-y: auto;
      }
      .gy-preview-card {
        width: 100%;
        background: rgba(24, 16, 50, 0.95);
        border: 2px solid #8b5cf6;
        border-radius: 16px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      }
      .gy-preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }
      .gy-preview-name {
        font-size: 16px;
        font-weight: 800;
        color: #ffffff;
      }
      .gy-preview-cost {
        background: #0284c7;
        color: #ffffff;
        font-weight: 800;
        font-size: 13px;
        padding: 2px 8px;
        border-radius: 99px;
      }
      .gy-preview-tribe {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #a78bfa;
      }
      .gy-preview-text {
        font-size: 12px;
        color: #cbd5e1;
        line-height: 1.4;
        text-align: center;
        background: rgba(0, 0, 0, 0.35);
        padding: 10px 12px;
        border-radius: 10px;
        width: 100%;
      }
      .gy-preview-kws {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
      }
      .gy-kw-badge {
        background: rgba(139, 92, 246, 0.25);
        border: 1px solid #8b5cf6;
        color: #ddd6fe;
        font-size: 10px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 6px;
        text-transform: uppercase;
      }
      .gy-empty-state {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        color: rgba(200, 180, 255, 0.5);
        gap: 12px;
        font-size: 15px;
        font-weight: 600;
      }
      .gy-empty-icon {
        font-size: 44px;
        opacity: 0.6;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build DOM ────────────────────────────────────────────────

  private buildDOM(): void {
    this.container = document.createElement("div");
    this.container.id = "graveyard-modal-overlay";
    this.container.innerHTML = `
      <div class="gy-container" id="gy-container">
        <div class="gy-header">
          <div class="gy-header-left">
            <div class="gy-title" id="gy-title">🪦 GRAVEYARD</div>
            <div class="gy-count-pill" id="gy-count-pill">0 Cards</div>
          </div>
          <button class="gy-close-btn" id="gy-close-btn" title="Close (Esc)">✕</button>
        </div>
        <div class="gy-body">
          <div class="gy-card-list" id="gy-card-list"></div>
          <div class="gy-preview-panel" id="gy-preview-panel">
            <div style="color: rgba(200,180,255,0.4); font-size: 12px; margin-top: 40px;">
              Hover or click a card to inspect details
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    this.titleEl = this.container.querySelector("#gy-title") as HTMLElement;
    this.countPillEl = this.container.querySelector("#gy-count-pill") as HTMLElement;
    this.gridEl = this.container.querySelector("#gy-card-list") as HTMLElement;
    this.previewPanel = this.container.querySelector("#gy-preview-panel") as HTMLElement;

    const closeBtn = this.container.querySelector("#gy-close-btn") as HTMLButtonElement;
    closeBtn.addEventListener("click", () => this.hide());

    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) {
        this.hide();
      }
    });
  }

  // ── Public Show API ──────────────────────────────────────────

  public show(cards: Card[], owner: "player" | "opponent"): void {
    this.isVisible = true;
    this.setupListeners();

    const isP1 = owner === "player";
    this.titleEl.textContent = isP1 ? "🪦 PLAYER'S GRAVEYARD" : "🪦 OPPONENT'S GRAVEYARD";
    this.titleEl.style.color = isP1 ? "#a78bfa" : "#fca5a5";
    this.countPillEl.textContent = `${cards.length} Card${cards.length === 1 ? "" : "s"}`;

    this.gridEl.innerHTML = "";

    if (cards.length === 0) {
      this.gridEl.innerHTML = `
        <div class="gy-empty-state">
          <div class="gy-empty-icon">🪦</div>
          <div>No cards have fallen into this graveyard yet.</div>
        </div>
      `;
      this.previewPanel.innerHTML = `
        <div style="color: rgba(200,180,255,0.4); font-size: 12px; margin-top: 40px;">
          Empty Graveyard
        </div>
      `;
    } else {
      // Order from newest to oldest (cards array is stored oldest -> newest)
      const reversed = [...cards].reverse();

      reversed.forEach((card, idx) => {
        const item = document.createElement("div");
        item.className = "gy-card-item";

        const icon = card.type === CardType.Unit ? "⚔️" :
                     card.type === CardType.Spell ? "✨" :
                     card.type === CardType.Environment ? "🌿" :
                     card.type === CardType.Equipment ? "🛡️" : "⭐";

        const statsHtml = card.type === CardType.Unit
          ? `<div class="gy-card-stats"><span class="gy-card-atk">⚔ ${card.attack}</span><span class="gy-card-hp">♥ ${card.hp}</span></div>`
          : `<div style="font-size:10px;color:#94a3b8;">${card.type}</div>`;

        item.innerHTML = `
          <div class="gy-card-cost">${card.cost}</div>
          <div class="gy-card-type-icon">${icon}</div>
          <div class="gy-card-name" title="${card.name}">${card.name}</div>
          ${statsHtml}
          <div class="gy-card-order-badge">#${cards.length - idx}</div>
        `;

        item.addEventListener("mouseenter", () => {
          this.renderPreview(card);
        });

        item.addEventListener("click", (e) => {
          e.stopPropagation();
          this.gridEl.querySelectorAll(".gy-card-item").forEach((el) => el.classList.remove("selected"));
          item.classList.add("selected");
          this.renderPreview(card);
        });

        this.gridEl.appendChild(item);
      });

      // Default preview first card
      this.renderPreview(reversed[0]);
    }

    this.container.classList.add("visible");
  }

  private renderPreview(card: Card): void {
    const icon = card.type === CardType.Unit ? "⚔️" :
                 card.type === CardType.Spell ? "✨" :
                 card.type === CardType.Environment ? "🌿" :
                 card.type === CardType.Equipment ? "🛡️" : "⭐";

    const tribeColor = TRIBE_CSS[card.tribe] ?? "#a78bfa";

    const keywordsHtml = card.keywords && card.keywords.length > 0
      ? `<div class="gy-preview-kws">${card.keywords.map((kw) => `<span class="gy-kw-badge">${kw}</span>`).join("")}</div>`
      : "";

    const statsHtml = card.type === CardType.Unit
      ? `<div style="display:flex;gap:18px;font-size:15px;font-weight:800;margin:6px 0;">
           <span style="color:#f87171;">⚔ Attack: ${card.attack}</span>
           <span style="color:#4ade80;">♥ HP: ${card.hp}</span>
         </div>`
      : "";

    this.previewPanel.innerHTML = `
      <div class="gy-preview-card">
        <div class="gy-preview-header">
          <div class="gy-preview-name">${card.name}</div>
          <div class="gy-preview-cost">${card.cost} Mana</div>
        </div>
        <div class="gy-preview-tribe" style="color: ${tribeColor};">${icon} ${card.tribe} ${card.type}</div>
        ${statsHtml}
        ${keywordsHtml}
        <div class="gy-preview-text">${card.text || "No additional rules text."}</div>
      </div>
    `;
  }

  public hide(): void {
    this.removeListeners();
    this.isVisible = false;
    this.container.classList.remove("visible");
  }

  private setupListeners(): void {
    this.removeListeners();
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.isVisible) {
        e.stopPropagation();
        this.hide();
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
}
