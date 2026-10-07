// ============================================================
//  client/CardCatalogModal.ts — Card Catalog & Lore Gallery
//  Quick viewer to browse all cards, artworks, and lore without editing constraints.
// ============================================================

import gsap from "gsap";
import { CardDefinition, CardType } from "../src/types";
import { cardRepo } from "./CardRepository";
import { audioManager } from "./AudioManager";
import {
  SUNFLOWER, PEASHOOTER, WALL_NUT, BONK_CHOY, CHOMPER, TALLNUT,
  HOMING_THISTLE, ROTOBAGA, AIR_RAID_ZOMBIE,
  LILY_PAD, SPIKEWEED, SEA_ZOMBIE,
  BASIC_ZOMBIE, CONEHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE, ZOMBIE_JESTER, BULLY_ZOMBIE,
  FERTILIZE, LIGHTNING_REED, BRAINS_FOR_BRAINS, WEED_SPRAY,
  TORCHWOOD, CHEF_ZOMBIE,
  DOOM_SHROOM, BARREL_OF_DEADBEARDS,
  SPIKED_HELMET, FERTILIZER_PACK,
  SOLAR_WINDS, BLACK_HOLE,
} from "../src/cards";
import { buildCardCatalog } from "./DeckStorage";

const FALLBACK_CARDS: CardDefinition[] = buildCardCatalog([
  SUNFLOWER, PEASHOOTER, WALL_NUT, BONK_CHOY, CHOMPER, TALLNUT,
  HOMING_THISTLE, ROTOBAGA, AIR_RAID_ZOMBIE,
  LILY_PAD, SPIKEWEED, SEA_ZOMBIE,
  BASIC_ZOMBIE, CONEHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE, ZOMBIE_JESTER, BULLY_ZOMBIE,
  FERTILIZE, LIGHTNING_REED, BRAINS_FOR_BRAINS, WEED_SPRAY,
  TORCHWOOD, CHEF_ZOMBIE,
  DOOM_SHROOM, BARREL_OF_DEADBEARDS,
  SPIKED_HELMET, FERTILIZER_PACK,
  SOLAR_WINDS, BLACK_HOLE,
]);

export class CardCatalogModal {
  private overlay!: HTMLElement;
  private gridEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private detailModal!: HTMLElement;
  private cards: CardDefinition[] = [];
  private searchQuery = "";
  private filterType = "ALL";
  private filterTribe = "ALL";
  private onCloseCallback?: () => void;
  private keydownListener?: (e: KeyboardEvent) => void;

  constructor() {
    this.injectStyles();
    this.buildUI();
    this.bindEvents();
  }

  private setupListeners(): void {
    this.removeListeners();
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (this.detailModal && this.detailModal.classList.contains("visible")) {
          this.detailModal.classList.remove("visible");
          this.detailModal.style.display = "none";
          return;
        }
        this.hide(true);
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

  public show(onClose?: () => void): void {
    this.setupListeners();
    this.onCloseCallback = onClose;
    audioManager.playClick();
    this.refreshCards();
    this.overlay.style.display = "flex";
    this.overlay.classList.add("visible");
    this.renderCards();

    const card = this.overlay.querySelector(".catalog-card");
    if (card) {
      gsap.killTweensOf(card);
      gsap.fromTo(
        card,
        { opacity: 0, scale: 0.95, y: 15 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "power2.out" },
      );
    }
  }

  public hide(triggerCallback: boolean = true): void {
    this.removeListeners();
    const cb = this.onCloseCallback;
    this.onCloseCallback = undefined;

    if (this.detailModal) {
      this.detailModal.classList.remove("visible");
      this.detailModal.style.display = "none";
    }

    const card = this.overlay.querySelector(".catalog-card");
    if (card) {
      gsap.killTweensOf(card);
    }

    if (!triggerCallback) {
      this.overlay.classList.remove("visible");
      this.overlay.style.display = "none";
      return;
    }

    audioManager.playClick();
    if (card) {
      gsap.to(card, {
        opacity: 0,
        scale: 0.96,
        duration: 0.18,
        onComplete: () => {
          this.overlay.classList.remove("visible");
          this.overlay.style.display = "none";
          if (cb) {
            cb();
          } else if ((window as any).screenController) {
            (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
          }
        },
      });
    } else {
      this.overlay.classList.remove("visible");
      this.overlay.style.display = "none";
      if (cb) {
        cb();
      } else if ((window as any).screenController) {
        (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
      }
    }
  }

  private refreshCards(): void {
    const repoCards = cardRepo.getAll();
    this.cards = repoCards.length > 0 ? repoCards : [...FALLBACK_CARDS];
  }

  // ── CSS Styles ───────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById("card-catalog-styles")) return;
    const style = document.createElement("style");
    style.id = "card-catalog-styles";
    style.textContent = `
      #catalog-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at 50% 20%, rgba(18, 12, 40, 0.96), rgba(4, 2, 14, 0.99));
        backdrop-filter: blur(28px);
        z-index: 250;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        user-select: none;
      }
      #catalog-overlay.visible {
        display: flex;
      }
      .catalog-card {
        background: linear-gradient(165deg, rgba(26, 18, 54, 0.96), rgba(12, 8, 28, 0.98));
        border: 2px solid rgba(140, 100, 255, 0.45);
        border-radius: 24px;
        width: 100%;
        max-width: 1180px;
        height: 90vh;
        max-height: 820px;
        padding: 28px 36px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.85), 0 0 50px rgba(120, 80, 255, 0.25);
        display: flex;
        flex-direction: column;
        gap: 18px;
        position: relative;
        box-sizing: border-box;
      }
      .catalog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(140, 100, 255, 0.2);
        padding-bottom: 14px;
      }
      .catalog-header-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .catalog-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 26px;
        font-weight: 800;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 12px;
        text-shadow: 0 0 18px rgba(160, 120, 255, 0.45);
      }
      .catalog-subtitle {
        font-size: 13px;
        color: #bfaee6;
      }
      .catalog-close-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #cbd5e1;
        padding: 8px 16px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
      }
      .catalog-close-btn:hover {
        background: rgba(239, 68, 68, 0.25);
        border-color: #ef4444;
        color: #ffffff;
      }
      .catalog-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        background: rgba(14, 10, 32, 0.6);
        border: 1px solid rgba(140, 100, 255, 0.2);
        padding: 12px 16px;
        border-radius: 14px;
      }
      .catalog-search {
        flex: 1;
        min-width: 220px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(140, 100, 255, 0.35);
        border-radius: 10px;
        padding: 8px 14px;
        color: #ffffff;
        font-size: 13px;
        outline: none;
      }
      .catalog-search:focus {
        border-color: #38bdf8;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
      }
      .catalog-filter-group {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .catalog-chip {
        padding: 5px 12px;
        border-radius: 99px;
        border: 1px solid rgba(140, 100, 255, 0.25);
        background: rgba(255, 255, 255, 0.05);
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
      }
      .catalog-chip:hover {
        border-color: #a78bfa;
        color: #ffffff;
      }
      .catalog-chip.active {
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        border-color: #c084fc;
        color: #ffffff;
        box-shadow: 0 2px 10px rgba(124, 58, 237, 0.5);
      }
      .catalog-grid-wrapper {
        flex: 1;
        overflow-y: auto;
        padding-right: 6px;
      }
      .catalog-grid-wrapper::-webkit-scrollbar {
        width: 8px;
      }
      .catalog-grid-wrapper::-webkit-scrollbar-thumb {
        background: rgba(140, 100, 255, 0.35);
        border-radius: 99px;
      }
      .catalog-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 14px;
      }
      .cat-card-item {
        background: linear-gradient(155deg, rgba(30, 22, 60, 0.9), rgba(16, 11, 35, 0.95));
        border: 1.5px solid rgba(140, 100, 255, 0.3);
        border-radius: 14px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
      }
      .cat-card-item:hover {
        transform: translateY(-4px);
        border-color: #ffd066;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 208, 102, 0.3);
      }
      .cat-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .cat-cost {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0284c7, #1d4ed8);
        border: 1px solid #38bdf8;
        color: #ffffff;
        font-weight: 800;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .cat-type-pill {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 8px;
        border-radius: 99px;
        background: rgba(255, 255, 255, 0.08);
        color: #c4b5fd;
      }
      .cat-art {
        height: 80px;
        background: rgba(0, 0, 0, 0.35);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 38px;
        overflow: hidden;
      }
      .cat-art img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .cat-name {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 13px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cat-stats {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 800;
      }
      .cat-atk { color: #f59e0b; }
      .cat-hp { color: #10b981; }

      /* Detail Inspect Modal */
      #cat-detail-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(12px);
        z-index: 280;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      #cat-detail-overlay.visible {
        display: flex;
      }
      .cat-detail-card {
        background: linear-gradient(165deg, rgba(32, 22, 70, 0.98), rgba(15, 10, 35, 0.99));
        border: 2px solid #ffd066;
        border-radius: 20px;
        width: 100%;
        max-width: 440px;
        padding: 24px 28px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.85), 0 0 30px rgba(255, 208, 102, 0.35);
        display: flex;
        flex-direction: column;
        gap: 14px;
        position: relative;
      }
      .cat-detail-close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build UI ─────────────────────────────────────────────────

  private buildUI(): void {
    const overlay = document.createElement("div");
    overlay.id = "catalog-overlay";
    overlay.innerHTML = `
      <div class="catalog-card">
        <div class="catalog-header">
          <div class="catalog-header-left">
            <div class="catalog-title">📖 CARD CATALOG &amp; LORE</div>
            <div class="catalog-subtitle">Inspect the full repository of Units, Spells, Equipment, and Environments</div>
          </div>
          <button class="catalog-close-btn" id="btn-close-catalog">← Return to Main Menu</button>
        </div>

        <div class="catalog-controls">
          <input class="catalog-search" id="cat-search-input" type="text" placeholder="🔍 Search card name, keyword, or lore..." />
          <div class="catalog-filter-group" id="cat-type-filters">
            <button class="catalog-chip active" data-type="ALL">All Types</button>
            <button class="catalog-chip" data-type="Unit">⚔️ Units</button>
            <button class="catalog-chip" data-type="Spell">✨ Spells</button>
            <button class="catalog-chip" data-type="Equipment">🛡️ Equipment</button>
            <button class="catalog-chip" data-type="Environment">🌿 Environments</button>
            <button class="catalog-chip" data-type="HeroAbility">⭐ Hero Abilities</button>
          </div>
        </div>

        <div class="catalog-grid-wrapper">
          <div class="catalog-grid" id="cat-cards-grid"></div>
        </div>
      </div>

      <!-- Card Detail Modal -->
      <div id="cat-detail-overlay">
        <div class="cat-detail-card">
          <button class="cat-detail-close" id="btn-close-cat-detail">✕</button>
          <div id="cat-detail-body"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.gridEl = overlay.querySelector("#cat-cards-grid") as HTMLElement;
    this.searchInput = overlay.querySelector("#cat-search-input") as HTMLInputElement;
    this.detailModal = overlay.querySelector("#cat-detail-overlay") as HTMLElement;
  }

  // ── Event Bindings ───────────────────────────────────────────

  private bindEvents(): void {
    const btnClose = this.overlay.querySelector("#btn-close-catalog")!;
    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide(true);
    });

    const btnCloseDetail = this.detailModal.querySelector("#btn-close-cat-detail")!;
    btnCloseDetail.addEventListener("click", (e) => {
      e.stopPropagation();
      this.detailModal.classList.remove("visible");
      this.detailModal.style.display = "none";
    });

    this.searchInput.addEventListener("input", () => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase();
      this.renderCards();
    });

    const typeChips = this.overlay.querySelectorAll("#cat-type-filters .catalog-chip");
    typeChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        audioManager.playHover();
        typeChips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        this.filterType = chip.getAttribute("data-type") || "ALL";
        this.renderCards();
      });
    });
  }

  // ── Rendering ────────────────────────────────────────────────

  private renderCards(): void {
    this.gridEl.innerHTML = "";

    const filtered = this.cards.filter((c) => {
      if (this.filterType !== "ALL" && c.type !== this.filterType) return false;
      if (this.searchQuery) {
        const matchesName = c.name.toLowerCase().includes(this.searchQuery);
        const matchesDesc = (c.description || c.text || "").toLowerCase().includes(this.searchQuery);
        const tribesList = c.tribes && c.tribes.length > 0 ? c.tribes : (c.tribe ? [c.tribe] : []);
        const matchesTribe = tribesList.some((t) => t.toLowerCase().includes(this.searchQuery));
        const matchesKeywords = (c.keywords || []).some((k) => k.toLowerCase().includes(this.searchQuery));
        if (!matchesName && !matchesDesc && !matchesTribe && !matchesKeywords) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      this.gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: #9d8ec7; padding: 48px; font-size: 15px;">
          No cards matched your filter or search criteria.
        </div>
      `;
      return;
    }

    filtered.forEach((card) => {
      const item = document.createElement("div");
      item.className = "cat-card-item";

      const isImg = card.imageUrl && (card.imageUrl.startsWith("http") || card.imageUrl.startsWith("data:") || card.imageUrl.startsWith("/"));
      const artHtml = isImg
        ? `<img src="${card.imageUrl}" alt="${card.name}" />`
        : (card.artEmoji || "🃏");

      const cardTribes = card.tribes && card.tribes.length > 0 ? card.tribes.join(" / ") : (card.tribe || card.type);

      item.innerHTML = `
        <div class="cat-top">
          <div class="cat-cost">${card.cost}</div>
          <div class="cat-type-pill">${cardTribes}</div>
        </div>
        <div class="cat-art">${artHtml}</div>
        <div class="cat-name" title="${card.name}">${card.name}</div>
        <div class="cat-stats">
          ${card.attack !== undefined && card.attack !== null ? `<span class="cat-atk">⚔ ${card.attack}</span>` : "<span></span>"}
          ${card.hp !== undefined && card.hp !== null ? `<span class="cat-hp">❤️ ${card.hp}</span>` : "<span></span>"}
        </div>
      `;

      item.addEventListener("click", () => {
        audioManager.playClick();
        this.openCardDetail(card);
      });

      this.gridEl.appendChild(item);
    });
  }

  private openCardDetail(card: CardDefinition): void {
    const body = this.detailModal.querySelector("#cat-detail-body") as HTMLElement;
    const isImg = card.imageUrl && (card.imageUrl.startsWith("http") || card.imageUrl.startsWith("data:") || card.imageUrl.startsWith("/"));
    const artHtml = isImg
      ? `<img src="${card.imageUrl}" alt="${card.name}" style="width:100%;height:160px;object-fit:cover;border-radius:12px;" />`
      : `<div style="font-size:64px;text-align:center;padding:16px;">${card.artEmoji || "🃏"}</div>`;

    const cardTribes = card.tribes && card.tribes.length > 0 ? card.tribes.join(" / ") : (card.tribe || "Neutral");

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11px;font-weight:800;letter-spacing:0.1em;color:#ffd066;text-transform:uppercase;">${card.type} · ${cardTribes}</span>
        <span style="font-size:18px;font-weight:900;color:#38bdf8;background:rgba(56,189,248,0.15);padding:2px 10px;border-radius:99px;">${card.cost} Mana</span>
      </div>
      <div style="font-family:'Cinzel Decorative',serif;font-size:22px;font-weight:800;color:#ffffff;margin-top:6px;">${card.name}</div>
      <div style="margin:10px 0;">${artHtml}</div>
      ${card.keywords && card.keywords.length > 0 ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          ${card.keywords.map(k => `<span style="background:rgba(140,100,255,0.25);border:1px solid rgba(140,100,255,0.4);color:#d8c8ff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">⚡ ${k}</span>`).join("")}
        </div>
      ` : ""}
      <div style="color:#d1c7f5;font-size:13px;line-height:1.5;background:rgba(0,0,0,0.35);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
        ${card.description || card.text || "No flavor text available for this temporal artifact."}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-weight:800;font-size:16px;">
        ${card.attack !== undefined && card.attack !== null ? `<span style="color:#f59e0b;">⚔ ${card.attack} Attack</span>` : "<span></span>"}
        ${card.hp !== undefined && card.hp !== null ? `<span style="color:#10b981;">❤️ ${card.hp} Health</span>` : "<span></span>"}
      </div>
    `;

    this.detailModal.style.display = "flex";
    this.detailModal.classList.add("visible");
  }
}
