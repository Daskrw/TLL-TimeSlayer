// ============================================================
//  HeroRepository.ts
//  Data access layer for Hero definitions & Superpower kits.
//  – Authoritative Cloud source: Supabase PostgreSQL (heroes table)
//  – Authoritative Node source: /api/catalog master_registry
//  – Manages custom & built-in Heroes
//  – Hydrates 4-card Superpower kits from CardRepository
//  – Persists overrides to Supabase/backend and caches to localStorage
//  – Reactive: subscribers notified on hero changes + Realtime sync
// ============================================================

import { Card, Hero, HeroDefinition, SuperpowerKit } from "../src/types";
import { cardRepo } from "./CardRepository";
import * as StaticCards from "../src/cards";
import {
  fetchHeroesFromSupabase,
  upsertHeroToSupabaseVerified,
  toggleHeroActiveInSupabase,
  deleteHeroFromSupabase,
  normalizeHeroRow,
  supabase,
  isSupabaseConfigured,
  UpsertHeroResult,
} from "../src/supabaseClient";

// ─────────────────────────────────────────────────────────────
//  Storage Key (Offline Fallback Cache)
// ─────────────────────────────────────────────────────────────

const LS_HERO_KEY = "CARD_GAME_HERO_OVERRIDES";

// ─────────────────────────────────────────────────────────────
//  Default Built-in Hero Definitions
// ─────────────────────────────────────────────────────────────

export const DEFAULT_HERO_DEFINITIONS: HeroDefinition[] = [
  {
    id: "hero_aegis_guardian",
    name: "Aegis Guardian",
    title: "The Indomitable Bulwark",
    description: "ผู้พิทักษ์แห่งโล่ ผู้ใช้พลังป้องกันและสะกดกลั้นการโจมตี ปกป้องพวกพ้องและเปลี่ยนสนามรบให้เป็นป้อมปราการอันไร้พ่าย",
    maxHp: 20,
    portraitUrl: "🛡️",
    allowedTribes: ["ปัญญา", "จอมพล", "จู่โจม", "รักษา", "พิทักษ์", "ยุทธศาสตร์", "จอมอาคม", "เป็นกลาง"],
    signatureAbilityCardId: "card_sp_shield_of_legend",
    coreAbilityCardIds: ["card_sp_human_shield", "card_sp_suppress_anger", "card_sp_leave_to_dust"],
    isActive: true,
    updatedAt: 0,
  },
  {
    id: "HERO_SKY_VANGUARD",
    name: "Sky Vanguard",
    title: "The Aerial Ace",
    description: "Master of the skies, swooping down with precision aerial strikes and swift tactical movement.",
    maxHp: 20,
    portraitUrl: "🦅",
    allowedTribes: ["Aerial", "Vanguard", "เป็นกลาง"],
    signatureAbilityCardId: "SP_SKY_STRIKE",
    coreAbilityCardIds: ["SP_AERIAL_SURGE", "SP_TAILWIND_DRAFT", "SP_GLACIAL_GALE"],
    isActive: false,
    updatedAt: 0,
  },
  {
    id: "HERO_ABYSSAL_SORCERER",
    name: "Abyssal Sorcerer",
    title: "Tidecaller of the Deep",
    description: "Channels the dark currents of the deep abyss to flood enemy lanes and crush opponents with oceanic power.",
    maxHp: 20,
    portraitUrl: "🌊",
    allowedTribes: ["Aquatic", "Mystic", "เป็นกลาง"],
    signatureAbilityCardId: "SP_TIDAL_WAVE",
    coreAbilityCardIds: ["SP_SOOTHING_CURRENT", "SP_CORAL_AEGIS", "SP_AQUATIC_CONJURATION"],
    isActive: false,
    updatedAt: 0,
  },
  {
    id: "HERO_SOLAR_FLARE",
    name: "Solar Flare",
    title: "The Radiant Sunburst",
    description: "Draws searing solar energy to burn down enemy units and illuminate victory.",
    maxHp: 20,
    portraitUrl: "🌻",
    allowedTribes: ["Kabloom", "Solar", "เป็นกลาง"],
    signatureAbilityCardId: "SP_SUNBURN",
    coreAbilityCardIds: ["SP_WEED_WHACKER", "SP_MORE_SPORE", "SP_SUN_BURST"],
    isActive: false,
    updatedAt: 0,
  },
  {
    id: "HERO_SUPER_BRAINZ",
    name: "Super Brainz",
    title: "The Melee Marvel",
    description: "An eccentric heroic zombie packing punches and heroic heroics across all lanes.",
    maxHp: 20,
    portraitUrl: "🧠",
    allowedTribes: ["Brainy", "Sneaky", "เป็นกลาง"],
    signatureAbilityCardId: "SP_CARRIED_AWAY",
    coreAbilityCardIds: ["SP_TELEPATHY", "SP_SUPER_STENCH", "SP_CUT_DOWN_TO_SIZE"],
    isActive: false,
    updatedAt: 0,
  },
];

export const LEGACY_HERO_IDS = new Set([
  "HERO_SKY_VANGUARD",
  "HERO_ABYSSAL_SORCERER",
  "HERO_SOLAR_FLARE",
  "HERO_SUPER_BRAINZ",
]);

// ─────────────────────────────────────────────────────────────
//  Fallback Card Helper
// ─────────────────────────────────────────────────────────────

function findCard(id: string): Card {
  // Check CardRepository first (which includes CMS overrides)
  const fromRepo = cardRepo.getCard(id);
  if (fromRepo) return fromRepo;

  // Check static cards map
  const fromStatic = (StaticCards as Record<string, any>)[id];
  if (fromStatic && typeof fromStatic === "object" && "id" in fromStatic) {
    return fromStatic as Card;
  }

  // Graceful fallback dummy superpower if ID is not yet defined
  return {
    id,
    name: id.replace(/^SP_/, "").replace(/_/g, " "),
    cost: 0,
    type: StaticCards.SP_SKY_STRIKE.type,
    tribe: "Superpower",
    tribes: ["Superpower"],
    keywords: [],
    text: "Hero Superpower ability.",
    attack: 0,
    hp: 0,
  };
}

// ─────────────────────────────────────────────────────────────
//  HeroRepository Singleton
// ─────────────────────────────────────────────────────────────

export type HeroChangeListener = (heroes: Hero[]) => void;

export class HeroRepository {
  private static _instance: HeroRepository | null = null;

  private heroDefs: Map<string, HeroDefinition> = new Map();
  private listeners: Set<HeroChangeListener> = new Set();
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;

  public constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.bootstrap();
    if (typeof window !== "undefined") {
      this.initRealtime();
    }
  }

  public isCloudAuthoritative(): boolean {
    return isSupabaseConfigured;
  }

  public getStorageMode(): "supabase" | "fallback" {
    return isSupabaseConfigured ? "supabase" : "fallback";
  }

  public static resetInstanceForTesting(): void {
    HeroRepository._instance = null;
  }

  public static getInstance(): HeroRepository {
    if (!HeroRepository._instance) {
      HeroRepository._instance = new HeroRepository();
    }
    return HeroRepository._instance;
  }

  public whenReady(): Promise<void> {
    return this.readyPromise;
  }

  // ── Realtime Synchronization ──────────────────────────────────

  private initRealtime(): void {
    try {
      if (!isSupabaseConfigured) return;
      // Use unique channel identifier to avoid duplicate subscription collisions
      const channelName = `public:heroes_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "heroes" },
          (payload) => {
            console.log("[HeroRepository] Realtime hero change received from Supabase:", payload.eventType);
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const row = normalizeHeroRow(payload.new);
              this.heroDefs.set(row.id, row);
              this.persist();
              this.notify();
            } else if (payload.eventType === "DELETE") {
              const old = payload.old as { id: string };
              if (old?.id) {
                const defaultHero = DEFAULT_HERO_DEFINITIONS.find((d) => d.id === old.id);
                if (defaultHero) {
                  this.heroDefs.set(old.id, { ...defaultHero });
                } else {
                  this.heroDefs.delete(old.id);
                }
                this.persist();
                this.notify();
              }
            }
          },
        )
        .subscribe();
    } catch (err) {
      console.warn("[HeroRepository] Failed to initialize Supabase Realtime channel:", err);
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────

  private async bootstrap(): Promise<void> {
    // 1. Seed defaults (Aegis Guardian + legacy heroes with isActive: false)
    for (const def of DEFAULT_HERO_DEFINITIONS) {
      this.heroDefs.set(def.id, { ...def });
    }

    // 2. Load localStorage cache as fast initial rendering cache
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(LS_HERO_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as Record<string, HeroDefinition>;
          for (const [id, def] of Object.entries(stored)) {
            const isLegacy = LEGACY_HERO_IDS.has(id);
            const isActive = typeof def.isActive === "boolean" ? def.isActive : !isLegacy;
            this.heroDefs.set(id, { ...def, isActive });
          }
        }
      } catch (err) {
        console.warn("[HeroRepository] Failed to read stored heroes cache:", err);
      }
    }

    // 3. Authoritative fetch from Supabase & Backend:
    // If Supabase is configured, remote database values ALWAYS overwrite any stale local cache.
    try {
      await this.fetchRemote();
    } catch (err) {
      console.warn("[HeroRepository] Remote hero fetch fallback:", err);
    } finally {
      this.resolveReady();
      this.notify();
    }
  }

  public async fetchRemote(): Promise<void> {
    // 1. Try Supabase Cloud PostgreSQL (Authoritative Source of Truth)
    if (isSupabaseConfigured) {
      try {
        const supabaseHeroes = await fetchHeroesFromSupabase();
        if (supabaseHeroes && supabaseHeroes.length > 0) {
          const remoteIds = new Set<string>();
          for (const row of supabaseHeroes) {
            remoteIds.add(row.id);
            // Normalize active status consistently across schema representations
            const isLegacy = LEGACY_HERO_IDS.has(row.id);
            const isActive = typeof row.isActive === "boolean" ? row.isActive : !isLegacy;
            this.heroDefs.set(row.id, { ...row, isActive });
          }

          // Prune any custom (non-default) heroes that are no longer present in Supabase
          for (const id of Array.from(this.heroDefs.keys())) {
            const isDefault = DEFAULT_HERO_DEFINITIONS.some((d) => d.id === id);
            if (!isDefault && !remoteIds.has(id)) {
              this.heroDefs.delete(id);
            }
          }

          this.persist();
          console.log(`[HeroRepository] Authoritative sync: Loaded ${supabaseHeroes.length} heroes from Supabase database.`);
          return;
        }
      } catch (err) {
        console.error("[HeroRepository] Supabase fetchRemote failed:", err);
      }
    } else {
      console.log("[HeroRepository] Running in local offline fallback mode (Supabase not configured).");
    }

    // 2. If Supabase is not configured or returned no rows, query Backend Node.js REST API (/api/catalog)
    if (typeof window !== "undefined") {
      try {
        const response = await fetch("/api/catalog");
        if (response.ok) {
          const data = await response.json();
          if (data.heroes && Array.isArray(data.heroes)) {
            for (const rawHero of data.heroes) {
              const hero = normalizeHeroRow(rawHero);
              const existing = this.heroDefs.get(hero.id);
              if (!existing || (hero.updatedAt && hero.updatedAt >= (existing.updatedAt || 0))) {
                this.heroDefs.set(hero.id, hero);
              }
            }
            this.persist();
            console.log(`[HeroRepository] Synced ${data.heroes.length} heroes from Backend Master Registry`);
          }
        }
      } catch (err) {
        console.warn("[HeroRepository] Backend REST fetch skipped:", err);
      }
    }
  }

  // ── Read API ──────────────────────────────────────────────────

  public getAllHeroDefinitions(): HeroDefinition[] {
    const list = Array.from(this.heroDefs.values());
    if (list.length > 0) return list;
    return [...DEFAULT_HERO_DEFINITIONS];
  }

  public getActiveHeroDefinitions(): HeroDefinition[] {
    const active = Array.from(this.heroDefs.values()).filter((def) => {
      const isLegacy = LEGACY_HERO_IDS.has(def.id);
      if (typeof def.isActive === "boolean") return def.isActive;
      return !isLegacy;
    });
    if (active.length > 0) return active;

    // Safety fallback: if all were marked inactive or none found, ensure Aegis Guardian is returned active
    const aegis = this.heroDefs.get("hero_aegis_guardian") || DEFAULT_HERO_DEFINITIONS[0];
    return [{ ...aegis, isActive: true }];
  }

  public getHeroDefinition(id: string): HeroDefinition | undefined {
    return this.heroDefs.get(id) || DEFAULT_HERO_DEFINITIONS.find((d) => d.id === id);
  }

  public getAllHeroes(): Hero[] {
    const defs = this.getAllHeroDefinitions();
    return defs.map((def) => this.hydrateHero(def));
  }

  public getActiveHeroes(): Hero[] {
    const activeDefs = this.getActiveHeroDefinitions();
    return activeDefs.map((def) => this.hydrateHero(def));
  }

  public getHero(id: string): Hero | undefined {
    const def = this.getHeroDefinition(id);
    return def ? this.hydrateHero(def) : undefined;
  }

  public setHeroes(heroes: HeroDefinition[]): void {
    for (const h of heroes) {
      this.heroDefs.set(h.id, { ...h });
    }
    this.persist();
    this.notify();
  }

  // ── Hydration ─────────────────────────────────────────────────

  public hydrateHero(def: HeroDefinition): Hero {
    if (!def) {
      def = DEFAULT_HERO_DEFINITIONS[0];
    }
    const sigCard = findCard(def.signatureAbilityCardId || "card_sp_shield_of_legend");
    const rawCores = Array.isArray(def.coreAbilityCardIds) ? def.coreAbilityCardIds : [];
    const core1 = findCard(rawCores[0] || "card_sp_human_shield");
    const core2 = findCard(rawCores[1] || "card_sp_suppress_anger");
    const core3 = findCard(rawCores[2] || "card_sp_leave_to_dust");

    const superpowerKit: SuperpowerKit = {
      signatureAbility: sigCard,
      coreAbilities: [core1, core2, core3],
    };

    const isLegacy = LEGACY_HERO_IDS.has(def.id);
    const isActive = typeof def.isActive === "boolean" ? def.isActive : !isLegacy;

    const hero: Hero = {
      id: def.id,
      name: def.name,
      title: def.title,
      description: def.description,
      portraitUrl: def.portraitUrl,
      maxHp: def.maxHp || 20,
      startingHp: def.maxHp || 20,
      allowedTribes: [...def.allowedTribes],
      tribeSynergies: [...def.allowedTribes],
      isActive,
      superpowerKit,
      get superpowers(): readonly Card[] {
        return [this.superpowerKit.signatureAbility, ...this.superpowerKit.coreAbilities];
      },
      updatedAt: def.updatedAt,
    };

    return hero;
  }

  // ── Write API ─────────────────────────────────────────────────

  public async toggleHeroActive(id: string, isActive: boolean): Promise<{
    success: boolean;
    mode: "supabase" | "fallback";
    error?: string;
  }> {
    const existing = this.heroDefs.get(id);
    if (!existing) {
      return {
        success: false,
        mode: this.getStorageMode(),
        error: `Hero "${id}" not found.`,
      };
    }

    const previousActive = existing.isActive;
    const updated: HeroDefinition = {
      ...existing,
      isActive,
      updatedAt: Date.now(),
    };

    if (isSupabaseConfigured) {
      let sbRes: UpsertHeroResult;
      try {
        sbRes = await toggleHeroActiveInSupabase(id, isActive);
      } catch (err: any) {
        sbRes = {
          success: false,
          error: err?.message || String(err),
        };
      }

      if (!sbRes.success) {
        console.warn(`[HeroRepository] Supabase active toggle failed for "${id}":`, sbRes.error);
        return {
          success: false,
          mode: "supabase",
          error: sbRes.error || "Failed to persist active status to Supabase.",
        };
      }

      if (sbRes.verifiedHero) {
        this.heroDefs.set(id, sbRes.verifiedHero);
      } else {
        this.heroDefs.set(id, updated);
      }
    } else {
      this.heroDefs.set(id, updated);
    }

    this.persist();
    this.notify();

    // Push to backend REST API
    if (typeof window !== "undefined") {
      try {
        await fetch("/api/admin/update-hero", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, hero: this.heroDefs.get(id) }),
        });
      } catch (err) {
        console.warn("[HeroRepository] Failed to push hero toggle to backend server:", err);
      }
    }

    return {
      success: true,
      mode: isSupabaseConfigured ? "supabase" : "fallback",
    };
  }

  public async saveHero(def: HeroDefinition): Promise<boolean> {
    const result = await this.saveHeroDetailed(def);
    return result.success;
  }

  public async saveHeroDetailed(def: HeroDefinition): Promise<{
    success: boolean;
    mode: "supabase" | "fallback";
    error?: string;
  }> {
    const previous = this.heroDefs.get(def.id) ? { ...this.heroDefs.get(def.id)! } : null;
    const updated: HeroDefinition = {
      ...def,
      updatedAt: Date.now(),
    };

    // 1. If Supabase is configured, push to Supabase and require strict read-back verification
    if (isSupabaseConfigured) {
      let sbResult: UpsertHeroResult;
      try {
        sbResult = await upsertHeroToSupabaseVerified(updated);
      } catch (err: any) {
        console.error("[HeroRepository] Supabase save exception:", err);
        sbResult = {
          success: false,
          error: err?.message || String(err),
        };
      }

      if (!sbResult.success) {
        console.warn(`[HeroRepository] Supabase verified save failed for "${updated.name}" (${updated.id}). Reverting local state.`);
        // Revert local state to previous definition (or delete if newly added)
        if (previous) {
          this.heroDefs.set(def.id, previous);
        } else {
          this.heroDefs.delete(def.id);
        }
        this.persist();
        this.notify();
        return {
          success: false,
          mode: "supabase",
          error: sbResult.error || "Supabase write or read-back verification failed.",
        };
      }

      console.log(`[HeroRepository] Hero "${updated.name}" (${updated.id}) successfully verified in Supabase.`);
      if (sbResult.verifiedHero) {
        this.heroDefs.set(def.id, sbResult.verifiedHero);
      } else {
        this.heroDefs.set(def.id, updated);
      }
    } else {
      console.warn(`[HeroRepository] Saving hero in local offline fallback mode (no Supabase connection).`);
      this.heroDefs.set(def.id, updated);
    }

    // 2. Commit update to in-memory state & localStorage
    this.persist();
    this.notify();

    // 3. Push to backend REST API (browser environment)
    if (typeof window !== "undefined") {
      try {
        await fetch("/api/admin/update-hero", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: def.id, hero: this.heroDefs.get(def.id) || updated }),
        });
      } catch (err) {
        console.warn("[HeroRepository] Failed to push hero to backend server:", err);
      }
    }

    return {
      success: true,
      mode: isSupabaseConfigured ? "supabase" : "fallback",
    };
  }

  public async deleteHero(id: string): Promise<boolean> {
    const isDefault = DEFAULT_HERO_DEFINITIONS.some((d) => d.id === id);
    if (isDefault) {
      const original = DEFAULT_HERO_DEFINITIONS.find((d) => d.id === id)!;
      this.heroDefs.set(id, { ...original });
    } else {
      this.heroDefs.delete(id);
    }
    this.persist();
    this.notify();

    // 1. Delete from Supabase PostgreSQL
    try {
      await deleteHeroFromSupabase(id);
    } catch (err) {
      console.warn("[HeroRepository] Supabase delete error:", err);
    }

    // 2. Delete from backend REST API (browser environment)
    if (typeof window !== "undefined") {
      try {
        await fetch("/api/admin/delete-hero", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } catch (err) {
        console.warn("[HeroRepository] Failed to delete hero on server:", err);
      }
    }

    return true;
  }

  public isDefaultHero(id: string): boolean {
    return DEFAULT_HERO_DEFINITIONS.some((d) => d.id === id);
  }

  // ── Persistence ───────────────────────────────────────────────

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const obj: Record<string, HeroDefinition> = {};
      for (const [id, def] of this.heroDefs.entries()) {
        obj[id] = def;
      }
      localStorage.setItem(LS_HERO_KEY, JSON.stringify(obj));
    } catch (err) {
      console.error("[HeroRepository] Failed to save heroes to localStorage:", err);
    }
  }

  // ── Reactive Subscriptions ────────────────────────────────────

  public subscribe(listener: HeroChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const heroes = this.getAllHeroes();
    for (const listener of this.listeners) {
      try {
        listener(heroes);
      } catch (err) {
        console.error("[HeroRepository] Listener error:", err);
      }
    }
  }
}

export const heroRepo = HeroRepository.getInstance();
