// ============================================================
//  server/MasterRegistry.ts — Authoritative Backend Card & Hero Storage
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CardDefinition, HeroDefinition } from "../src/types";
import { ALL_STATIC_CARDS } from "../src/cards";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const DATA_DIR = path.resolve(__dirname, "data");
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
          this.cardsMap.set(card.id, {
            ...card,
            tribes: card.tribes && card.tribes.length > 0 ? card.tribes : (card.tribe ? [card.tribe] : ["เป็นกลาง"]),
            tribe: card.tribe || card.tribes?.[0] || "เป็นกลาง",
            imageUrl: card.imageUrl || "",
            updatedAt: card.updatedAt || 0,
          });
        }

        // Seed any missing static cards
        for (const staticCard of ALL_STATIC_CARDS) {
          if (!this.cardsMap.has(staticCard.id)) {
            this.cardsMap.set(staticCard.id, {
              ...staticCard,
              imageUrl: "",
              updatedAt: 0,
            });
          }
        }

        // Populate heroes
        for (const hero of data.heroes || []) {
          this.heroesMap.set(hero.id, { ...hero });
        }

        // Seed any missing default heroes
        for (const defaultHero of DEFAULT_HEROES) {
          if (!this.heroesMap.has(defaultHero.id)) {
            this.heroesMap.set(defaultHero.id, { ...defaultHero });
          }
        }

        this.updatedAt = data.updatedAt || Date.now();
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

  public getHero(id: string): HeroDefinition | undefined {
    return this.heroesMap.get(id);
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
