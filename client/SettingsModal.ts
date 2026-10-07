// ============================================================
//  client/SettingsModal.ts — Game Settings & Preferences Modal
// ============================================================

import gsap from "gsap";
import { audioManager, AudioSettings } from "./AudioManager";

export type GraphicsQuality = "HIGH" | "LOW";

export interface SettingsState {
  graphics: GraphicsQuality;
  audio: AudioSettings;
}

const STORAGE_KEY = "tll_timeslayer_graphics_settings";

export class SettingsModal {
  private overlay!: HTMLElement;
  private state: SettingsState;
  private onGraphicsChange?: (quality: GraphicsQuality) => void;
  private onCloseCallback?: () => void;

  constructor(onGraphicsChange?: (quality: GraphicsQuality) => void) {
    this.onGraphicsChange = onGraphicsChange;
    this.state = {
      graphics: this.loadGraphicsSettings(),
      audio: audioManager.getSettings(),
    };
    this.injectStyles();
    this.buildUI();
    this.bindEvents();
  }

  private onCloseCallback?: () => void;
  private keydownListener?: (e: KeyboardEvent) => void;

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

  public getGraphicsQuality(): GraphicsQuality {
    return this.state.graphics;
  }

  public show(onClose?: () => void): void {
    this.setupListeners();
    this.onCloseCallback = onClose;
    audioManager.playClick();
    this.overlay.style.display = "flex";
    this.overlay.classList.add("visible");
    const card = this.overlay.querySelector(".settings-card");
    if (card) {
      gsap.killTweensOf(card);
      gsap.fromTo(
        card,
        { opacity: 0, scale: 0.92, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.4)" },
      );
    }
  }

  public hide(triggerCallback: boolean = true): void {
    this.removeListeners();
    const cb = this.onCloseCallback;
    this.onCloseCallback = undefined;

    const card = this.overlay.querySelector(".settings-card");
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
        scale: 0.95,
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

  private loadGraphicsSettings(): GraphicsQuality {
    try {
      const q = localStorage.getItem(STORAGE_KEY);
      if (q === "LOW" || q === "HIGH") return q;
    } catch {
      // fallback
    }
    return "HIGH";
  }

  private saveGraphicsSettings(q: GraphicsQuality): void {
    try {
      localStorage.setItem(STORAGE_KEY, q);
    } catch {
      // ignore
    }
  }

  // ── CSS Injection ───────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById("settings-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "settings-modal-styles";
    style.textContent = `
      #settings-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at 50% 25%, rgba(18, 12, 38, 0.95), rgba(4, 3, 14, 0.99));
        backdrop-filter: blur(24px);
        z-index: 300;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        user-select: none;
        box-sizing: border-box;
      }
      #settings-overlay.visible {
        display: flex;
      }
      .settings-card {
        background: linear-gradient(165deg, rgba(28, 20, 58, 0.95), rgba(12, 8, 28, 0.98));
        border: 2px solid rgba(140, 100, 255, 0.4);
        border-radius: 24px;
        width: 100%;
        max-width: 580px;
        padding: 32px 36px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(120, 80, 255, 0.25);
        display: flex;
        flex-direction: column;
        gap: 22px;
        position: relative;
      }
      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(140, 100, 255, 0.2);
        padding-bottom: 14px;
      }
      .settings-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 24px;
        font-weight: 800;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 10px;
        text-shadow: 0 0 16px rgba(160, 120, 255, 0.4);
      }
      .settings-close-btn {
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
      .settings-close-btn:hover {
        background: rgba(239, 68, 68, 0.25);
        border-color: #ef4444;
        color: #ffffff;
      }
      .settings-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .settings-group-label {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        color: #ffd066;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .settings-pill-row {
        display: flex;
        gap: 10px;
      }
      .settings-pill-btn {
        flex: 1;
        padding: 10px 16px;
        border-radius: 12px;
        border: 1.5px solid rgba(140, 100, 255, 0.3);
        background: rgba(15, 10, 35, 0.6);
        color: #a594c9;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .settings-pill-btn:hover {
        border-color: rgba(160, 120, 255, 0.6);
        color: #ffffff;
      }
      .settings-pill-btn.active {
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        border-color: #a78bfa;
        color: #ffffff;
        box-shadow: 0 4px 16px rgba(124, 58, 237, 0.5);
      }
      .settings-slider-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        background: rgba(14, 10, 32, 0.6);
        border: 1px solid rgba(140, 100, 255, 0.2);
        padding: 10px 16px;
        border-radius: 12px;
      }
      .settings-slider-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #e2e8f0;
        min-width: 140px;
      }
      .settings-slider {
        flex: 1;
        accent-color: #a855f7;
        cursor: pointer;
      }
      .settings-slider-val {
        font-size: 12px;
        font-weight: 800;
        color: #ffd066;
        min-width: 38px;
        text-align: right;
      }
      .settings-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 8px;
      }
      .settings-btn-primary {
        padding: 10px 24px;
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        border: 1px solid rgba(167, 139, 250, 0.6);
        border-radius: 12px;
        color: #ffffff;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.05em;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(124, 58, 237, 0.4);
        transition: all 0.2s;
      }
      .settings-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(124, 58, 237, 0.6);
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build UI ─────────────────────────────────────────────────

  private buildUI(): void {
    const overlay = document.createElement("div");
    overlay.id = "settings-overlay";
    const audio = this.state.audio;

    overlay.innerHTML = `
      <div class="settings-card">
        <div class="settings-header">
          <div class="settings-title">⚙️ SETTINGS</div>
          <button class="settings-close-btn" id="btn-close-settings">✕</button>
        </div>

        <!-- Graphics Quality -->
        <div class="settings-group">
          <div class="settings-group-label">🖥️ Graphics &amp; Performance</div>
          <div class="settings-pill-row">
            <button class="settings-pill-btn ${this.state.graphics === "HIGH" ? "active" : ""}" id="btn-gfx-high">
              ✨ High Quality (Full Shadows &amp; Postfx)
            </button>
            <button class="settings-pill-btn ${this.state.graphics === "LOW" ? "active" : ""}" id="btn-gfx-low">
              ⚡ Performance (Smooth FPS)
            </button>
          </div>
        </div>

        <!-- Audio Settings -->
        <div class="settings-group">
          <div class="settings-group-label">🔊 Audio &amp; Sound FX</div>

          <!-- Master Volume -->
          <div class="settings-slider-row">
            <div class="settings-slider-info">
              <span>🎚️ Master</span>
            </div>
            <input type="range" class="settings-slider" id="slider-master-vol" min="0" max="100" value="${Math.round(audio.masterVolume * 100)}" />
            <div class="settings-slider-val" id="val-master-vol">${Math.round(audio.masterVolume * 100)}%</div>
          </div>

          <!-- Sound FX -->
          <div class="settings-slider-row">
            <div class="settings-slider-info">
              <span>🔔 Sound FX</span>
            </div>
            <input type="range" class="settings-slider" id="slider-sfx-vol" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}" />
            <div class="settings-slider-val" id="val-sfx-vol">${Math.round(audio.sfxVolume * 100)}%</div>
          </div>

          <!-- BGM -->
          <div class="settings-slider-row">
            <div class="settings-slider-info">
              <span>🎵 Music (BGM)</span>
            </div>
            <input type="range" class="settings-slider" id="slider-bgm-vol" min="0" max="100" value="${Math.round(audio.bgmVolume * 100)}" />
            <div class="settings-slider-val" id="val-bgm-vol">${Math.round(audio.bgmVolume * 100)}%</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="settings-footer">
          <button class="settings-btn-primary" id="btn-save-settings">Done &amp; Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  // ── Event Handlers ───────────────────────────────────────────

  private bindEvents(): void {
    const btnClose = this.overlay.querySelector("#btn-close-settings")!;
    const btnDone = this.overlay.querySelector("#btn-save-settings")!;
    const btnHigh = this.overlay.querySelector("#btn-gfx-high")!;
    const btnLow = this.overlay.querySelector("#btn-gfx-low")!;

    const sliderMaster = this.overlay.querySelector("#slider-master-vol") as HTMLInputElement;
    const valMaster = this.overlay.querySelector("#val-master-vol")!;
    const sliderSfx = this.overlay.querySelector("#slider-sfx-vol") as HTMLInputElement;
    const valSfx = this.overlay.querySelector("#val-sfx-vol")!;
    const sliderBgm = this.overlay.querySelector("#slider-bgm-vol") as HTMLInputElement;
    const valBgm = this.overlay.querySelector("#val-bgm-vol")!;

    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide(true);
    });
    btnDone.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide(true);
    });

    // Graphics toggles
    btnHigh.addEventListener("click", () => {
      audioManager.playClick();
      btnHigh.classList.add("active");
      btnLow.classList.remove("active");
      this.state.graphics = "HIGH";
      this.saveGraphicsSettings("HIGH");
      this.onGraphicsChange?.("HIGH");
    });

    btnLow.addEventListener("click", () => {
      audioManager.playClick();
      btnLow.classList.add("active");
      btnHigh.classList.remove("active");
      this.state.graphics = "LOW";
      this.saveGraphicsSettings("LOW");
      this.onGraphicsChange?.("LOW");
    });

    // Sliders
    sliderMaster.addEventListener("input", () => {
      const v = parseInt(sliderMaster.value, 10) / 100;
      valMaster.textContent = `${sliderMaster.value}%`;
      audioManager.updateSettings({ masterVolume: v });
    });

    sliderSfx.addEventListener("input", () => {
      const v = parseInt(sliderSfx.value, 10) / 100;
      valSfx.textContent = `${sliderSfx.value}%`;
      audioManager.updateSettings({ sfxVolume: v });
      audioManager.playHover();
    });

    sliderBgm.addEventListener("input", () => {
      const v = parseInt(sliderBgm.value, 10) / 100;
      valBgm.textContent = `${sliderBgm.value}%`;
      audioManager.updateSettings({ bgmVolume: v });
    });
  }
}
