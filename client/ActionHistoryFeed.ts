// ============================================================
//  ActionHistoryFeed.ts — Live Card Play History Banner / Feed
//
//  Renders a collapsible left-side action ticker displaying the
//  last 5-8 cards played by player and opponent with interactive
//  hover card inspection for fast turns.
// ============================================================

import { CardDefinition, CardType, PlayerId } from "../src/types";
import { TRIBE_CSS } from "./visualConstants";

export interface HistoryActionEntry {
  id?: string;
  playerId?: PlayerId | string;
  playerName?: string;
  owner?: "player" | "opponent";
  card: CardDefinition;
  laneIndex?: number;
  actionText?: string;
  timestamp?: number;
}

export class ActionHistoryFeed {
  private container!: HTMLElement;
  private feedList!: HTMLElement;
  private hoverTooltip!: HTMLElement;
  private toggleBtn!: HTMLButtonElement;

  private isCollapsed = false;
  private entries: HistoryActionEntry[] = [];
  private maxVisible = 8;
  private styleInjected = false;
  private myRole: "p1" | "p2" = "p1";
  private isOnline = false;

  constructor() {
    this.injectStyles();
    this.buildDOM();
  }

  public setMyRole(role: "p1" | "p2", isOnline = false): void {
    this.myRole = role;
    this.isOnline = isOnline;
    this.render();
  }

  // ── CSS Injection ───────────────────────────────────────────

  private injectStyles(): void {
    if (this.styleInjected || document.getElementById("action-history-styles")) return;
    this.styleInjected = true;
    const style = document.createElement("style");
    style.id = "action-history-styles";
    style.textContent = `
      #action-history-container {
        position: fixed;
        top: 72px;
        right: 16px;
        left: auto;
        width: 240px;
        max-height: calc(100vh - 160px);
        display: flex;
        flex-direction: column;
        z-index: 50;
        pointer-events: auto;
        user-select: none;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
      }
      #action-history-container.collapsed {
        transform: translateX(200px);
      }
      .ah-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(12, 8, 28, 0.85);
        border: 1px solid rgba(139, 92, 246, 0.35);
        border-radius: 12px 12px 0 0;
        padding: 8px 12px;
        backdrop-filter: blur(12px);
      }
      .ah-title {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #d8c8ff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ah-toggle-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #c4b5fd;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }
      .ah-toggle-btn:hover {
        background: rgba(139, 92, 246, 0.4);
        color: #ffffff;
      }
      .ah-feed-list {
        background: rgba(8, 5, 20, 0.75);
        border: 1px solid rgba(139, 92, 246, 0.25);
        border-top: none;
        border-radius: 0 0 12px 12px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
        overflow-x: hidden;
        backdrop-filter: blur(12px);
      }
      .ah-entry {
        background: rgba(22, 14, 46, 0.85);
        border-radius: 8px;
        padding: 6px 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        border-right: 3px solid #8b5cf6;
        animation: ah-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes ah-slide-in {
        from { opacity: 0; transform: translateX(30px); }
        to { opacity: 1; transform: translateX(0); }
      }
      .ah-entry:hover {
        transform: translateX(-4px) scale(1.02);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      }
      .ah-entry.player {
        border-right-color: #38bdf8;
      }
      .ah-entry.player:hover {
        background: rgba(14, 40, 70, 0.9);
      }
      .ah-entry.opponent {
        border-right-color: #f87171;
      }
      .ah-entry.opponent:hover {
        background: rgba(70, 16, 26, 0.9);
      }
      .ah-cost-badge {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #0284c7;
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .ah-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .ah-card-name {
        font-size: 11px;
        font-weight: 700;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ah-action-sub {
        font-size: 9px;
        font-weight: 600;
        color: rgba(200, 185, 255, 0.6);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .ah-player-tag {
        font-weight: 800;
      }
      .ah-player-tag.player { color: #38bdf8; }
      .ah-player-tag.opponent { color: #f87171; }

      /* Hover Card Tooltip */
      #ah-hover-tooltip {
        position: fixed;
        right: 265px;
        left: auto;
        width: 240px;
        background: rgba(18, 12, 38, 0.96);
        border: 2px solid #a78bfa;
        border-radius: 14px;
        padding: 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(139, 92, 246, 0.35);
        display: none;
        flex-direction: column;
        gap: 8px;
        z-index: 100;
        pointer-events: none;
        backdrop-filter: blur(16px);
      }
      #ah-hover-tooltip.visible {
        display: flex;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build DOM ────────────────────────────────────────────────

  private buildDOM(): void {
    this.container = document.createElement("div");
    this.container.id = "action-history-container";
    this.container.innerHTML = `
      <div class="ah-header">
        <div class="ah-title">📜 Action History</div>
        <button class="ah-toggle-btn" id="ah-toggle-btn" title="Toggle History Feed">▶</button>
      </div>
      <div class="ah-feed-list" id="ah-feed-list">
        <div style="font-size: 10px; color: rgba(200,185,255,0.4); text-align: center; padding: 12px 0;">
          No cards played yet
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    this.feedList = this.container.querySelector("#ah-feed-list") as HTMLElement;
    this.toggleBtn = this.container.querySelector("#ah-toggle-btn") as HTMLButtonElement;

    this.toggleBtn.addEventListener("click", () => this.toggleCollapse());

    // Build Hover Tooltip
    this.hoverTooltip = document.createElement("div");
    this.hoverTooltip.id = "ah-hover-tooltip";
    document.body.appendChild(this.hoverTooltip);
  }

  public toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    if (this.isCollapsed) {
      this.container.classList.add("collapsed");
      this.toggleBtn.textContent = "◀";
    } else {
      this.container.classList.remove("collapsed");
      this.toggleBtn.textContent = "▶";
    }
  }

  // ── Add Entry API ────────────────────────────────────────────

  public addEntry(entry: HistoryActionEntry): void {
    if (entry.id && this.entries.some((e) => e.id === entry.id)) {
      return; // Deduplicate
    }
    this.entries.unshift(entry);
    if (this.entries.length > this.maxVisible) {
      this.entries.pop();
    }
    this.render();
  }

  public clear(): void {
    this.entries = [];
    this.feedList.innerHTML = `
      <div style="font-size: 10px; color: rgba(200,185,255,0.4); text-align: center; padding: 12px 0;">
        No cards played yet
      </div>
    `;
    this.hideTooltip();
  }

  // ── Render ───────────────────────────────────────────────────

  private render(): void {
    this.feedList.innerHTML = "";

    if (this.entries.length === 0) {
      this.feedList.innerHTML = `
        <div style="font-size: 10px; color: rgba(200,185,255,0.4); text-align: center; padding: 12px 0;">
          No cards played yet
        </div>
      `;
      return;
    }

    this.entries.forEach((e) => {
      let isMe = false;
      if (e.owner) {
        isMe = e.owner === "player";
      } else if (e.playerId) {
        if (this.myRole === "p2") {
          isMe = e.playerId === "P2" || e.playerId === "p2" || e.playerId === PlayerId.Opponent;
        } else {
          isMe = e.playerId === "P1" || e.playerId === "p1" || e.playerId === PlayerId.Player;
        }
      } else {
        isMe = true;
      }

      const item = document.createElement("div");
      item.className = `ah-entry ${isMe ? "player" : "opponent"}`;

      const icon = e.card.type === CardType.Unit ? "⚔️" :
                   e.card.type === CardType.Spell ? "✨" :
                   e.card.type === CardType.Environment ? "🌿" :
                   e.card.type === CardType.Equipment ? "🛡️" : "⭐";

      const laneText = e.laneIndex !== undefined && e.laneIndex !== null
        ? `• Lane ${e.laneIndex + 1}`
        : "";

      const tagText = isMe
        ? "You"
        : (this.isOnline ? (e.playerName || "Opponent") : "Bot");

      item.innerHTML = `
        <div class="ah-cost-badge">${e.card.cost}</div>
        <div class="ah-info">
          <div class="ah-card-name">${icon} ${e.card.name}</div>
          <div class="ah-action-sub">
            <span class="ah-player-tag ${isMe ? "player" : "opponent"}">${tagText}</span>
            <span>${e.actionText || "Played"} ${laneText}</span>
          </div>
        </div>
      `;

      item.addEventListener("mouseenter", () => {
        const rect = item.getBoundingClientRect();
        this.showTooltip(e.card, rect.top);
      });

      item.addEventListener("mouseleave", () => {
        this.hideTooltip();
      });

      this.feedList.appendChild(item);
    });
  }

  private showTooltip(card: CardDefinition, topPx: number): void {
    const icon = card.type === CardType.Unit ? "⚔️" :
                 card.type === CardType.Spell ? "✨" :
                 card.type === CardType.Environment ? "🌿" :
                 card.type === CardType.Equipment ? "🛡️" : "⭐";

    const cardTribes = (card as any).tribes && (card as any).tribes.length > 0 ? (card as any).tribes : [card.tribe || "Neutral"];
    const tribeColor = TRIBE_CSS[cardTribes[0]] ?? "#a78bfa";

    const keywordsHtml = card.keywords && card.keywords.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">
           ${card.keywords.map((kw) => `<span style="background:rgba(139,92,246,0.3);border:1px solid #8b5cf6;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:800;color:#ddd6fe;">${kw}</span>`).join("")}
         </div>`
      : "";

    const statsHtml = card.type === CardType.Unit
      ? `<div style="display:flex;gap:12px;font-size:12px;font-weight:800;">
           <span style="color:#f87171;">⚔ ${card.attack}</span>
           <span style="color:#4ade80;">♥ ${card.hp}</span>
         </div>`
      : "";

    this.hoverTooltip.style.top = `${Math.min(topPx, window.innerHeight - 200)}px`;
    this.hoverTooltip.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:800;font-size:13px;color:#ffffff;">${card.name}</div>
        <div style="background:#0284c7;color:#fff;font-weight:800;font-size:10px;padding:1px 6px;border-radius:99px;">${card.cost} Mana</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:${tribeColor};text-transform:uppercase;">${icon} ${cardTribes.join(" / ")} ${card.type}</div>
      ${statsHtml}
      ${keywordsHtml}
      <div style="font-size:10px;color:#cbd5e1;background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;line-height:1.3;">
        ${card.text || "No additional rules text."}
      </div>
    `;
    this.hoverTooltip.classList.add("visible");
  }

  private hideTooltip(): void {
    this.hoverTooltip.classList.remove("visible");
  }
}
