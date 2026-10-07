// ============================================================
//  client/AudioManager.ts — Procedural Web Audio Engine
//  Synthesizes UI clicks, swooshes, and chimes without external assets.
// ============================================================

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  bgmVolume: number;
  muted: boolean;
}

const STORAGE_KEY = "tll_timeslayer_audio_settings";

export class AudioManager {
  private static instance: AudioManager;
  private ctx: AudioContext | null = null;
  private settings: AudioSettings = {
    masterVolume: 0.8,
    sfxVolume: 0.8,
    bgmVolume: 0.5,
    muted: false,
  };

  private constructor() {
    this.loadSettings();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private initContext(): void {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  // ── Settings ─────────────────────────────────────────────────

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.settings = { ...this.settings, ...JSON.parse(raw) };
      }
    } catch {
      // fallback to defaults
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
  }

  private getEffectiveVolume(type: "sfx" | "bgm"): number {
    if (this.settings.muted) return 0;
    const sub = type === "sfx" ? this.settings.sfxVolume : this.settings.bgmVolume;
    return Math.max(0, Math.min(1, this.settings.masterVolume * sub));
  }

  // ── Procedural Sound Synthesis ───────────────────────────────

  /** Delicate, soft tick on button hover */
  public playHover(): void {
    const vol = this.getEffectiveVolume("sfx") * 0.12;
    if (vol <= 0) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.03);

      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {
      // AudioContext unavailable
    }
  }

  /** Satisfying glass-metallic tap on button click */
  public playClick(): void {
    const vol = this.getEffectiveVolume("sfx") * 0.28;
    if (vol <= 0) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(520, now);
      osc1.frequency.exponentialRampToValueAtTime(260, now + 0.08);

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1040, now);
      osc2.frequency.exponentialRampToValueAtTime(520, now + 0.08);

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(now + 0.11);
      osc2.stop(now + 0.11);
    } catch {
      // ignore
    }
  }

  /** Card whoosh on drag or deal */
  public playWhoosh(): void {
    const vol = this.getEffectiveVolume("sfx") * 0.2;
    if (vol <= 0) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.16);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(now + 0.2);
    } catch {
      // ignore
    }
  }

  /** Victory / Defeat fanfare chord */
  public playFanfare(victory = true): void {
    const vol = this.getEffectiveVolume("sfx") * 0.35;
    if (vol <= 0) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = victory ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 369.99, 349.23, 261.63];

      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = victory ? "triangle" : "sawtooth";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(vol, now + idx * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.65);
      });
    } catch {
      // ignore
    }
  }
}

export const audioManager = AudioManager.getInstance();
