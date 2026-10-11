// ============================================================
//  server/MasterRegistry.ts — Authoritative Backend Card & Hero Storage
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Card, CardDefinition, HeroDefinition, Hero, SuperpowerKit } from "../src/types";
import {
  ALL_STATIC_CARDS,
  getStaticCardById,
  SP_SHIELD_OF_LEGEND,
  SP_HUMAN_SHIELD,
  SP_SUPPRESS_ANGER,
  SP_LEAVE_TO_DUST,
} from "../src/cards";
import {
  fetchHeroesFromSupabase,
  fetchCardsFromSupabase,
  isSupabaseConfigured,
} from "../src/supabaseClient";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

export interface CardMeta extends CardDefinition {
  imageUrl: string;
  updatedAt: number;
}

export interface MasterRegistryData {
  version: number;
  updatedAt: number;
  heroes: HeroDefinition[];
  cards: CardMeta[];
  keywords: string[];
  tribes: string[];
}

export const DEFAULT_HEROES: HeroDefinition[] = [
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

export const CORE_KEYWORDS: string[] = [
  "สนับสนุน",
  "โจมตีต่อเนื่อง",
  "เกลียดชังตำนาน",
  "อากาศยาน",
  "กองเรือ",
  "กลืนชีพ",
  "ทนทาน",
  "จู่โจม",
];

export const CORE_TRIBES: string[] = [
  "ปัญญา",
  "จอมพล",
  "จู่โจม",
  "รักษา",
  "พิทักษ์",
  "ยุทธศาสตร์",
  "จอมอาคม",
  "เป็นกลาง",
];

const DATA_DIR = path.resolve(CURRENT_DIR, "data");
const REGISTRY_FILE = path.join(DATA_DIR, "master_registry.json");

export class MasterRegistry {
  private static instance: MasterRegistry | null = null;
  private heroesMap: Map<string, HeroDefinition> = new Map();
  private cardsMap: Map<string, CardMeta> = new Map();
  private updatedAt: number = Date.now();

  private constructor() {
    this.ensureDataDir();
    this.loadOrCreate();
  }

  public static getInstance(): MasterRegistry {
    if (!MasterRegistry.instance) {
      MasterRegistry.instance = new MasterRegistry();
    }
    return MasterRegistry.instance;
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadOrCreate(): void {
    if (fs.existsSync(REGISTRY_FILE)) {
      try {
        const raw = fs.readFileSync(REGISTRY_FILE, "utf-8");
        const data = JSON.parse(raw) as MasterRegistryData;

        // Populate cards
        for (const card of data.cards || []) {
          const rawCost = Number(card.cost);
          const cost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : (card.cost ?? 0);
          this.cardsMap.set(card.id, {
            ...card,
            cost: typeof cost === "number" ? cost : 0,
            tribes: card.tribes && card.tribes.length > 0 ? card.tribes : (card.tribe ? [card.tribe] : ["เป็นกลาง"]),
            tribe: card.tribe || card.tribes?.[0] || "เป็นกลาง",
            imageUrl: card.imageUrl || "",
            updatedAt: card.updatedAt || 0,
          });
        }

        // Seed any missing static cards
        for (const staticCard of ALL_STATIC_CARDS) {
          if (!this.cardsMap.has(staticCard.id)) {
            const rawCost = Number(staticCard.cost);
            const cost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : (staticCard.cost ?? 0);
            this.cardsMap.set(staticCard.id, {
              ...staticCard,
              cost: typeof cost === "number" ? cost : 0,
              imageUrl: "",
              updatedAt: 0,
            });
          }
        }

        // Populate heroes (ensuring isActive compatibility rule)
        for (const hero of data.heroes || []) {
          const isLegacy = LEGACY_HERO_IDS.has(hero.id);
          const isActive = typeof hero.isActive === "boolean" ? hero.isActive : !isLegacy;
          this.heroesMap.set(hero.id, {
            ...hero,
            isActive,
          });
        }

        // Seed any missing default heroes
        for (const defaultHero of DEFAULT_HEROES) {
          if (!this.heroesMap.has(defaultHero.id)) {
            this.heroesMap.set(defaultHero.id, {
              ...defaultHero,
            });
          }
        }

        this.updatedAt = data.updatedAt || Date.now();
        this.saveToFile();
        console.log(`[MasterRegistry] Loaded ${this.cardsMap.size} cards and ${this.heroesMap.size} heroes from ${REGISTRY_FILE}`);
        return;
      } catch (err) {
        console.error("[MasterRegistry] Failed to parse master_registry.json. Reseeding with defaults...", err);
      }
    }

    // Seed defaults if file didn't exist or was corrupt
    this.reseedDefaults();
  }

  public reseedDefaults(): void {
    this.cardsMap.clear();
    for (const card of ALL_STATIC_CARDS) {
      this.cardsMap.set(card.id, {
        ...card,
        imageUrl: "",
        updatedAt: 0,
      });
    }

    this.heroesMap.clear();
    for (const hero of DEFAULT_HEROES) {
      this.heroesMap.set(hero.id, { ...hero });
    }

    this.updatedAt = Date.now();
    this.saveToFile();
    console.log(`[MasterRegistry] Initialized master_registry.json with ${this.cardsMap.size} cards & ${this.heroesMap.size} heroes`);
  }

  private saveToFile(): void {
    try {
      this.ensureDataDir();
      const payload: MasterRegistryData = {
        version: 1,
        updatedAt: this.updatedAt,
        heroes: Array.from(this.heroesMap.values()),
        cards: Array.from(this.cardsMap.values()),
        keywords: CORE_KEYWORDS,
        tribes: CORE_TRIBES,
      };
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(payload, null, 2), "utf-8");
    } catch (err) {
      console.error("[MasterRegistry] Error writing master_registry.json:", err);
    }
  }

  public async syncFromSupabase(): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      const heroes = await fetchHeroesFromSupabase();
      if (heroes && heroes.length > 0) {
        for (const h of heroes) {
          this.heroesMap.set(h.id, h);
        }
        console.log(`[MasterRegistry] Synced ${heroes.length} heroes from Supabase database.`);
      }
      const cards = await fetchCardsFromSupabase();
      if (cards && cards.length > 0) {
        for (const c of cards) {
          this.cardsMap.set(c.id, c);
        }
        console.log(`[MasterRegistry] Synced ${cards.length} cards from Supabase database.`);
      }
      this.updatedAt = Date.now();
      this.saveToFile();
    } catch (err) {
      console.warn("[MasterRegistry] Supabase sync warning:", err);
    }
  }

  // ── Public Accessors ──────────────────────────────────────────

  public getCatalog(): MasterRegistryData {
    return {
      version: 1,
      updatedAt: this.updatedAt,
      heroes: Array.from(this.heroesMap.values()),
      cards: Array.from(this.cardsMap.values()),
      keywords: CORE_KEYWORDS,
      tribes: CORE_TRIBES,
    };
  }

  public getCard(id: string): CardMeta | undefined {
    return this.cardsMap.get(id);
  }

  public getAllCards(): CardMeta[] {
    return Array.from(this.cardsMap.values());
  }

  public getHero(idOrName: string): HeroDefinition | undefined {
    if (!idOrName) return undefined;
    const direct = this.heroesMap.get(idOrName);
    if (direct) return direct;
    const lower = idOrName.toLowerCase().trim();
    for (const h of this.heroesMap.values()) {
      if (h.id.toLowerCase() === lower || h.name.toLowerCase() === lower) {
        return h;
      }
    }
    return undefined;
  }

  public getActiveHeroes(): HeroDefinition[] {
    const active = Array.from(this.heroesMap.values()).filter((h) => {
      const isLegacy = LEGACY_HERO_IDS.has(h.id);
      if (typeof h.isActive === "boolean") return h.isActive;
      return !isLegacy;
    });
    if (active.length > 0) return active;
    const aegis = this.heroesMap.get("hero_aegis_guardian") || DEFAULT_HEROES[0];
    return [{ ...aegis, isActive: true }];
  }

  public hydrateHero(def: HeroDefinition): Hero {
    const sigCard = this.getCard(def.signatureAbilityCardId) || getStaticCardById(def.signatureAbilityCardId);
    const coreCards = (def.coreAbilityCardIds || [])
      .map((id) => this.getCard(id) || getStaticCardById(id))
      .filter(Boolean);

    const defaultCore: [Card, Card, Card] = [SP_HUMAN_SHIELD, SP_SUPPRESS_ANGER, SP_LEAVE_TO_DUST];
    const coreAbilities: [Card, Card, Card] = [
      ((coreCards[0] as Card) || defaultCore[0]),
      ((coreCards[1] as Card) || defaultCore[1]),
      ((coreCards[2] as Card) || defaultCore[2]),
    ];

    const superpowerKit: SuperpowerKit = {
      signatureAbility: (sigCard as Card) || SP_SHIELD_OF_LEGEND,
      coreAbilities,
    };

    const isLegacy = LEGACY_HERO_IDS.has(def.id);
    const isActive = typeof def.isActive === "boolean" ? def.isActive : !isLegacy;

    return {
      id: def.id,
      name: def.name,
      title: def.title,
      description: def.description,
      portraitUrl: def.portraitUrl,
      maxHp: def.maxHp || 20,
      startingHp: def.maxHp || 20,
      allowedTribes: def.allowedTribes || ["เป็นกลาง"],
      superpowerKit,
      get superpowers() {
        return [this.superpowerKit.signatureAbility, ...this.superpowerKit.coreAbilities];
      },
      isActive,
    };
  }

  public getAllHeroes(): HeroDefinition[] {
    return Array.from(this.heroesMap.values());
  }

  public updateCard(id: string, patch: Partial<CardMeta>): CardMeta {
    const existing = this.cardsMap.get(id);
    const updated: CardMeta = existing
      ? {
          ...existing,
          ...patch,
          tribes: patch.tribes || existing.tribes || (patch.tribe ? [patch.tribe] : [existing.tribe || "เป็นกลาง"]),
          tribe: patch.tribe || (patch.tribes?.[0] ?? existing.tribe ?? "เป็นกลาง"),
          updatedAt: Date.now(),
        }
      : ({
          id,
          name: patch.name || id,
          cost: patch.cost ?? 1,
          type: patch.type || ("UNIT" as any),
          tribes: patch.tribes || (patch.tribe ? [patch.tribe] : ["เป็นกลาง"]),
          tribe: patch.tribe || patch.tribes?.[0] || "เป็นกลาง",
          keywords: patch.keywords || [],
          attack: patch.attack ?? 1,
          hp: patch.hp ?? 1,
          imageUrl: patch.imageUrl || "",
          text: patch.text || "",
          updatedAt: Date.now(),
          ...patch,
        } as CardMeta);

    this.cardsMap.set(id, updated);
    this.updatedAt = Date.now();
    this.saveToFile();
    return updated;
  }

  public updateHero(id: string, heroDef: HeroDefinition): HeroDefinition {
    const updated: HeroDefinition = {
      ...heroDef,
      id,
      updatedAt: Date.now(),
    };
    this.heroesMap.set(id, updated);
    this.updatedAt = Date.now();
    this.saveToFile();
    return updated;
  }

  public deleteHero(id: string): boolean {
    const defaultHero = DEFAULT_HEROES.find((h) => h.id === id);
    if (defaultHero) {
      // Reset back to default
      this.heroesMap.set(id, { ...defaultHero, updatedAt: Date.now() });
    } else {
      this.heroesMap.delete(id);
    }
    this.updatedAt = Date.now();
    this.saveToFile();
    return true;
  }
}

export const masterRegistry = MasterRegistry.getInstance();
