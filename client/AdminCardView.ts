// ============================================================
//  AdminCardView.ts
//  Protected Admin Dashboard for Card & Hero CMS.
//  Access: Ctrl+Shift+A (dev) or /admin hash route or ?debug=1
//  Features:
//   – Tabbed Interface: 🃏 Cards | 👑 Heroes
//   – Card catalog grid & Card Editor modal (artwork upload, stats)
//   – Hero catalog grid: create/edit heroes, portraits, base stats
//   – 4-Card Superpower kit configuration (1 Signature + 3 Core)
//   – Real-time sync with Three.js game client & localStorage
// ============================================================

import { CardType, Hero, HeroDefinition, Keyword } from "../src/types";
import { cardRepo, CardMeta } from "./CardRepository";
import { heroRepo } from "./HeroRepository";
import { textures } from "./CardTextureManager";
import { uploadAssetToSupabaseStorage } from "../src/supabaseClient";

// ─────────────────────────────────────────────────────────────
//  Tribe / Type options
// ─────────────────────────────────────────────────────────────

const TRIBES = [
  "ปัญญา", "จอมพล", "จู่โจม", "รักษา", "พิทักษ์", "ยุทธศาสตร์", "จอมอาคม", "เป็นกลาง",
];

const CARD_TYPES = Object.values(CardType);
const ALL_KEYWORDS = [
  Keyword.Support,
  Keyword.Overkill,
  Keyword.Strikethrough,
  Keyword.Aerial,
  Keyword.Naval,
  Keyword.Lifesteal,
  Keyword.Armored,
  Keyword.Rush,
];

const TYPE_COLORS: Record<string, string> = {
  UNIT: "#7ab8f5",
  SPELL: "#c4a1ff",
  EQUIPMENT: "#fbbf24",
  ENVIRONMENT: "#4ade80",
  HERO_ABILITY: "#f87171",
};

const QUICK_EMOJIS = ["🦅", "🌊", "🌻", "🧠", "⚡", "🔥", "🛡️", "🧙", "🐉", "🏹", "💀", "🤖", "⚔️", "🌪️", "💎"];

// ─────────────────────────────────────────────────────────────
//  Admin Auth guard
// ─────────────────────────────────────────────────────────────

const ADMIN_KEY = "CARD_GAME_ADMIN_AUTH";

function isAdminAuthed(): boolean {
  if (typeof window !== "undefined" && (window.location.search.includes("admin=1") || window.location.search.includes("debug=1"))) {
    return true;
  }
  return localStorage.getItem(ADMIN_KEY) === "true";
}
function setAdminAuth(): void {
  localStorage.setItem(ADMIN_KEY, "true");
}

// ─────────────────────────────────────────────────────────────
//  AdminCardView
// ─────────────────────────────────────────────────────────────

export class AdminCardView {
  private overlay!:       HTMLElement;
  private grid!:          HTMLElement;
  private cardModal!:     HTMLElement;
  private heroModal!:     HTMLElement;
  private toastEl!:       HTMLElement;

  private currentTab:     "cards" | "heroes" = "cards";
  private searchVal       = "";
  private filterType      = "ALL";

  // Card editor state
  private editingCard:    CardMeta | null = null;
  private pendingCardImg: string | null = null;

  // Hero editor state
  private editingHero:    HeroDefinition | null = null;
  private isNewHero       = false;
  private pendingHeroImg: string | null = null;

  private styleInjected   = false;
  private unsubscribeCard?: (() => void) | undefined;
  private unsubscribeHero?: (() => void) | undefined;
  private toastTimer?:    ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.injectStyles();
    this.buildShell();
    this.bindHotkey();
    this.bindHashRoute();
    if (window.location.hash === "#admin") this.open();
  }

  // ── Public API ───────────────────────────────────────────────

  private keydownListener?: (e: KeyboardEvent) => void;

  private setupListeners(): void {
    this.removeListeners();
    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close(true);
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

  public open(): void {
    if (!isAdminAuthed()) {
      const pw = prompt("🔐 Admin passphrase (default: admin):");
      if (pw !== "admin" && pw !== (import.meta as any).env?.VITE_ADMIN_PASS) {
        alert("Access denied.");
        if ((window as any).screenController) {
          (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
        }
        return;
      }
      setAdminAuth();
    }

    this.setupListeners();
    this.overlay.style.display = "flex";
    requestAnimationFrame(() => {
      this.overlay.style.opacity = "1";
      this.overlay.style.transform = "scale(1)";
    });

    Promise.all([cardRepo.whenReady(), heroRepo.whenReady()]).then(() => {
      this.render();
      this.unsubscribeCard = cardRepo.subscribe(() => {
        if (this.currentTab === "cards") this.render();
      });
      this.unsubscribeHero = heroRepo.subscribe(() => {
        if (this.currentTab === "heroes") this.render();
      });
    });
  }

  public close(triggerCallback: boolean = true): void {
    this.removeListeners();
    this.overlay.style.opacity  = "0";
    this.overlay.style.transform = "scale(0.97)";
    this.overlay.style.display = "none";
    this.unsubscribeCard?.();
    this.unsubscribeHero?.();
    this.unsubscribeCard = undefined;
    this.unsubscribeHero = undefined;
    if (triggerCallback && (window as any).screenController && (window as any).screenController.getCurrentScreen() !== "MAIN_MENU") {
      (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
    }
  }

  // ── Build Shell ───────────────────────────────────────────────

  private buildShell(): void {
    this.overlay = document.createElement("div");
    this.overlay.id = "admin-overlay";

    this.overlay.innerHTML = `
      <div class="adm-inner">
        <!-- Header -->
        <div class="adm-header">
          <div class="adm-header-left">
            <div class="adm-logo">🛠 CMS</div>
            <div class="adm-badge">ADMIN</div>
            <!-- Navigation Tabs -->
            <div class="adm-tabs">
              <button class="adm-tab-btn active" id="adm-tab-cards">🃏 Cards</button>
              <button class="adm-tab-btn" id="adm-tab-heroes">👑 Heroes</button>
            </div>
          </div>
          <div class="adm-header-center">
            <input class="adm-search" id="adm-search" type="text" placeholder="🔍 Search cards…" />
            <div class="adm-type-filters" id="adm-type-filters">
              ${["ALL", ...CARD_TYPES].map(t => `
                <button class="adm-flt-btn${t === "ALL" ? " active" : ""}" data-type="${t}">
                  ${t === "ALL" ? "All" : t.replace(/_/g, " ")}
                </button>
              `).join("")}
            </div>
            <button class="adm-btn-create-hero" id="adm-btn-create-hero" style="display:none;">
              ＋ Create New Hero
            </button>
          </div>
          <div class="adm-header-right">
            <span class="adm-stats" id="adm-stats"></span>
            <button class="adm-btn-close" id="adm-btn-close">✕ Close</button>
          </div>
        </div>

        <!-- Catalog Grid (Cards or Heroes) -->
        <div class="adm-grid" id="adm-grid"></div>

        <!-- Card Editor Modal -->
        <div class="adm-modal" id="adm-card-modal" style="display:none;">
          <div class="adm-modal-inner">
            <div class="adm-modal-header">
              <div class="adm-modal-title" id="adm-card-modal-title">Edit Card</div>
              <button class="adm-btn-close-modal" id="adm-close-card-modal">✕</button>
            </div>
            <div class="adm-modal-body">
              <!-- Left: Image uploader -->
              <div class="adm-editor-left">
                <div class="adm-img-preview" id="adm-img-preview">
                  <div class="adm-img-placeholder" id="adm-img-placeholder">
                    <div class="adm-img-icon">🖼</div>
                    <div class="adm-img-hint">Drag &amp; drop image<br/>or click to browse</div>
                  </div>
                  <img class="adm-img-el" id="adm-img-el" src="" alt="Card art" style="display:none;" />
                </div>
                <input type="file" id="adm-card-file-input" accept="image/*" style="display:none;" />
                <button class="adm-btn-upload" id="adm-btn-upload-card">📁 Browse Image</button>
                <input class="adm-field" id="adm-field-imageUrl" type="text" placeholder="Or paste image URL…" />
                <div class="adm-img-label">Remote CDN / Storage URL</div>
              </div>

              <!-- Right: Fields -->
              <div class="adm-editor-right">
                <div class="adm-row">
                  <label class="adm-label">Card ID <span class="adm-readonly">(read-only)</span></label>
                  <input class="adm-field adm-field--mono" id="adm-field-id" type="text" readonly />
                </div>
                <div class="adm-row adm-row--2col">
                  <div>
                    <label class="adm-label">Name</label>
                    <input class="adm-field" id="adm-field-name" type="text" />
                  </div>
                  <div>
                    <label class="adm-label">Cost</label>
                    <input class="adm-field" id="adm-field-cost" type="number" min="0" max="20" />
                  </div>
                </div>
                <div class="adm-row adm-row--2col">
                  <div>
                    <label class="adm-label">Attack</label>
                    <input class="adm-field" id="adm-field-attack" type="number" min="0" max="99" />
                  </div>
                  <div>
                    <label class="adm-label">HP</label>
                    <input class="adm-field" id="adm-field-hp" type="number" min="1" max="99" />
                  </div>
                </div>
                <div class="adm-row">
                  <label class="adm-label">Card Type</label>
                  <input class="adm-field adm-field--mono" id="adm-field-type" type="text" readonly />
                </div>
                <div class="adm-row">
                  <label class="adm-label">Tribes</label>
                  <div class="adm-kw-grid" id="adm-tribe-grid">
                    ${TRIBES.map(t => `
                      <label class="adm-kw-chip">
                        <input type="checkbox" value="${t}" />
                        <span>${t}</span>
                      </label>
                    `).join("")}
                  </div>
                </div>
                <div class="adm-row">
                  <label class="adm-label">Description / Rules Text</label>
                  <textarea class="adm-field adm-textarea" id="adm-field-text" rows="3"></textarea>
                </div>
                <div class="adm-row">
                  <label class="adm-label">Keywords</label>
                  <div class="adm-kw-grid" id="adm-kw-grid">
                    ${ALL_KEYWORDS.map(kw => `
                      <label class="adm-kw-chip">
                        <input type="checkbox" value="${kw}" />
                        <span>${kw}</span>
                      </label>
                    `).join("")}
                  </div>
                </div>
                <div class="adm-updated" id="adm-updated-label"></div>
              </div>
            </div>
            <div class="adm-modal-footer">
              <button class="adm-btn-cancel" id="adm-btn-cancel-card">Cancel</button>
              <button class="adm-btn-publish" id="adm-btn-save-card">💾 Save &amp; Publish</button>
            </div>
          </div>
        </div>

        <!-- Hero Editor Modal -->
        <div class="adm-modal" id="adm-hero-modal" style="display:none;">
          <div class="adm-modal-inner" style="max-width:860px;">
            <div class="adm-modal-header">
              <div class="adm-modal-title" id="adm-hero-modal-title">Edit Hero</div>
              <button class="adm-btn-close-modal" id="adm-close-hero-modal">✕</button>
            </div>
            <div class="adm-modal-body">
              <!-- Left: Avatar / Portrait -->
              <div class="adm-editor-left" style="width:230px;">
                <div class="adm-hero-avatar-preview" id="adm-hero-avatar-preview">
                  <span id="adm-hero-avatar-emoji" style="font-size:52px;">🧙</span>
                  <img id="adm-hero-avatar-img" src="" alt="Hero Portrait" style="display:none;width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                </div>
                <input type="file" id="adm-hero-file-input" accept="image/*" style="display:none;" />
                <button class="adm-btn-upload" id="adm-btn-upload-hero">📁 Browse Image</button>
                <input class="adm-field" id="adm-hero-field-portrait" type="text" placeholder="Image URL or Emoji…" />
                <div class="adm-img-label">Quick Emoji Picker</div>
                <div class="adm-emoji-picker" id="adm-emoji-picker">
                  ${QUICK_EMOJIS.map(e => `<button type="button" class="adm-emoji-btn">${e}</button>`).join("")}
                </div>
              </div>

              <!-- Right: Hero Fields & 4-Card Superpower Kit -->
              <div class="adm-editor-right">
                <div class="adm-row adm-row--2col">
                  <div>
                    <label class="adm-label">Hero ID</label>
                    <input class="adm-field adm-field--mono" id="adm-hero-field-id" type="text" placeholder="e.g. HERO_VALEN" />
                  </div>
                  <div>
                    <label class="adm-label">Base Max HP</label>
                    <input class="adm-field" id="adm-hero-field-hp" type="number" min="1" max="99" value="20" />
                  </div>
                </div>
                <div class="adm-row adm-row--2col">
                  <div>
                    <label class="adm-label">Hero Name</label>
                    <input class="adm-field" id="adm-hero-field-name" type="text" placeholder="Hero name…" />
                  </div>
                  <div>
                    <label class="adm-label">Title / Epithet</label>
                    <input class="adm-field" id="adm-hero-field-title" type="text" placeholder="e.g. The Sky Vanguard" />
                  </div>
                </div>
                <div class="adm-row">
                  <label class="adm-label">Description / Lore</label>
                  <textarea class="adm-field adm-textarea" id="adm-hero-field-desc" rows="2" placeholder="Hero background & combat philosophy…"></textarea>
                </div>
                <div class="adm-row">
                  <label class="adm-label">Allowed Tribes (Deckbuilding Synergies)</label>
                  <div class="adm-kw-grid" id="adm-hero-tribes-grid">
                    ${TRIBES.filter(t => t !== "Superpower").map(tr => `
                      <label class="adm-kw-chip">
                        <input type="checkbox" value="${tr}" class="adm-hero-tr-check" />
                        <span>${tr}</span>
                      </label>
                    `).join("")}
                  </div>
                </div>

                <!-- 4-Card Superpower Kit Config -->
                <div class="adm-hero-sp-config">
                  <div class="adm-hero-sp-header">
                    <span>⚡ 4-Card Superpower Kit (Block Meter Pool)</span>
                  </div>
                  <div class="adm-sp-select-row">
                    <label class="adm-label" style="color:#ffd066;">⭐ Signature Ability (Iconic 1-of-a-Kind)</label>
                    <select class="adm-field" id="adm-hero-sp-sig"></select>
                    <div class="adm-sp-desc-preview" id="adm-hero-sp-sig-desc"></div>
                  </div>
                  <div class="adm-row adm-row--3col" style="gap:8px;">
                    <div>
                      <label class="adm-label">Core Ability 1</label>
                      <select class="adm-field" id="adm-hero-sp-c1"></select>
                      <div class="adm-sp-desc-preview" id="adm-hero-sp-c1-desc"></div>
                    </div>
                    <div>
                      <label class="adm-label">Core Ability 2</label>
                      <select class="adm-field" id="adm-hero-sp-c2"></select>
                      <div class="adm-sp-desc-preview" id="adm-hero-sp-c2-desc"></div>
                    </div>
                    <div>
                      <label class="adm-label">Core Ability 3</label>
                      <select class="adm-field" id="adm-hero-sp-c3"></select>
                      <div class="adm-sp-desc-preview" id="adm-hero-sp-c3-desc"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="adm-modal-footer">
              <button class="adm-btn-cancel" id="adm-btn-cancel-hero">Cancel</button>
              <button class="adm-btn-publish" id="adm-btn-save-hero">💾 Save &amp; Publish Hero</button>
            </div>
          </div>
        </div>

        <!-- Toast Notification -->
        <div class="adm-toast" id="adm-toast"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.grid       = this.overlay.querySelector("#adm-grid") as HTMLElement;
    this.cardModal  = this.overlay.querySelector("#adm-card-modal") as HTMLElement;
    this.heroModal  = this.overlay.querySelector("#adm-hero-modal") as HTMLElement;
    this.toastEl    = this.overlay.querySelector("#adm-toast") as HTMLElement;

    this.bindEvents();
  }

  // ── Event Bindings ───────────────────────────────────────────

  private bindEvents(): void {
    // Close button
    this.overlay.querySelector("#adm-btn-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.close(true);
    });

    // Navigation Tabs
    const tabCards = this.overlay.querySelector("#adm-tab-cards") as HTMLButtonElement;
    const tabHeroes = this.overlay.querySelector("#adm-tab-heroes") as HTMLButtonElement;
    const typeFilters = this.overlay.querySelector("#adm-type-filters") as HTMLElement;
    const btnCreateHero = this.overlay.querySelector("#adm-btn-create-hero") as HTMLElement;
    const searchInput = this.overlay.querySelector("#adm-search") as HTMLInputElement;

    tabCards?.addEventListener("click", () => {
      this.currentTab = "cards";
      tabCards.classList.add("active");
      tabHeroes.classList.remove("active");
      typeFilters.style.display = "flex";
      btnCreateHero.style.display = "none";
      searchInput.placeholder = "🔍 Search cards…";
      this.render();
    });

    tabHeroes?.addEventListener("click", () => {
      this.currentTab = "heroes";
      tabHeroes.classList.add("active");
      tabCards.classList.remove("active");
      typeFilters.style.display = "none";
      btnCreateHero.style.display = "flex";
      searchInput.placeholder = "🔍 Search heroes…";
      this.render();
    });

    // Create New Hero button
    btnCreateHero?.addEventListener("click", () => {
      this.openHeroEditor(null);
    });

    // Search input
    searchInput?.addEventListener("input", (e) => {
      this.searchVal = (e.target as HTMLInputElement).value;
      this.render();
    });

    // Card Type filters
    this.overlay.querySelectorAll(".adm-flt-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.overlay.querySelectorAll(".adm-flt-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.filterType = (btn as HTMLElement).dataset.type ?? "ALL";
        this.render();
      });
    });

    // Card Modal Close & Cancel
    this.overlay.querySelector("#adm-close-card-modal")?.addEventListener("click", () => this.closeCardModal());
    this.overlay.querySelector("#adm-btn-cancel-card")?.addEventListener("click", () => this.closeCardModal());
    this.overlay.querySelector("#adm-btn-save-card")?.addEventListener("click", () => this.saveCard());

    // Hero Modal Close & Cancel
    this.overlay.querySelector("#adm-close-hero-modal")?.addEventListener("click", () => this.closeHeroModal());
    this.overlay.querySelector("#adm-btn-cancel-hero")?.addEventListener("click", () => this.closeHeroModal());
    this.overlay.querySelector("#adm-btn-save-hero")?.addEventListener("click", () => this.saveHero());

    // Card file uploader & drag-and-drop
    this.bindCardUploadEvents();

    // Hero file uploader & emoji picker
    this.bindHeroUploadEvents();

    // Modal backdrop clicks
    this.cardModal.addEventListener("click", (e) => {
      if (e.target === this.cardModal) this.closeCardModal();
    });
    this.heroModal.addEventListener("click", (e) => {
      if (e.target === this.heroModal) this.closeHeroModal();
    });
  }

  private bindCardUploadEvents(): void {
    const preview = this.overlay.querySelector("#adm-img-preview") as HTMLElement;
    const fileInput = this.overlay.querySelector("#adm-card-file-input") as HTMLInputElement;
    const browseBtn = this.overlay.querySelector("#adm-btn-upload-card") as HTMLButtonElement;
    const urlInput = this.overlay.querySelector("#adm-field-imageUrl") as HTMLInputElement;

    const handleCardFile = async (file: File) => {
      // Immediate local preview
      this.readLocalImage(file, (dataUrl) => {
        this.pendingCardImg = dataUrl;
        this.setCardPreviewUrl(dataUrl);
        urlInput.value = "Uploading to server...";
      });

      // Upload to server for permanent hosted URL
      try {
        const hostedUrl = await this.uploadAssetToServer(file);
        this.pendingCardImg = hostedUrl;
        this.setCardPreviewUrl(hostedUrl);
        urlInput.value = hostedUrl;
        this.showToast("☁ Artwork uploaded & hosted on server!");
      } catch (err) {
        console.warn("[AdminCardView] Upload error:", err);
      }
    };

    browseBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleCardFile(file);
    });

    preview?.addEventListener("dragover", (e) => { e.preventDefault(); preview.classList.add("dragover"); });
    preview?.addEventListener("dragleave", () => preview.classList.remove("dragover"));
    preview?.addEventListener("drop", (e) => {
      e.preventDefault();
      preview.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) {
        handleCardFile(file);
      }
    });

    urlInput?.addEventListener("input", (e) => {
      const url = (e.target as HTMLInputElement).value.trim();
      this.pendingCardImg = url || null;
      this.setCardPreviewUrl(url);
    });
  }

  private bindHeroUploadEvents(): void {
    const fileInput = this.overlay.querySelector("#adm-hero-file-input") as HTMLInputElement;
    const browseBtn = this.overlay.querySelector("#adm-btn-upload-hero") as HTMLButtonElement;
    const portraitInput = this.overlay.querySelector("#adm-hero-field-portrait") as HTMLInputElement;

    const handleHeroFile = async (file: File) => {
      this.readLocalImage(file, (dataUrl) => {
        this.pendingHeroImg = dataUrl;
        portraitInput.value = "Uploading...";
        this.setHeroAvatarPreview(dataUrl);
      });

      try {
        const hostedUrl = await this.uploadAssetToServer(file);
        if (hostedUrl) {
          this.pendingHeroImg = hostedUrl;
          portraitInput.value = hostedUrl;
          this.setHeroAvatarPreview(hostedUrl);
          this.showToast("☁ Hero portrait uploaded & hosted on server!");
        } else {
          portraitInput.value = this.pendingHeroImg || "🧙";
          this.setHeroAvatarPreview(this.pendingHeroImg || "🧙");
          this.showToast("⚠️ Could not host image remotely, using local preview.");
        }
      } catch (err) {
        console.warn("[AdminCardView] Hero portrait upload error:", err);
        portraitInput.value = this.pendingHeroImg || "🧙";
        this.setHeroAvatarPreview(this.pendingHeroImg || "🧙");
      }
    };

    browseBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleHeroFile(file);
    });

    portraitInput?.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value.trim();
      this.pendingHeroImg = val || null;
      this.setHeroAvatarPreview(val);
    });

    // Quick emoji clickers
    this.overlay.querySelectorAll(".adm-emoji-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = btn.textContent || "";
        portraitInput.value = emoji;
        this.pendingHeroImg = emoji;
        this.setHeroAvatarPreview(emoji);
      });
    });
  }

  private async uploadAssetToServer(file: File): Promise<string> {
    // 1. Upload to Supabase Public Storage Bucket for permanent global HTTPS CDN URL
    try {
      const supabaseUrl = await uploadAssetToSupabaseStorage(file);
      if (supabaseUrl) {
        console.log(`[AdminCardView] Successfully uploaded asset to Supabase Storage: ${supabaseUrl}`);
        return supabaseUrl;
      }
    } catch (err) {
      console.warn("[AdminCardView] Supabase Storage upload error:", err);
    }

    // 2. Fallback to Node.js backend upload endpoint
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return reject(new Error("Failed to read file"));
        try {
          const res = await fetch("/api/admin/upload-asset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, dataUrl }),
          });
          const json = await res.json();
          if (json.success && json.url) {
            resolve(json.url);
          } else {
            resolve(dataUrl);
          }
        } catch (err) {
          console.warn("[AdminCardView] Asset upload failed, falling back to data URL:", err);
          resolve(dataUrl);
        }
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsDataURL(file);
    });
  }

  private readLocalImage(file: File, onRead: (dataUrl: string) => void): void {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) onRead(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  // ── Render Dispatcher ─────────────────────────────────────────

  private render(): void {
    if (this.currentTab === "cards") {
      this.renderCardGrid();
    } else {
      this.renderHeroGrid();
    }
  }

  // ── Card Grid ────────────────────────────────────────────────

  private renderCardGrid(): void {
    const cards = cardRepo.getAll();
    const q = this.searchVal.toLowerCase();

    const filtered = cards.filter(c => {
      const cardTribes = c.tribes && c.tribes.length > 0 ? c.tribes : [c.tribe || ""];
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        cardTribes.some(t => t.toLowerCase().includes(q));
      const matchType = this.filterType === "ALL" || c.type === this.filterType;
      return matchSearch && matchType;
    });

    const statsEl = this.overlay.querySelector("#adm-stats");
    if (statsEl) {
      const withArt = cards.filter(c => c.imageUrl).length;
      statsEl.innerHTML = `<span>${filtered.length}/${cards.length} cards</span> <span class="adm-art-count">🖼 ${withArt} with art</span>`;
    }

    if (filtered.length === 0) {
      this.grid.innerHTML = `<div class="adm-empty">No cards match your search.</div>`;
      return;
    }

    this.grid.innerHTML = "";
    for (const card of filtered) {
      const tile = document.createElement("div");
      tile.className = "adm-tile";
      tile.dataset.id = card.id;

      const typeColor = TYPE_COLORS[card.type] ?? "#888";
      const hasArt = !!card.imageUrl;
      const age = card.updatedAt > 0 ? `Updated ${this.timeAgo(card.updatedAt)}` : "Static (default)";
      const tribeStr = card.tribes && card.tribes.length > 0 ? card.tribes.join(" · ") : (card.tribe || "Neutral");

      tile.innerHTML = `
        <div class="adm-tile-art${hasArt ? " has-art" : ""}">
          ${hasArt
            ? `<img src="${card.imageUrl}" alt="${card.name}" onerror="this.style.display='none'" />`
            : `<div class="adm-tile-art-placeholder">🖼</div>`}
          <div class="adm-tile-type-badge" style="background:${typeColor}22;border-color:${typeColor}44;color:${typeColor}">
            ${card.type.replace(/_/g, " ")}
          </div>
        </div>
        <div class="adm-tile-body">
          <div class="adm-tile-name">${card.name}</div>
          <div class="adm-tile-sub">${tribeStr} · Cost ${card.cost}</div>
          ${card.type === "UNIT" ? `
            <div class="adm-tile-stats">
              <span class="atk">⚔ ${card.attack}</span>
              <span class="hp">❤ ${card.hp}</span>
            </div>
          ` : ""}
          <div class="adm-tile-age">${age}</div>
          <div class="adm-tile-id">${card.id}</div>
        </div>
        <button class="adm-tile-edit-btn">✏ Edit</button>
      `;

      tile.querySelector(".adm-tile-edit-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openCardEditor(card);
      });
      tile.addEventListener("click", () => this.openCardEditor(card));

      this.grid.appendChild(tile);
    }
  }

  // ── Hero Grid ────────────────────────────────────────────────

  private renderHeroGrid(): void {
    const heroes = heroRepo.getAllHeroDefinitions();
    const q = this.searchVal.toLowerCase();

    const filtered = heroes.filter(h => {
      return !q ||
        h.name.toLowerCase().includes(q) ||
        h.id.toLowerCase().includes(q) ||
        h.title.toLowerCase().includes(q) ||
        h.allowedTribes.some(t => t.toLowerCase().includes(q));
    });

    const statsEl = this.overlay.querySelector("#adm-stats");
    if (statsEl) {
      statsEl.innerHTML = `<span>${filtered.length}/${heroes.length} Heroes</span>`;
    }

    if (filtered.length === 0) {
      this.grid.innerHTML = `<div class="adm-empty">No heroes match your search.</div>`;
      return;
    }

    this.grid.innerHTML = "";
    for (const h of filtered) {
      const tile = document.createElement("div");
      tile.className = "adm-hero-tile";
      tile.dataset.id = h.id;

      const isDefault = heroRepo.isDefaultHero(h.id);
      const isImg = h.portraitUrl && (
        h.portraitUrl.startsWith("http://") ||
        h.portraitUrl.startsWith("https://") ||
        h.portraitUrl.startsWith("data:") ||
        h.portraitUrl.startsWith("/") ||
        h.portraitUrl.startsWith("./")
      );
      const fallbackEmoji = (!h.portraitUrl || h.portraitUrl.toLowerCase() === "loading" || h.portraitUrl.toLowerCase() === "uploading...")
        ? "🧙"
        : h.portraitUrl;
      const avatarHtml = isImg
        ? `<img src="${h.portraitUrl}" alt="${h.name}" crossorigin="anonymous" onerror="this.onerror=null; this.parentElement.innerHTML='<span>🧙</span>';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : `<span>${fallbackEmoji}</span>`;

      const sigCard = cardRepo.getCard(h.signatureAbilityCardId);
      const c1 = cardRepo.getCard(h.coreAbilityCardIds[0]);
      const c2 = cardRepo.getCard(h.coreAbilityCardIds[1]);
      const c3 = cardRepo.getCard(h.coreAbilityCardIds[2]);

      tile.innerHTML = `
        <div class="adm-hero-tile-header">
          <div class="adm-hero-tile-avatar">${avatarHtml}</div>
          <div class="adm-hero-tile-info">
            <div class="adm-hero-tile-name">${h.name}</div>
            <div class="adm-hero-tile-title">${h.title}</div>
            <div class="adm-hero-tile-badges">
              <span class="adm-hero-hp-badge">❤️ ${h.maxHp} HP</span>
              ${h.allowedTribes.map(tr => `<span class="adm-hero-tr-tag">${tr}</span>`).join("")}
            </div>
          </div>
        </div>
        <div class="adm-hero-tile-desc">${h.description || "No lore description provided."}</div>
        
        <!-- 4-Card Kit Summary -->
        <div class="adm-hero-kit-box">
          <div class="adm-hero-kit-title">⚡ 4-Card Superpower Kit</div>
          <div class="adm-hero-kit-item signature">
            <span class="badge">⭐ SIGNATURE</span>
            <span class="name">${sigCard ? sigCard.name : h.signatureAbilityCardId}</span>
            <span class="cost">0 Mana</span>
          </div>
          <div class="adm-hero-kit-cores">
            <div class="adm-hero-kit-item core"><span class="badge">CORE</span> ${c1 ? c1.name : h.coreAbilityCardIds[0]}</div>
            <div class="adm-hero-kit-item core"><span class="badge">CORE</span> ${c2 ? c2.name : h.coreAbilityCardIds[1]}</div>
            <div class="adm-hero-kit-item core"><span class="badge">CORE</span> ${c3 ? c3.name : h.coreAbilityCardIds[2]}</div>
          </div>
        </div>

        <div class="adm-hero-tile-actions">
          <button class="adm-btn-edit-hero">✏ Edit Hero</button>
          <button class="adm-btn-del-hero" title="${isDefault ? "Reset to default hero stats" : "Delete custom hero"}">
            ${isDefault ? "↺ Reset" : "🗑 Delete"}
          </button>
        </div>
      `;

      tile.querySelector(".adm-btn-edit-hero")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openHeroEditor(h);
      });
      tile.querySelector(".adm-btn-del-hero")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.confirmDeleteHero(h.id, h.name, isDefault);
      });
      tile.addEventListener("click", () => this.openHeroEditor(h));

      this.grid.appendChild(tile);
    }
  }

  // ── Card Editor Modal ────────────────────────────────────────

  private openCardEditor(card: CardMeta): void {
    this.editingCard = card;
    this.pendingCardImg = card.imageUrl || null;

    (this.cardModal.querySelector("#adm-card-modal-title") as HTMLElement).textContent = `✏ Edit: ${card.name}`;
    (this.cardModal.querySelector("#adm-field-id") as HTMLInputElement).value = card.id;
    (this.cardModal.querySelector("#adm-field-name") as HTMLInputElement).value = card.name;
    (this.cardModal.querySelector("#adm-field-cost") as HTMLInputElement).value = String(card.cost);
    (this.cardModal.querySelector("#adm-field-attack") as HTMLInputElement).value = String(card.attack ?? 0);
    (this.cardModal.querySelector("#adm-field-hp") as HTMLInputElement).value = String(card.hp ?? 1);
    (this.cardModal.querySelector("#adm-field-type") as HTMLInputElement).value = card.type;
    (this.cardModal.querySelector("#adm-field-text") as HTMLTextAreaElement).value = card.text ?? "";
    (this.cardModal.querySelector("#adm-field-imageUrl") as HTMLInputElement).value = card.imageUrl ?? "";

    // Tribe checkboxes
    const cardTribes = card.tribes && card.tribes.length > 0 ? card.tribes : [card.tribe || "เป็นกลาง"];
    const tribeGrid = this.cardModal.querySelector("#adm-tribe-grid") as HTMLElement;
    tribeGrid?.querySelectorAll("input").forEach((inp) => {
      inp.checked = cardTribes.includes(inp.value);
    });

    // Keyword checkboxes
    const kwGrid = this.cardModal.querySelector("#adm-kw-grid") as HTMLElement;
    kwGrid.querySelectorAll("input").forEach((inp) => {
      inp.checked = card.keywords.includes(inp.value as Keyword);
    });

    // Updated date
    const updatedLabel = this.cardModal.querySelector("#adm-updated-label") as HTMLElement;
    if (updatedLabel) {
      updatedLabel.textContent = card.updatedAt > 0
        ? `Last modified: ${new Date(card.updatedAt).toLocaleString()}`
        : "Unmodified static definition";
    }

    this.setCardPreviewUrl(card.imageUrl);

    this.cardModal.style.display = "flex";
    requestAnimationFrame(() => {
      this.cardModal.style.opacity = "1";
    });
  }

  private closeCardModal(): void {
    this.cardModal.style.opacity = "0";
    setTimeout(() => {
      this.cardModal.style.display = "none";
      this.editingCard = null;
      this.pendingCardImg = null;
    }, 200);
  }

  private setCardPreviewUrl(url: string | null): void {
    const preview = this.cardModal.querySelector("#adm-img-preview") as HTMLElement;
    const placeholder = this.cardModal.querySelector("#adm-img-placeholder") as HTMLElement;
    const imgEl = this.cardModal.querySelector("#adm-img-el") as HTMLImageElement;

    if (url) {
      imgEl.src = url;
      imgEl.style.display = "block";
      placeholder.style.display = "none";
      preview.classList.add("has-image");
    } else {
      imgEl.src = "";
      imgEl.style.display = "none";
      placeholder.style.display = "flex";
      preview.classList.remove("has-image");
    }
  }

  private async saveCard(): Promise<void> {
    if (!this.editingCard) return;

    const name = (this.cardModal.querySelector("#adm-field-name") as HTMLInputElement).value.trim();
    const cost = parseInt((this.cardModal.querySelector("#adm-field-cost") as HTMLInputElement).value, 10);
    const attack = parseInt((this.cardModal.querySelector("#adm-field-attack") as HTMLInputElement).value, 10);
    const hp = parseInt((this.cardModal.querySelector("#adm-field-hp") as HTMLInputElement).value, 10);
    const text = (this.cardModal.querySelector("#adm-field-text") as HTMLTextAreaElement).value.trim();
    const imageUrl = this.pendingCardImg ?? "";

    const tribes: string[] = [];
    this.cardModal.querySelectorAll<HTMLInputElement>("#adm-tribe-grid input:checked").forEach((inp) => {
      tribes.push(inp.value);
    });
    if (tribes.length === 0) tribes.push("เป็นกลาง");

    const keywords: Keyword[] = [];
    this.cardModal.querySelectorAll<HTMLInputElement>("#adm-kw-grid input:checked").forEach((inp) => {
      keywords.push(inp.value as Keyword);
    });

    const patch: Partial<CardMeta> = {
      name: name || this.editingCard.name,
      cost: isNaN(cost) ? this.editingCard.cost : cost,
      attack: isNaN(attack) ? this.editingCard.attack : attack,
      hp: isNaN(hp) ? this.editingCard.hp : hp,
      tribes,
      tribe: tribes[0] || "เป็นกลาง",
      keywords,
      imageUrl,
      ...(text ? { text } : {}),
    };

    await cardRepo.updateCard(this.editingCard.id, patch);

    this.closeCardModal();
    this.showToast(`✅ "${name || this.editingCard.name}" saved & published!`);
  }

  // ── Hero Editor Modal ────────────────────────────────────────

  private openHeroEditor(heroDef: HeroDefinition | null): void {
    this.editingHero = heroDef;
    this.isNewHero = !heroDef;
    this.pendingHeroImg = heroDef?.portraitUrl || null;

    const titleEl = this.heroModal.querySelector("#adm-hero-modal-title") as HTMLElement;
    titleEl.textContent = this.isNewHero ? "✨ Create New Hero" : `✏ Edit: ${heroDef!.name}`;

    const idInput = this.heroModal.querySelector("#adm-hero-field-id") as HTMLInputElement;
    const nameInput = this.heroModal.querySelector("#adm-hero-field-name") as HTMLInputElement;
    const titleInput = this.heroModal.querySelector("#adm-hero-field-title") as HTMLInputElement;
    const hpInput = this.heroModal.querySelector("#adm-hero-field-hp") as HTMLInputElement;
    const descInput = this.heroModal.querySelector("#adm-hero-field-desc") as HTMLTextAreaElement;
    const portraitInput = this.heroModal.querySelector("#adm-hero-field-portrait") as HTMLInputElement;

    idInput.value = heroDef?.id ?? `HERO_${Date.now().toString(36).toUpperCase()}`;
    idInput.readOnly = !this.isNewHero && heroRepo.isDefaultHero(heroDef!.id);
    nameInput.value = heroDef?.name ?? "";
    titleInput.value = heroDef?.title ?? "";
    hpInput.value = String(heroDef?.maxHp ?? 20);
    descInput.value = heroDef?.description ?? "";
    portraitInput.value = heroDef?.portraitUrl ?? "🧙";

    // Allowed Tribes checkboxes
    const allowedSet = new Set(heroDef?.allowedTribes ?? ["Aerial", "Vanguard"]);
    this.heroModal.querySelectorAll<HTMLInputElement>(".adm-hero-tr-check").forEach((chk) => {
      chk.checked = allowedSet.has(chk.value);
    });

    this.setHeroAvatarPreview(portraitInput.value);

    // Populate Superpower select dropdowns
    this.populateSuperpowerSelects(heroDef);

    this.heroModal.style.display = "flex";
    requestAnimationFrame(() => {
      this.heroModal.style.opacity = "1";
    });
  }

  private populateSuperpowerSelects(heroDef: HeroDefinition | null): void {
    const allCards = cardRepo.getAll();
    const superpowers = allCards.filter(c => c.tribe === "Superpower" || c.id.startsWith("SP_") || c.type === CardType.HeroAbility);
    const otherSpells = allCards.filter(c => c.type === CardType.Spell && !superpowers.some(s => s.id === c.id));
    const otherCards = allCards.filter(c => !superpowers.some(s => s.id === c.id) && !otherSpells.some(s => s.id === c.id));

    const optionsHtml = `
      <optgroup label="⭐ Dedicated Superpowers (${superpowers.length})">
        ${superpowers.map(c => `<option value="${c.id}">${c.name} (Cost ${c.cost})</option>`).join("")}
      </optgroup>
      <optgroup label="✨ Spells (${otherSpells.length})">
        ${otherSpells.map(c => `<option value="${c.id}">${c.name} (Cost ${c.cost})</option>`).join("")}
      </optgroup>
      <optgroup label="⚔️ Units / Equipment (${otherCards.length})">
        ${otherCards.map(c => `<option value="${c.id}">${c.name} (Cost ${c.cost})</option>`).join("")}
      </optgroup>
    `;

    const sigSel = this.heroModal.querySelector("#adm-hero-sp-sig") as HTMLSelectElement;
    const c1Sel = this.heroModal.querySelector("#adm-hero-sp-c1") as HTMLSelectElement;
    const c2Sel = this.heroModal.querySelector("#adm-hero-sp-c2") as HTMLSelectElement;
    const c3Sel = this.heroModal.querySelector("#adm-hero-sp-c3") as HTMLSelectElement;

    sigSel.innerHTML = optionsHtml;
    c1Sel.innerHTML = optionsHtml;
    c2Sel.innerHTML = optionsHtml;
    c3Sel.innerHTML = optionsHtml;

    // Set selections
    sigSel.value = heroDef?.signatureAbilityCardId ?? (superpowers[0]?.id || allCards[0].id);
    c1Sel.value = heroDef?.coreAbilityCardIds[0] ?? (superpowers[1]?.id || allCards[1].id);
    c2Sel.value = heroDef?.coreAbilityCardIds[1] ?? (superpowers[2]?.id || allCards[2].id);
    c3Sel.value = heroDef?.coreAbilityCardIds[2] ?? (superpowers[3]?.id || allCards[3].id);

    // Update previews
    const updatePreview = (sel: HTMLSelectElement, descElId: string) => {
      const card = cardRepo.getCard(sel.value);
      const descEl = this.heroModal.querySelector(descElId) as HTMLElement;
      if (descEl) descEl.textContent = card?.text || "No effect text.";
    };

    updatePreview(sigSel, "#adm-hero-sp-sig-desc");
    updatePreview(c1Sel, "#adm-hero-sp-c1-desc");
    updatePreview(c2Sel, "#adm-hero-sp-c2-desc");
    updatePreview(c3Sel, "#adm-hero-sp-c3-desc");

    sigSel.onchange = () => updatePreview(sigSel, "#adm-hero-sp-sig-desc");
    c1Sel.onchange = () => updatePreview(c1Sel, "#adm-hero-sp-c1-desc");
    c2Sel.onchange = () => updatePreview(c2Sel, "#adm-hero-sp-c2-desc");
    c3Sel.onchange = () => updatePreview(c3Sel, "#adm-hero-sp-c3-desc");
  }

  private setHeroAvatarPreview(val: string): void {
    const preview = this.heroModal.querySelector("#adm-hero-avatar-preview") as HTMLElement;
    const emojiEl = this.heroModal.querySelector("#adm-hero-avatar-emoji") as HTMLElement;
    const imgEl = this.heroModal.querySelector("#adm-hero-avatar-img") as HTMLImageElement;
    if (!preview || !emojiEl || !imgEl) return;

    const trimmed = (val || "").trim();
    const isImg = trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:") || trimmed.startsWith("/") || trimmed.startsWith("./");

    if (isImg) {
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        imgEl.style.display = "block";
        emojiEl.style.display = "none";
        preview.classList.add("has-image");
      };
      imgEl.onerror = () => {
        imgEl.style.display = "none";
        emojiEl.textContent = "🧙";
        emojiEl.style.display = "block";
        preview.classList.remove("has-image");
      };
      imgEl.src = trimmed;
    } else {
      imgEl.src = "";
      imgEl.style.display = "none";
      const fallback = (!trimmed || trimmed.toLowerCase() === "loading" || trimmed.toLowerCase() === "uploading...") ? "🧙" : trimmed;
      emojiEl.textContent = fallback;
      emojiEl.style.display = "block";
      preview.classList.remove("has-image");
    }
  }

  private closeHeroModal(): void {
    this.heroModal.style.opacity = "0";
    setTimeout(() => {
      this.heroModal.style.display = "none";
      this.editingHero = null;
      this.pendingHeroImg = null;
    }, 200);
  }

  private async saveHero(): Promise<void> {
    const idInput = this.heroModal.querySelector("#adm-hero-field-id") as HTMLInputElement;
    const nameInput = this.heroModal.querySelector("#adm-hero-field-name") as HTMLInputElement;
    const titleInput = this.heroModal.querySelector("#adm-hero-field-title") as HTMLInputElement;
    const hpInput = this.heroModal.querySelector("#adm-hero-field-hp") as HTMLInputElement;
    const descInput = this.heroModal.querySelector("#adm-hero-field-desc") as HTMLTextAreaElement;
    const portraitInput = this.heroModal.querySelector("#adm-hero-field-portrait") as HTMLInputElement;

    const sigSel = this.heroModal.querySelector("#adm-hero-sp-sig") as HTMLSelectElement;
    const c1Sel = this.heroModal.querySelector("#adm-hero-sp-c1") as HTMLSelectElement;
    const c2Sel = this.heroModal.querySelector("#adm-hero-sp-c2") as HTMLSelectElement;
    const c3Sel = this.heroModal.querySelector("#adm-hero-sp-c3") as HTMLSelectElement;

    const id = (idInput.value || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const name = (nameInput.value || "").trim();
    const title = (titleInput.value || "").trim();
    const maxHp = parseInt(hpInput.value, 10) || 20;
    const description = (descInput.value || "").trim();
    let portraitUrl = (portraitInput.value || "").trim();

    if (!portraitUrl || portraitUrl.toLowerCase() === "uploading..." || portraitUrl.toLowerCase() === "loading") {
      portraitUrl = this.pendingHeroImg || "🧙";
    }
    if (!portraitUrl || portraitUrl.toLowerCase() === "uploading..." || portraitUrl.toLowerCase() === "loading") {
      portraitUrl = "🧙";
    }

    if (!id) {
      alert("Please provide a unique Hero ID.");
      return;
    }
    if (!name) {
      alert("Please provide a Hero Name.");
      return;
    }

    const allowedTribes: string[] = [];
    this.heroModal.querySelectorAll<HTMLInputElement>(".adm-hero-tr-check:checked").forEach((chk) => {
      allowedTribes.push(chk.value);
    });

    const sigId = sigSel.value;
    const c1Id = c1Sel.value;
    const c2Id = c2Sel.value;
    const c3Id = c3Sel.value;

    const heroDef: HeroDefinition = {
      id,
      name,
      title: title || "The Champion",
      description: description || "A formidable hero in battle.",
      maxHp,
      portraitUrl: portraitUrl || "🧙",
      allowedTribes: allowedTribes.length > 0 ? allowedTribes : ["Neutral"],
      signatureAbilityCardId: sigId,
      coreAbilityCardIds: [c1Id, c2Id, c3Id],
      updatedAt: Date.now(),
    };

    const saveBtn = this.heroModal.querySelector("#adm-btn-save-hero") as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Publishing to Supabase...";
    }

    try {
      const ok = await heroRepo.saveHero(heroDef);
      this.closeHeroModal();
      this.render();
      if (ok) {
        this.showToast(`✅ Hero "${name}" saved & published to Supabase!`);
      } else {
        this.showToast(`⚠️ Hero saved locally, but failed to write to Supabase (check RLS/network).`);
      }
    } catch (err) {
      console.error("[AdminCardView] saveHero error:", err);
      this.showToast(`⚠️ Error saving hero: ${err}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "💾 Save & Publish Hero";
      }
    }
  }

  private async confirmDeleteHero(id: string, name: string, isDefault: boolean): Promise<void> {
    const msg = isDefault
      ? `Reset "${name}" to its original default configuration?`
      : `Are you sure you want to permanently delete custom hero "${name}"?`;
    if (!confirm(msg)) return;

    await heroRepo.deleteHero(id);
    this.render();
    this.showToast(isDefault ? `↺ "${name}" reset to defaults.` : `🗑 "${name}" deleted.`);
  }

  // ── Toast Notification ───────────────────────────────────────

  private showToast(msg: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("visible");
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove("visible");
    }, 2800);
  }

  private timeAgo(ts: number): string {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // ── Keyboard & Route Listeners ────────────────────────────────

  private bindHotkey(): void {
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyA") {
        e.preventDefault();
        if (this.overlay.style.display === "flex") {
          this.close();
        } else {
          this.open();
        }
      }
    });
  }

  private bindHashRoute(): void {
    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#admin") {
        this.open();
      } else if (this.overlay.style.display === "flex") {
        this.close();
      }
    });
  }

  // ── CSS Injection ───────────────────────────────────────────

  private injectStyles(): void {
    if (this.styleInjected || document.getElementById("admin-styles")) return;
    this.styleInjected = true;

    const s = document.createElement("style");
    s.id = "admin-styles";
    s.textContent = `
      #admin-overlay {
        position: fixed; inset: 0; z-index: 1000;
        background: radial-gradient(circle at center, rgba(12, 8, 28, 0.96), rgba(3, 2, 10, 0.99));
        backdrop-filter: blur(16px);
        display: none; align-items: center; justify-content: center;
        opacity: 0; transform: scale(0.97);
        transition: opacity 0.28s ease, transform 0.28s ease;
        user-select: none; font-family: 'Inter', system-ui, sans-serif;
      }
      .adm-inner {
        width: 95vw; max-width: 1400px; height: 92vh;
        display: flex; flex-direction: column;
        background: rgba(14, 10, 32, 0.95);
        border: 1px solid rgba(140, 100, 255, 0.25);
        border-radius: 20px; overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,0.8), 0 0 60px rgba(120,60,255,0.18);
        position: relative;
      }

      /* ─── Header ─────────────────────────────────────────── */
      .adm-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 24px;
        background: rgba(20, 14, 44, 0.8);
        border-bottom: 1px solid rgba(140, 100, 255, 0.2);
        gap: 16px; flex-shrink: 0;
      }
      .adm-header-left { display: flex; align-items: center; gap: 12px; }
      .adm-logo {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 20px; font-weight: 700; color: #fff;
        text-shadow: 0 0 16px rgba(180,120,255,0.7);
      }
      .adm-badge {
        font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        color: #fff; padding: 2px 8px; border-radius: 99px;
      }
      .adm-tabs {
        display: flex; gap: 4px; background: rgba(0,0,0,0.3);
        padding: 3px; border-radius: 10px; border: 1px solid rgba(140,100,255,0.2);
      }
      .adm-tab-btn {
        background: transparent; border: none; color: #c4b5fd;
        font-size: 12px; font-weight: 700; padding: 6px 14px;
        border-radius: 8px; cursor: pointer; transition: all 0.2s;
      }
      .adm-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.06); }
      .adm-tab-btn.active {
        background: linear-gradient(135deg, #7c3aed, #5b21b6);
        color: #fff; box-shadow: 0 2px 10px rgba(124,58,237,0.5);
      }

      .adm-header-center { display: flex; align-items: center; gap: 10px; flex: 1; max-width: 700px; }
      .adm-search {
        flex: 1; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(140,100,255,0.25); border-radius: 99px;
        padding: 7px 16px; color: #e2d9ff; font-size: 13px; outline: none;
        transition: border-color 0.2s, background 0.2s;
      }
      .adm-search:focus {
        border-color: rgba(160,120,255,0.6); background: rgba(255,255,255,0.08);
      }
      .adm-type-filters { display: flex; gap: 4px; }
      .adm-flt-btn {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(140,100,255,0.18);
        border-radius: 6px; padding: 5px 9px; font-size: 11px; font-weight: 600;
        color: rgba(200,180,255,0.65); cursor: pointer; transition: all 0.15s;
      }
      .adm-flt-btn:hover { background: rgba(140,100,255,0.12); color: #fff; }
      .adm-flt-btn.active {
        background: rgba(140,100,255,0.3); border-color: rgba(160,120,255,0.6); color: #e9d5ff;
      }
      .adm-btn-create-hero {
        background: linear-gradient(135deg, #059669, #047857);
        border: none; color: #fff; font-size: 12px; font-weight: 700;
        padding: 7px 16px; border-radius: 99px; cursor: pointer;
        display: flex; align-items: center; gap: 6px;
        box-shadow: 0 2px 12px rgba(5,150,105,0.4); transition: transform 0.15s;
        white-space: nowrap;
      }
      .adm-btn-create-hero:hover { transform: translateY(-1px); }

      .adm-header-right { display: flex; align-items: center; gap: 14px; }
      .adm-stats { font-size: 12px; color: rgba(200,180,255,0.6); }
      .adm-art-count { color: #a78bfa; margin-left: 6px; }
      .adm-btn-close {
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15);
        color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 600;
        padding: 6px 14px; border-radius: 8px; cursor: pointer; transition: background 0.15s;
      }
      .adm-btn-close:hover { background: rgba(255,80,80,0.2); border-color: rgba(255,80,80,0.4); color: #ff8888; }

      /* ─── Grid ───────────────────────────────────────────── */
      .adm-grid {
        flex: 1; overflow-y: auto; padding: 20px;
        display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 16px; align-content: start;
      }
      .adm-empty {
        grid-column: 1 / -1; text-align: center; color: rgba(200,180,255,0.4);
        padding: 60px 0; font-size: 15px;
      }

      /* ─── Card Tile ──────────────────────────────────────── */
      .adm-tile {
        background: rgba(255,255,255,0.03); border: 1px solid rgba(140,100,255,0.18);
        border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
        cursor: pointer; transition: transform 0.15s, border-color 0.2s, box-shadow 0.2s;
        position: relative;
      }
      .adm-tile:hover {
        transform: translateY(-2px); border-color: rgba(160,120,255,0.45);
        box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 16px rgba(140,80,255,0.2);
      }
      .adm-tile-art {
        height: 120px; background: rgba(0,0,0,0.3); position: relative;
        display: flex; align-items: center; justify-content: center; overflow: hidden;
      }
      .adm-tile-art img { width: 100%; height: 100%; object-fit: cover; }
      .adm-tile-art-placeholder { font-size: 36px; opacity: 0.25; }
      .adm-tile-type-badge {
        position: absolute; top: 8px; left: 8px;
        font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
        text-transform: uppercase; padding: 2px 7px; border-radius: 99px;
        border: 1px solid currentColor;
      }
      .adm-tile-body { padding: 10px 12px 12px; flex: 1; display: flex; flex-direction: column; gap: 3px; }
      .adm-tile-name { font-size: 13px; font-weight: 700; color: #fff; line-height: 1.2; }
      .adm-tile-sub  { font-size: 11px; color: rgba(200,180,255,0.6); }
      .adm-tile-stats { display: flex; gap: 8px; margin-top: 4px; font-size: 12px; font-weight: 700; }
      .adm-tile-stats .atk { color: #fb923c; }
      .adm-tile-stats .hp  { color: #4ade80; }
      .adm-tile-age { font-size: 10px; color: rgba(160,140,200,0.4); margin-top: auto; padding-top: 6px; }
      .adm-tile-id  { font-size: 9px; color: rgba(140,120,180,0.35); font-family: monospace; }
      .adm-tile-edit-btn {
        margin: 0 10px 10px; background: rgba(140,100,255,0.12);
        border: 1px solid rgba(140,100,255,0.25); color: #c4b5fd;
        border-radius: 6px; padding: 5px; font-size: 11px; font-weight: 600;
        cursor: pointer; transition: background 0.15s, color 0.15s;
      }
      .adm-tile-edit-btn:hover { background: rgba(140,100,255,0.3); color: #fff; }

      /* ─── Hero Tile ──────────────────────────────────────── */
      .adm-hero-tile {
        background: linear-gradient(145deg, rgba(30, 20, 60, 0.7), rgba(16, 10, 36, 0.85));
        border: 1px solid rgba(168, 85, 247, 0.3);
        border-radius: 14px; padding: 16px; display: flex; flex-direction: column;
        gap: 12px; transition: transform 0.15s, border-color 0.2s, box-shadow 0.2s;
        cursor: pointer;
      }
      .adm-hero-tile:hover {
        transform: translateY(-2px);
        border-color: rgba(192, 132, 252, 0.6);
        box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 20px rgba(168,85,247,0.25);
      }
      .adm-hero-tile-header { display: flex; gap: 12px; align-items: center; }
      .adm-hero-tile-avatar {
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, #3b1d6d, #1c0e3a);
        border: 2px solid #a855f7; display: flex; align-items: center; justify-content: center;
        font-size: 30px; flex-shrink: 0; overflow: hidden;
      }
      .adm-hero-tile-info { flex: 1; min-width: 0; }
      .adm-hero-tile-name {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 17px; font-weight: 700; color: #fff;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .adm-hero-tile-title {
        font-size: 11px; font-weight: 700; color: #ffd066;
        text-transform: uppercase; letter-spacing: 0.08em;
      }
      .adm-hero-tile-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
      .adm-hero-hp-badge {
        font-size: 10px; font-weight: 700; background: rgba(239,68,68,0.2);
        color: #fca5a5; border: 1px solid rgba(239,68,68,0.4);
        padding: 2px 7px; border-radius: 99px;
      }
      .adm-hero-tr-tag {
        font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.08);
        color: #ddd0ff; border-radius: 99px; padding: 2px 7px;
      }
      .adm-hero-tile-desc {
        font-size: 11px; color: #c4b5fd; line-height: 1.4;
        max-height: 48px; overflow: hidden; text-overflow: ellipsis;
        background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px;
      }
      .adm-hero-kit-box {
        background: rgba(10, 6, 22, 0.7);
        border: 1px solid rgba(140, 100, 255, 0.2); border-radius: 8px;
        padding: 8px 10px; display: flex; flex-direction: column; gap: 5px;
      }
      .adm-hero-kit-title {
        font-size: 10px; font-weight: 800; color: #ffd066; text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .adm-hero-kit-item {
        font-size: 11px; color: #e9d5ff; display: flex; align-items: center; gap: 6px;
      }
      .adm-hero-kit-item.signature { color: #fde047; font-weight: 700; }
      .adm-hero-kit-item .badge {
        font-size: 9px; padding: 1px 5px; border-radius: 4px; font-weight: 800;
      }
      .adm-hero-kit-item.signature .badge { background: rgba(234,179,8,0.25); color: #fde047; border: 1px solid #facc15; }
      .adm-hero-kit-item.core .badge { background: rgba(140,100,255,0.2); color: #c4b5fd; border: 1px solid rgba(140,100,255,0.4); }
      .adm-hero-kit-item .cost { margin-left: auto; font-size: 10px; color: #a78bfa; }
      .adm-hero-kit-cores { display: flex; flex-direction: column; gap: 3px; }
      .adm-hero-tile-actions { display: flex; gap: 8px; margin-top: auto; }
      .adm-btn-edit-hero {
        flex: 1; background: rgba(140,100,255,0.15); border: 1px solid rgba(140,100,255,0.3);
        color: #d8c8ff; border-radius: 8px; padding: 7px; font-size: 12px; font-weight: 700;
        cursor: pointer; transition: all 0.15s;
      }
      .adm-btn-edit-hero:hover { background: rgba(140,100,255,0.35); color: #fff; }
      .adm-btn-del-hero {
        background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
        color: #fca5a5; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all 0.15s;
      }
      .adm-btn-del-hero:hover { background: rgba(239,68,68,0.25); color: #fee2e2; }

      /* ─── Modals ─────────────────────────────────────────── */
      .adm-modal {
        position: absolute; inset: 0; z-index: 10;
        background: rgba(4, 2, 14, 0.85); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.2s ease; padding: 20px;
      }
      .adm-modal-inner {
        width: 100%; max-width: 780px; max-height: 88vh;
        background: linear-gradient(160deg, #181035, #0d0822);
        border: 1px solid rgba(160, 100, 255, 0.35);
        border-radius: 18px; overflow: hidden; display: flex; flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(120,60,255,0.25);
      }
      .adm-modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 24px 14px; border-bottom: 1px solid rgba(140,100,255,0.18); flex-shrink: 0;
      }
      .adm-modal-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 18px; font-weight: 700; color: #fff;
      }
      .adm-btn-close-modal {
        background: none; border: none; color: rgba(255,255,255,0.5); font-size: 18px;
        cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: color 0.15s;
      }
      .adm-btn-close-modal:hover { color: #fff; background: rgba(255,255,255,0.08); }
      .adm-modal-body {
        padding: 20px 24px; overflow-y: auto; display: flex; gap: 24px; flex: 1;
      }

      /* ─── Editor Left (Image/Avatar) ─────────────────────── */
      .adm-editor-left { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
      .adm-img-preview {
        width: 100%; height: 230px; border-radius: 12px;
        border: 2px dashed rgba(140,100,255,0.3); background: rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        overflow: hidden; cursor: pointer; transition: border-color 0.2s; position: relative;
      }
      .adm-img-preview.dragover { border-color: #a78bfa; background: rgba(140,100,255,0.1); }
      .adm-img-preview.has-image { border-style: solid; border-color: rgba(140,100,255,0.4); }
      .adm-img-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
      .adm-img-icon { font-size: 32px; opacity: 0.4; }
      .adm-img-hint { font-size: 11px; color: rgba(180,160,255,0.5); line-height: 1.3; }
      .adm-img-el { width: 100%; height: 100%; object-fit: cover; }
      .adm-btn-upload {
        background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.35);
        color: #c4b5fd; font-size: 12px; font-weight: 600; padding: 8px; border-radius: 8px;
        cursor: pointer; transition: background 0.15s;
      }
      .adm-btn-upload:hover { background: rgba(124,58,237,0.28); }
      .adm-img-label { font-size: 10px; color: rgba(180,160,255,0.5); text-align: center; }

      .adm-hero-avatar-preview {
        width: 140px; height: 140px; border-radius: 50%;
        margin: 0 auto 6px;
        background: radial-gradient(circle at 35% 35%, #3a1e6c, #160c2e);
        border: 3px solid #a855f7; display: flex; align-items: center; justify-content: center;
        overflow: hidden; box-shadow: 0 0 25px rgba(168,85,247,0.4);
      }
      .adm-emoji-picker {
        display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 4px;
      }
      .adm-emoji-btn {
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px; font-size: 18px; width: 34px; height: 34px;
        cursor: pointer; transition: all 0.15s;
      }
      .adm-emoji-btn:hover { background: rgba(168,85,247,0.3); transform: scale(1.15); }

      /* ─── Editor Right (Fields) ──────────────────────────── */
      .adm-editor-right { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .adm-row { display: flex; flex-direction: column; gap: 5px; }
      .adm-row--2col { flex-direction: row; gap: 12px; }
      .adm-row--2col > div { flex: 1; display: flex; flex-direction: column; gap: 5px; }
      .adm-row--3col { flex-direction: row; gap: 8px; }
      .adm-row--3col > div { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .adm-label {
        font-size: 11px; font-weight: 700; color: rgba(180,160,255,0.7);
        letter-spacing: 0.05em; text-transform: uppercase;
      }
      .adm-readonly { font-weight: 400; opacity: 0.6; }
      .adm-field {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(140,100,255,0.22);
        border-radius: 8px; padding: 8px 12px; color: #e2d9ff; font-size: 13px;
        outline: none; transition: border-color 0.2s; width: 100%; box-sizing: border-box;
        font-family: inherit;
      }
      .adm-field:focus { border-color: rgba(160,120,255,0.55); }
      .adm-field--mono { font-family: monospace; font-size: 11px; color: rgba(180,160,255,0.6); }
      .adm-field[readonly] { opacity: 0.6; cursor: not-allowed; }
      .adm-textarea { resize: vertical; min-height: 60px; }
      select.adm-field option { background: #12082a; color: #fff; }
      optgroup { background: #0c061e; color: #ffd066; font-weight: 700; }
      .adm-kw-grid { display: flex; flex-wrap: wrap; gap: 6px; }
      .adm-kw-chip {
        display: flex; align-items: center; gap: 5px;
        background: rgba(140,100,255,0.08); border: 1px solid rgba(140,100,255,0.2);
        border-radius: 99px; padding: 4px 10px; font-size: 11px; font-weight: 600;
        color: rgba(200,180,255,0.75); cursor: pointer; transition: all 0.15s;
        user-select: none;
      }
      .adm-kw-chip:has(input:checked) {
        background: rgba(140,100,255,0.25); border-color: rgba(160,120,255,0.5); color: #d8c8ff;
      }
      .adm-kw-chip input { width: 0; height: 0; opacity: 0; margin: 0; }
      .adm-updated { font-size: 10px; color: rgba(160,140,200,0.45); margin-top: auto; }

      /* Hero SP Kit Config Section */
      .adm-hero-sp-config {
        background: rgba(0,0,0,0.35); border: 1px solid rgba(168,85,247,0.3);
        border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
        margin-top: 4px;
      }
      .adm-hero-sp-header {
        font-size: 11px; font-weight: 800; color: #ffd066; text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .adm-sp-select-row { display: flex; flex-direction: column; gap: 4px; }
      .adm-sp-desc-preview {
        font-size: 10px; color: #c4b5fd; font-style: italic; min-height: 28px;
        max-height: 40px; overflow: hidden; line-height: 1.35; padding: 3px 6px;
        background: rgba(255,255,255,0.02); border-radius: 6px;
      }

      /* ─── Footer ─────────────────────────────────────────── */
      .adm-modal-footer {
        display: flex; align-items: center; justify-content: flex-end; gap: 10px;
        padding: 14px 24px 18px; border-top: 1px solid rgba(140,100,255,0.15); flex-shrink: 0;
      }
      .adm-btn-cancel {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(140,100,255,0.2);
        color: rgba(200,180,255,0.65); font-size: 13px; font-weight: 600;
        padding: 9px 22px; border-radius: 10px; cursor: pointer; transition: background 0.15s;
      }
      .adm-btn-cancel:hover { background: rgba(140,100,255,0.1); }
      .adm-btn-publish {
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        border: none; color: #fff; font-size: 14px; font-weight: 700;
        padding: 10px 28px; border-radius: 10px; cursor: pointer;
        box-shadow: 0 4px 20px rgba(100,60,255,0.45);
        transition: transform 0.1s, box-shadow 0.2s;
      }
      .adm-btn-publish:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(100,60,255,0.6); }
      .adm-btn-publish:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

      /* ─── Toast ──────────────────────────────────────────── */
      .adm-toast {
        position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(12px);
        background: rgba(74,222,128,0.15); border: 1px solid rgba(74,222,128,0.4);
        color: #4ade80; font-size: 13px; font-weight: 600;
        padding: 10px 24px; border-radius: 99px;
        opacity: 0; transition: opacity 0.3s, transform 0.3s; pointer-events: none;
        white-space: nowrap; z-index: 100;
      }
      .adm-toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;
    document.head.appendChild(s);
  }
}

// ─────────────────────────────────────────────────────────────
//  Auto-mount singleton
// ─────────────────────────────────────────────────────────────

let _adminView: AdminCardView | null = null;

export function getAdminView(): AdminCardView {
  if (!_adminView) _adminView = new AdminCardView();
  return _adminView;
}
