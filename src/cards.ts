// ============================================================
//  TLL TimeSlayer — Sample Card Catalogue
//  Demonstrates every keyword and lane restriction type.
// ============================================================

import {
  CardDefinition,
  CardType,
  Keyword,
  LaneType,
  Hero,
  DeathrattleEffect,
  EquipmentEffect,
  EnvironmentEffect,
  SpellEffect,
  OnEnterEffect,
  OnHeroDamageEffect,
  TargetType,
  isSuperpowerCard,
} from "./types";

// ─── Helpers ───────────────────────────────────────────────────
function normalizeTribes(t: string | readonly string[] | string[] | undefined): string[] {
  if (!t) return ["เป็นกลาง"];
  if (Array.isArray(t)) return [...t];
  return [t as string];
}

function unit(
  id: string,
  name: string,
  cost: number,
  attack: number,
  hp: number,
  tribe: string | string[],
  keywords: Keyword[] = [],
  text?: string,
  laneTypeRestriction?: LaneType,
  deathrattleEffect?: DeathrattleEffect,
  extra?: {
    onEnterEffect?: OnEnterEffect;
    onHeroDamageEffect?: OnHeroDamageEffect;
    adjacentLaneDamage?: boolean;
  },
): CardDefinition {
  const tribes = normalizeTribes(tribe);
  return {
    id, name, type: CardType.Unit, cost, attack, hp,
    tribes,
    tribe: tribes[0] || "เป็นกลาง",
    keywords,
    ...(text                !== undefined ? { text }                : {}),
    ...(laneTypeRestriction !== undefined ? { laneTypeRestriction }  : {}),
    ...(deathrattleEffect   !== undefined ? { deathrattleEffect }    : {}),
    ...(extra?.onEnterEffect      !== undefined ? { onEnterEffect: extra.onEnterEffect } : {}),
    ...(extra?.onHeroDamageEffect !== undefined ? { onHeroDamageEffect: extra.onHeroDamageEffect } : {}),
    ...(extra?.adjacentLaneDamage !== undefined ? { adjacentLaneDamage: extra.adjacentLaneDamage } : {}),
  };
}

function spell(
  id: string,
  name: string,
  cost: number,
  tribe: string | string[],
  text?: string,
  spellEffect?: SpellEffect,
  targetType: TargetType = "NONE",
): CardDefinition {
  const tribes = normalizeTribes(tribe);
  return {
    id, name, type: CardType.Spell, cost, attack: 0, hp: 0,
    tribes,
    tribe: tribes[0] || "เป็นกลาง",
    keywords: [],
    targetType,
    ...(text        !== undefined ? { text }        : {}),
    ...(spellEffect !== undefined ? { spellEffect } : {}),
  };
}

function equipment(
  id: string,
  name: string,
  cost: number,
  tribe: string | string[],
  equipmentEffect: EquipmentEffect,
  text?: string,
  targetType: TargetType = "FRIENDLY_UNIT",
): CardDefinition {
  const tribes = normalizeTribes(tribe);
  return {
    id, name, type: CardType.Equipment, cost, attack: 0, hp: 0,
    tribes,
    tribe: tribes[0] || "เป็นกลาง",
    keywords: [],
    equipmentEffect,
    targetType,
    ...(text !== undefined ? { text } : {}),
  };
}

function environment(
  id: string,
  name: string,
  cost: number,
  tribe: string | string[],
  environmentEffect: EnvironmentEffect,
  text?: string,
): CardDefinition {
  const tribes = normalizeTribes(tribe);
  return {
    id, name, type: CardType.Environment, cost, attack: 0, hp: 0,
    tribes,
    tribe: tribes[0] || "เป็นกลาง",
    keywords: [],
    environmentEffect,
    laneTypeRestriction: LaneType.Ground1, // Ground only
    ...(text !== undefined ? { text } : {}),
  };
}

function superpower(
  id: string,
  name: string,
  type: CardType,
  tribe: string | string[],
  cost: number = 0,
  spellEffect?: SpellEffect,
  attack: number = 0,
  hp: number = 0,
  keywords: Keyword[] = [],
  text?: string,
  targetType: TargetType = "NONE",
): CardDefinition {
  const tribes = normalizeTribes(tribe);
  return {
    id, name, type, cost, attack, hp,
    tribes,
    tribe: tribes[0] || "เป็นกลาง",
    keywords,
    targetType,
    ...(spellEffect !== undefined ? { spellEffect } : {}),
    ...(text        !== undefined ? { text }        : {}),
  };
}

// ─── Canonical Reset Unit Cards (Group A: Death Draw — 3 Cards) ───────────
// Ability: "When this unit is destroyed, its owner draws 1 card."
export const CARD_DEATH_DRAW_1: CardDefinition = unit(
  "CARD_DEATH_DRAW_1",
  "Soul Harvester",
  1, 1, 1,
  ["ปัญญา", "เป็นกลาง"],
  [Keyword.Deathrattle],
  "เมื่อยูนิตนี้ถูกทำลาย เจ้าของจั่วการ์ด 1 ใบ (When this unit is destroyed, its owner draws 1 card.)",
  undefined,
  { drawCards: 1, description: "When this unit is destroyed, its owner draws 1 card." },
);

export const CARD_DEATH_DRAW_2: CardDefinition = unit(
  "CARD_DEATH_DRAW_2",
  "Grave Watcher",
  1, 1, 1,
  ["รักษา", "เป็นกลาง"],
  [Keyword.Deathrattle],
  "เมื่อยูนิตนี้ถูกทำลาย เจ้าของจั่วการ์ด 1 ใบ (When this unit is destroyed, its owner draws 1 card.)",
  undefined,
  { drawCards: 1, description: "When this unit is destroyed, its owner draws 1 card." },
);

export const CARD_DEATH_DRAW_3: CardDefinition = unit(
  "CARD_DEATH_DRAW_3",
  "Crypt Scribe",
  1, 1, 1,
  ["ยุทธศาสตร์", "เป็นกลาง"],
  [Keyword.Deathrattle],
  "เมื่อยูนิตนี้ถูกทำลาย เจ้าของจั่วการ์ด 1 ใบ (When this unit is destroyed, its owner draws 1 card.)",
  undefined,
  { drawCards: 1, description: "When this unit is destroyed, its owner draws 1 card." },
);

// ─── Canonical Reset Unit Cards (Group B: Vanilla Units — 3 Cards) ────────
// Ability: Ordinary vanilla units with no abilities or keywords.
export const CARD_VANILLA_1: CardDefinition = unit(
  "CARD_VANILLA_1",
  "Recruit Scout",
  1, 1, 1,
  ["เป็นกลาง"],
  [],
  "ยูนิตพื้นฐานทั่วไป ไม่มีอบิลิตี้ (Ordinary vanilla unit with no abilities.)",
);

export const CARD_VANILLA_2: CardDefinition = unit(
  "CARD_VANILLA_2",
  "Iron Sentry",
  1, 1, 1,
  ["พิทักษ์", "เป็นกลาง"],
  [],
  "ยูนิตพื้นฐานทั่วไป ไม่มีอบิลิตี้ (Ordinary vanilla unit with no abilities.)",
);

export const CARD_VANILLA_3: CardDefinition = unit(
  "CARD_VANILLA_3",
  "Border Vanguard",
  1, 1, 1,
  ["จอมพล", "เป็นกลาง"],
  [],
  "ยูนิตพื้นฐานทั่วไป ไม่มีอบิลิตี้ (Ordinary vanilla unit with no abilities.)",
);

// ─── Canonical Reset Unit Cards (Group C: Grant Durability — 1 Card) ──────
// Ability: "When this unit enters the battlefield, your units gain the 'ทนทาน' keyword."
export const CARD_GRANT_DURABILITY: CardDefinition = unit(
  "CARD_GRANT_DURABILITY",
  "Aegis Armorer",
  1, 1, 1,
  ["พิทักษ์", "เป็นกลาง"],
  [],
  "เมื่อยูนิตนี้ลงสู่สนาม ยูนิตฝ่ายเราทั้งหมดได้รับคีย์เวิร์ด 'ทนทาน' (When this unit enters the battlefield, your units gain the 'ทนทาน' keyword.)",
  undefined,
  undefined,
  {
    onEnterEffect: {
      grantKeyword: Keyword.Armored,
      target: "FRIENDLY_UNITS",
    },
  },
);

// ─── Canonical Reset Unit Cards (Group D: Hero Damage Draw — 1 Card) ──────
// Ability: "When this unit deals combat damage to the opposing hero, its owner draws 1 card."
export const CARD_HERO_DAMAGE_DRAW: CardDefinition = unit(
  "CARD_HERO_DAMAGE_DRAW",
  "Phantom Infiltrator",
  1, 1, 1,
  ["ปัญญา", "เป็นกลาง"],
  [],
  "เมื่อยูนิตนี้สร้างความเสียหายจากการต่อสู้แก่ฮีโร่ฝ่ายตรงข้าม เจ้าของจั่วการ์ด 1 ใบ (When this unit deals combat damage to the opposing hero, its owner draws 1 card.)",
  undefined,
  undefined,
  {
    onHeroDamageEffect: {
      drawCards: 1,
    },
  },
);

// ─── Canonical Reset Unit Cards (Group E: Adjacent Lane Damage — 1 Card) ──
// Ability: "Whenever this unit deals damage, also deal damage to units in the immediately adjacent lane on its left and right."
export const CARD_ADJACENT_DAMAGE: CardDefinition = unit(
  "CARD_ADJACENT_DAMAGE",
  "Cleave Berserker",
  1, 1, 1,
  ["จู่โจม", "เป็นกลาง"],
  [],
  "เมื่อยูนิตนี้สร้างความเสียหาย สร้างความเสียหายแก่ยูนิตในเลนที่ติดกันทางซ้ายและขวาด้วย (Whenever this unit deals damage, also deal damage to units in the immediately adjacent lane on its left and right.)",
  undefined,
  undefined,
  {
    adjacentLaneDamage: true,
  },
);

// ─── Equipment Cards ──────────────────────────────────────────
export const SPIKED_HELMET: CardDefinition = equipment(
  "EQ_SPIKED_HELMET", "Spiked Helmet", 2, "พิทักษ์",
  { attackBonus: 2, hpBonus: 2, grantedKeywords: [Keyword.Strikethrough] },
  "Attach to friendly unit: +2/+2 and grants Strikethrough.",
  "FRIENDLY_UNIT",
);

export const FERTILIZER_PACK: CardDefinition = equipment(
  "EQ_FERTILIZER_PACK", "Fertilizer Pack", 2, "จอมพล",
  { attackBonus: 3, hpBonus: 3 },
  "Attach to friendly unit: +3/+3 stat buff.",
  "FRIENDLY_UNIT",
);

// ─── Environment Cards (Ground Lanes 1 & 2 only) ──────────────
export const SOLAR_WINDS: CardDefinition = environment(
  "ENV_SOLAR_WINDS", "Solar Winds", 2, "ยุทธศาสตร์",
  { damagePerTurnEnd: 1 },
  "Environment: Ground lanes only. Deals 1 damage to all units in lane at turn end.",
);

export const BLACK_HOLE: CardDefinition = environment(
  "ENV_BLACK_HOLE", "Black Hole", 2, "ยุทธศาสตร์",
  { damagePerTurnEnd: 2 },
  "Environment: Ground lanes only. Deals 2 damage to all units in lane at turn end.",
);

// ─── Hero Superpowers ─────────────────────────────────────────

// Solar Flare Superpowers
export const SP_SUNBURN: CardDefinition = superpower(
  "SP_SUNBURN", "Sunburn", CardType.HeroAbility, "Superpower", 0,
  { damage: 2, target: "ANY" }, 0, 0, [],
  "Superpower: Deal 2 damage to any target.",
  "SINGLE_UNIT",
);

export const SP_WEED_WHACKER: CardDefinition = superpower(
  "SP_WEED_WHACKER", "Weed Whacker", CardType.HeroAbility, "Superpower", 0,
  { damage: 3, target: "UNIT" }, 0, 0, [],
  "Superpower: Deal 3 damage to an enemy unit.",
  "ENEMY_UNIT",
);

export const SP_MORE_SPORE: CardDefinition = superpower(
  "SP_MORE_SPORE", "More Spore", CardType.HeroAbility, "Superpower", 0,
  { buffAttack: 2, buffHp: 2, target: "UNIT" }, 0, 0, [],
  "Superpower: Give a friendly plant +2/+2.",
  "FRIENDLY_UNIT",
);

export const SP_SUN_BURST: CardDefinition = superpower(
  "SP_SUN_BURST", "Sun Burst", CardType.HeroAbility, "Superpower", 0,
  { heal: 4, drawCards: 1 }, 0, 0, [],
  "Superpower: Heal your Hero for 4 HP and draw 1 card.",
  "NONE",
);

// Super Brainz Superpowers
export const SP_TELEPATHY: CardDefinition = superpower(
  "SP_TELEPATHY", "Telepathy", CardType.HeroAbility, "Superpower", 0,
  { drawCards: 2 }, 0, 0, [],
  "Superpower: Draw 2 cards.",
  "NONE",
);

export const SP_CARRIED_AWAY: CardDefinition = superpower(
  "SP_CARRIED_AWAY", "Carried Away", CardType.HeroAbility, "Superpower", 0,
  { damage: 2, target: "HERO" }, 0, 0, [],
  "Superpower: Deal 2 damage directly to the enemy Hero.",
  "ENEMY_HERO",
);

export const SP_SUPER_STENCH: CardDefinition = superpower(
  "SP_SUPER_STENCH", "Super Stench", CardType.HeroAbility, "Superpower", 0,
  { buffAttack: 2, buffHp: 1, target: "UNIT" }, 0, 0, [],
  "Superpower: Give a friendly Zombie +2/+1.",
  "FRIENDLY_UNIT",
);

export const SP_CUT_DOWN_TO_SIZE: CardDefinition = superpower(
  "SP_CUT_DOWN_TO_SIZE", "Cut Down to Size", CardType.HeroAbility, "Superpower", 0,
  { damage: 5, target: "UNIT" }, 0, 0, [],
  "Superpower: Deal 5 damage to a high threat unit.",
  "ENEMY_UNIT",
);

// ─────────────────────────────────────────────────────────────
//  Hero A: Valen, The Sky Vanguard Superpowers
// ─────────────────────────────────────────────────────────────

export const SP_SKY_STRIKE: CardDefinition = superpower(
  "SP_SKY_STRIKE",
  "Sky Strike",
  CardType.HeroAbility,
  "Superpower",
  0,
  { damagePerUnitOnBoard: true, target: "ENEMY_HERO" },
  0,
  0,
  [],
  "Signature: Deal direct damage to the enemy Hero equal to the total number of units on the board.",
  "ENEMY_HERO",
);

export const SP_AERIAL_SURGE: CardDefinition = superpower(
  "SP_AERIAL_SURGE",
  "Aerial Surge",
  CardType.HeroAbility,
  "Superpower",
  0,
  { buffAttack: 2, buffHp: 2, grantKeyword: Keyword.Flying, target: "UNIT" },
  0,
  0,
  [],
  "Superpower: Give a friendly unit +2/+2 and Flying.",
  "FRIENDLY_UNIT",
);

export const SP_TAILWIND_DRAFT: CardDefinition = superpower(
  "SP_TAILWIND_DRAFT",
  "Tailwind Draft",
  CardType.HeroAbility,
  "Superpower",
  0,
  { drawCards: 2 },
  0,
  0,
  [],
  "Superpower: Draw 2 cards from your deck.",
  "NONE",
);

export const SP_GLACIAL_GALE: CardDefinition = superpower(
  "SP_GLACIAL_GALE",
  "Glacial Gale",
  CardType.HeroAbility,
  "Superpower",
  0,
  { freezeLane: true, target: "LANE" },
  0,
  0,
  [],
  "Superpower: Freeze all enemy units in the target lane.",
  "LANE",
);

// ─────────────────────────────────────────────────────────────
//  Hero B: Nereus, Abyssal Sorcerer Superpowers
// ─────────────────────────────────────────────────────────────

export const WATER_ELEMENTAL: CardDefinition = unit(
  "UNIT_WATER_ELEMENTAL",
  "Water Elemental",
  2,
  2,
  2,
  "Aquatic",
  [Keyword.Amphibious],
  "A summoned tidal elemental with Amphibious.",
  LaneType.Water,
);

export const SP_TIDAL_WAVE: CardDefinition = superpower(
  "SP_TIDAL_WAVE",
  "Tidal Wave",
  CardType.HeroAbility,
  "Superpower",
  0,
  { damageAllNonWater: 3 },
  0,
  0,
  [],
  "Signature: Massive tidal wave dealing 3 damage to all non-water units on the board.",
  "NONE",
);

export const SP_SOOTHING_CURRENT: CardDefinition = superpower(
  "SP_SOOTHING_CURRENT",
  "Soothing Current",
  CardType.HeroAbility,
  "Superpower",
  0,
  { heal: 5 },
  0,
  0,
  [],
  "Superpower: Heal your Hero for 5 HP.",
  "NONE",
);

export const SP_CORAL_AEGIS: CardDefinition = superpower(
  "SP_CORAL_AEGIS",
  "Coral Aegis",
  CardType.HeroAbility,
  "Superpower",
  0,
  { applyStatus: "SHIELD", target: "UNIT" },
  0,
  0,
  [],
  "Superpower: Grant Shield to a friendly unit.",
  "FRIENDLY_UNIT",
);

export const SP_AQUATIC_CONJURATION: CardDefinition = superpower(
  "SP_AQUATIC_CONJURATION",
  "Aquatic Conjuration",
  CardType.HeroAbility,
  "Superpower",
  0,
  { summonCardId: "UNIT_WATER_ELEMENTAL" },
  0,
  0,
  [],
  "Superpower: Summon a 2/2 Water Elemental into an open lane.",
  "NONE",
);

// ─────────────────────────────────────────────────────────────
//  Aegis Guardian Superpowers (4 Custom Abilities)
// ─────────────────────────────────────────────────────────────

export const SP_SHIELD_OF_LEGEND: CardDefinition = superpower(
  "card_sp_shield_of_legend",
  "Shield of Legend",
  CardType.HeroAbility,
  "Superpower",
  0,
  {},
  0,
  0,
  [],
  "เมื่อใช้ จนจบเทิร์นนี้ ฮีโร่ของคุณและยูนิททั้งหมดของคุณจะไม่ได้รับความเสียหายทุกกรณี",
  "NONE",
);

export const SP_HUMAN_SHIELD: CardDefinition = {
  id: "card_sp_human_shield",
  name: "Human Shield",
  type: CardType.Equipment,
  cost: 1,
  attack: 0,
  hp: 0,
  tribes: ["Superpower"],
  tribe: "Superpower",
  keywords: [],
  targetType: "FRIENDLY_UNIT",
  equipmentEffect: {
    attackBonus: 0,
    hpBonus: 2,
    grantedKeywords: [Keyword.Armored],
  },
  text: "เลือกสวมให้ยูนิทฝ่ายเรา 1 ตัวในสนาม ยูนิทนั้นได้รับ HP +2 และได้รับคีย์เวิร์ด 'ทนทาน' (Armor / ทนทาน)",
};

export const SP_SUPPRESS_ANGER: CardDefinition = superpower(
  "card_sp_suppress_anger",
  "Suppress one's anger",
  CardType.HeroAbility,
  "Superpower",
  1,
  {},
  0,
  0,
  [],
  "เมื่อใช้ จั่วการ์ด 2 ใบ: ยูนิทที่มี HP สูงสุดในเด็ค 1 ใบ และการ์ดเวท 1 ใบ",
  "NONE",
);

export const SP_LEAVE_TO_DUST: CardDefinition = superpower(
  "card_sp_leave_to_dust",
  "Leave it to the dust",
  CardType.HeroAbility,
  "Superpower",
  1,
  {},
  0,
  0,
  [],
  "เมื่อใช้ ทำให้ยูนิทศัตรูทั้งหมดในสนาม Atk -1",
  "NONE",
);

// ─── Hero Definitions ─────────────────────────────────────────

export const HERO_AEGIS_GUARDIAN: Hero = {
  id: "hero_aegis_guardian",
  name: "Aegis Guardian",
  title: "The Indomitable Bulwark",
  description: "ผู้พิทักษ์แห่งโล่ ผู้ใช้พลังป้องกันและสะกดกลั้นการโจมตี ปกป้องพวกพ้องและเปลี่ยนสนามรบให้เป็นป้อมปราการอันไร้พ่าย",
  portraitUrl: "🛡️",
  maxHp: 20,
  startingHp: 20,
  allowedTribes: ["ปัญญา", "จอมพล", "จู่โจม", "รักษา", "พิทักษ์", "ยุทธศาสตร์", "จอมอาคม", "เป็นกลาง"],
  tribeSynergies: ["พิทักษ์", "รักษา", "ปัญญา"],
  superpowerKit: {
    signatureAbility: SP_SHIELD_OF_LEGEND,
    coreAbilities: [SP_HUMAN_SHIELD, SP_SUPPRESS_ANGER, SP_LEAVE_TO_DUST],
  },
  superpowers: [SP_SHIELD_OF_LEGEND, SP_HUMAN_SHIELD, SP_SUPPRESS_ANGER, SP_LEAVE_TO_DUST],
};

export const AVAILABLE_HEROES: readonly Hero[] = [
  HERO_AEGIS_GUARDIAN,
];

// Compatibility aliases
export const HERO_DEFAULT = HERO_AEGIS_GUARDIAN;
export const HERO_A = HERO_AEGIS_GUARDIAN;
export const HERO_B = HERO_AEGIS_GUARDIAN;
export const HERO_SKY_VANGUARD = HERO_AEGIS_GUARDIAN;
export const HERO_ABYSSAL_SORCERER = HERO_AEGIS_GUARDIAN;
export const HERO_SOLAR_FLARE = HERO_AEGIS_GUARDIAN;
export const HERO_SUPER_BRAINZ = HERO_AEGIS_GUARDIAN;

// ─── Pre-built Sample Decks ───────────────────────────────────

/** Standard 40-card competitive Plant Deck */
export const DECK_PLANTS_40: CardDefinition[] = [
  CARD_DEATH_DRAW_1, CARD_DEATH_DRAW_1, CARD_DEATH_DRAW_1, CARD_DEATH_DRAW_1,
  CARD_DEATH_DRAW_2, CARD_DEATH_DRAW_2, CARD_DEATH_DRAW_2, CARD_DEATH_DRAW_2,
  CARD_DEATH_DRAW_3, CARD_DEATH_DRAW_3, CARD_DEATH_DRAW_3, CARD_DEATH_DRAW_3,
  CARD_VANILLA_1, CARD_VANILLA_1, CARD_VANILLA_1, CARD_VANILLA_1,
  CARD_VANILLA_2, CARD_VANILLA_2, CARD_VANILLA_2, CARD_VANILLA_2,
  CARD_VANILLA_3, CARD_VANILLA_3, CARD_VANILLA_3, CARD_VANILLA_3,
  CARD_GRANT_DURABILITY, CARD_GRANT_DURABILITY, CARD_GRANT_DURABILITY, CARD_GRANT_DURABILITY,
  CARD_HERO_DAMAGE_DRAW, CARD_HERO_DAMAGE_DRAW, CARD_HERO_DAMAGE_DRAW, CARD_HERO_DAMAGE_DRAW,
  CARD_ADJACENT_DAMAGE, CARD_ADJACENT_DAMAGE, CARD_ADJACENT_DAMAGE, CARD_ADJACENT_DAMAGE,
  SPIKED_HELMET, SPIKED_HELMET,
  SOLAR_WINDS, SOLAR_WINDS,
];

/** Standard 40-card competitive Zombie Deck */
export const DECK_ZOMBIES_40: CardDefinition[] = [
  CARD_DEATH_DRAW_1, CARD_DEATH_DRAW_1, CARD_DEATH_DRAW_1, CARD_DEATH_DRAW_1,
  CARD_DEATH_DRAW_2, CARD_DEATH_DRAW_2, CARD_DEATH_DRAW_2, CARD_DEATH_DRAW_2,
  CARD_DEATH_DRAW_3, CARD_DEATH_DRAW_3, CARD_DEATH_DRAW_3, CARD_DEATH_DRAW_3,
  CARD_VANILLA_1, CARD_VANILLA_1, CARD_VANILLA_1, CARD_VANILLA_1,
  CARD_VANILLA_2, CARD_VANILLA_2, CARD_VANILLA_2, CARD_VANILLA_2,
  CARD_VANILLA_3, CARD_VANILLA_3, CARD_VANILLA_3, CARD_VANILLA_3,
  CARD_GRANT_DURABILITY, CARD_GRANT_DURABILITY, CARD_GRANT_DURABILITY, CARD_GRANT_DURABILITY,
  CARD_HERO_DAMAGE_DRAW, CARD_HERO_DAMAGE_DRAW, CARD_HERO_DAMAGE_DRAW, CARD_HERO_DAMAGE_DRAW,
  CARD_ADJACENT_DAMAGE, CARD_ADJACENT_DAMAGE, CARD_ADJACENT_DAMAGE, CARD_ADJACENT_DAMAGE,
  FERTILIZER_PACK, FERTILIZER_PACK,
  BLACK_HOLE, BLACK_HOLE,
];

/** Standard 40-card competitive Vanguard / Sky Deck */
export const DECK_VANGUARD_40: CardDefinition[] = [...DECK_PLANTS_40];

/** Standard 40-card competitive Abyssal / Sorcerer Deck */
export const DECK_ABYSSAL_40: CardDefinition[] = [...DECK_ZOMBIES_40];

/** A 20-card Plant deck covering sample archetypes. */
export const SAMPLE_PLANT_DECK: CardDefinition[] = DECK_PLANTS_40.slice(0, 20);

/** A 20-card Zombie deck covering sample archetypes. */
export const SAMPLE_ZOMBIE_DECK: CardDefinition[] = DECK_ZOMBIES_40.slice(0, 20);

// ─────────────────────────────────────────────────────────────
//  Master Static Registry
// ─────────────────────────────────────────────────────────────

export const ALL_STATIC_CARDS: CardDefinition[] = (() => {
  const seen = new Set<string>();
  const all: CardDefinition[] = [
    // Exactly 9 Canonical Reset Units
    CARD_DEATH_DRAW_1,
    CARD_DEATH_DRAW_2,
    CARD_DEATH_DRAW_3,
    CARD_VANILLA_1,
    CARD_VANILLA_2,
    CARD_VANILLA_3,
    CARD_GRANT_DURABILITY,
    CARD_HERO_DAMAGE_DRAW,
    CARD_ADJACENT_DAMAGE,
    // Preserved Non-Unit / Non-Spell Cards
    SPIKED_HELMET,
    FERTILIZER_PACK,
    SOLAR_WINDS,
    BLACK_HOLE,
    // Preserved Hero Superpowers
    SP_SHIELD_OF_LEGEND,
    SP_HUMAN_SHIELD,
    SP_SUPPRESS_ANGER,
    SP_LEAVE_TO_DUST,
    SP_SKY_STRIKE,
    SP_AERIAL_SURGE,
    SP_TAILWIND_DRAFT,
    SP_GLACIAL_GALE,
    SP_TIDAL_WAVE,
    SP_SOOTHING_CURRENT,
    SP_CORAL_AEGIS,
    SP_AQUATIC_CONJURATION,
    SP_SUNBURN,
    SP_WEED_WHACKER,
    SP_MORE_SPORE,
    SP_SUN_BURST,
    SP_TELEPATHY,
    SP_CARRIED_AWAY,
    SP_SUPER_STENCH,
    SP_CUT_DOWN_TO_SIZE,
  ];
  return all.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
})();

export const ALL_CARDS: CardDefinition[] = ALL_STATIC_CARDS;

const _staticCardsMap = new Map<string, CardDefinition>(
  ALL_STATIC_CARDS.map((c) => [c.id, c])
);

/** Single lookup for static card definitions by ID */
export function getStaticCardById(id: string): CardDefinition | null {
  return _staticCardsMap.get(id) ?? null;
}

