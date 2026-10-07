// ============================================================
//  BotDeckGenerator.ts — Procedural Bot Deck Builder
//
//  Generates a 40-card opponent deck based on the bot's chosen
//  Hero identity, targeting one of three archetypes:
//    "Aggro"   – low-cost rush units, burn spells
//    "Control" – high-HP walls, removal, environments
//    "Midrange"– balanced mana curve, keyword synergies
//
//  Entry: generateBotDeck(heroId, difficulty?, seed?) → CardDefinition[]
// ============================================================

import { CardDefinition, CardType, Keyword, LaneType } from "./types";
import { ALL_STATIC_CARDS } from "./cards";
import { createCardInstance } from "./cardInstance";

// ─────────────────────────────────────────────────────────────
//  Dynamic Card Pool Helpers
// ─────────────────────────────────────────────────────────────

function getCardPool(
  customPool?: CardDefinition[],
): {
  units: CardDefinition[];
  spells: CardDefinition[];
  equipment: CardDefinition[];
  environments: CardDefinition[];
} {
  const pool = customPool && customPool.length > 0
    ? customPool
    : ALL_STATIC_CARDS.filter((c) => c.type !== CardType.HeroAbility);

  return {
    units: pool.filter((c) => c.type === CardType.Unit),
    spells: pool.filter((c) => c.type === CardType.Spell),
    equipment: pool.filter((c) => c.type === CardType.Equipment),
    environments: pool.filter((c) => c.type === CardType.Environment),
  };
}


// ─────────────────────────────────────────────────────────────
//  Archetype Definitions per Hero
// ─────────────────────────────────────────────────────────────

type Archetype = "Aggro" | "Control" | "Midrange";

interface HeroArchetypeMap {
  primary: Archetype;
  secondary: Archetype;
  coreCards: string[];
  preferredKeywords: Keyword[];
  preferredLanes: (LaneType | undefined)[];
}

const HERO_ARCHETYPE_MAP: Record<string, HeroArchetypeMap> = {
  HERO_SKY_VANGUARD: {
    primary: "Aggro",
    secondary: "Midrange",
    coreCards: [
      "CARD_HOMING_THISTLE", "CARD_ROTOBAGA", "CARD_AIR_RAID_ZOMBIE",
      "CARD_PEASHOOTER", "CARD_BONK_CHOY", "CARD_CHOMPER",
    ],
    preferredKeywords: [Keyword.Flying, Keyword.Rush, Keyword.DoubleStrike],
    preferredLanes: [LaneType.Aerial, undefined],
  },
  HERO_ABYSSAL_SORCERER: {
    primary: "Control",
    secondary: "Midrange",
    coreCards: [
      "CARD_LILY_PAD", "CARD_SPIKEWEED_AQUA", "CARD_SEA_ZOMBIE",
      "CARD_TALLNUT", "CARD_BUCKETHEAD_ZOMBIE", "CARD_CHEF_ZOMBIE",
    ],
    preferredKeywords: [Keyword.Amphibious, Keyword.Deathrattle],
    preferredLanes: [LaneType.Water, undefined],
  },
  HERO_SOLAR_FLARE: {
    primary: "Midrange",
    secondary: "Aggro",
    coreCards: [
      "CARD_SUNFLOWER", "CARD_PEASHOOTER", "CARD_BONK_CHOY",
      "CARD_CHOMPER", "CARD_WALL_NUT", "CARD_TORCHWOOD",
    ],
    preferredKeywords: [Keyword.Rush, Keyword.Piercing, Keyword.DoubleStrike],
    preferredLanes: [undefined, LaneType.Ground1],
  },
  HERO_SUPER_BRAINZ: {
    primary: "Control",
    secondary: "Aggro",
    coreCards: [
      "CARD_BASIC_ZOMBIE", "CARD_CONEHEAD_ZOMBIE", "CARD_BULLY_ZOMBIE",
      "CARD_ZOMBIE_JESTER", "CARD_CHEF_ZOMBIE", "CARD_BUCKETHEAD_ZOMBIE",
    ],
    preferredKeywords: [Keyword.DoubleStrike, Keyword.Piercing, Keyword.Rush],
    preferredLanes: [undefined, LaneType.Ground2],
  },
};

const DEFAULT_ARCHETYPE: HeroArchetypeMap = {
  primary: "Midrange",
  secondary: "Control",
  coreCards: [],
  preferredKeywords: [],
  preferredLanes: [undefined],
};

// ─────────────────────────────────────────────────────────────
//  Difficulty Modifiers
// ─────────────────────────────────────────────────────────────

export type BotDifficulty = "Easy" | "Medium" | "Hard";

interface DifficultyModifiers {
  coreBias: number;
  synergyBias: number;
  maxCopies: number;
  unitTarget: number;
  spellTarget: number;
  includeEnvironments: boolean;
  includeEquipment: boolean;
}

const DIFFICULTY_MODIFIERS: Record<BotDifficulty, DifficultyModifiers> = {
  Easy: {
    coreBias: 0.20,
    synergyBias: 0.20,
    maxCopies: 4,
    unitTarget: 32,
    spellTarget: 4,
    includeEnvironments: false,
    includeEquipment: false,
  },
  Medium: {
    coreBias: 0.55,
    synergyBias: 0.55,
    maxCopies: 4,
    unitTarget: 28,
    spellTarget: 7,
    includeEnvironments: true,
    includeEquipment: true,
  },
  Hard: {
    coreBias: 0.90,
    synergyBias: 0.85,
    maxCopies: 4,
    unitTarget: 26,
    spellTarget: 8,
    includeEnvironments: true,
    includeEquipment: true,
  },
};

// ─────────────────────────────────────────────────────────────
//  Mana Curve Targets
// ─────────────────────────────────────────────────────────────

interface ManaBucket {
  min: number;
  max: number;
  weight: number; // relative proportion for this bucket
}

const MANA_CURVE: Record<Archetype, ManaBucket[]> = {
  Aggro: [
    { min: 1, max: 1, weight: 0.30 },
    { min: 2, max: 2, weight: 0.35 },
    { min: 3, max: 4, weight: 0.25 },
    { min: 5, max: 99, weight: 0.10 },
  ],
  Control: [
    { min: 1, max: 1, weight: 0.10 },
    { min: 2, max: 2, weight: 0.20 },
    { min: 3, max: 4, weight: 0.40 },
    { min: 5, max: 99, weight: 0.30 },
  ],
  Midrange: [
    { min: 1, max: 1, weight: 0.15 },
    { min: 2, max: 2, weight: 0.30 },
    { min: 3, max: 4, weight: 0.35 },
    { min: 5, max: 99, weight: 0.20 },
  ],
};

function assignManaBucket(cost: number, archetype: Archetype): number {
  const buckets = MANA_CURVE[archetype];
  for (let i = 0; i < buckets.length; i++) {
    if (cost >= buckets[i].min && cost <= buckets[i].max) return i;
  }
  return buckets.length - 1;
}

// ─────────────────────────────────────────────────────────────
//  LCG RNG (seeded for reproducible decks)
// ─────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

// ─────────────────────────────────────────────────────────────
//  Card Scoring
// ─────────────────────────────────────────────────────────────

function scoreCard(
  card: CardDefinition,
  archetype: Archetype,
  heroMap: HeroArchetypeMap,
  mods: DifficultyModifiers,
  rand: () => number,
): number {
  let score = rand() * 0.5; // small random jitter for variety

  // Core card bonus
  if (heroMap.coreCards.includes(card.id)) score += 10 * mods.coreBias;

  // Keyword synergy bonus
  for (const kw of card.keywords) {
    if (heroMap.preferredKeywords.includes(kw)) {
      score += 3 * mods.synergyBias;
    }
  }

  // Lane preference bonus
  if (heroMap.preferredLanes.includes(card.laneTypeRestriction)) score += 2;

  // Archetype stat scoring
  if (archetype === "Aggro") {
    score += card.attack * 1.5;
    score += Math.max(0, 5 - card.cost) * 0.6;
    if (card.keywords.includes(Keyword.Rush)) score += 4;
    if (card.keywords.includes(Keyword.Piercing)) score += 2.5;
    if (card.keywords.includes(Keyword.DoubleStrike)) score += 3;
  } else if (archetype === "Control") {
    score += card.hp * 1.5;
    score += card.cost * 0.3;
    if (card.keywords.includes(Keyword.Deathrattle)) score += 4;
    if (card.keywords.includes(Keyword.Aura)) score += 3;
    if (card.keywords.includes(Keyword.Support)) score += 2;
  } else {
    // Midrange
    score += (card.attack + card.hp) * 0.8;
    if (card.keywords.includes(Keyword.DoubleStrike)) score += 3;
    if (card.keywords.includes(Keyword.Rush)) score += 2;
    if (card.keywords.includes(Keyword.Piercing)) score += 1.5;
  }

  return score;
}

// ─────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a 40-card procedural bot deck based on hero and difficulty.
 *
 * @param heroId       The bot's hero ID (e.g. "HERO_SKY_VANGUARD").
 * @param difficulty   How smart the deck construction is.
 * @param seed         RNG seed — same seed always produces the same deck.
 * @param customPool   Optional card catalogue from CardRepository.
 * @param cardResolver Optional function to resolve card by ID from CardRepository.
 */
export function generateBotDeck(
  heroId: string,
  difficulty: BotDifficulty = "Medium",
  seed: number = Date.now(),
  customPool?: CardDefinition[],
  cardResolver?: (id: string) => CardDefinition | null,
): CardDefinition[] {
  const heroMap = HERO_ARCHETYPE_MAP[heroId] ?? DEFAULT_ARCHETYPE;
  const mods = DIFFICULTY_MODIFIERS[difficulty];
  const rand = makeRng(seed);

  const pool = getCardPool(customPool);

  // Easy mode randomly picks primary or secondary archetype for more variance
  const archetype: Archetype =
    difficulty === "Easy" && rand() < 0.5 ? heroMap.secondary : heroMap.primary;

  // ── Score all cards from dynamic pool ──────────────────────────
  const scoredUnits = pool.units
    .map((c) => ({ card: c, score: scoreCard(c, archetype, heroMap, mods, rand) }))
    .sort((a, b) => b.score - a.score);

  const scoredSpells = pool.spells
    .map((c) => ({ card: c, score: scoreCard(c, archetype, heroMap, mods, rand) }))
    .sort((a, b) => b.score - a.score);

  const scoredEquip = pool.equipment
    .map((c) => ({ card: c, score: scoreCard(c, archetype, heroMap, mods, rand) }))
    .sort((a, b) => b.score - a.score);

  const scoredEnvs = pool.environments
    .map((c) => ({ card: c, score: scoreCard(c, archetype, heroMap, mods, rand) }))
    .sort((a, b) => b.score - a.score);

  // ── Build deck ─────────────────────────────────────────────
  const deck: CardDefinition[] = [];
  const copyCount: Map<string, number> = new Map();

  const tryAdd = (card: CardDefinition): boolean => {
    const n = copyCount.get(card.id) ?? 0;
    if (n >= mods.maxCopies) return false;
    deck.push(card);
    copyCount.set(card.id, n + 1);
    return true;
  };

  const buckets = MANA_CURVE[archetype];
  const bucketFilled = buckets.map(() => 0);

  // 1. Units — fill to unitTarget using mana-curve guidance
  let unitAttempts = 0;
  while (deck.length < mods.unitTarget && unitAttempts < 400) {
    unitAttempts++;

    // Find most under-filled bucket (relative to target weight)
    let worstBucket = 0;
    let worstRatio = Infinity;
    for (let b = 0; b < buckets.length; b++) {
      const ratio = buckets[b].weight === 0 ? Infinity :
        bucketFilled[b] / (buckets[b].weight * mods.unitTarget);
      if (ratio < worstRatio) { worstRatio = ratio; worstBucket = b; }
    }

    // Find best scored unit that fits this bucket
    const candidate = scoredUnits.find((sc) => {
      const bi = assignManaBucket(sc.card.cost, archetype);
      return bi === worstBucket && (copyCount.get(sc.card.id) ?? 0) < mods.maxCopies;
    });

    if (candidate) {
      tryAdd(candidate.card);
      bucketFilled[worstBucket]++;
    } else {
      // No card fits bucket — pick any available unit
      const fallback = scoredUnits.find((sc) =>
        (copyCount.get(sc.card.id) ?? 0) < mods.maxCopies,
      );
      if (!fallback) break;
      const bi = assignManaBucket(fallback.card.cost, archetype);
      tryAdd(fallback.card);
      bucketFilled[bi]++;
    }
  }

  // 2. Spells
  let spellAdded = 0;
  for (const sc of scoredSpells) {
    while (spellAdded < mods.spellTarget && (copyCount.get(sc.card.id) ?? 0) < mods.maxCopies) {
      if (!tryAdd(sc.card)) break;
      spellAdded++;
    }
    if (spellAdded >= mods.spellTarget) break;
  }

  // 3. Equipment
  if (mods.includeEquipment) {
    const eqTarget = difficulty === "Hard" ? 4 : 2;
    let eqAdded = 0;
    for (const sc of scoredEquip) {
      while (eqAdded < eqTarget && (copyCount.get(sc.card.id) ?? 0) < mods.maxCopies) {
        if (!tryAdd(sc.card)) break;
        eqAdded++;
      }
      if (eqAdded >= eqTarget) break;
    }
  }

  // 4. Environments
  if (mods.includeEnvironments) {
    const envTarget = difficulty === "Hard" ? 4 : 2;
    let envAdded = 0;
    for (const sc of scoredEnvs) {
      while (envAdded < envTarget && (copyCount.get(sc.card.id) ?? 0) < mods.maxCopies) {
        if (!tryAdd(sc.card)) break;
        envAdded++;
      }
      if (envAdded >= envTarget) break;
    }
  }

  // 5. Pad to 40 with best available units
  let padAttempts = 0;
  while (deck.length < 40 && padAttempts < 200) {
    padAttempts++;
    const filler = scoredUnits.find((sc) => (copyCount.get(sc.card.id) ?? 0) < mods.maxCopies);
    if (!filler) break;
    tryAdd(filler.card);
  }

  // Return fresh, deep-cloned CardInstances to ensure complete reference isolation
  return deck.slice(0, 40).map((c) => {
    // If a custom resolver is supplied, re-resolve to get latest CMS card definition
    const resolved = cardResolver ? (cardResolver(c.id) ?? c) : c;
    return createCardInstance(resolved);
  });
}
