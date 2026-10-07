// ============================================================
//  DeckBuilderUI.ts — 2-Panel Deck Builder Screen
//  Left: Card Catalog grid with rich tiles & strict Hero Tribe filter
//  Right: Sticky Card Inspector & Compact Visual Deck Stack
//  Full validation, save, load, rename, duplicate, delete support.
// ============================================================

import { CardDefinition, CardType, Hero, Keyword } from "../src/types";
import { DeckStorage, SavedDeck, buildCardCatalog, hydrateCardIds } from "./DeckStorage";
import { cardRepo } from "./CardRepository";
import { heroRepo } from "./HeroRepository";
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
import { TRIBE_CSS } from "./visualConstants";

// ─── All collectible fallback cards ───────────────────────────
const ALL_CARDS: CardDefinition[] = buildCardCatalog([
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

const DECK_SIZE  = 40;
const MAX_COPIES = 4;

const TYPE_ICONS: Record<string, string> = {
  UNIT:        "⚔️",
  SPELL:       "✨",
  EQUIPMENT:   "🛡️",
  ENVIRONMENT: "🌿",
  HERO_ABILITY: "⭐",
  Unit:        "⚔️",
  Spell:       "✨",
  Equipment:   "🛡️",
  Environment: "🌿",
  HeroAbility: "⭐",
};

export const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  สนับสนุน: "สามารถวางในแถวสนับสนุน (Support Row) ด้านหลังได้",
  โจมตีต่อเนื่อง: "โจมตีอีกครั้งทันที หรือโจมตีซ้ำ 2 ครั้งในขั้นตอนการต่อสู้",
  เกลียดชังตำนาน: "เมื่อสร้างความเสียหายแก่ยูนิต จะสร้างความเสียหายแก่ฮีโร่คู่ต่อสู้ด้วย",
  อากาศยาน: "สามารถวางลงในเลน 0 (เลนอากาศ) ได้",
  กองเรือ: "สามารถวางลงในเลน 3 (เลนน้ำ) ได้",
  กลืนชีพ: "ฟื้นฟูพลังชีวิตฮีโร่ของฝ่ายตนเองเท่ากับความเสียหายที่สร้างได้",
  ทนทาน: "ลดทอนความเสียหายจากการโจมตีที่ได้รับลง 1 หน่วย",
  จู่โจม: "โจมตี 1 ครั้งทันทีเมื่อถูกนำลงสู่สนาม",
  // English / Legacy mappings for backwards compatibility:
  SUPPORT: "สามารถวางในแถวสนับสนุน (Support Row) ด้านหลังได้",
  Support: "สามารถวางในแถวสนับสนุน (Support Row) ด้านหลังได้",
  RUSH: "โจมตี 1 ครั้งทันทีเมื่อถูกนำลงสู่สนาม",
  Rush: "โจมตี 1 ครั้งทันทีเมื่อถูกนำลงสู่สนาม",
  FLYING: "สามารถวางลงในเลน 0 (เลนอากาศ) ได้",
  Flying: "สามารถวางลงในเลน 0 (เลนอากาศ) ได้",
  AMPHIBIOUS: "สามารถวางลงในเลน 3 (เลนน้ำ) ได้",
  Amphibious: "สามารถวางลงในเลน 3 (เลนน้ำ) ได้",
  STRIKETHROUGH: "เมื่อสร้างความเสียหายแก่ยูนิต จะสร้างความเสียหายแก่ฮีโร่คู่ต่อสู้ด้วย",
  Strikethrough: "เมื่อสร้างความเสียหายแก่ยูนิต จะสร้างความเสียหายแก่ฮีโร่คู่ต่อสู้ด้วย",
  PIERCING: "เจาะเกราะทะลวงผ่านยูนิตไปยังฮีโร่",
  Piercing: "เจาะเกราะทะลวงผ่านยูนิตไปยังฮีโร่",
  DOUBLE_STRIKE: "โจมตีซ้ำ 2 ครั้งในขั้นตอนการต่อสู้",
  DoubleStrike: "โจมตีซ้ำ 2 ครั้งในขั้นตอนการต่อสู้",
  "Double Strike": "โจมตีซ้ำ 2 ครั้งในขั้นตอนการต่อสู้",
  LIFESTEAL: "ฟื้นฟูพลังชีวิตฮีโร่ของฝ่ายตนเองเท่ากับความเสียหายที่สร้างได้",
  Lifesteal: "ฟื้นฟูพลังชีวิตฮีโร่ของฝ่ายตนเองเท่ากับความเสียหายที่สร้างได้",
  ARMORED: "ลดทอนความเสียหายจากการโจมตีที่ได้รับลง 1 หน่วย",
  Armored: "ลดทอนความเสียหายจากการโจมตีที่ได้รับลง 1 หน่วย",
  OVERKILL: "โจมตีอีกครั้งทันทีเมื่อทำลายยูนิตศัตรูสำเร็จ",
  Overkill: "โจมตีอีกครั้งทันทีเมื่อทำลายยูนิตศัตรูสำเร็จ",
  DEATHRATTLE: "แสดงผลพิเศษทันทีเมื่อยูนิตถูกทำลาย",
  Deathrattle: "แสดงผลพิเศษทันทีเมื่อยูนิตถูกทำลาย",
  AURA: "มอบบัฟสถานะต่อเนื่องแก่ยูนิตฝ่ายเดียวกัน",
  Aura: "มอบบัฟสถานะต่อเนื่องแก่ยูนิตฝ่ายเดียวกัน",
  SHIELD: "ดูดซับความเสียหายที่จะได้รับครั้งถัดไปอย่างสมบูรณ์",
  Shield: "ดูดซับความเสียหายที่จะได้รับครั้งถัดไปอย่างสมบูรณ์",
  FROZEN: "ข้ามการโจมตีในรอบถัดไป",
  Frozen: "ข้ามการโจมตีในรอบถัดไป",
  DEADLY: "ทำลายยูนิตที่ได้รับความเสียหายจากการโจมตีทันที",
  Deadly: "ทำลายยูนิตที่ได้รับความเสียหายจากการโจมตีทันที",
};

function costColor(cost: number): string {
  if (cost <= 1) return "#38bdf8";
  if (cost === 2) return "#4ade80";
  if (cost === 3) return "#fbbf24";
  if (cost === 4) return "#f97316";
  if (cost === 5) return "#c084fc";
  return "#f43f5e";
}

function getCardArtEmoji(card: CardDefinition): string {
  const name = (card.name || "").toLowerCase();
  if (name.includes("sunflower")) return "🌻";
  if (name.includes("peashooter")) return "🌱";
  if (name.includes("wall-nut") || name.includes("wallnut")) return "🌰";
  if (name.includes("bonk choy") || name.includes("bonkchoy")) return "🥊";
  if (name.includes("chomper")) return "🪴";
  if (name.includes("tallnut") || name.includes("tall-nut")) return "🗿";
  if (name.includes("thistle")) return "🌵";
  if (name.includes("rotobaga")) return "🚁";
  if (name.includes("air raid") || name.includes("air-raid")) return "🛩️";
  if (name.includes("lily pad") || name.includes("lilypad")) return "🪷";
  if (name.includes("spikeweed")) return "🌿";
  if (name.includes("sea zombie")) return "🧟‍♂️";
  if (name.includes("conehead")) return "🗼";
  if (name.includes("buckethead")) return "🪣";
  if (name.includes("jester")) return "🎭";
  if (name.includes("bully")) return "🏈";
  if (name.includes("zombie")) return "🧟";
  if (name.includes("fertiliz")) return "🧪";
  if (name.includes("lightning") || name.includes("reed")) return "⚡";
  if (name.includes("brains")) return "🧠";
  if (name.includes("weed spray")) return "💨";
  if (name.includes("torchwood")) return "🪵";
  if (name.includes("chef")) return "👨‍🍳";
  if (name.includes("doom")) return "💥";
  if (name.includes("barrel")) return "🛢️";
  if (name.includes("helmet")) return "🪖";
  if (name.includes("solar winds")) return "🌪️";
  if (name.includes("black hole")) return "🕳️";
  if (card.type === CardType.Spell || (card.type as any) === "Spell") return "✨";
  if (card.type === CardType.Equipment || (card.type as any) === "Equipment") return "🛡️";
  if (card.type === CardType.Environment || (card.type as any) === "Environment") return "🌿";
  return "⚔️";
}

function getTribeColor(tribe: string): string {
  return TRIBE_CSS[tribe] || TRIBE_CSS["default"] || "#a855f7";
}

// ─────────────────────────────────────────────────────────────

export class DeckBuilderUI {
  private overlay!: HTMLElement;
  private leftPanel!: HTMLElement;
  private rightPanel!: HTMLElement;
  private inspectorPanel!: HTMLElement;

  // State
  private hero!: Hero;
  private heroes: Hero[] = [];
  private catalog: CardDefinition[] = [];
  private activeDeckIds: string[] = [];
  private savedDecks: SavedDeck[] = [];
  private selectedDeckId: string | null = null;
  private searchQuery = "";
  private filterType = "ALL";
  private filterCost = "ALL";
  private hoveredCard: CardDefinition | null = null;
  private onDone!: (deck: CardDefinition[], hero: Hero) => void;
  private onCloseCb?: () => void;
  private onFallbackToMenu?: () => void;
  private styleInjected = false;
  private keydownListener?: (e: KeyboardEvent) => void;

  constructor() {
    this.injectStyles();
    this.buildShell();
  }

  // ── Public API ───────────────────────────────────────────────

  public setOnFallbackToMenu(cb: () => void): void {
    this.onFallbackToMenu = cb;
  }

  private setupListeners(): void {
    this.removeListeners();
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
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

  // ── Safe Hero Extraction & Normalization ───────────────────────

  private getSafeHero(rawHero?: any): Hero {
    if (!rawHero || typeof rawHero !== "object") {
      return {
        id: "HERO_UNKNOWN",
        name: "Unknown Hero",
        title: "Hero",
        description: "",
        portraitUrl: "🧙",
        maxHp: 20,
        startingHp: 20,
        allowedTribes: ["Neutral"],
        tribeSynergies: ["Neutral"],
        superpowerKit: {
          signatureAbility: SUNFLOWER,
          coreAbilities: [SUNFLOWER, PEASHOOTER, WALL_NUT],
        },
        superpowers: [SUNFLOWER, PEASHOOTER, WALL_NUT],
      };
    }

    const id = typeof rawHero.id === "string" && rawHero.id.trim() ? rawHero.id : "HERO_UNKNOWN";
    const name = typeof rawHero.name === "string" && rawHero.name.trim() ? rawHero.name : "Unnamed Hero";
    const title = typeof rawHero.title === "string" ? rawHero.title : "Hero";
    const description = typeof rawHero.description === "string" ? rawHero.description : "";
    const portraitUrl = typeof rawHero.portraitUrl === "string" && rawHero.portraitUrl.trim()
      ? rawHero.portraitUrl
      : (typeof rawHero.avatar === "string" && rawHero.avatar.trim() ? rawHero.avatar : "🧙");
    const maxHp = typeof rawHero.maxHp === "number" && !isNaN(rawHero.maxHp) ? rawHero.maxHp : 20;
    const startingHp = typeof rawHero.startingHp === "number" && !isNaN(rawHero.startingHp) ? rawHero.startingHp : maxHp;

    let allowedTribes: string[] = [];
    if (Array.isArray(rawHero.allowedTribes) && rawHero.allowedTribes.length > 0) {
      allowedTribes = rawHero.allowedTribes.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim());
    } else if (Array.isArray(rawHero.tribeSynergies) && rawHero.tribeSynergies.length > 0) {
      allowedTribes = rawHero.tribeSynergies.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim());
    }
    if (allowedTribes.length === 0) {
      allowedTribes = ["Neutral"];
    }

    const tribeSynergies = Array.isArray(rawHero.tribeSynergies) && rawHero.tribeSynergies.length > 0
      ? rawHero.tribeSynergies.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim())
      : [...allowedTribes];

    return {
      ...rawHero,
      id,
      name,
      title,
      description,
      portraitUrl,
      maxHp,
      startingHp,
      allowedTribes,
      tribeSynergies,
    };
  }

  public show(hero?: Hero, onDone?: (deck: CardDefinition[], hero: Hero) => void, onClose?: () => void): void {
    DeckStorage.seedDefaults();
    this.setupListeners();
    const allHeroes = heroRepo.getAllHeroes();
    this.heroes = allHeroes.length > 0 ? allHeroes.map((h) => this.getSafeHero(h)) : [];
    const initialHero = (hero && this.heroes.find((h) => h.id === hero.id)) ? hero : (this.heroes[0] || hero);
    this.hero = this.getSafeHero(initialHero);
    if (onDone) this.onDone = onDone;
    this.onCloseCb = onClose;

    // Load CMS cards or fallback, exclude Superpower cards from collectible deck builder
    const repoCards = cardRepo.getAll().filter((c) => {
      return c.type !== CardType.HeroAbility && (c.type as any) !== "HeroAbility" && (c.type as any) !== "HERO_ABILITY";
    });
    this.catalog = repoCards.length > 0 ? repoCards : [...ALL_CARDS];

    this.savedDecks = DeckStorage.loadByHero(this.hero.id);
    this.activeDeckIds = [];
    this.selectedDeckId = null;
    this.searchQuery = "";
    this.filterType = "ALL";
    this.filterCost = "ALL";

    // Auto-select first saved deck
    if (this.savedDecks.length > 0) {
      this.selectedDeckId = this.savedDecks[0].id;
      this.activeDeckIds = [...this.savedDecks[0].cardIds];
    }

    // Set initial hovered card to first card in catalog
    const allowedCards = this.getAllowedCards();
    this.hoveredCard = allowedCards[0] || this.catalog[0] || null;

    this.render();
    this.overlay.style.pointerEvents = "auto";
    this.overlay.style.display = "flex";
    requestAnimationFrame(() => {
      this.overlay.style.opacity = "1";
      this.overlay.style.transform = "scale(1)";
    });
  }

  public selectHero(heroId: string): void {
    if (this.hero && this.hero.id === heroId) return;
    const target = this.heroes.find((h) => h.id === heroId);
    if (!target) return;

    this.hero = this.getSafeHero(target);
    this.savedDecks = DeckStorage.loadByHero(this.hero.id);
    this.selectedDeckId = null;
    this.activeDeckIds = [];

    // Auto-select first saved deck for this hero
    if (this.savedDecks.length > 0) {
      this.selectedDeckId = this.savedDecks[0].id;
      this.activeDeckIds = [...this.savedDecks[0].cardIds];
    }

    const allowed = this.getAllowedCards();
    this.hoveredCard = allowed[0] || this.catalog[0] || null;

    this.render();
  }

  public hide(triggerCloseCallback: boolean = true): void {
    this.removeListeners();
    this.overlay.style.pointerEvents = "none";
    this.overlay.style.opacity = "0";
    this.overlay.style.transform = "scale(0.97)";
    this.overlay.style.display = "none";
    const cb = this.onCloseCb;
    this.onCloseCb = undefined;
    if (triggerCloseCallback) {
      if (cb) {
        cb();
      } else if (this.onFallbackToMenu) {
        this.onFallbackToMenu();
      } else if ((window as any).screenController) {
        (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
      }
    }
  }

  // ── Hero Allowed Tribe Filtering Logic ────────────────────────

  private getAllowedTribes(heroObj?: Hero): string[] {
    const h = this.getSafeHero(heroObj || this.hero);
    if (Array.isArray(h.allowedTribes) && h.allowedTribes.length > 0) {
      return [...h.allowedTribes];
    }
    if (Array.isArray(h.tribeSynergies) && h.tribeSynergies.length > 0) {
      return [...h.tribeSynergies];
    }
    return ["Neutral"];
  }

  private isCardAllowedForHero(card: CardDefinition): boolean {
    // Exclude Superpower / Hero Ability cards entirely
    if (
      card.type === CardType.HeroAbility ||
      (card.type as any) === "HeroAbility" ||
      (card.type as any) === "HERO_ABILITY"
    ) {
      return false;
    }

    const allowed = this.getAllowedTribes();
    if (allowed.length === 0) return true;

    const cardTribe = (card.tribe || "").trim().toLowerCase();
    if (
      !cardTribe ||
      cardTribe === "neutral" ||
      cardTribe === "เป็นกลาง" ||
      cardTribe === "universal" ||
      cardTribe === "all" ||
      cardTribe === "none"
    ) {
      return true;
    }

    return allowed.some((t) => t.trim().toLowerCase() === cardTribe);
  }

  private getAllowedCards(): CardDefinition[] {
    return this.catalog.filter((c) => this.isCardAllowedForHero(c));
  }

  // ── Build Shell ──────────────────────────────────────────────

  private buildShell(): void {
    this.overlay = document.createElement("div");
    this.overlay.id = "deck-builder-overlay";

    const inner = document.createElement("div");
    inner.className = "db-inner";

    const header = document.createElement("div");
    header.className = "db-header";
    header.innerHTML = `
      <div class="db-header-left">
        <div class="db-logo">⚔ DECK BUILDER</div>
        <div class="db-hero-filter-pill" id="db-hero-filter-tag">
          <span class="db-filter-dot"></span>
          <span id="db-filter-text">Filtering for Hero</span>
        </div>
      </div>
      <div class="db-hero-tabs-bar" id="db-hero-tabs-bar"></div>
      <div class="db-header-right">
        <div class="db-counter" id="db-card-counter">0 / 40 Cards</div>
        <button class="db-btn-save" id="db-btn-save" disabled>💾 Save &amp; Select Deck</button>
        <button class="db-btn-close" id="db-btn-close" title="Close Deck Builder">✕</button>
      </div>
    `;

    const content = document.createElement("div");
    content.className = "db-content";

    this.leftPanel = document.createElement("div");
    this.leftPanel.className = "db-left";

    this.rightPanel = document.createElement("div");
    this.rightPanel.className = "db-right";

    content.appendChild(this.leftPanel);
    content.appendChild(this.rightPanel);
    inner.appendChild(header);
    inner.appendChild(content);
    this.overlay.appendChild(inner);
    document.body.appendChild(this.overlay);

    this.overlay.style.display = "none";
    this.overlay.style.opacity = "0";
    this.overlay.style.transform = "scale(0.97)";

    const closeBtn = this.overlay.querySelector("#db-btn-close") as HTMLButtonElement;
    closeBtn?.addEventListener("click", () => this.hide());

    const saveBtn = this.overlay.querySelector("#db-btn-save") as HTMLButtonElement;
    saveBtn?.addEventListener("click", () => this.handleSaveAndSelect());
  }

  // ── Render ───────────────────────────────────────────────────

  private render(): void {
    try {
      this.renderHeroTabs();
      this.updateFilterHeaderTag();
      this.renderLeft();
      this.renderRight();
      this.updateCounter();
      this.updateSaveBtn();
    } catch (err) {
      console.error("[DeckBuilderUI] render encountered an error:", err);
    }
  }

  private updateFilterHeaderTag(): void {
    const filterTextEl = this.overlay.querySelector("#db-filter-text");
    if (!filterTextEl) return;
    const safeH = this.getSafeHero(this.hero);
    const allowed = this.getAllowedTribes(safeH);
    const tribesStr = allowed.length > 0 ? `${allowed.join(" / ")} / เป็นกลาง` : "ทุกสาย";
    const icon = (safeH.portraitUrl && !safeH.portraitUrl.startsWith("http") && !safeH.portraitUrl.startsWith("/") && !safeH.portraitUrl.startsWith("data:") && !safeH.portraitUrl.startsWith("./"))
      ? safeH.portraitUrl
      : "🧙";
    filterTextEl.textContent = `${icon} ${safeH.name}: ${tribesStr}`;
  }

  private renderHeroTabs(): void {
    const tabsBar = this.overlay.querySelector("#db-hero-tabs-bar");
    if (!tabsBar) return;

    tabsBar.innerHTML = "";
    for (const rawH of this.heroes) {
      const h = this.getSafeHero(rawH);
      const btn = document.createElement("button");
      btn.type = "button";
      const currentHero = this.getSafeHero(this.hero);
      const isSelected = currentHero && currentHero.id === h.id;
      btn.className = `db-hero-tab${isSelected ? " active" : ""}`;
      btn.dataset.heroId = h.id;
      btn.title = `Switch to ${h.name} (${h.title})`;

      const isImg = h.portraitUrl && (
        h.portraitUrl.startsWith("http://") ||
        h.portraitUrl.startsWith("https://") ||
        h.portraitUrl.startsWith("data:") ||
        h.portraitUrl.startsWith("/") ||
        h.portraitUrl.startsWith("./")
      );
      const portraitHtml = isImg
        ? `<img src="${h.portraitUrl}" alt="${h.name}" class="db-hero-tab-img" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'db-hero-tab-portrait\\'>🧙</span>';" />`
        : `<span class="db-hero-tab-portrait">${h.portraitUrl || "🧙"}</span>`;

      const allowed = this.getAllowedTribes(h);
      const tribePills = (Array.isArray(allowed) ? allowed : []).slice(0, 2).map((t) => `<span class="db-tab-tribe-mini">${t}</span>`).join("");

      btn.innerHTML = `
        ${portraitHtml}
        <div class="db-hero-tab-info">
          <div class="db-hero-tab-title-row">
            <span class="db-hero-tab-name">${h.name}</span>
            ${tribePills}
          </div>
          <span class="db-hero-tab-title">${h.title}</span>
        </div>
      `;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectHero(h.id);
      });
      tabsBar.appendChild(btn);
    }
  }

  // ─── Left Panel: Card Catalog Grid ────────────────────────────

  private renderLeft(): void {
    const allowed = this.getAllowedTribes();
    const allowedCount = this.getAllowedCards().length;

    this.leftPanel.innerHTML = `
      <div class="db-left-header">
        <div class="db-left-title-bar">
          <div class="db-left-title">
            <span>📚 Card Collection</span>
            <span class="db-allowed-badge">${allowedCount} Available</span>
          </div>
          <div class="db-tribe-tags">
            ${allowed.map((t) => `<span class="db-tribe-chip" style="border-color:${getTribeColor(t)};color:${getTribeColor(t)}">● ${t}</span>`).join("")}
            <span class="db-tribe-chip neutral">● เป็นกลาง</span>
          </div>
        </div>

        <div class="db-left-controls">
          <div class="db-search-wrap">
            <input class="db-search" id="db-search" type="text" placeholder="🔍 Search by card name, tribe, or keyword..." value="${this.searchQuery}" />
            ${this.searchQuery ? `<button class="db-search-clear" id="db-search-clear">✕</button>` : ""}
          </div>
          
          <div class="db-filters-row">
            <div class="db-filter-bar" id="db-filter-bar">
              ${["ALL", "UNIT", "SPELL", "EQUIPMENT", "ENVIRONMENT"].map((t) => `
                <button class="db-filter-btn${this.filterType === t ? " active" : ""}" data-type="${t}">
                  ${t === "ALL" ? "All Types" : (TYPE_ICONS[t] || "") + " " + t.replace(/_/g, " ")}
                </button>
              `).join("")}
            </div>

            <div class="db-cost-bar" id="db-cost-bar">
              <button class="db-cost-btn${this.filterCost === "ALL" ? " active" : ""}" data-cost="ALL">All Cost</button>
              ${[1, 2, 3, 4, 5].map((c) => `
                <button class="db-cost-btn${this.filterCost === String(c) ? " active" : ""}" data-cost="${c}" style="--cost-col:${costColor(c)}">
                  ${c === 5 ? "5+" : c}
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="db-catalog-grid" id="db-catalog-grid"></div>
    `;

    // Search input
    const searchInput = this.leftPanel.querySelector("#db-search") as HTMLInputElement;
    searchInput?.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderCatalogGrid();
    });

    this.leftPanel.querySelector("#db-search-clear")?.addEventListener("click", () => {
      this.searchQuery = "";
      this.renderLeft();
    });

    // Type filters
    const filterBar = this.leftPanel.querySelector("#db-filter-bar");
    filterBar?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-type]") as HTMLElement;
      if (!btn) return;
      this.filterType = btn.dataset.type || "ALL";
      filterBar.querySelectorAll(".db-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.renderCatalogGrid();
    });

    // Cost filters
    const costBar = this.leftPanel.querySelector("#db-cost-bar");
    costBar?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-cost]") as HTMLElement;
      if (!btn) return;
      this.filterCost = btn.dataset.cost || "ALL";
      costBar.querySelectorAll(".db-cost-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.renderCatalogGrid();
    });

    this.renderCatalogGrid();
  }

  private renderCatalogGrid(): void {
    const grid = this.leftPanel.querySelector("#db-catalog-grid");
    if (!grid) return;

    const query = this.searchQuery.toLowerCase().trim();
    const allowedCards = this.getAllowedCards();

    const filtered = allowedCards.filter((c) => {
      const matchesSearch = !query ||
        c.name.toLowerCase().includes(query) ||
        (c.tribe || "").toLowerCase().includes(query) ||
        (c.text || "").toLowerCase().includes(query) ||
        (c.keywords || []).some((kw) => String(kw).toLowerCase().includes(query));

      const typeUpper = (c.type || "").toUpperCase();
      const matchesType = this.filterType === "ALL" || typeUpper === this.filterType;

      let matchesCost = true;
      if (this.filterCost !== "ALL") {
        const costNum = parseInt(this.filterCost, 10);
        if (costNum === 5) {
          matchesCost = c.cost >= 5;
        } else {
          matchesCost = c.cost === costNum;
        }
      }

      return matchesSearch && matchesType && matchesCost;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="db-empty">
          <div class="db-empty-icon">🔍</div>
          <div class="db-empty-title">No matching cards found</div>
          <div class="db-empty-desc">Try clearing your search query or switching filters. Only cards belonging to ${this.hero.name}'s allowed tribes (${this.getAllowedTribes().join(", ")}) or Neutral are shown.</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = "";
    const copyCounts = this.getCopyCounts();

    for (const card of filtered) {
      const inDeck = copyCounts.get(card.id) ?? 0;
      const maxed  = inDeck >= MAX_COPIES;
      const full   = this.activeDeckIds.length >= DECK_SIZE;
      const isUnit = card.type === CardType.Unit || (card.type as any) === "Unit" || (card.type as any) === "UNIT";

      const tile = document.createElement("div");
      tile.className = `db-card-tile ${maxed ? "maxed" : ""} ${full && !maxed ? "full" : ""}`;
      tile.dataset.cardId = card.id;

      // Extract image or emoji artwork
      const cardMeta = cardRepo.getCard(card.id);
      const imageUrl = (cardMeta as any)?.imageUrl || (card as any).imageUrl;
      const isImg = Boolean(imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("data:") || imageUrl.startsWith("/")));

      const artContent = isImg
        ? `<img src="${imageUrl}" alt="${card.name}" class="db-tile-art-img" loading="lazy" />`
        : `<span class="db-tile-art-emoji">${getCardArtEmoji(card)}</span>`;

      // Keywords
      const kwList = (card.keywords || []).slice(0, 3);
      const kwBadges = kwList.map((kw) => `<span class="db-kw-pill">${kw}</span>`).join("");

      // Lane requirement if any
      const laneTag = card.laneTypeRestriction ? `<span class="db-lane-pill">Lane: ${card.laneTypeRestriction}</span>` : "";

      const tribeCol = getTribeColor(card.tribe);

      tile.innerHTML = `
        <!-- Top Header: Mana Orb + Deck Count Pip -->
        <div class="db-tile-header">
          <div class="db-tile-cost-orb" style="--cost-color:${costColor(card.cost)}">
            <span class="db-cost-num">${card.cost}</span>
          </div>
          <div class="db-tile-deck-count ${maxed ? "max" : inDeck > 0 ? "active" : ""}">
            ${maxed ? "MAX (4/4)" : `${inDeck}/4`}
          </div>
        </div>

        <!-- Upper Thumbnail Art -->
        <div class="db-tile-art" style="--art-border:${tribeCol}">
          ${artContent}
          <div class="db-tile-art-overlay"></div>
        </div>

        <!-- Card Body Info -->
        <div class="db-tile-body">
          <div class="db-tile-title" title="${card.name}">${card.name}</div>
          
          <div class="db-tile-type-row">
            <span class="db-type-pill" style="border-color:${tribeCol}44;color:${tribeCol}">
              ${TYPE_ICONS[card.type] || "🃏"} ${card.tribe || "Neutral"} ${card.type}
            </span>
            ${laneTag}
          </div>

          ${kwBadges ? `<div class="db-tile-keywords">${kwBadges}</div>` : ""}

          ${card.text ? `<div class="db-tile-snippet">${card.text}</div>` : ""}
        </div>

        <!-- Bottom Stat Bar (for Units) or Action Bar -->
        ${isUnit ? `
          <div class="db-tile-stats-bar">
            <div class="db-stat-badge atk" title="Attack">
              <span class="db-stat-icon">⚔</span>
              <span class="db-stat-val">${card.attack}</span>
            </div>
            <div class="db-stat-badge hp" title="Health">
              <span class="db-stat-icon">❤</span>
              <span class="db-stat-val">${card.hp}</span>
            </div>
          </div>
        ` : `
          <div class="db-tile-type-footer">
            <span class="db-non-unit-tag">${card.type}</span>
          </div>
        `}

        <button class="db-tile-add-btn" ${(maxed || full) ? "disabled" : ""} title="Add to deck">
          ${maxed ? "✓ MAX COPIES" : full ? "DECK FULL (40)" : "+ ADD TO DECK"}
        </button>
      `;

      // Hover to inspect
      tile.addEventListener("mouseenter", () => {
        this.hoveredCard = card;
        this.renderInspector();
      });

      // Click to add
      tile.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".db-tile-add-btn") || !tile.classList.contains("maxed")) {
          this.addCard(card.id);
        }
      });

      grid.appendChild(tile);
    }
  }

  // ─── Right Panel: Inspector & Active Deck Stack ───────────────

  private renderRight(): void {
    const savedDecks = DeckStorage.loadByHero(this.hero.id);
    this.savedDecks = savedDecks;

    this.rightPanel.innerHTML = `
      <!-- Sticky Card Inspector -->
      <div class="db-inspector-shell" id="db-inspector-shell"></div>

      <!-- Active Deck Header & Controls -->
      <div class="db-right-header">
        <div class="db-right-title-row">
          <div class="db-right-title">⚔ Active Deck</div>
          <div class="db-deck-count-badge" id="db-deck-count-badge">${this.activeDeckIds.length} / ${DECK_SIZE}</div>
        </div>

        <div class="db-deck-management">
          <div class="db-deck-selector-row">
            <select class="db-deck-select" id="db-deck-select">
              <option value="">— Create New Deck —</option>
              ${savedDecks.map((d) => `
                <option value="${d.id}" ${this.selectedDeckId === d.id ? "selected" : ""}>${d.name} (${d.cardIds.length} cards)</option>
              `).join("")}
            </select>
            <button class="db-btn-mini db-btn-new" id="db-btn-new" title="Create Blank Deck">＋</button>
            <button class="db-btn-mini db-btn-dup" id="db-btn-dup" title="Duplicate Deck" ${!this.selectedDeckId ? "disabled" : ""}>⊕</button>
            <button class="db-btn-mini db-btn-del" id="db-btn-del" title="Delete Deck" ${!this.selectedDeckId ? "disabled" : ""}>🗑</button>
          </div>
          <div class="db-deck-name-row">
            <input class="db-deck-name-input" id="db-deck-name-input" type="text" placeholder="Enter deck name..." 
              value="${this.selectedDeckId ? (savedDecks.find((d) => d.id === this.selectedDeckId)?.name ?? "") : `${this.hero.name}'s Deck`}" />
            <button class="db-btn-mini" id="db-btn-rename" title="Save Name">✏</button>
          </div>
        </div>
      </div>

      <!-- Mana Curve Distribution Bar -->
      <div class="db-mana-curve" id="db-mana-curve"></div>

      <!-- Deck Validation Strip -->
      <div class="db-validation" id="db-validation-strip"></div>

      <!-- Compact Visual Deck List -->
      <div class="db-deck-list" id="db-deck-list"></div>

      <!-- Footer Actions -->
      <div class="db-deck-footer">
        <button class="db-btn-clear" id="db-btn-clear">🗑 Clear All</button>
        <button class="db-btn-sort" id="db-btn-sort">⇅ Sort by Mana Cost</button>
      </div>
    `;

    // Hook Inspector
    this.inspectorPanel = this.rightPanel.querySelector("#db-inspector-shell") as HTMLElement;
    this.renderInspector();

    // Deck select
    const deckSelect = this.rightPanel.querySelector("#db-deck-select") as HTMLSelectElement;
    deckSelect?.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      this.selectedDeckId = id || null;
      if (id) {
        const saved = DeckStorage.loadById(id);
        this.activeDeckIds = saved ? [...saved.cardIds] : [];
      } else {
        this.activeDeckIds = [];
      }
      this.render();
    });

    // New deck
    this.rightPanel.querySelector("#db-btn-new")?.addEventListener("click", () => {
      this.selectedDeckId = null;
      this.activeDeckIds = [];
      this.render();
    });

    // Duplicate
    this.rightPanel.querySelector("#db-btn-dup")?.addEventListener("click", () => {
      if (!this.selectedDeckId) return;
      const dup = DeckStorage.duplicate(this.selectedDeckId);
      if (dup) {
        this.selectedDeckId = dup.id;
        this.activeDeckIds = [...dup.cardIds];
        this.render();
      }
    });

    // Delete
    this.rightPanel.querySelector("#db-btn-del")?.addEventListener("click", () => {
      if (!this.selectedDeckId) return;
      if (!confirm("Delete this deck? This cannot be undone.")) return;
      DeckStorage.delete(this.selectedDeckId);
      this.selectedDeckId = null;
      this.activeDeckIds = [];
      this.render();
    });

    // Rename
    this.rightPanel.querySelector("#db-btn-rename")?.addEventListener("click", () => {
      const inp = this.rightPanel.querySelector("#db-deck-name-input") as HTMLInputElement;
      const name = inp.value.trim();
      if (!name) return;
      if (this.selectedDeckId) {
        DeckStorage.rename(this.selectedDeckId, name);
        this.render();
      }
    });

    // Clear All
    this.rightPanel.querySelector("#db-btn-clear")?.addEventListener("click", () => {
      this.activeDeckIds = [];
      this.renderDeckList();
      this.renderManaCurve();
      this.renderValidation();
      this.updateCounter();
      this.updateSaveBtn();
      this.renderCatalogGrid();
    });

    // Sort by Cost
    this.rightPanel.querySelector("#db-btn-sort")?.addEventListener("click", () => {
      const catalogMap = new Map(this.catalog.map((c) => [c.id, c]));
      this.activeDeckIds.sort((a, b) => {
        const ca = catalogMap.get(a);
        const cb = catalogMap.get(b);
        return (ca?.cost ?? 99) - (cb?.cost ?? 99);
      });
      this.renderDeckList();
    });

    this.renderDeckList();
    this.renderManaCurve();
    this.renderValidation();
  }

  // ─── Sticky Card Inspector ───────────────────────────────────

  private renderInspector(): void {
    if (!this.inspectorPanel) return;
    const card = this.hoveredCard;

    if (!card) {
      this.inspectorPanel.innerHTML = `
        <div class="db-inspect-empty">
          <span>Hover over any card in the catalog to inspect full details, art, and keyword rules.</span>
        </div>
      `;
      return;
    }

    const cardMeta = cardRepo.getCard(card.id);
    const imageUrl = (cardMeta as any)?.imageUrl || (card as any).imageUrl;
    const isImg = Boolean(imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("data:") || imageUrl.startsWith("/")));

    const isUnit = card.type === CardType.Unit || (card.type as any) === "Unit" || (card.type as any) === "UNIT";
    const tribeCol = getTribeColor(card.tribe);

    // Keywords with detailed tooltips
    const kwList = card.keywords || [];
    const kwTooltips = kwList.map((kw) => {
      const desc = KEYWORD_DESCRIPTIONS[kw] || KEYWORD_DESCRIPTIONS[String(kw).toUpperCase()] || "Special combat ability.";
      return `
        <div class="db-inspect-kw-item">
          <span class="db-inspect-kw-tag">${kw}</span>
          <span class="db-inspect-kw-desc">${desc}</span>
        </div>
      `;
    }).join("");

    this.inspectorPanel.innerHTML = `
      <div class="db-inspect-card" style="--hero-border:${tribeCol}">
        <div class="db-inspect-left">
          <div class="db-inspect-art-wrap">
            ${isImg 
              ? `<img src="${imageUrl}" alt="${card.name}" class="db-inspect-img" />`
              : `<div class="db-inspect-emoji">${getCardArtEmoji(card)}</div>`
            }
            <div class="db-inspect-cost-badge" style="--cost-color:${costColor(card.cost)}">${card.cost}</div>
          </div>
        </div>

        <div class="db-inspect-right">
          <div class="db-inspect-header">
            <div class="db-inspect-name">${card.name}</div>
            <div class="db-inspect-sub">${TYPE_ICONS[card.type] || "🃏"} ${card.tribe || "Neutral"} · ${card.type}</div>
          </div>

          ${isUnit ? `
            <div class="db-inspect-stats-row">
              <span class="db-inspect-stat atk">⚔ ${card.attack} ATK</span>
              <span class="db-inspect-stat hp">❤ ${card.hp} HP</span>
              ${card.laneTypeRestriction ? `<span class="db-inspect-lane">Lane: ${card.laneTypeRestriction}</span>` : ""}
            </div>
          ` : ""}

          ${card.text ? `<div class="db-inspect-text">${card.text}</div>` : ""}

          ${kwTooltips ? `<div class="db-inspect-keywords-box">${kwTooltips}</div>` : ""}
        </div>
      </div>
    `;
  }

  // ─── Compact Visual Active Deck List ─────────────────────────

  private renderDeckList(): void {
    const list = this.rightPanel.querySelector("#db-deck-list");
    if (!list) return;

    if (this.activeDeckIds.length === 0) {
      list.innerHTML = `
        <div class="db-deck-empty">
          <div class="db-deck-empty-icon">🎴</div>
          <div class="db-deck-empty-title">Deck is Empty</div>
          <div class="db-deck-empty-desc">Click cards from the collection on the left to add up to 4 copies of each card (40 total).</div>
        </div>
      `;
      return;
    }

    const catalogMap = new Map(this.catalog.map((c) => [c.id, c]));
    const grouped = new Map<string, number>();
    for (const id of this.activeDeckIds) {
      grouped.set(id, (grouped.get(id) ?? 0) + 1);
    }

    // Sort by cost then name
    const entries = Array.from(grouped.entries()).sort((a, b) => {
      const ca = catalogMap.get(a[0]);
      const cb = catalogMap.get(b[0]);
      const costDiff = (ca?.cost ?? 99) - (cb?.cost ?? 99);
      if (costDiff !== 0) return costDiff;
      return (ca?.name ?? "").localeCompare(cb?.name ?? "");
    });

    list.innerHTML = "";
    for (const [id, count] of entries) {
      const card = catalogMap.get(id);
      if (!card) continue;

      const maxed = count >= MAX_COPIES;
      const isFull = this.activeDeckIds.length >= DECK_SIZE;
      const tribeCol = getTribeColor(card.tribe);

      const row = document.createElement("div");
      row.className = `db-deck-row ${maxed ? "maxed-row" : ""}`;
      row.title = `Left-click to add copy, Right-click to remove copy`;

      row.innerHTML = `
        <div class="db-row-cost-badge" style="--cost-color:${costColor(card.cost)}">
          ${card.cost}
        </div>
        
        <div class="db-row-art-crop">
          <span>${getCardArtEmoji(card)}</span>
        </div>

        <div class="db-row-info">
          <div class="db-row-name">${card.name}</div>
          <div class="db-row-meta" style="color:${tribeCol}">${card.tribe} · ${card.type}</div>
        </div>

        <div class="db-row-count-pill ${maxed ? "gold-max" : ""}">
          ×${count}${maxed ? " MAX" : ""}
        </div>

        <div class="db-row-actions">
          <button class="db-row-btn db-row-minus" title="Remove one copy">−</button>
          <button class="db-row-btn db-row-plus" ${maxed || isFull ? "disabled" : ""} title="Add one copy">+</button>
        </div>
      `;

      // Hover to inspect
      row.addEventListener("mouseenter", () => {
        this.hoveredCard = card;
        this.renderInspector();
      });

      // Left click row to add (if not clicking action button)
      row.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".db-row-minus")) {
          this.removeCard(id);
        } else if ((e.target as HTMLElement).closest(".db-row-plus")) {
          this.addCard(id);
        } else {
          this.addCard(id);
        }
      });

      // Right click row to remove
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.removeCard(id);
      });

      list.appendChild(row);
    }
  }

  private renderManaCurve(): void {
    const curveContainer = this.rightPanel.querySelector("#db-mana-curve");
    if (!curveContainer) return;

    const catalogMap = new Map(this.catalog.map((c) => [c.id, c]));
    const bins: number[] = [0, 0, 0, 0, 0, 0]; // 1, 2, 3, 4, 5, 6+

    for (const id of this.activeDeckIds) {
      const card = catalogMap.get(id);
      if (!card) continue;
      const c = Math.min(Math.max(card.cost, 1), 6);
      bins[c - 1] = (bins[c - 1] || 0) + 1;
    }

    const maxCount = Math.max(...bins, 1);

    curveContainer.innerHTML = `
      <div class="db-curve-header">Mana Curve (${this.activeDeckIds.length} cards)</div>
      <div class="db-curve-bars">
        ${bins.map((cnt, idx) => {
          const costLabel = idx === 5 ? "6+" : String(idx + 1);
          const heightPct = Math.round((cnt / maxCount) * 100);
          return `
            <div class="db-curve-col" title="${costLabel} Mana: ${cnt} cards">
              <span class="db-curve-val">${cnt > 0 ? cnt : ""}</span>
              <div class="db-curve-bar-track">
                <div class="db-curve-bar-fill" style="height:${heightPct}%;background:${costColor(idx + 1)}"></div>
              </div>
              <span class="db-curve-label">${costLabel}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  private renderValidation(): void {
    const strip = this.rightPanel.querySelector("#db-validation-strip");
    if (!strip) return;

    const v = DeckStorage.validate(this.activeDeckIds, this.catalog);
    if (v.isValid) {
      strip.innerHTML = `<div class="db-valid-msg">✨ Deck Complete! Ready for match play (40/40 cards).</div>`;
    } else {
      strip.innerHTML = v.errors.map((e) => `<div class="db-error-msg">⚠ ${e}</div>`).join("");
    }
  }

  // ── Card Add / Remove ────────────────────────────────────────

  private addCard(id: string): void {
    const count = this.activeDeckIds.filter((x) => x === id).length;
    if (count >= MAX_COPIES) return;
    if (this.activeDeckIds.length >= DECK_SIZE) return;

    this.activeDeckIds.push(id);
    this.renderDeckList();
    this.renderManaCurve();
    this.renderValidation();
    this.updateCounter();
    this.updateSaveBtn();
    this.renderCatalogGrid(); // refresh badge counts on grid
  }

  private removeCard(id: string): void {
    const idx = this.activeDeckIds.lastIndexOf(id);
    if (idx === -1) return;
    this.activeDeckIds.splice(idx, 1);
    this.renderDeckList();
    this.renderManaCurve();
    this.renderValidation();
    this.updateCounter();
    this.updateSaveBtn();
    this.renderCatalogGrid();
  }

  // ── Counter & Save Button ────────────────────────────────────

  private updateCounter(): void {
    const el = this.overlay.querySelector("#db-card-counter");
    const countBadge = this.rightPanel?.querySelector("#db-deck-count-badge");
    const count = this.activeDeckIds.length;
    const color = count === DECK_SIZE ? "#4ade80" : count > DECK_SIZE ? "#f87171" : "#cbbfff";

    if (el) {
      el.innerHTML = `<span style="color:${color};font-weight:900">${count}</span> / ${DECK_SIZE} Cards`;
    }
    if (countBadge) {
      countBadge.innerHTML = `<span style="color:${color};font-weight:900">${count}</span> / ${DECK_SIZE}`;
    }
  }

  private updateSaveBtn(): void {
    const btn = this.overlay.querySelector("#db-btn-save") as HTMLButtonElement;
    if (!btn) return;
    const v = DeckStorage.validate(this.activeDeckIds, this.catalog);
    btn.disabled = !v.isValid;
    btn.style.opacity = v.isValid ? "1" : "0.45";
  }

  // ── Save & Select ────────────────────────────────────────────

  private handleSaveAndSelect(): void {
    const v = DeckStorage.validate(this.activeDeckIds, this.catalog);
    if (!v.isValid) return;

    const nameInput = this.rightPanel.querySelector("#db-deck-name-input") as HTMLInputElement;
    const deckName  = nameInput?.value.trim() || `${this.hero.name}'s Deck`;

    if (this.selectedDeckId) {
      DeckStorage.updateCards(this.selectedDeckId, this.activeDeckIds);
      DeckStorage.rename(this.selectedDeckId, deckName);
    } else {
      const saved = DeckStorage.create(this.hero.id, deckName, this.activeDeckIds);
      this.selectedDeckId = saved.id;
    }

    const deck = hydrateCardIds(this.activeDeckIds, this.catalog);
    this.hide(false);
    if (this.onDone) {
      this.onDone(deck, this.hero);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  private getCopyCounts(): Map<string, number> {
    const map = new Map<string, number>();
    for (const id of this.activeDeckIds) {
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }

  // ── CSS ───────────────────────────────────────────────────────

  private injectStyles(): void {
    if (this.styleInjected || document.getElementById("deck-builder-styles")) return;
    this.styleInjected = true;
    const style = document.createElement("style");
    style.id = "deck-builder-styles";
    style.textContent = `
      /* ─── Overlay Root ────────────────────────────────────── */
      #deck-builder-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(ellipse at 50% 0%, rgba(15, 10, 35, 0.98) 0%, rgba(4, 2, 12, 0.99) 100%);
        backdrop-filter: blur(28px);
        z-index: 9999;
        display: flex;
        align-items: stretch;
        justify-content: center;
        transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
        user-select: none;
      }

      .db-inner {
        width: 100%;
        max-width: 1720px;
        display: flex;
        flex-direction: column;
        padding: 0 16px;
      }

      /* ─── Header ─────────────────────────────────────────── */
      .db-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 14px 12px;
        border-bottom: 1px solid rgba(168, 85, 247, 0.22);
        flex-shrink: 0;
      }
      .db-header-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-shrink: 0;
      }
      .db-logo {
        font-family: 'Cinzel Decorative', serif;
        font-size: 20px;
        font-weight: 800;
        color: #d8b4fe;
        letter-spacing: 0.08em;
        text-shadow: 0 0 20px rgba(192, 132, 252, 0.6);
      }
      .db-hero-filter-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(168, 85, 247, 0.12);
        border: 1px solid rgba(168, 85, 247, 0.35);
        padding: 3px 10px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 700;
        color: #f3e8ff;
      }
      .db-filter-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 8px #4ade80;
      }

      /* ─── Hero Selection Tabs ──────────────────────────────── */
      .db-hero-tabs-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: rgba(140, 100, 255, 0.08);
        border: 1px solid rgba(140, 100, 255, 0.25);
        border-radius: 99px;
        overflow-x: auto;
        max-width: 740px;
        scrollbar-width: thin;
      }
      .db-hero-tabs-bar::-webkit-scrollbar { height: 3px; }
      .db-hero-tabs-bar::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.4); border-radius: 2px; }

      .db-hero-tab {
        display: flex;
        align-items: center;
        gap: 8px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 99px;
        padding: 5px 12px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        color: rgba(216, 180, 254, 0.75);
        white-space: nowrap;
      }
      .db-hero-tab:hover {
        background: rgba(168, 85, 247, 0.18);
        border-color: rgba(192, 132, 252, 0.4);
        color: #ffffff;
      }
      .db-hero-tab.active {
        background: linear-gradient(135deg, rgba(147, 51, 234, 0.65), rgba(79, 70, 229, 0.6));
        border-color: #ffd066;
        color: #ffffff;
        box-shadow: 0 0 16px rgba(168, 85, 247, 0.5), 0 0 8px rgba(255, 208, 102, 0.3);
      }
      .db-hero-tab-portrait {
        font-size: 18px;
        line-height: 1;
      }
      .db-hero-tab-img {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
      }
      .db-hero-tab-info {
        display: flex;
        flex-direction: column;
        text-align: left;
      }
      .db-hero-tab-title-row {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .db-hero-tab-name {
        font-size: 13px;
        font-weight: 800;
      }
      .db-tab-tribe-mini {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.12);
        color: #e9d5ff;
        font-weight: 700;
      }
      .db-hero-tab-title {
        font-size: 10px;
        opacity: 0.7;
        font-weight: 500;
      }

      /* ─── Header Right ───────────────────────────────────── */
      .db-header-right {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .db-counter {
        font-size: 15px;
        font-weight: 800;
        color: #f3e8ff;
        background: rgba(168, 85, 247, 0.15);
        border: 1px solid rgba(168, 85, 247, 0.35);
        padding: 6px 16px;
        border-radius: 99px;
      }
      .db-btn-save {
        background: linear-gradient(135deg, #9333ea, #4f46e5);
        border: 1px solid rgba(255, 208, 102, 0.5);
        color: #fff;
        font-size: 13px;
        font-weight: 800;
        padding: 8px 22px;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s;
        letter-spacing: 0.04em;
        box-shadow: 0 4px 18px rgba(147, 51, 234, 0.45);
      }
      .db-btn-save:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 24px rgba(147, 51, 234, 0.65), 0 0 12px rgba(255, 208, 102, 0.4);
      }
      .db-btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
      .db-btn-close {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.35);
        color: #fca5a5;
        font-size: 16px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      .db-btn-close:hover { background: rgba(239, 68, 68, 0.3); color: #ffffff; }

      /* ─── Content Split ──────────────────────────────────── */
      .db-content {
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      /* ─── Left Panel: Catalog ────────────────────────────── */
      .db-left {
        flex: 1;
        display: flex;
        flex-direction: column;
        border-right: 1px solid rgba(168, 85, 247, 0.2);
        overflow: hidden;
      }
      .db-left-header {
        padding: 12px 18px 10px;
        border-bottom: 1px solid rgba(168, 85, 247, 0.15);
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .db-left-title-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .db-left-title {
        font-size: 14px;
        font-weight: 800;
        color: #c084fc;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .db-allowed-badge {
        font-size: 11px;
        font-weight: 700;
        background: rgba(56, 189, 248, 0.15);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #38bdf8;
        padding: 2px 8px;
        border-radius: 99px;
      }
      .db-tribe-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .db-tribe-chip {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 99px;
        border: 1px solid;
        background: rgba(255, 255, 255, 0.05);
      }
      .db-tribe-chip.neutral {
        border-color: rgba(255, 255, 255, 0.3);
        color: #cbd5e1;
      }

      .db-left-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .db-search-wrap {
        position: relative;
        width: 100%;
      }
      .db-search {
        width: 100%;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(168, 85, 247, 0.3);
        border-radius: 8px;
        padding: 8px 32px 8px 12px;
        color: #ffffff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .db-search:focus {
        border-color: #38bdf8;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
      }
      .db-search-clear {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        font-size: 12px;
      }

      .db-filters-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .db-filter-bar, .db-cost-bar {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
      }
      .db-filter-btn, .db-cost-btn {
        background: rgba(168, 85, 247, 0.1);
        border: 1px solid rgba(168, 85, 247, 0.25);
        color: rgba(216, 180, 254, 0.8);
        font-size: 11px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 99px;
        cursor: pointer;
        transition: all 0.16s;
      }
      .db-filter-btn:hover, .db-cost-btn:hover {
        background: rgba(168, 85, 247, 0.25);
        border-color: #c084fc;
        color: #ffffff;
      }
      .db-filter-btn.active, .db-cost-btn.active {
        background: linear-gradient(135deg, #9333ea, #4f46e5);
        border-color: #ffd066;
        color: #ffffff;
        box-shadow: 0 2px 10px rgba(147, 51, 234, 0.4);
      }

      /* ─── Rich Catalog Grid ──────────────────────────────── */
      .db-catalog-grid {
        flex: 1;
        overflow-y: auto;
        padding: 14px 18px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 12px;
        align-content: start;
      }
      .db-catalog-grid::-webkit-scrollbar { width: 6px; }
      .db-catalog-grid::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.35); border-radius: 3px; }

      /* ─── Rich Card Tile ─────────────────────────────────── */
      .db-card-tile {
        background: linear-gradient(160deg, rgba(32, 22, 65, 0.95), rgba(16, 10, 36, 0.98));
        border: 1.5px solid rgba(168, 85, 247, 0.28);
        border-radius: 14px;
        padding: 10px;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: relative;
        overflow: hidden;
      }
      .db-card-tile:hover:not(.maxed) {
        transform: translateY(-4px);
        border-color: #ffd066;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 208, 102, 0.35);
      }
      .db-card-tile.maxed {
        opacity: 0.65;
        border-color: rgba(251, 191, 36, 0.5);
      }

      .db-tile-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .db-tile-cost-orb {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #ffffff 0%, var(--cost-color, #38bdf8) 60%, #0369a1 100%);
        border: 1.5px solid #ffffff;
        box-shadow: 0 0 10px var(--cost-color, #38bdf8);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .db-cost-num {
        font-size: 14px;
        font-weight: 900;
        color: #040817;
        line-height: 1;
      }
      .db-tile-deck-count {
        font-size: 10px;
        font-weight: 800;
        padding: 2px 7px;
        border-radius: 99px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #cbd5e1;
      }
      .db-tile-deck-count.active {
        background: rgba(56, 189, 248, 0.2);
        border-color: #38bdf8;
        color: #38bdf8;
      }
      .db-tile-deck-count.max {
        background: rgba(251, 191, 36, 0.25);
        border-color: #fbbf24;
        color: #fef08a;
        box-shadow: 0 0 8px rgba(251, 191, 36, 0.4);
      }

      .db-tile-art {
        height: 82px;
        background: radial-gradient(ellipse at 50% 50%, rgba(50, 35, 90, 0.8), rgba(15, 8, 30, 0.95));
        border: 1px solid var(--art-border, rgba(168, 85, 247, 0.35));
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative;
      }
      .db-tile-art-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .db-tile-art-emoji {
        font-size: 40px;
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
      }
      .db-tile-art-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, transparent 60%, rgba(0, 0, 0, 0.4) 100%);
        pointer-events: none;
      }

      .db-tile-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .db-tile-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 13px;
        font-weight: 800;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .db-tile-type-row {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
      }
      .db-type-pill, .db-lane-pill {
        font-size: 9px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 4px;
        border: 1px solid;
        background: rgba(0, 0, 0, 0.3);
      }
      .db-lane-pill {
        border-color: rgba(56, 189, 248, 0.4);
        color: #7dd3fc;
      }

      .db-tile-keywords {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .db-kw-pill {
        font-size: 9px;
        font-weight: 800;
        background: rgba(192, 132, 252, 0.2);
        border: 1px solid rgba(192, 132, 252, 0.4);
        color: #e9d5ff;
        padding: 1px 5px;
        border-radius: 4px;
      }
      .db-tile-snippet {
        font-size: 10px;
        color: rgba(226, 232, 240, 0.7);
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 24px;
      }

      .db-tile-stats-bar {
        display: flex;
        gap: 8px;
        margin-top: 2px;
      }
      .db-stat-badge {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 4px 6px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 900;
      }
      .db-stat-badge.atk {
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid #ef4444;
        color: #fca5a5;
      }
      .db-stat-badge.hp {
        background: rgba(34, 197, 94, 0.2);
        border: 1px solid #22c55e;
        color: #86efac;
      }
      .db-tile-type-footer {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .db-non-unit-tag {
        font-size: 10px;
        font-weight: 700;
        color: #cbd5e1;
        background: rgba(255, 255, 255, 0.06);
        padding: 3px 10px;
        border-radius: 6px;
        width: 100%;
        text-align: center;
      }

      .db-tile-add-btn {
        margin-top: 4px;
        background: rgba(147, 51, 234, 0.25);
        border: 1px solid rgba(168, 85, 247, 0.45);
        color: #e9d5ff;
        font-size: 11px;
        font-weight: 800;
        padding: 5px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
        text-align: center;
      }
      .db-tile-add-btn:not(:disabled):hover {
        background: linear-gradient(135deg, #9333ea, #4f46e5);
        color: #ffffff;
        border-color: #ffd066;
        box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
      }
      .db-tile-add-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      /* ─── Right Panel: Inspector & Stack ─────────────────── */
      .db-right {
        width: 440px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: rgba(10, 6, 24, 0.6);
      }

      /* ─── Sticky Card Inspector ──────────────────────────── */
      .db-inspector-shell {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(168, 85, 247, 0.2);
        background: rgba(20, 14, 45, 0.85);
        flex-shrink: 0;
        min-height: 140px;
      }
      .db-inspect-empty {
        font-size: 12px;
        color: rgba(216, 180, 254, 0.5);
        text-align: center;
        padding: 30px 10px;
      }
      .db-inspect-card {
        display: flex;
        gap: 12px;
      }
      .db-inspect-left {
        flex-shrink: 0;
      }
      .db-inspect-art-wrap {
        width: 80px;
        height: 110px;
        border-radius: 10px;
        border: 1.5px solid var(--hero-border, #ffd066);
        background: radial-gradient(circle at 50% 50%, rgba(60, 40, 110, 0.9), rgba(15, 10, 30, 0.98));
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      }
      .db-inspect-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .db-inspect-emoji {
        font-size: 44px;
      }
      .db-inspect-cost-badge {
        position: absolute;
        top: 4px;
        left: 4px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--cost-color, #38bdf8);
        color: #040817;
        font-weight: 900;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #ffffff;
      }

      .db-inspect-right {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .db-inspect-name {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 14px;
        font-weight: 800;
        color: #ffffff;
      }
      .db-inspect-sub {
        font-size: 10px;
        font-weight: 700;
        color: #c084fc;
      }
      .db-inspect-stats-row {
        display: flex;
        gap: 8px;
        font-size: 11px;
        font-weight: 800;
      }
      .db-inspect-stat.atk { color: #f87171; }
      .db-inspect-stat.hp { color: #4ade80; }
      .db-inspect-lane {
        color: #38bdf8;
        font-size: 10px;
        background: rgba(56, 189, 248, 0.15);
        padding: 1px 6px;
        border-radius: 4px;
      }
      .db-inspect-text {
        font-size: 11px;
        color: #e2e8f0;
        line-height: 1.35;
        background: rgba(0, 0, 0, 0.25);
        padding: 4px 8px;
        border-radius: 6px;
      }
      .db-inspect-keywords-box {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin-top: 2px;
      }
      .db-inspect-kw-item {
        font-size: 10px;
        line-height: 1.25;
        color: #cbd5e1;
      }
      .db-inspect-kw-tag {
        font-weight: 800;
        color: #ffd066;
        margin-right: 4px;
      }

      /* ─── Right Deck Management ──────────────────────────── */
      .db-right-header {
        padding: 10px 14px;
        border-bottom: 1px solid rgba(168, 85, 247, 0.15);
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .db-right-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .db-right-title {
        font-size: 13px;
        font-weight: 800;
        color: #c084fc;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .db-deck-count-badge {
        font-size: 12px;
        font-weight: 800;
        color: #f3e8ff;
      }
      .db-deck-management {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .db-deck-selector-row, .db-deck-name-row {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .db-deck-select, .db-deck-name-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(168, 85, 247, 0.28);
        border-radius: 8px;
        padding: 6px 10px;
        color: #ffffff;
        font-size: 12px;
        outline: none;
      }
      .db-btn-mini {
        background: rgba(168, 85, 247, 0.15);
        border: 1px solid rgba(168, 85, 247, 0.35);
        color: #d8b4fe;
        font-size: 14px;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
        flex-shrink: 0;
      }
      .db-btn-mini:hover:not(:disabled) {
        background: rgba(168, 85, 247, 0.3);
        color: #ffffff;
      }

      /* ─── Mana Curve Graph ───────────────────────────────── */
      .db-mana-curve {
        padding: 6px 14px;
        border-bottom: 1px solid rgba(168, 85, 247, 0.12);
        flex-shrink: 0;
      }
      .db-curve-header {
        font-size: 10px;
        font-weight: 700;
        color: rgba(216, 180, 254, 0.6);
        margin-bottom: 4px;
      }
      .db-curve-bars {
        display: flex;
        gap: 8px;
        align-items: flex-end;
        height: 38px;
      }
      .db-curve-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        justify-content: flex-end;
      }
      .db-curve-val {
        font-size: 9px;
        font-weight: 800;
        color: #e2e8f0;
        line-height: 1;
        margin-bottom: 2px;
      }
      .db-curve-bar-track {
        width: 100%;
        height: 20px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
        display: flex;
        align-items: flex-end;
        overflow: hidden;
      }
      .db-curve-bar-fill {
        width: 100%;
        border-radius: 3px 3px 0 0;
        transition: height 0.2s ease;
      }
      .db-curve-label {
        font-size: 9px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 2px;
      }

      /* ─── Validation Strip ───────────────────────────────── */
      .db-validation {
        padding: 6px 14px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
        border-bottom: 1px solid rgba(168, 85, 247, 0.1);
      }
      .db-valid-msg {
        font-size: 11px;
        color: #4ade80;
        font-weight: 700;
      }
      .db-error-msg {
        font-size: 10px;
        color: #f87171;
        font-weight: 600;
      }

      /* ─── Active Deck List Stack ─────────────────────────── */
      .db-deck-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .db-deck-list::-webkit-scrollbar { width: 5px; }
      .db-deck-list::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.35); border-radius: 3px; }

      .db-deck-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(168, 85, 247, 0.18);
        border-radius: 8px;
        transition: all 0.15s ease;
        cursor: pointer;
      }
      .db-deck-row:hover {
        background: rgba(168, 85, 247, 0.15);
        border-color: #ffd066;
        transform: translateX(2px);
      }
      .db-deck-row.maxed-row {
        border-color: rgba(251, 191, 36, 0.35);
      }
      .db-row-cost-badge {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--cost-color, #38bdf8);
        color: #040817;
        font-weight: 900;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .db-row-art-crop {
        font-size: 18px;
        line-height: 1;
        flex-shrink: 0;
      }
      .db-row-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .db-row-name {
        font-size: 12px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .db-row-meta {
        font-size: 9px;
        font-weight: 600;
      }
      .db-row-count-pill {
        font-size: 11px;
        font-weight: 800;
        color: #c084fc;
        padding: 2px 6px;
        border-radius: 99px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        flex-shrink: 0;
      }
      .db-row-count-pill.gold-max {
        background: rgba(251, 191, 36, 0.2);
        border-color: #fbbf24;
        color: #fef08a;
      }
      .db-row-actions {
        display: flex;
        gap: 3px;
        flex-shrink: 0;
      }
      .db-row-btn {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 1px solid rgba(168, 85, 247, 0.3);
        background: rgba(168, 85, 247, 0.15);
        color: #e9d5ff;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s;
      }
      .db-row-plus:hover:not(:disabled) { background: rgba(34, 197, 94, 0.3); color: #4ade80; border-color: #22c55e; }
      .db-row-minus:hover { background: rgba(239, 68, 68, 0.3); color: #f87171; border-color: #ef4444; }
      .db-row-plus:disabled { opacity: 0.3; cursor: not-allowed; }

      /* ─── Deck Footer ────────────────────────────────────── */
      .db-deck-footer {
        padding: 8px 14px;
        display: flex;
        gap: 8px;
        border-top: 1px solid rgba(168, 85, 247, 0.15);
        flex-shrink: 0;
      }
      .db-btn-clear, .db-btn-sort {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(168, 85, 247, 0.25);
        color: rgba(216, 180, 254, 0.8);
        font-size: 11px;
        font-weight: 700;
        padding: 7px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .db-btn-clear:hover { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border-color: #ef4444; }
      .db-btn-sort:hover  { background: rgba(168, 85, 247, 0.25); color: #ffffff; border-color: #c084fc; }

      /* ─── Empty States ───────────────────────────────────── */
      .db-empty, .db-deck-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
        grid-column: 1 / -1;
      }
      .db-empty-icon, .db-deck-empty-icon {
        font-size: 36px;
        margin-bottom: 8px;
        opacity: 0.8;
      }
      .db-empty-title, .db-deck-empty-title {
        font-size: 14px;
        font-weight: 800;
        color: #e9d5ff;
        margin-bottom: 4px;
      }
      .db-empty-desc, .db-deck-empty-desc {
        font-size: 11px;
        color: rgba(216, 180, 254, 0.6);
        max-width: 320px;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }
}
