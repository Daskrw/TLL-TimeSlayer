// ============================================================
//  OverlayController.ts — Full Visual Game Shell & Screen Overlays
//  Includes Mulligan UI, Animated Phase Announcer, Turn Controls,
//  and Victory / Defeat Screen with Match Statistics.
// ============================================================

import gsap from "gsap";
import { CardDefinition, CardType, Hero, PlayerId, TurnPhase } from "../src/types";

export interface MatchStats {
  turnNumber: number;
  playerFinalHp: number;
  oppFinalHp: number;
  unitsDestroyed: number;
  superBlocksTriggered: number;
}

export class OverlayController {
  // Container root
  private uiRoot: HTMLElement;

  // Hero Selection Elements
  private heroSelectionModal!: HTMLElement;
  private heroCardsGrid!: HTMLElement;
  private onHeroSelectCb: ((playerHero: Hero, oppHero: Hero) => void) | null = null;
  private onDifficultyChangeCb: ((difficulty: string) => void) | null = null;

  // Mulligan Elements
  private mulliganModal!: HTMLElement;
  private mulliganCardsGrid!: HTMLElement;
  private mulliganConfirmBtn!: HTMLButtonElement;
  private mulliganSelectedIndices: Set<number> = new Set();
  private currentMulliganCards: CardDefinition[] = [];
  private onMulliganConfirmCb: ((replacedIds: string[]) => void) | null = null;

  // Phase Announcer Elements
  private phaseBanner!: HTMLElement;
  private phaseTitle!: HTMLElement;
  private phaseSubtitle!: HTMLElement;
  private bannerTl: gsap.core.Timeline | null = null;

  // Turn Controls Elements
  private turnControlsContainer!: HTMLElement;
  private btnEndPhase!: HTMLButtonElement;
  private btnCombat!: HTMLButtonElement;
  private phaseStatusPill!: HTMLElement;
  private onEndPhaseCb: (() => void) | null = null;
  private onCombatCb: (() => void) | null = null;

  // Game Over Elements
  private gameOverModal!: HTMLElement;
  private goTitle!: HTMLElement;
  private goSubtitle!: HTMLElement;
  private goStatsContent!: HTMLElement;
  private goPlayAgainBtn!: HTMLButtonElement;
  private goMenuBtn!: HTMLButtonElement;
  private onPlayAgainCb: (() => void) | null = null;
  private onBackToMenuCb: (() => void) | null = null;

  // Waiting / Match Sync Blocking Overlay
  private waitingSyncOverlay!: HTMLElement;
  private waitingSyncTitle!: HTMLElement;
  private waitingSyncSubtitle!: HTMLElement;
  private waitingSyncSpinner!: HTMLElement;

  constructor() {
    this.uiRoot = document.getElementById("ui-overlay") || document.body;
    this.injectStyles();
    this.buildHeroSelectionUI();
    this.buildMulliganUI();
    this.buildPhaseAnnouncer();
    this.buildTurnControls();
    this.buildGameOverScreen();
    this.buildWaitingSyncUI();
  }

  // ── CSS Injection ───────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById("overlay-shell-styles")) return;
    const style = document.createElement("style");
    style.id = "overlay-shell-styles";
    style.textContent = `
      /* ─── Hero Selection Screen ──────────────────────────────── */
      #hero-selection-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at 50% 15%, rgba(26, 18, 54, 0.98), rgba(6, 4, 18, 0.99));
        backdrop-filter: blur(24px);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 200;
        pointer-events: all;
        user-select: none;
        padding: 16px 24px;
        box-sizing: border-box;
        opacity: 0;
        transition: opacity 0.35s ease;
        overflow-y: auto;
        overflow-x: hidden;
      }
      #hero-selection-overlay.visible {
        display: flex;
        opacity: 1;
      }
      .hs-header {
        text-align: center;
        margin-bottom: 14px;
        flex-shrink: 0;
      }
      .hs-badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #ffd066;
        background: rgba(255, 208, 102, 0.12);
        border: 1px solid rgba(255, 208, 102, 0.35);
        padding: 4px 16px;
        border-radius: 99px;
        margin-bottom: 6px;
        box-shadow: 0 0 16px rgba(255, 208, 102, 0.2);
      }
      .hs-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 28px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 0 0 24px rgba(180, 140, 255, 0.6), 0 0 40px rgba(120, 80, 255, 0.3);
        margin-bottom: 4px;
        letter-spacing: 0.08em;
      }
      .hs-subtitle {
        color: #c4b9e8;
        font-size: 13px;
        max-width: 680px;
        line-height: 1.4;
        margin: 0 auto;
      }
      .hs-btn-back {
        position: absolute;
        top: 24px;
        left: 32px;
        z-index: 50;
        pointer-events: auto !important;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(18, 14, 38, 0.75);
        border: 1px solid rgba(160, 100, 255, 0.4);
        color: #d8c8ff;
        padding: 8px 18px;
        border-radius: 99px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        backdrop-filter: blur(8px);
        transition: all 0.2s ease;
      }
      .hs-btn-back:hover {
        background: rgba(160, 100, 255, 0.25);
        border-color: #c084fc;
        color: #ffffff;
        transform: translateX(-3px);
      }
      .hs-btn-close {
        position: absolute;
        top: 24px;
        right: 32px;
        z-index: 50;
        pointer-events: auto !important;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(18, 14, 38, 0.75);
        border: 1px solid rgba(160, 100, 255, 0.4);
        color: #d8c8ff;
        border-radius: 50%;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        backdrop-filter: blur(8px);
        transition: all 0.2s ease;
      }
      .hs-btn-close:hover {
        background: rgba(239, 68, 68, 0.25);
        border-color: #f87171;
        color: #ffffff;
        transform: scale(1.08);
      }
      .hs-cards-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 16px;
        width: 100%;
        max-width: 1360px;
        align-items: stretch;
        justify-content: center;
        margin: 0 auto;
        flex-shrink: 1;
        position: relative;
        z-index: 10;
        pointer-events: auto !important;
      }
      .hs-hero-card {
        background: linear-gradient(165deg, rgba(26, 19, 50, 0.92) 0%, rgba(10, 7, 24, 0.98) 100%);
        border: 1.5px solid rgba(140, 100, 255, 0.35);
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(120, 80, 255, 0.12);
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
        position: relative;
        overflow: hidden;
        pointer-events: auto !important;
      }
      .hs-hero-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, transparent, var(--hero-accent, #a855f7), transparent);
        opacity: 0.8;
      }
      .hs-hero-card:hover {
        transform: translateY(-4px);
        border-color: var(--hero-accent, rgba(180, 140, 255, 0.8));
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 28px var(--hero-glow, rgba(160, 120, 255, 0.3));
      }
      .hs-hero-card.hero-sky {
        --hero-accent: #38bdf8;
        --hero-glow: rgba(56, 189, 248, 0.35);
        --hero-btn-bg: linear-gradient(135deg, #0284c7, #2563eb);
      }
      .hs-hero-card.hero-abyss {
        --hero-accent: #06b6d4;
        --hero-glow: rgba(6, 182, 212, 0.35);
        --hero-btn-bg: linear-gradient(135deg, #0d9488, #0284c7);
      }
      .hs-hero-card.hero-solar {
        --hero-accent: #f59e0b;
        --hero-glow: rgba(245, 158, 11, 0.35);
        --hero-btn-bg: linear-gradient(135deg, #d97706, #b45309);
      }
      .hs-hero-card.hero-brainz {
        --hero-accent: #c084fc;
        --hero-glow: rgba(192, 132, 252, 0.35);
        --hero-btn-bg: linear-gradient(135deg, #9333ea, #7e22ce);
      }
      .hs-hero-card.hero-custom {
        --hero-accent: #a855f7;
        --hero-glow: rgba(168, 85, 247, 0.35);
        --hero-btn-bg: linear-gradient(135deg, #7c3aed, #5b21b6);
      }
      .hs-hero-top {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .hs-hero-avatar {
        width: 58px;
        height: 58px;
        border-radius: 50%;
        background: linear-gradient(135deg, #2a184c, #140b28);
        border: 2px solid var(--hero-accent, #a87ffb);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        box-shadow: 0 0 16px var(--hero-glow, rgba(168, 127, 251, 0.4));
        flex-shrink: 0;
      }
      .hs-hero-info {
        flex: 1;
        min-width: 0;
      }
      .hs-hero-name {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 19px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-hero-title {
        font-size: 11px;
        font-weight: 800;
        color: var(--hero-accent, #ffd066);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 11px;
      }
      .hs-pill {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 1px 8px;
        border-radius: 99px;
        color: #d1c7f5;
        font-weight: 600;
        white-space: nowrap;
      }
      .hs-pill.hp {
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.35);
        color: #fca5a5;
      }
      .hs-hero-lore {
        font-size: 11.5px;
        color: #b8acdd;
        line-height: 1.35;
        background: rgba(0, 0, 0, 0.32);
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        height: 32px;
      }
      .hs-sp-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .hs-sp-section-title {
        font-size: 10.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #9d8ec7;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .hs-sp-chips {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
      }
      .hs-sp-chip {
        background: rgba(18, 12, 38, 0.9);
        border: 1px solid rgba(140, 100, 255, 0.25);
        border-radius: 6px;
        padding: 5px 3px;
        text-align: center;
        font-size: 10.5px;
        font-weight: 700;
        color: #cbd5e1;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: none;
      }
      .hs-sp-chip:hover {
        background: rgba(36, 24, 72, 0.95);
        border-color: var(--hero-accent, #c084fc);
        color: #ffffff;
      }
      .hs-sp-chip.active {
        background: linear-gradient(135deg, rgba(58, 38, 100, 0.95), rgba(28, 18, 54, 0.95));
        border-color: var(--hero-accent, #c084fc);
        color: #ffffff;
        box-shadow: 0 0 10px var(--hero-glow, rgba(160, 120, 255, 0.4));
      }
      .hs-sp-chip.sig-chip {
        border-color: rgba(255, 208, 102, 0.45);
        color: #fde68a;
      }
      .hs-sp-chip.sig-chip.active {
        background: linear-gradient(135deg, rgba(65, 45, 15, 0.95), rgba(35, 22, 5, 0.98));
        border-color: #ffd066;
        color: #ffd066;
        box-shadow: 0 0 10px rgba(255, 208, 102, 0.45);
      }
      .hs-sp-preview-box {
        background: rgba(12, 8, 28, 0.85);
        border: 1px solid rgba(140, 100, 255, 0.3);
        border-radius: 8px;
        padding: 8px 10px;
        min-height: 82px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 4px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .hs-sp-preview-box.sig-active {
        border-color: rgba(255, 208, 102, 0.6);
        background: linear-gradient(145deg, rgba(28, 20, 10, 0.85), rgba(12, 8, 28, 0.95));
      }
      .hs-sp-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .hs-sp-item-name {
        font-weight: 700;
        font-size: 12.5px;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hs-sp-badge {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 1px 6px;
        border-radius: 99px;
      }
      .hs-sp-badge.sig {
        background: #ffd066;
        color: #1a1002;
      }
      .hs-sp-badge.core {
        background: rgba(160, 120, 255, 0.25);
        color: #d8c2ff;
        border: 1px solid rgba(160, 120, 255, 0.4);
      }
      .hs-sp-cost {
        font-size: 10.5px;
        font-weight: 800;
        color: #8cd6ff;
        background: rgba(80, 180, 255, 0.15);
        padding: 1px 5px;
        border-radius: 5px;
      }
      .hs-sp-desc {
        font-size: 11px;
        color: #b5a8de;
        line-height: 1.35;
      }
      .hs-btn-select {
        margin-top: auto;
        padding: 11px 16px;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        pointer-events: auto !important;
        color: #ffffff;
        background: var(--hero-btn-bg, linear-gradient(135deg, #7c3aed, #5b21b6));
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px var(--hero-glow, rgba(124, 58, 237, 0.3));
        transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .hs-btn-select:hover {
        transform: translateY(-2px);
        filter: brightness(1.15);
        box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5), 0 0 20px var(--hero-glow, rgba(124, 58, 237, 0.5));
      }
      .hs-btn-select:active {
        transform: translateY(0);
      }

      /* ─── Mulligan Modal ─────────────────────────────────────── */
      #mulligan-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at center, rgba(14, 10, 30, 0.94), rgba(4, 2, 12, 0.98));
        backdrop-filter: blur(16px);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        pointer-events: all;
        user-select: none;
        padding: 24px;
        opacity: 0;
        transition: opacity 0.35s ease;
      }
      #mulligan-overlay.visible {
        display: flex !important;
        opacity: 1 !important;
        pointer-events: all !important;
      }
      .mul-header {
        text-align: center;
        margin-bottom: 28px;
      }
      .mul-badge {
        display: inline-block;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #8cd6ff;
        background: rgba(80, 180, 255, 0.14);
        border: 1px solid rgba(100, 200, 255, 0.4);
        padding: 5px 18px;
        border-radius: 99px;
        margin-bottom: 10px;
        box-shadow: 0 0 16px rgba(80, 180, 255, 0.3);
      }
      .mul-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 38px;
        font-weight: 700;
        color: #ffffff;
        text-shadow: 0 0 24px rgba(160, 210, 255, 0.6);
        margin-bottom: 8px;
      }
      .mul-subtitle {
        color: #c0b8e6;
        font-size: 15px;
        max-width: 520px;
        margin: 0 auto;
      }
      .mul-cards-container {
        display: flex;
        gap: 20px;
        margin-bottom: 32px;
        flex-wrap: wrap;
        justify-content: center;
        max-width: 1100px;
      }
      .mul-card-frame {
        width: 210px;
        height: 310px;
        background: linear-gradient(150deg, #181232, #0b0718);
        border: 2px solid rgba(160, 120, 255, 0.4);
        border-radius: 16px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        position: relative;
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.2s, box-shadow 0.2s;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      }
      .mul-card-frame:hover {
        transform: translateY(-8px) scale(1.03);
        border-color: rgba(200, 160, 255, 0.85);
        box-shadow: 0 12px 32px rgba(140, 90, 255, 0.35);
      }
      .mul-card-frame.replace-selected {
        border-color: #ff4444 !important;
        box-shadow: 0 0 30px rgba(255, 50, 50, 0.6), inset 0 0 20px rgba(255, 0, 0, 0.3) !important;
        transform: translateY(-4px) scale(0.98);
        filter: brightness(0.75);
      }
      .mul-card-replace-overlay {
        position: absolute;
        inset: 0;
        background: rgba(40, 0, 0, 0.6);
        border-radius: 14px;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        z-index: 10;
        backdrop-filter: blur(2px);
        pointer-events: none;
      }
      .mul-card-frame.replace-selected .mul-card-replace-overlay {
        display: flex;
        animation: cross-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes cross-pop {
        from { transform: scale(0.7); opacity: 0; }
        to   { transform: scale(1);   opacity: 1; }
      }
      .mul-cross-icon {
        font-size: 54px;
        color: #ff3333;
        text-shadow: 0 0 16px #ff0000;
      }
      .mul-cross-label {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.12em;
        color: #ffaaaa;
        text-transform: uppercase;
        background: rgba(255, 0, 0, 0.35);
        padding: 4px 12px;
        border-radius: 99px;
        border: 1px solid rgba(255, 60, 60, 0.6);
      }
      .mul-top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .mul-cost {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1e60cc, #0a2558);
        border: 1.5px solid #5aa5ff;
        color: #fff;
        font-weight: 800;
        font-size: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 10px rgba(80, 160, 255, 0.5);
      }
      .mul-tribe {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 2px 8px;
        border-radius: 99px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ddd0ff;
      }
      .mul-art {
        height: 100px;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 48px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .mul-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .mul-card-name {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 14px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mul-card-desc {
        font-size: 11px;
        color: #bfaee6;
        line-height: 1.35;
        height: 42px;
        overflow: hidden;
      }
      .mul-stats {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        font-weight: 800;
      }
      .mul-btn-confirm {
        padding: 14px 44px;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        border-radius: 99px;
        background: linear-gradient(135deg, #7c3aed, #4c1d95);
        color: #ffffff;
        border: 2px solid #a78bfa;
        cursor: pointer;
        box-shadow: 0 4px 24px rgba(124, 58, 237, 0.5), 0 0 20px rgba(167, 139, 250, 0.35);
        transition: all 0.22s ease;
      }
      .mul-btn-confirm:hover {
        background: linear-gradient(135deg, #8b5cf6, #5b21b6);
        border-color: #c4b5fd;
        box-shadow: 0 6px 30px rgba(139, 92, 246, 0.7), 0 0 30px rgba(196, 181, 253, 0.5);
        transform: translateY(-2px) scale(1.03);
      }

      /* ─── Animated Phase Announcer Banner (Cinematic Ribbon) ─ */
      #phase-announcer {
        position: fixed;
        left: 50%;
        top: 38%;
        transform: translate(-50%, -50%);
        width: 100%;
        max-width: 860px;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 120;
      }
      .pa-ribbon {
        width: 100%;
        padding: 26px 48px;
        background: linear-gradient(90deg, rgba(6, 4, 16, 0) 0%, rgba(18, 10, 42, 0.96) 18%, rgba(28, 14, 62, 0.98) 50%, rgba(18, 10, 42, 0.96) 82%, rgba(6, 4, 16, 0) 100%);
        border-top: 2.5px solid;
        border-bottom: 2.5px solid;
        border-image: linear-gradient(90deg, transparent 5%, var(--pa-color, #a78bfa) 50%, transparent 95%) 1;
        backdrop-filter: blur(20px);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 50px var(--pa-glow, rgba(140, 80, 255, 0.45)), inset 0 0 30px rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 4px;
        position: relative;
      }
      .pa-crest {
        font-size: 32px;
        margin-bottom: -4px;
        filter: drop-shadow(0 0 16px var(--pa-color, #ffd066));
      }
      .pa-badge {
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: var(--pa-color, #ffd066);
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid var(--pa-color, rgba(255, 208, 102, 0.4));
        padding: 3px 18px;
        border-radius: 99px;
        box-shadow: 0 0 16px var(--pa-glow, rgba(255, 208, 102, 0.3));
        margin-bottom: 2px;
      }
      .pa-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 44px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #ffffff;
        text-shadow: 0 0 28px var(--pa-color, #a78bfa), 0 0 50px var(--pa-glow, rgba(167, 139, 250, 0.5));
        line-height: 1.1;
      }
      .pa-subtitle {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #e2d9ff;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
      }

      /* Theme specific colors */
      .pa-theme-player {
        --pa-color: #38bdf8;
        --pa-glow: rgba(56, 189, 248, 0.6);
      }
      .pa-theme-opponent {
        --pa-color: #f87171;
        --pa-glow: rgba(239, 68, 68, 0.6);
      }
      .pa-theme-spell-player {
        --pa-color: #c084fc;
        --pa-glow: rgba(192, 132, 252, 0.6);
      }
      .pa-theme-spell-opp {
        --pa-color: #e879f9;
        --pa-glow: rgba(232, 121, 249, 0.6);
      }
      .pa-theme-combat {
        --pa-color: #fbbf24;
        --pa-glow: rgba(245, 158, 11, 0.7);
      }
      .pa-theme-neutral {
        --pa-color: #34d399;
        --pa-glow: rgba(52, 211, 153, 0.6);
      }

      /* ─── Tactile Turn Controls (Bottom-Right Command Dial) ── */
      #turn-controls-shell {
        position: fixed;
        right: 32px;
        bottom: 28px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
        z-index: 60;
        pointer-events: all;
      }
      .tc-phase-pill {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        padding: 5px 18px;
        border-radius: 99px;
        background: linear-gradient(180deg, rgba(22, 14, 48, 0.94) 0%, rgba(10, 6, 24, 0.98) 100%);
        border: 1.5px solid rgba(167, 139, 250, 0.45);
        color: #d8c8ff;
        backdrop-filter: blur(14px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .tc-btn-pass {
        position: relative;
        padding: 16px 36px;
        min-width: 200px;
        border-radius: 99px;
        border: 2.5px solid #38bdf8;
        background: linear-gradient(180deg, rgba(14, 44, 88, 0.98) 0%, rgba(6, 22, 48, 0.98) 100%);
        color: #ffffff;
        cursor: pointer;
        backdrop-filter: blur(16px);
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.7), 0 0 24px rgba(56, 189, 248, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.4);
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        animation: tc-active-breath 2.2s infinite ease-in-out;
      }
      @keyframes tc-active-breath {
        0%, 100% { box-shadow: 0 10px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(56, 189, 248, 0.4); }
        50%      { box-shadow: 0 12px 38px rgba(0, 0, 0, 0.8), 0 0 32px rgba(56, 189, 248, 0.75); }
      }
      .tc-btn-pass:hover:not(:disabled) {
        background: linear-gradient(180deg, rgba(20, 65, 130, 0.98) 0%, rgba(10, 35, 75, 0.98) 100%);
        border-color: #bae6fd;
        color: #ffffff;
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 14px 40px rgba(56, 189, 248, 0.6), 0 0 32px rgba(186, 230, 253, 0.7);
      }
      .tc-btn-pass:active:not(:disabled) {
        transform: translateY(4px) scale(0.94);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.9), inset 0 3px 8px rgba(0, 0, 0, 0.8);
      }
      .tc-btn-pass:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: linear-gradient(180deg, rgba(30, 25, 45, 0.95) 0%, rgba(16, 12, 26, 0.98) 100%);
        border-color: rgba(148, 163, 184, 0.4);
        color: #94a3b8;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
        animation: none;
        transform: none;
      }
      .tc-btn-combat {
        position: relative;
        padding: 16px 36px;
        min-width: 200px;
        border-radius: 99px;
        border: 2.5px solid #fbbf24;
        background: linear-gradient(180deg, rgba(160, 90, 10, 0.98) 0%, rgba(85, 45, 5, 0.98) 100%);
        color: #fef08a;
        font-size: 15px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
        backdrop-filter: blur(16px);
        box-shadow: 0 10px 34px rgba(0, 0, 0, 0.7), 0 0 28px rgba(245, 158, 11, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.4);
        animation: pulse-combat-btn 1.6s infinite ease-in-out;
        display: none;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes pulse-combat-btn {
        0%, 100% { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.5); }
        50%      { box-shadow: 0 12px 42px rgba(245, 158, 11, 0.8), 0 0 38px rgba(253, 224, 71, 0.85); }
      }
      .tc-btn-combat:hover:not(:disabled) {
        background: linear-gradient(180deg, rgba(215, 125, 15, 0.98) 0%, rgba(120, 60, 5, 0.98) 100%);
        border-color: #fef08a;
        color: #ffffff;
        transform: translateY(-2px) scale(1.04);
      }
      .tc-btn-combat:active:not(:disabled) {
        transform: translateY(4px) scale(0.94);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.9), inset 0 3px 8px rgba(0, 0, 0, 0.8);
      }
      .tc-btn-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-weight: 900;
        font-size: 14px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .tc-btn-icon {
        font-size: 18px;
        filter: drop-shadow(0 0 6px currentColor);
      }

      /* ─── Game Over Screen ───────────────────────────────────── */
      #game-over-modal {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at center, rgba(12, 8, 26, 0.96), rgba(2, 1, 8, 0.99));
        backdrop-filter: blur(18px);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 200;
        pointer-events: all;
        opacity: 0;
        transition: opacity 0.4s ease;
      }
      #game-over-modal.visible {
        display: flex;
        opacity: 1;
      }
      .go-container {
        width: 480px;
        background: linear-gradient(160deg, rgba(28, 18, 55, 0.95), rgba(12, 8, 28, 0.98));
        border: 2px solid rgba(168, 85, 247, 0.5);
        border-radius: 24px;
        padding: 36px 30px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(140, 80, 255, 0.35);
      }
      .go-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 52px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        line-height: 1.1;
      }
      .go-title.win {
        color: #facc15;
        text-shadow: 0 0 32px #eab308, 0 0 60px rgba(234, 179, 8, 0.4);
      }
      .go-title.lose {
        color: #ef4444;
        text-shadow: 0 0 32px #dc2626, 0 0 60px rgba(220, 38, 38, 0.4);
      }
      .go-title.draw {
        color: #93c5fd;
        text-shadow: 0 0 32px #3b82f6;
      }
      .go-subtitle {
        color: #c4b5fd;
        font-size: 15px;
      }
      .go-stats-card {
        width: 100%;
        background: rgba(0, 0, 0, 0.45);
        border-radius: 14px;
        padding: 16px 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .go-stat-row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        color: #d1d5db;
      }
      .go-stat-val {
        font-weight: 800;
        color: #ffffff;
      }
      .go-btn-play {
        width: 100%;
        padding: 15px;
        border-radius: 99px;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 2px solid #fbbf24;
        background: linear-gradient(135deg, #b45309, #78350f);
        color: #fffbeb;
        cursor: pointer;
        box-shadow: 0 6px 24px rgba(180, 83, 9, 0.6);
        transition: all 0.2s ease;
      }
      .go-btn-play:hover {
        background: linear-gradient(135deg, #d97706, #92400e);
        border-color: #fde68a;
        transform: translateY(-2px) scale(1.02);
      }
      .go-btn-menu {
        padding: 15px;
        border-radius: 99px;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        cursor: pointer;
        background: rgba(30, 22, 54, 0.85);
        border: 2px solid rgba(160, 100, 255, 0.5);
        color: #d8c8ff;
        backdrop-filter: blur(8px);
        transition: all 0.2s ease;
      }
      .go-btn-menu:hover {
        background: rgba(160, 100, 255, 0.3);
        border-color: #c084fc;
        color: #ffffff;
        transform: translateY(-2px) scale(1.02);
      }
      /* ─── Difficulty Selector ────────────────────────────────── */
      .hs-difficulty-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 14px 24px;
        background: rgba(10, 6, 22, 0.65);
        border-top: 1px solid rgba(255,255,255,0.07);
        border-bottom: 1px solid rgba(255,255,255,0.07);
        backdrop-filter: blur(10px);
        flex-shrink: 0;
      }
      .hs-diff-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(200,185,255,0.7);
        margin-right: 6px;
      }
      .hs-diff-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 20px;
        border-radius: 99px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        cursor: pointer;
        border: 2px solid transparent;
        background: rgba(30, 22, 52, 0.8);
        color: rgba(200, 185, 255, 0.75);
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
      }
      .hs-diff-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .hs-diff-btn:hover {
        transform: translateY(-2px) scale(1.04);
      }
      .hs-diff-btn.active-diff {
        color: #ffffff;
        transform: translateY(-1px) scale(1.03);
      }
      /* Easy */
      .hs-diff-btn.diff-easy {
        border-color: rgba(52, 211, 153, 0.35);
      }
      .hs-diff-btn.diff-easy:hover,
      .hs-diff-btn.diff-easy.active-diff {
        background: rgba(6, 78, 59, 0.7);
        border-color: #34d399;
        box-shadow: 0 0 18px rgba(52, 211, 153, 0.45);
        color: #a7f3d0;
      }
      /* Medium */
      .hs-diff-btn.diff-medium {
        border-color: rgba(251, 191, 36, 0.35);
      }
      .hs-diff-btn.diff-medium:hover,
      .hs-diff-btn.diff-medium.active-diff {
        background: rgba(78, 55, 6, 0.7);
        border-color: #fbbf24;
        box-shadow: 0 0 18px rgba(251, 191, 36, 0.45);
        color: #fef3c7;
      }
      /* Hard */
      .hs-diff-btn.diff-hard {
        border-color: rgba(239, 68, 68, 0.35);
      }
      .hs-diff-btn.diff-hard:hover,
      .hs-diff-btn.diff-hard.active-diff {
        background: rgba(78, 6, 6, 0.7);
        border-color: #ef4444;
        box-shadow: 0 0 18px rgba(239, 68, 68, 0.45);
        color: #fecaca;
      }
      .hs-diff-desc {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.05em;
        color: rgba(200, 185, 255, 0.55);
        margin-left: auto;
        padding: 0 8px;
        align-self: center;
        max-width: 280px;
        text-align: right;
        transition: color 0.2s;
      }

      /* ─── Dedicated Waiting & Match Sync Blocking Overlay ─── */
      #waiting-sync-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at 50% 30%, rgba(18, 12, 42, 0.95), rgba(4, 2, 12, 0.99));
        backdrop-filter: blur(28px);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 25000;
        pointer-events: all !important;
        user-select: none;
        padding: 24px;
        opacity: 0;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #waiting-sync-overlay.visible {
        display: flex !important;
        opacity: 1 !important;
        pointer-events: all !important;
      }
      .ws-card {
        background: linear-gradient(160deg, rgba(28, 18, 56, 0.96), rgba(12, 8, 28, 0.98));
        border: 2px solid rgba(160, 120, 255, 0.45);
        border-radius: 24px;
        padding: 40px 48px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 20px;
        max-width: 540px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85), 0 0 50px rgba(140, 80, 255, 0.3);
        position: relative;
        overflow: hidden;
      }
      .ws-card::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(140, 90, 255, 0.12) 0%, transparent 65%);
        animation: ws-rotate-glow 10s linear infinite;
        pointer-events: none;
      }
      @keyframes ws-rotate-glow {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .ws-icon-container {
        position: relative;
        width: 72px;
        height: 72px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ws-spinner-ring {
        position: absolute;
        inset: 0;
        border: 3px solid rgba(160, 120, 255, 0.2);
        border-top-color: #38bdf8;
        border-right-color: #c084fc;
        border-radius: 50%;
        animation: ws-spin 1.2s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite;
        box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
      }
      @keyframes ws-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .ws-center-icon {
        font-size: 30px;
        animation: ws-pulse-icon 2s ease-in-out infinite;
        filter: drop-shadow(0 0 10px rgba(255, 208, 102, 0.6));
      }
      @keyframes ws-pulse-icon {
        0%, 100% { transform: scale(1); opacity: 0.9; }
        50% { transform: scale(1.15); opacity: 1; filter: drop-shadow(0 0 18px rgba(255, 208, 102, 0.9)); }
      }
      .ws-badge {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.35);
        padding: 4px 14px;
        border-radius: 99px;
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.25);
      }
      .ws-title {
        font-family: 'Cinzel Decorative', Georgia, serif;
        font-size: 24px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 0 0 20px rgba(180, 140, 255, 0.5);
        line-height: 1.3;
      }
      .ws-subtitle {
        font-size: 14px;
        color: #c4b8e8;
        line-height: 1.5;
        max-width: 440px;
      }
      .ws-dots {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .ws-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #a855f7;
        box-shadow: 0 0 8px #a855f7;
        animation: ws-dot-bounce 1.4s infinite ease-in-out;
      }
      .ws-dot:nth-child(2) { animation-delay: 0.2s; background: #38bdf8; box-shadow: 0 0 8px #38bdf8; }
      .ws-dot:nth-child(3) { animation-delay: 0.4s; background: #ffd066; box-shadow: 0 0 8px #ffd066; }
      @keyframes ws-dot-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1.2); opacity: 1; }
      }
      .ws-cancel-btn {
        margin-top: 14px;
        padding: 9px 24px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.45);
        border-radius: 99px;
        color: #fca5a5;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.04em;
        cursor: pointer;
        transition: all 0.2s ease;
        z-index: 2;
      }
      .ws-cancel-btn:hover {
        background: rgba(239, 68, 68, 0.35);
        border-color: #ef4444;
        color: #ffffff;
        box-shadow: 0 0 16px rgba(239, 68, 68, 0.5);
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build Hero Selection UI ──────────────────────────────────

  private buildHeroSelectionUI(): void {
    const modal = document.createElement("div");
    modal.id = "hero-selection-overlay";
    modal.innerHTML = `
      <button class="hs-btn-back" id="hs-btn-back">← Return to Main Menu</button>
      <button class="hs-btn-close" id="hs-btn-close" title="Return to Main Menu">✕</button>
      <div class="hs-header">
        <div class="hs-badge">⚔️ Champion Roster</div>
        <div class="hs-title">CHOOSE YOUR HERO</div>
        <div class="hs-subtitle">Select your champion. Each Hero commands 4 exclusive Superpowers drawn via Super-Block.</div>
      </div>
      <div class="hs-difficulty-bar" id="hs-difficulty-bar">
        <span class="hs-diff-label">🤖 Bot Difficulty:</span>
        <button class="hs-diff-btn diff-easy" data-diff="Easy" title="Easy — relaxed, makes mistakes">🟢 Easy</button>
        <button class="hs-diff-btn diff-medium active-diff" data-diff="Medium" title="Medium — balanced heuristic play">🟡 Medium</button>
        <button class="hs-diff-btn diff-hard" data-diff="Hard" title="Hard — aggressive, optimal, relentless">🔴 Hard</button>
        <span class="hs-diff-desc" id="hs-diff-desc">Balanced — the bot plays smart but won't crush you.</span>
      </div>
      <div class="hs-cards-container" id="hs-cards-grid"></div>
    `;
    document.body.appendChild(modal);

    this.heroSelectionModal = modal;
    this.heroCardsGrid = modal.querySelector("#hs-cards-grid") as HTMLElement;

    // ── Difficulty selector logic ─────────────────────────────
    const DIFF_DESCS: Record<string, string> = {
      Easy:   "Relaxed — the bot plays sub-optimally and makes mistakes.",
      Medium: "Balanced — the bot plays smart but won't crush you.",
      Hard:   "Relentless — optimal deck, aggressive play, no mercy.",
    };

    const diffBar = modal.querySelector("#hs-difficulty-bar") as HTMLElement;
    const diffDescEl = modal.querySelector("#hs-diff-desc") as HTMLElement;
    const diffBtns = Array.from(diffBar.querySelectorAll<HTMLButtonElement>(".hs-diff-btn"));

    diffBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const diff = btn.dataset.diff || "Medium";
        diffBtns.forEach((b) => b.classList.remove("active-diff"));
        btn.classList.add("active-diff");
        if (diffDescEl) diffDescEl.textContent = DIFF_DESCS[diff] ?? "";
        this.onDifficultyChangeCb?.(diff);
      });
    });

    const handleExitHeroSelect = (e?: Event) => {
      e?.stopPropagation();
      this.hideHeroSelection();
      if (this.onBackToMenuCb) {
        this.onBackToMenuCb();
      } else if ((window as any).screenController) {
        (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
      }
    };

    const backBtn = modal.querySelector("#hs-btn-back") as HTMLButtonElement;
    backBtn?.addEventListener("click", handleExitHeroSelect);

    const closeBtn = modal.querySelector("#hs-btn-close") as HTMLButtonElement;
    closeBtn?.addEventListener("click", handleExitHeroSelect);
  }

  /** Register a callback that fires when the user changes bot difficulty. */
  public setOnDifficultyChange(cb: (difficulty: string) => void): void {
    this.onDifficultyChangeCb = cb;
  }

  private heroSelectKeydownListener?: (e: KeyboardEvent) => void;

  private setupHeroSelectListeners(): void {
    this.removeHeroSelectListeners();
    this.heroSelectKeydownListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.hideHeroSelection();
        if (this.onBackToMenuCb) {
          this.onBackToMenuCb();
        } else if ((window as any).screenController) {
          (window as any).screenController.returnToMainMenu?.() || (window as any).screenController.setScreen("MAIN_MENU");
        }
      }
    };
    window.addEventListener("keydown", this.heroSelectKeydownListener);
  }

  private removeHeroSelectListeners(): void {
    if (this.heroSelectKeydownListener) {
      window.removeEventListener("keydown", this.heroSelectKeydownListener);
      this.heroSelectKeydownListener = undefined;
    }
  }

  public hideHeroSelection(): void {
    this.removeHeroSelectListeners();
    if (this.heroSelectionModal) {
      this.heroSelectionModal.classList.remove("visible");
      this.heroSelectionModal.style.display = "none";
      this.heroSelectionModal.style.pointerEvents = "none";
    }
  }

  public setOnBackToMenu(cb: () => void): void {
    this.onBackToMenuCb = cb;
  }

  public showHeroSelection(
    heroes: readonly Hero[],
    onSelect: (playerHero: Hero, oppHero: Hero) => void,
  ): void {
    this.setupHeroSelectListeners();
    this.onHeroSelectCb = onSelect;
    this.heroCardsGrid.innerHTML = "";

    heroes.forEach((h, idx) => {
      const card = document.createElement("div");
      let themeClass = "hero-custom";
      if (h.id === "HERO_SKY_VANGUARD") themeClass = "hero-sky";
      else if (h.id === "HERO_ABYSSAL_SORCERER") themeClass = "hero-abyss";
      else if (h.id === "HERO_SOLAR_FLARE") themeClass = "hero-solar";
      else if (h.id === "HERO_SUPER_BRAINZ") themeClass = "hero-brainz";
      card.className = `hs-hero-card ${themeClass}`;

      const sig = h.superpowerKit.signatureAbility;
      const cores = h.superpowerKit.coreAbilities;

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
        ? `<img src="${h.portraitUrl}" alt="${h.name}" crossorigin="anonymous" onerror="this.onerror=null; this.parentElement.innerHTML='🧙';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : fallbackEmoji;
      const tribes = (h.allowedTribes && h.allowedTribes.length > 0 ? h.allowedTribes : h.tribeSynergies) || [];

      const allAbilities = [
        { card: sig, isSig: true, icon: "⭐", shortName: sig.name },
        { card: cores[0], isSig: false, icon: "⚡", shortName: cores[0]?.name || "Core 1" },
        { card: cores[1], isSig: false, icon: "🛡️", shortName: cores[1]?.name || "Core 2" },
        { card: cores[2], isSig: false, icon: "🔮", shortName: cores[2]?.name || "Core 3" },
      ];

      const chipsHtml = allAbilities
        .map(
          (ab, aIdx) => `
        <div class="hs-sp-chip ${ab.isSig ? "sig-chip active" : ""}" data-hero-idx="${idx}" data-ability-idx="${aIdx}" title="${ab.card?.name || ""}">
          ${ab.icon} ${ab.shortName}
        </div>
      `,
        )
        .join("");

      card.innerHTML = `
        <div class="hs-hero-top">
          <div class="hs-hero-avatar" style="${isImg ? "overflow:hidden;padding:0;" : ""}">${avatarHtml}</div>
          <div class="hs-hero-info">
            <div class="hs-hero-name" title="${h.name}">${h.name}</div>
            <div class="hs-hero-title" title="${h.title}">${h.title}</div>
            <div class="hs-hero-meta">
              <span class="hs-pill hp">❤️ ${h.maxHp} HP</span>
              <span class="hs-pill">${tribes.length > 0 ? tribes.join(" · ") : "Neutral Archetype"}</span>
            </div>
          </div>
        </div>
        <div class="hs-hero-lore" title="${h.description}">${h.description}</div>
        <div class="hs-sp-section">
          <div class="hs-sp-section-title">
            <span>Superpowers (4)</span>
            <span style="font-size:10px; opacity:0.75;">Hover to inspect</span>
          </div>
          <div class="hs-sp-chips">
            ${chipsHtml}
          </div>
          <div class="hs-sp-preview-box sig-active" id="sp-preview-${idx}">
            <div class="hs-sp-item-header">
              <div class="hs-sp-item-name" id="sp-name-${idx}">
                <span class="hs-sp-badge sig" id="sp-badge-${idx}">⭐ SIGNATURE</span>
                <span id="sp-title-${idx}">${sig.name}</span>
              </div>
              <span class="hs-sp-cost">0 Mana</span>
            </div>
            <div class="hs-sp-desc" id="sp-desc-${idx}">${sig.text || ""}</div>
          </div>
        </div>
        <button class="hs-btn-select" id="btn-select-hero-${idx}">⚔ Command ${h.name}</button>
      `;

      // Ability chip hover / click listener
      const chips = card.querySelectorAll<HTMLElement>(".hs-sp-chip");
      const previewBox = card.querySelector<HTMLElement>(`#sp-preview-${idx}`);
      const badgeEl = card.querySelector<HTMLElement>(`#sp-badge-${idx}`);
      const titleEl = card.querySelector<HTMLElement>(`#sp-title-${idx}`);
      const descEl = card.querySelector<HTMLElement>(`#sp-desc-${idx}`);

      chips.forEach((chip) => {
        const activateAbility = () => {
          const aIdx = parseInt(chip.dataset.abilityIdx || "0", 10);
          const ability = allAbilities[aIdx];
          if (!ability || !ability.card) return;

          chips.forEach((c) => c.classList.remove("active"));
          chip.classList.add("active");

          if (badgeEl) {
            badgeEl.className = `hs-sp-badge ${ability.isSig ? "sig" : "core"}`;
            badgeEl.textContent = ability.isSig ? "⭐ SIGNATURE" : "CORE";
          }
          if (titleEl) {
            titleEl.textContent = ability.card.name;
          }
          if (descEl) {
            descEl.textContent = ability.card.text || "";
          }
          if (previewBox) {
            if (ability.isSig) {
              previewBox.classList.add("sig-active");
            } else {
              previewBox.classList.remove("sig-active");
            }
          }
        };

        chip.addEventListener("mouseenter", activateAbility);
        chip.addEventListener("click", activateAbility);
      });

      const btn = card.querySelector(`#btn-select-hero-${idx}`) as HTMLButtonElement;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const otherHero = heroes.find((other) => other.id !== h.id) || heroes[0]!;
        btn.disabled = true;
        btn.textContent = "⚔ Entering Battlefield...";
        gsap.to(this.heroSelectionModal, {
          duration: 0.35,
          opacity: 0,
          scale: 0.98,
          ease: "power2.inOut",
          onComplete: () => {
            this.hideHeroSelection();
            this.onHeroSelectCb?.(h, otherHero);
          },
        });
      });

      this.heroCardsGrid.appendChild(card);
    });

    gsap.killTweensOf(this.heroSelectionModal);
    this.heroSelectionModal.style.pointerEvents = "all";
    this.heroSelectionModal.style.opacity = "1";
    this.heroSelectionModal.style.transform = "none";
    this.heroSelectionModal.style.display = "flex";
    this.heroSelectionModal.classList.add("visible");

    requestAnimationFrame(() => {
      gsap.fromTo(
        this.heroCardsGrid.children,
        { opacity: 0, y: 35, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.1, ease: "power2.out" },
      );
    });
  }

  // ── Build Mulligan UI ────────────────────────────────────────

  private buildMulliganUI(): void {
    const modal = document.createElement("div");
    modal.id = "mulligan-overlay";
    modal.innerHTML = `
      <div class="mul-header">
        <div class="mul-badge">Tactical Preparation</div>
        <div class="mul-title">MULLIGAN PHASE</div>
        <div class="mul-subtitle">Click cards to mark them for replacement, then confirm to draw fresh options.</div>
      </div>
      <div class="mul-cards-container" id="mul-cards-grid"></div>
      <button class="mul-btn-confirm" id="mul-btn-confirm">KEEP ALL CARDS (0 Selected)</button>
    `;
    document.body.appendChild(modal);

    this.mulliganModal = modal;
    this.mulliganCardsGrid = modal.querySelector("#mul-cards-grid") as HTMLElement;
    this.mulliganConfirmBtn = modal.querySelector("#mul-btn-confirm") as HTMLButtonElement;

    this.mulliganConfirmBtn.addEventListener("click", () => {
      this.mulliganConfirmBtn.disabled = true;
      this.mulliganConfirmBtn.style.opacity = "0.75";
      this.mulliganConfirmBtn.textContent = "⏳ LOCKED IN · WAITING...";
      if (this.mulliganCardsGrid) {
        this.mulliganCardsGrid.style.pointerEvents = "none";
      }

      const replaced = Array.from(this.mulliganSelectedIndices)
        .map((idx) => this.currentMulliganCards[idx]?.id)
        .filter((id): id is string => Boolean(id));

      this.onMulliganConfirmCb?.(replaced);
    });
  }

  public showMulligan(cards: CardDefinition[], onConfirm: (cardIdsToReplace: string[]) => void): void {
    this.currentMulliganCards = [...cards];
    this.onMulliganConfirmCb = onConfirm;
    this.mulliganSelectedIndices.clear();
    this.mulliganCardsGrid.innerHTML = "";
    this.mulliganCardsGrid.style.pointerEvents = "auto";
    this.mulliganConfirmBtn.disabled = false;
    this.mulliganConfirmBtn.style.opacity = "1";

    cards.forEach((card, idx) => {
      const frame = document.createElement("div");
      frame.className = "mul-card-frame";
      frame.dataset["cardIdx"] = String(idx);
      frame.dataset["cardId"] = card.id;

      const emoji = cardArtEmoji(card);
      const atkHpStats =
        card.type === CardType.Unit
          ? `<div class="mul-stats"><span style="color:#ffaa66">⚔ ${card.attack}</span><span style="color:#66ff99">❤️ ${card.hp}</span></div>`
          : "";

      frame.innerHTML = `
        <div class="mul-card-replace-overlay">
          <div class="mul-cross-icon">❌</div>
          <div class="mul-cross-label">REPLACE</div>
        </div>
        <div class="mul-top-bar">
          <div class="mul-cost">${card.cost}</div>
          <div class="mul-tribe">${card.tribe}</div>
        </div>
        <div class="mul-art">${emoji}</div>
        <div class="mul-info">
          <div class="mul-card-name">${card.name}</div>
          <div class="mul-card-desc">${card.text || "Standard deployment unit."}</div>
        </div>
        ${atkHpStats}
      `;

      frame.addEventListener("click", () => {
        if (this.mulliganSelectedIndices.has(idx)) {
          this.mulliganSelectedIndices.delete(idx);
          frame.classList.remove("replace-selected");
        } else {
          this.mulliganSelectedIndices.add(idx);
          frame.classList.add("replace-selected");
        }
        this.updateMulliganBtn();
      });

      this.mulliganCardsGrid.appendChild(frame);
    });

    this.updateMulliganBtn();
    this.mulliganModal.style.display = "flex";
    this.mulliganModal.style.pointerEvents = "all";
    requestAnimationFrame(() => {
      this.mulliganModal.classList.add("visible");
    });
  }

  private updateMulliganBtn(): void {
    const count = this.mulliganSelectedIndices.size;
    if (count === 0) {
      this.mulliganConfirmBtn.textContent = "KEEP ALL CARDS (0 Selected)";
      this.mulliganConfirmBtn.style.background = "linear-gradient(135deg, #10b981, #047857)";
      this.mulliganConfirmBtn.style.borderColor = "#6ee7b7";
    } else {
      this.mulliganConfirmBtn.textContent = `REPLACE ${count} CARD${count > 1 ? "S" : ""}`;
      this.mulliganConfirmBtn.style.background = "linear-gradient(135deg, #ef4444, #b91c1c)";
      this.mulliganConfirmBtn.style.borderColor = "#fca5a5";
    }
  }

  public hideMulligan(): void {
    if (this.mulliganModal) {
      this.mulliganModal.classList.remove("visible");
      this.mulliganModal.style.display = "none";
      this.mulliganModal.style.pointerEvents = "none";
    }
  }

  // ── Build Phase Announcer Banner ────────────────────────────

  private buildPhaseAnnouncer(): void {
    const banner = document.createElement("div");
    banner.id = "phase-announcer";
    banner.innerHTML = `
      <div class="pa-ribbon">
        <div class="pa-crest" id="pa-crest">⚔️</div>
        <div class="pa-badge" id="pa-badge">PHASE ANNOUNCEMENT</div>
        <div class="pa-title" id="pa-title">YOUR UNIT PHASE</div>
        <div class="pa-subtitle" id="pa-subtitle">Deploy Frontline & Support Units</div>
      </div>
    `;
    document.body.appendChild(banner);

    this.phaseBanner = banner;
    this.phaseTitle = banner.querySelector("#pa-title") as HTMLElement;
    this.phaseSubtitle = banner.querySelector("#pa-subtitle") as HTMLElement;
  }

  public announcePhase(phase: TurnPhase, turnNumber: number, onComplete?: () => void, myRole: "p1" | "p2" = "p1"): void {
    let crest = "⚔️";
    let badge = "PHASE NOTIFICATION";
    let title = "PHASE CHANGED";
    let sub = `Turn ${turnNumber}`;
    let theme = "pa-theme-neutral";

    const isMyUnitPhase = myRole === "p2" ? phase === TurnPhase.P2_UNIT_PHASE : phase === TurnPhase.P1_UNIT_PHASE;
    const isMySpellPhase = myRole === "p2" ? phase === TurnPhase.P2_SPELL_PHASE : phase === TurnPhase.P1_SPELL_PHASE;

    switch (phase) {
      case TurnPhase.MULLIGAN:
        crest = "🎴";
        badge = "STARTING HAND";
        title = "MULLIGAN PHASE";
        sub = "Select cards to replace in your opening hand";
        theme = "pa-theme-neutral";
        break;
      case TurnPhase.P1_UNIT_PHASE:
      case TurnPhase.P2_UNIT_PHASE:
        crest = "🛡️";
        badge = isMyUnitPhase ? "DEPLOYMENT PHASE" : "ENEMY REINFORCEMENTS";
        title = isMyUnitPhase ? "YOUR UNIT PHASE" : "OPPONENT UNIT PHASE";
        sub = isMyUnitPhase ? "Deploy units into Frontline & Support sub-slots" : "Enemy champion is placing forces...";
        theme = isMyUnitPhase ? "pa-theme-player" : "pa-theme-opponent";
        break;
      case TurnPhase.P1_SPELL_PHASE:
      case TurnPhase.P2_SPELL_PHASE:
        crest = "✨";
        badge = isMySpellPhase ? "SPELL & TRICK PHASE" : "ENEMY ARCANE PHASE";
        title = isMySpellPhase ? "YOUR SPELL PHASE" : "OPPONENT SPELL PHASE";
        sub = isMySpellPhase ? "Cast tactical spells, attach equipment & trigger tricks" : "Brace for opposing spells & abilities...";
        theme = isMySpellPhase ? "pa-theme-spell-player" : "pa-theme-spell-opp";
        break;
      case TurnPhase.COMBAT_PHASE:
        crest = "⚔️";
        badge = "BATTLEFIELD CLASH";
        title = "⚔ COMBAT RESOLUTION ⚔";
        sub = "All 4 lanes clash sequentially from Left to Right!";
        theme = "pa-theme-combat";
        break;
      case TurnPhase.TURN_END:
        crest = "👑";
        badge = "TURN CYCLE";
        title = `TURN ${turnNumber} CONCLUDED`;
        sub = "Draw 1 card, reset mana pool, prepare for next turn";
        theme = "pa-theme-neutral";
        break;
    }

    const crestEl = this.phaseBanner.querySelector("#pa-crest");
    if (crestEl) crestEl.textContent = crest;
    const badgeEl = this.phaseBanner.querySelector("#pa-badge");
    if (badgeEl) badgeEl.textContent = badge;

    this.phaseTitle.textContent = title;
    this.phaseSubtitle.textContent = sub;
    this.phaseBanner.className = theme;

    if (this.bannerTl) {
      this.bannerTl.kill();
    }

    this.phaseBanner.style.display = "flex";
    this.phaseBanner.style.opacity = "0";

    this.bannerTl = gsap.timeline({
      onComplete: () => {
        this.phaseBanner.style.display = "none";
        onComplete?.();
      },
    });

    this.bannerTl
      .fromTo(
        this.phaseBanner,
        { scale: 0.8, opacity: 0, x: -280 },
        { duration: 0.38, scale: 1.0, opacity: 1, x: 0, ease: "power3.out" },
      )
      .to(this.phaseBanner, { duration: 0.85 }) // hold
      .to(this.phaseBanner, { duration: 0.3, opacity: 0, y: -40, scale: 1.05, ease: "power2.in" });
  }

  // ── Build Turn Controls ─────────────────────────────────────

  private buildTurnControls(): void {
    // Hide old action bar in index.html to replace with our enhanced controls
    const oldBar = document.getElementById("action-bar");
    if (oldBar) {
      oldBar.style.display = "none";
    }

    const container = document.createElement("div");
    container.id = "turn-controls-shell";
    container.innerHTML = `
      <div class="tc-phase-pill" id="tc-phase-status">Your Unit Phase</div>
      <button class="tc-btn-pass" id="tc-btn-pass">
        <div class="tc-btn-inner">
          <span class="tc-btn-icon" id="tc-btn-icon">⏳</span>
          <span class="tc-btn-text" id="tc-btn-text">End Phase</span>
        </div>
      </button>
      <button class="tc-btn-combat" id="tc-btn-combat">
        <div class="tc-btn-inner">
          <span class="tc-btn-icon">⚔️</span>
          <span class="tc-btn-text">Resolve Combat</span>
        </div>
      </button>
    `;
    document.body.appendChild(container);

    this.turnControlsContainer = container;
    this.phaseStatusPill = container.querySelector("#tc-phase-status") as HTMLElement;
    this.btnEndPhase = container.querySelector("#tc-btn-pass") as HTMLButtonElement;
    this.btnCombat = container.querySelector("#tc-btn-combat") as HTMLButtonElement;

    this.btnEndPhase.addEventListener("click", () => {
      this.onEndPhaseCb?.();
    });

    this.btnCombat.addEventListener("click", () => {
      this.onCombatCb?.();
    });
  }

  public setTurnControlCallbacks(onEndPhase: () => void, onCombat: () => void): void {
    this.onEndPhaseCb = onEndPhase;
    this.onCombatCb = onCombat;
  }

  public updateTurnControls(phase: TurnPhase, busy: boolean, myRole: "p1" | "p2" = "p1"): void {
    const isPlayerPhase =
      myRole === "p2"
        ? (phase === TurnPhase.P2_UNIT_PHASE || phase === TurnPhase.P2_SPELL_PHASE)
        : (phase === TurnPhase.P1_UNIT_PHASE || phase === TurnPhase.P1_SPELL_PHASE);

    this.phaseStatusPill.textContent = formatPhaseLabel(phase);

    const btnTextEl = this.btnEndPhase.querySelector("#tc-btn-text");
    const btnIconEl = this.btnEndPhase.querySelector("#tc-btn-icon");

    if (phase === TurnPhase.COMBAT_PHASE) {
      this.btnCombat.style.display = "flex";
      this.btnEndPhase.style.display = "none";
      this.btnCombat.disabled = busy;
    } else {
      this.btnCombat.style.display = "none";
      this.btnEndPhase.style.display = "flex";
      this.btnEndPhase.disabled = !isPlayerPhase || busy;

      if (!isPlayerPhase) {
        if (btnTextEl) btnTextEl.textContent = "Opponent's Turn";
        if (btnIconEl) btnIconEl.textContent = "⚙️";
      } else if (phase === TurnPhase.P1_UNIT_PHASE || phase === TurnPhase.P2_UNIT_PHASE) {
        if (btnTextEl) btnTextEl.textContent = "End Unit Phase";
        if (btnIconEl) btnIconEl.textContent = "⏩";
      } else {
        if (btnTextEl) btnTextEl.textContent = "End Spell Phase";
        if (btnIconEl) btnIconEl.textContent = "⏳";
      }
    }
  }

  // ── Build Game Over Screen ──────────────────────────────────

  private buildGameOverScreen(): void {
    const oldGo = document.getElementById("game-over");
    if (oldGo) {
      oldGo.style.display = "none";
    }

    const modal = document.createElement("div");
    modal.id = "game-over-modal";
    modal.innerHTML = `
      <div class="go-container">
        <div class="go-title win" id="go-banner-title">VICTORY</div>
        <div class="go-subtitle" id="go-banner-sub">The battlefield has been conquered!</div>
        <div class="go-stats-card" id="go-stats-list"></div>
        <div style="display:flex;gap:12px;width:100%;margin-top:14px;">
          <button class="go-btn-play" id="go-btn-play" style="flex:1;">⚔ Play Again</button>
          <button class="go-btn-menu" id="go-btn-menu" style="flex:1;">🏠 Main Menu</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    this.gameOverModal = modal;
    this.goTitle = modal.querySelector("#go-banner-title") as HTMLElement;
    this.goSubtitle = modal.querySelector("#go-banner-sub") as HTMLElement;
    this.goStatsContent = modal.querySelector("#go-stats-list") as HTMLElement;
    this.goPlayAgainBtn = modal.querySelector("#go-btn-play") as HTMLButtonElement;
    this.goMenuBtn = modal.querySelector("#go-btn-menu") as HTMLButtonElement;

    this.goPlayAgainBtn.addEventListener("click", () => {
      this.hideGameOver();
      this.onPlayAgainCb?.();
    });

    this.goMenuBtn?.addEventListener("click", () => {
      this.hideGameOver();
      if (this.onBackToMenuCb) {
        this.onBackToMenuCb();
      } else if ((window as any).screenController) {
        (window as any).screenController.setScreen("MAIN_MENU");
      }
    });
  }

  public showGameOver(
    winner: PlayerId | "DRAW" | null,
    stats: MatchStats,
    onPlayAgain: () => void,
    customSubtitle?: string,
  ): void {
    this.onPlayAgainCb = onPlayAgain;

    if (winner === PlayerId.Player) {
      this.goTitle.className = "go-title win";
      this.goTitle.textContent = "VICTORY";
      this.goSubtitle.textContent = customSubtitle ?? "Your Hero triumphed over the enemy champion!";
    } else if (winner === PlayerId.Opponent) {
      this.goTitle.className = "go-title lose";
      this.goTitle.textContent = "DEFEAT";
      this.goSubtitle.textContent = customSubtitle ?? "The opposing Hero outmatched your forces.";
    } else {
      this.goTitle.className = "go-title draw";
      this.goTitle.textContent = "DRAW";
      this.goSubtitle.textContent = customSubtitle ?? "Both Heroes fell in mutual combat.";
    }

    this.goStatsContent.innerHTML = `
      <div class="go-stat-row"><span>Total Turns:</span><span class="go-stat-val">${stats.turnNumber}</span></div>
      <div class="go-stat-row"><span>Player Final HP:</span><span class="go-stat-val">${stats.playerFinalHp}</span></div>
      <div class="go-stat-row"><span>Opponent Final HP:</span><span class="go-stat-val">${stats.oppFinalHp}</span></div>
      <div class="go-stat-row"><span>Units Destroyed:</span><span class="go-stat-val">${stats.unitsDestroyed}</span></div>
      <div class="go-stat-row"><span>Super Blocks Activated:</span><span class="go-stat-val">${stats.superBlocksTriggered}</span></div>
    `;

    this.gameOverModal.classList.add("visible");
  }

  private waitingSyncCancelCb?: () => void;
  private waitingSyncTimeout?: any;

  // ── Build Dedicated Waiting & Match Sync UI ─────────────────

  private buildWaitingSyncUI(): void {
    const modal = document.createElement("div");
    modal.id = "waiting-sync-overlay";
    modal.innerHTML = `
      <div class="ws-card">
        <div class="ws-badge">MATCH SYNC GATE</div>
        <div class="ws-icon-container">
          <div class="ws-spinner-ring"></div>
          <div class="ws-center-icon">⏳</div>
        </div>
        <div class="ws-title" id="ws-title">Waiting for Opponent to choose Hero & Deck...</div>
        <div class="ws-subtitle" id="ws-subtitle">Please wait while both champions lock in their battle loadouts.</div>
        <div class="ws-dots">
          <div class="ws-dot"></div>
          <div class="ws-dot"></div>
          <div class="ws-dot"></div>
        </div>
        <button id="ws-btn-cancel" class="ws-cancel-btn">✕ Leave / Return to Menu</button>
      </div>
    `;
    document.body.appendChild(modal);

    this.waitingSyncOverlay = modal;
    this.waitingSyncTitle = modal.querySelector("#ws-title") as HTMLElement;
    this.waitingSyncSubtitle = modal.querySelector("#ws-subtitle") as HTMLElement;
    this.waitingSyncSpinner = modal.querySelector(".ws-spinner-ring") as HTMLElement;

    const cancelBtn = modal.querySelector("#ws-btn-cancel") as HTMLButtonElement;
    cancelBtn?.addEventListener("click", () => {
      this.hideWaitingOverlay();
      this.waitingSyncCancelCb?.();
    });
  }

  public showWaitingOverlay(
    title: string = "Waiting for Opponent to choose Hero & Deck...",
    subtitle: string = "Please wait while both champions lock in their battle loadouts.",
    onCancel?: () => void,
  ): void {
    if (this.waitingSyncTitle) this.waitingSyncTitle.textContent = title;
    if (this.waitingSyncSubtitle) this.waitingSyncSubtitle.textContent = subtitle;
    this.waitingSyncCancelCb = onCancel;

    if (this.waitingSyncTimeout) {
      clearTimeout(this.waitingSyncTimeout);
      this.waitingSyncTimeout = null;
    }

    // Safety timeout: If waiting > 30s, update status advice
    this.waitingSyncTimeout = setTimeout(() => {
      if (this.isWaitingOverlayVisible() && this.waitingSyncSubtitle) {
        this.waitingSyncSubtitle.textContent =
          "Sync is taking longer than expected. Opponent may still be choosing cards, or disconnected. You can continue waiting or cancel.";
      }
    }, 30000);

    this.waitingSyncOverlay.style.pointerEvents = "all";
    this.waitingSyncOverlay.style.display = "flex";
    requestAnimationFrame(() => {
      this.waitingSyncOverlay.classList.add("visible");
    });
  }

  public updateWaitingOverlay(title: string, subtitle?: string): void {
    if (this.waitingSyncTitle) this.waitingSyncTitle.textContent = title;
    if (subtitle && this.waitingSyncSubtitle) this.waitingSyncSubtitle.textContent = subtitle;
  }

  public hideWaitingOverlay(): void {
    if (this.waitingSyncTimeout) {
      clearTimeout(this.waitingSyncTimeout);
      this.waitingSyncTimeout = null;
    }
    this.waitingSyncCancelCb = undefined;
    if (this.waitingSyncOverlay) {
      this.waitingSyncOverlay.classList.remove("visible");
      this.waitingSyncOverlay.style.display = "none";
      this.waitingSyncOverlay.style.pointerEvents = "none";
    }
  }

  public isWaitingOverlayVisible(): boolean {
    return this.waitingSyncOverlay?.classList.contains("visible") ?? false;
  }

  public hideGameOver(): void {
    this.gameOverModal.classList.remove("visible");
  }
}

// ── Helpers ───────────────────────────────────────────────────

function formatPhaseLabel(phase: TurnPhase): string {
  const map: Record<TurnPhase, string> = {
    [TurnPhase.HERO_SELECTION]: "Hero Selection",
    [TurnPhase.MULLIGAN]:       "Mulligan Phase",
    [TurnPhase.P1_UNIT_PHASE]:  "Your Unit Phase",
    [TurnPhase.P1_SPELL_PHASE]: "Your Spell Phase",
    [TurnPhase.P2_UNIT_PHASE]:  "Bot Unit Phase",
    [TurnPhase.P2_SPELL_PHASE]: "Bot Spell Phase",
    [TurnPhase.COMBAT_PHASE]:   "Combat ⚔",
    [TurnPhase.TURN_END]:       "Turn End",
  };
  return map[phase] ?? phase;
}

function cardArtEmoji(card: CardDefinition): string {
  const n = card.name.toLowerCase();
  if (n.includes("sky strike")) return "🦅";
  if (n.includes("aerial")) return "🪽";
  if (n.includes("tailwind")) return "💨";
  if (n.includes("glacial") || n.includes("gale") || n.includes("frost")) return "❄️";
  if (n.includes("tidal") || n.includes("wave")) return "🌊";
  if (n.includes("soothing") || n.includes("current")) return "💧";
  if (n.includes("coral") || n.includes("aegis")) return "🛡️";
  if (n.includes("elemental")) return "🌀";
  if (n.includes("pea")) return "🌿";
  if (n.includes("sunflower")) return "🌻";
  if (n.includes("lightning") || n.includes("zap") || n.includes("bolt")) return "⚡";
  if (n.includes("chomper")) return "🐊";
  if (n.includes("tall-nut") || n.includes("wall-nut")) return "🌰";
  if (n.includes("lily")) return "🪷";
  if (n.includes("roto") || n.includes("copter")) return "🚁";
  if (n.includes("thistle")) return "🌵";
  if (n.includes("bucket")) return "🪣";
  if (n.includes("cone")) return "⚠️";
  if (n.includes("football") || n.includes("all-star")) return "🏈";
  if (n.includes("imp")) return "😈";
  if (n.includes("gargantuar")) return "👹";
  if (n.includes("grave")) return "🪦";
  if (n.includes("bungee")) return "🪂";
  if (n.includes("smoke")) return "💨";
  if (n.includes("toxic") || n.includes("poison")) return "☣️";
  if (n.includes("rain") || n.includes("water")) return "🌧️";
  if (n.includes("fertilizer") || n.includes("potion")) return "🧪";
  if (n.includes("time") || n.includes("warp") || n.includes("slayer")) return "⏳";
  if (card.tribe === "ปัญญา") return "🧠";
  if (card.tribe === "จอมพล") return "👑";
  if (card.tribe === "จู่โจม") return "⚔️";
  if (card.tribe === "รักษา") return "💖";
  if (card.tribe === "พิทักษ์") return "🛡️";
  if (card.tribe === "ยุทธศาสตร์") return "📜";
  if (card.tribe === "จอมอาคม") return "✨";
  if (card.tribe === "เป็นกลาง") return "⚪";
  if (card.tribe === "Aerial") return "🦅";
  if (card.tribe === "Aquatic") return "🌊";
  if (card.tribe === "Vanguard") return "⚔️";
  if (card.tribe === "Plant") return "🌱";
  if (card.tribe === "Zombie") return "🧟";
  if (card.tribe === "Amphibian") return "🐸";
  return "✨";
}
