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
  upsertHeroToSupabase,
  deleteHeroFromSupabase,
  supabase,
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
    id: "HERO_SKY_VANGUARD",
    name: "Valen",
    title: "The Sky Vanguard",
    description: "Master of high-altitude aerial tactics and whirlwind momentum. Strikes fast and hard from above before foes can react.",
    maxHp: 20,
    portraitUrl: "🦅",
    allowedTribes: ["จู่โจม", "ยุทธศาสตร์", "จอมพล"],
    signatureAbilityCardId: "SP_SKY_STRIKE",
    coreAbilityCardIds: ["SP_AERIAL_SURGE", "SP_TAILWIND_DRAFT", "SP_GLACIAL_GALE"],
    updatedAt: 0,
  },
  {
    id: "HERO_ABYSSAL_SORCERER",
    name: "Nereus",
    title: "Abyssal Sorcerer",
    description: "Ancient mystic commanding the deepest oceanic trenches. Submerges the entire battlefield in roaring tidal waves while sustaining allies.",
    maxHp: 20,
    portraitUrl: "🌊",
    allowedTribes: ["จอมอาคม", "ปัญญา", "รักษา"],
    signatureAbilityCardId: "SP_TIDAL_WAVE",
    coreAbilityCardIds: ["SP_SOOTHING_CURRENT", "SP_CORAL_AEGIS", "SP_AQUATIC_CONJURATION"],
    updatedAt: 0,
  },
  {
    id: "HERO_SOLAR_FLARE",
    name: "Solar Flare",
    title: "The Solar Vanguard",
    description: "Radiant flame specialist who incinerates threats with blistering solar bursts and fiery energy.",
    maxHp: 20,
    portraitUrl: "🌻",
    allowedTribes: ["รักษา", "จู่โจม", "จอมอาคม"],
    signatureAbilityCardId: "SP_SUNBURN",
    coreAbilityCardIds: ["SP_WEED_WHACKER", "SP_MORE_SPORE", "SP_SUN_BURST"],
    updatedAt: 0,
  },
  {
    id: "HERO_SUPER_BRAINZ",
    name: "Super Brainz",
    title: "Psionic Mastermind",
    description: "Cerebral powerhouse wielding psionic disruption, telekinesis, and overwhelming brute force.",
    maxHp: 20,
    portraitUrl: "🧠",
    allowedTribes: ["ปัญญา", "พิทักษ์", "ยุทธศาสตร์"],
    signatureAbilityCardId: "SP_TELEPATHY",
    coreAbilityCardIds: ["SP_CARRIED_AWAY", "SP_SUPER_STENCH", "SP_CUT_DOWN_TO_SIZE"],
    updatedAt: 0,
  },
];

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

  private constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.bootstrap();
    this.initRealtime();
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
      supabase
        .channel("public:heroes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "heroes" },
          (payload) => {
            console.log("[HeroRepository] Realtime hero change received from Supabase:", payload.eventType);
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const row = payload.new as HeroDefinition;
              this.heroDefs.set(row.id, row);
              this.persist();
              this.notify();
            } else if (payload.eventType === "DELETE") {
              const old = payload.old as { id: string };
              if (old?.id) {
                this.heroDefs.delete(old.id);
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
    // 1. Seed defaults
    for (const def of DEFAULT_HERO_DEFINITIONS) {
      this.heroDefs.set(def.id, { ...def });
    }

    // 2. Load localStorage overrides for instant cached UI
    try {
      const raw = localStorage.getItem(LS_HERO_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, HeroDefinition>;
        for (const [id, def] of Object.entries(stored)) {
          this.heroDefs.set(id, { ...def });
        }
      }
    } catch (err) {
      console.warn("[HeroRepository] Failed to read stored heroes cache:", err);
    }

    // 3. Authoritative fetch from Supabase & Backend
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
    // 1. Try Supabase Cloud PostgreSQL
    const supabaseHeroes = await fetchHeroesFromSupabase();
    if (supabaseHeroes && supabaseHeroes.length > 0) {
      for (const row of supabaseHeroes) {
        this.heroDefs.set(row.id, row);
      }
      this.persist();
      console.log(`[HeroRepository] Loaded ${supabaseHeroes.length} heroes from Supabase`);
      return;
    }

    // 2. Try Backend Node.js REST API
    try {
      const response = await fetch("/api/catalog");
      if (response.ok) {
        const data = await response.json();
        if (data.heroes && Array.isArray(data.heroes)) {
          for (const hero of data.heroes) {
            this.heroDefs.set(hero.id, hero);
          }
          this.persist();
          console.log(`[HeroRepository] Loaded ${data.heroes.length} heroes from Backend Master Registry`);
        }
      }
    } catch (err) {
      console.warn("[HeroRepository] Backend REST fetch skipped:", err);
    }
  }

  // ── Read API ──────────────────────────────────────────────────

  public getAllHeroDefinitions(): HeroDefinition[] {
    return Array.from(this.heroDefs.values());
  }

  public getHeroDefinition(id: string): HeroDefinition | undefined {
    return this.heroDefs.get(id);
  }

  public getAllHeroes(): Hero[] {
    return Array.from(this.heroDefs.values()).map((def) => this.hydrateHero(def));
  }

  public getHero(id: string): Hero | undefined {
    const def = this.heroDefs.get(id);
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
    const sigCard = findCard(def.signatureAbilityCardId);
    const core1 = findCard(def.coreAbilityCardIds[0]);
    const core2 = findCard(def.coreAbilityCardIds[1]);
    const core3 = findCard(def.coreAbilityCardIds[2]);

    const superpowerKit: SuperpowerKit = {
      signatureAbility: sigCard,
      coreAbilities: [core1, core2, core3],
    };

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
      superpowerKit,
      get superpowers(): readonly Card[] {
        return [this.superpowerKit.signatureAbility, ...this.superpowerKit.coreAbilities];
      },
      updatedAt: def.updatedAt,
    };

    return hero;
  }

  // ── Write API ─────────────────────────────────────────────────

  public async saveHero(def: HeroDefinition): Promise<void> {
    const updated: HeroDefinition = {
      ...def,
      updatedAt: Date.now(),
    };
    this.heroDefs.set(def.id, updated);
    this.persist();
    this.notify();

    // 1. Push to Supabase PostgreSQL
    upsertHeroToSupabase(updated).catch((err) => {
      console.warn("[HeroRepository] Supabase push error:", err);
    });

    // 2. Push to backend REST API
    try {
      await fetch("/api/admin/update-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: def.id, hero: updated }),
      });
    } catch (err) {
      console.warn("[HeroRepository] Failed to push hero to server:", err);
    }
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
    deleteHeroFromSupabase(id).catch((err) => {
      console.warn("[HeroRepository] Supabase delete error:", err);
    });

    // 2. Delete from backend REST API
    try {
      await fetch("/api/admin/delete-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      console.warn("[HeroRepository] Failed to delete hero on server:", err);
    }

    return true;
  }

  public isDefaultHero(id: string): boolean {
    return DEFAULT_HERO_DEFINITIONS.some((d) => d.id === id);
  }

  // ── Persistence ───────────────────────────────────────────────

  private persist(): void {
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
