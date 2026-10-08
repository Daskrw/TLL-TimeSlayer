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
  TargetType,
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
): CardDefinition {
  const tribes = normalizeTribes(tribe);
  return {
    id, name, type: CardType.Unit, cost, attack, hp,
    tribes,
    tribe: tribes[0] || "เป็นกลาง",
    keywords,
    ...(text               !== undefined ? { text }               : {}),
    ...(laneTypeRestriction !== undefined ? { laneTypeRestriction } : {}),
    ...(deathrattleEffect   !== undefined ? { deathrattleEffect }   : {}),
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

// ─── Ground Units ─────────────────────────────────────────────
export const SUNFLOWER: CardDefinition = unit(
  "CARD_SUNFLOWER", "Sunflower", 1, 1, 2, "รักษา",
  [],
  "A cheerful healer. (No keywords — basic vanilla unit.)",
);

export const PEASHOOTER: CardDefinition = unit(
  "CARD_PEASHOOTER", "Peashooter", 2, 2, 2, "จอมพล",
  [Keyword.Rush],
  "Fires immediately upon planting.",
);

export const WALL_NUT: CardDefinition = unit(
  "CARD_WALL_NUT", "Wall-nut", 2, 0, 5, "พิทักษ์",
  [],
  "A sturdy wall. Low attack, very high HP.",
);

export const BONK_CHOY: CardDefinition = unit(
  "CARD_BONK_CHOY", "Bonk Choy", 3, 3, 3, "จู่โจม",
  [Keyword.DoubleStrike],
  "Punches twice! Hits the opposing unit twice in combat.",
);

export const CHOMPER: CardDefinition = unit(
  "CARD_CHOMPER", "Chomper", 3, 4, 2, "จู่โจม",
  [Keyword.Piercing],
  "Bites through — deals damage to both the unit and the hero behind it.",
);

export const TALLNUT: CardDefinition = unit(
  "CARD_TALLNUT", "Tall-nut", 4, 1, 8, "พิทักษ์",
  [Keyword.Deathrattle],
  "When Tall-nut is destroyed, it leaves behind a Wall-nut (effect handled by deathrattle registry).",
);

// ─── Aerial Units (Lane 0 only) ───────────────────────────────
export const HOMING_THISTLE: CardDefinition = unit(
  "CARD_HOMING_THISTLE", "Homing Thistle", 2, 2, 1, "ปัญญา",
  [Keyword.Flying, Keyword.Rush],
  "A flying plant that strikes the moment it lands.",
);

export const ROTOBAGA: CardDefinition = unit(
  "CARD_ROTOBAGA", "Rotobaga", 3, 2, 3, "ยุทธศาสตร์",
  [Keyword.Flying, Keyword.Piercing],
  "Flies above the battlefield and pierces through everything below.",
);

export const AIR_RAID_ZOMBIE: CardDefinition = unit(
  "CARD_AIR_RAID_ZOMBIE", "Air Raid Zombie", 4, 4, 3, "จอมพล",
  [Keyword.Flying, Keyword.DoubleStrike],
  "An airborne zombie that strikes twice.",
);

// ─── Water Units (Lane 3 only) ────────────────────────────────
export const LILY_PAD: CardDefinition = unit(
  "CARD_LILY_PAD", "Lily Pad", 1, 0, 3, "รักษา",
  [Keyword.Amphibious],
  "Floats on water. No attack, but gives allied aquatic units cover.",
);

export const SPIKEWEED: CardDefinition = unit(
  "CARD_SPIKEWEED_AQUA", "Aqua Spikeweed", 2, 1, 4, "ยุทธศาสตร์",
  [Keyword.Amphibious, Keyword.Deathrattle],
  "A submerged spikeweed. On death, deals 1 damage to all enemies (future registry effect).",
);

export const SEA_ZOMBIE: CardDefinition = unit(
  "CARD_SEA_ZOMBIE", "Sea Zombie", 3, 3, 3, "ยุทธศาสตร์",
  [Keyword.Amphibious, Keyword.Rush],
  "Lunges from the water immediately.",
);

// ─── Zombie Ground Units ──────────────────────────────────────
export const BASIC_ZOMBIE: CardDefinition = unit(
  "CARD_BASIC_ZOMBIE", "Basic Zombie", 1, 1, 1, "เป็นกลาง",
  [],
  "The most basic of all undead.",
);

export const CONEHEAD_ZOMBIE: CardDefinition = unit(
  "CARD_CONEHEAD_ZOMBIE", "Cone-head Zombie", 2, 2, 3, "พิทักษ์",
  [],
  "Wears a cone for extra protection.",
);

export const BUCKETHEAD_ZOMBIE: CardDefinition = unit(
  "CARD_BUCKETHEAD_ZOMBIE", "Buckethead Zombie", 3, 2, 5, "พิทักษ์",
  [Keyword.Deathrattle],
  "Upon defeat, the bucket becomes a shield for another zombie (deathrattle registry).",
);

export const ZOMBIE_JESTER: CardDefinition = unit(
  "CARD_ZOMBIE_JESTER", "Jester Zombie", 2, 3, 1, "จู่โจม",
  [Keyword.Piercing, Keyword.Rush],
  "Rushes in and stabs through everything.",
);

export const BULLY_ZOMBIE: CardDefinition = unit(
  "CARD_BULLY_ZOMBIE", "Bully Zombie", 3, 3, 3, "จู่โจม",
  [Keyword.DoubleStrike, Keyword.Piercing],
  "Double-strikes with full piercing on each hit.",
);

// ─── Spells ───────────────────────────────────────────────────
export const FERTILIZE: CardDefinition = spell(
  "SPELL_FERTILIZE", "Fertilize", 2, "จอมอาคม",
  "Give a friendly unit +2/+2.",
  { buffAttack: 2, buffHp: 2, target: "UNIT" },
  "FRIENDLY_UNIT",
);

export const LIGHTNING_REED: CardDefinition = spell(
  "SPELL_LIGHTNING_REED", "Lightning Reed", 3, "จอมอาคม",
  "Deal 3 damage to any target.",
  { damage: 3, target: "UNIT" },
  "SINGLE_UNIT",
);

export const BRAINS_FOR_BRAINS: CardDefinition = spell(
  "SPELL_BRAINS", "Brains for Brains", 1, "ปัญญา",
  "Draw 2 cards.",
  { drawCards: 2 },
  "NONE",
);

export const WEED_SPRAY: CardDefinition = spell(
  "SPELL_WEED_SPRAY", "Weed Spray", 4, "จอมอาคม",
  "Deal 2 damage to all enemy units.",
  { damage: 2, target: "ALL_UNITS" },
  "ALL_ENEMIES",
);

// ─── Support Units ───────────────────────────────────────────
export const TORCHWOOD: CardDefinition = unit(
  "CARD_TORCHWOOD", "Torchwood", 1, 0, 4, "จอมพล",
  [Keyword.Support],
  "Support: Shares a lane behind a frontline unit.",
);

export const CHEF_ZOMBIE: CardDefinition = unit(
  "CARD_CHEF_ZOMBIE", "Chef Zombie", 2, 1, 3, "จอมพล",
  [Keyword.Support],
  "Support: Backline support that feeds allies.",
);

// ─── Deathrattle Cascading Units ──────────────────────────────
export const DOOM_SHROOM: CardDefinition = unit(
  "CARD_DOOM_SHROOM", "Doom-shroom", 4, 0, 2, "ยุทธศาสตร์",
  [Keyword.Deathrattle],
  "Deathrattle: Deals 3 damage to all units in adjacent lanes!",
  undefined,
  { damage: 3, target: "ADJACENT_LANES" },
);

export const BARREL_OF_DEADBEARDS: CardDefinition = unit(
  "CARD_BARREL_DEADBEARDS", "Barrel of Deadbeards", 2, 0, 1, "ยุทธศาสตร์",
  [Keyword.Deathrattle],
  "Deathrattle: Deals 1 damage to all units in adjacent lanes!",
  undefined,
  { damage: 1, target: "ADJACENT_LANES" },
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

/** A 20-card Plant deck covering all lane types and keywords. */
export const SAMPLE_PLANT_DECK: CardDefinition[] = [
  SUNFLOWER, SUNFLOWER,
  PEASHOOTER, PEASHOOTER,
  WALL_NUT, WALL_NUT,
  BONK_CHOY, BONK_CHOY,
  CHOMPER,
  TALLNUT,
  HOMING_THISTLE, HOMING_THISTLE,
  ROTOBAGA,
  LILY_PAD, LILY_PAD,
  SPIKEWEED,
  FERTILIZE, FERTILIZE,
  LIGHTNING_REED, LIGHTNING_REED,
];

/** A 20-card Zombie deck covering all lane types and keywords. */
export const SAMPLE_ZOMBIE_DECK: CardDefinition[] = [
  BASIC_ZOMBIE, BASIC_ZOMBIE,
  CONEHEAD_ZOMBIE, CONEHEAD_ZOMBIE,
  BUCKETHEAD_ZOMBIE,
  ZOMBIE_JESTER, ZOMBIE_JESTER,
  BULLY_ZOMBIE,
  AIR_RAID_ZOMBIE,
  SEA_ZOMBIE, SEA_ZOMBIE,
  BRAINS_FOR_BRAINS, BRAINS_FOR_BRAINS,
  WEED_SPRAY,
  BASIC_ZOMBIE,
  CONEHEAD_ZOMBIE,
  BUCKETHEAD_ZOMBIE,
  ZOMBIE_JESTER,
  SEA_ZOMBIE,
  AIR_RAID_ZOMBIE,
];

/** Standard 40-card competitive Plant Deck */
export const DECK_PLANTS_40: CardDefinition[] = [
  SUNFLOWER, SUNFLOWER, SUNFLOWER, SUNFLOWER,
  PEASHOOTER, PEASHOOTER, PEASHOOTER, PEASHOOTER,
  WALL_NUT, WALL_NUT, WALL_NUT,
  TORCHWOOD, TORCHWOOD, TORCHWOOD,
  BONK_CHOY, BONK_CHOY, BONK_CHOY,
  CHOMPER, CHOMPER,
  TALLNUT, TALLNUT,
  DOOM_SHROOM, DOOM_SHROOM,
  HOMING_THISTLE, HOMING_THISTLE, HOMING_THISTLE,
  ROTOBAGA, ROTOBAGA,
  LILY_PAD, LILY_PAD,
  SPIKEWEED, SPIKEWEED,
  FERTILIZE, FERTILIZE,
  FERTILIZER_PACK, FERTILIZER_PACK,
  SOLAR_WINDS, SOLAR_WINDS,
  LIGHTNING_REED, LIGHTNING_REED,
];

/** Standard 40-card competitive Zombie Deck */
export const DECK_ZOMBIES_40: CardDefinition[] = [
  BASIC_ZOMBIE, BASIC_ZOMBIE, BASIC_ZOMBIE, BASIC_ZOMBIE,
  CHEF_ZOMBIE, CHEF_ZOMBIE, CHEF_ZOMBIE,
  CONEHEAD_ZOMBIE, CONEHEAD_ZOMBIE, CONEHEAD_ZOMBIE,
  BUCKETHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE,
  BARREL_OF_DEADBEARDS, BARREL_OF_DEADBEARDS,
  ZOMBIE_JESTER, ZOMBIE_JESTER, ZOMBIE_JESTER,
  BULLY_ZOMBIE, BULLY_ZOMBIE,
  AIR_RAID_ZOMBIE, AIR_RAID_ZOMBIE, AIR_RAID_ZOMBIE,
  SEA_ZOMBIE, SEA_ZOMBIE, SEA_ZOMBIE,
  SPIKED_HELMET, SPIKED_HELMET, SPIKED_HELMET,
  BLACK_HOLE, BLACK_HOLE,
  BRAINS_FOR_BRAINS, BRAINS_FOR_BRAINS, BRAINS_FOR_BRAINS,
  WEED_SPRAY, WEED_SPRAY,
  CONEHEAD_ZOMBIE,
  BUCKETHEAD_ZOMBIE,
  BULLY_ZOMBIE,
  SEA_ZOMBIE,
  AIR_RAID_ZOMBIE,
];

/** Standard 40-card competitive Vanguard / Sky Deck */
export const DECK_VANGUARD_40: CardDefinition[] = [
  HOMING_THISTLE, HOMING_THISTLE, HOMING_THISTLE, HOMING_THISTLE,
  ROTOBAGA, ROTOBAGA, ROTOBAGA, ROTOBAGA,
  AIR_RAID_ZOMBIE, AIR_RAID_ZOMBIE,
  PEASHOOTER, PEASHOOTER, PEASHOOTER, PEASHOOTER,
  BONK_CHOY, BONK_CHOY, BONK_CHOY,
  TORCHWOOD, TORCHWOOD, TORCHWOOD,
  CHOMPER, CHOMPER,
  WALL_NUT, WALL_NUT, WALL_NUT,
  FERTILIZE, FERTILIZE,
  FERTILIZER_PACK, FERTILIZER_PACK,
  LIGHTNING_REED, LIGHTNING_REED, LIGHTNING_REED,
  DOOM_SHROOM, DOOM_SHROOM,
  SOLAR_WINDS, SOLAR_WINDS,
  LILY_PAD, LILY_PAD,
  SEA_ZOMBIE, SEA_ZOMBIE,
];

/** Standard 40-card competitive Abyssal / Sorcerer Deck */
export const DECK_ABYSSAL_40: CardDefinition[] = [
  LILY_PAD, LILY_PAD, LILY_PAD, LILY_PAD,
  SPIKEWEED, SPIKEWEED, SPIKEWEED, SPIKEWEED,
  SEA_ZOMBIE, SEA_ZOMBIE, SEA_ZOMBIE, SEA_ZOMBIE,
  TALLNUT, TALLNUT, TALLNUT,
  BUCKETHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE,
  CHEF_ZOMBIE, CHEF_ZOMBIE, CHEF_ZOMBIE,
  BARREL_OF_DEADBEARDS, BARREL_OF_DEADBEARDS,
  ZOMBIE_JESTER, ZOMBIE_JESTER,
  BULLY_ZOMBIE, BULLY_ZOMBIE,
  SPIKED_HELMET, SPIKED_HELMET, SPIKED_HELMET,
  BLACK_HOLE, BLACK_HOLE,
  BRAINS_FOR_BRAINS, BRAINS_FOR_BRAINS, BRAINS_FOR_BRAINS,
  WEED_SPRAY, WEED_SPRAY,
  CONEHEAD_ZOMBIE, CONEHEAD_ZOMBIE,
  BASIC_ZOMBIE, BASIC_ZOMBIE,
];

// ─────────────────────────────────────────────────────────────
//  Master Static Registry
// ─────────────────────────────────────────────────────────────

export const ALL_STATIC_CARDS: CardDefinition[] = (() => {
  const seen = new Set<string>();
  const all: CardDefinition[] = [
    SUNFLOWER, PEASHOOTER, WALL_NUT, BONK_CHOY, CHOMPER, TALLNUT,
    HOMING_THISTLE, ROTOBAGA, AIR_RAID_ZOMBIE,
    LILY_PAD, SPIKEWEED, SEA_ZOMBIE,
    BASIC_ZOMBIE, CONEHEAD_ZOMBIE, BUCKETHEAD_ZOMBIE,
    ZOMBIE_JESTER, BULLY_ZOMBIE,
    FERTILIZE, LIGHTNING_REED,
    BRAINS_FOR_BRAINS, WEED_SPRAY,
    TORCHWOOD, CHEF_ZOMBIE,
    DOOM_SHROOM, BARREL_OF_DEADBEARDS,
    SPIKED_HELMET, FERTILIZER_PACK,
    SOLAR_WINDS, BLACK_HOLE,
    // Superpowers
    SP_SHIELD_OF_LEGEND, SP_HUMAN_SHIELD,
    SP_SUPPRESS_ANGER, SP_LEAVE_TO_DUST,
    SP_SKY_STRIKE, SP_AERIAL_SURGE,
    SP_TAILWIND_DRAFT, SP_GLACIAL_GALE,
    SP_TIDAL_WAVE, SP_SOOTHING_CURRENT,
    SP_CORAL_AEGIS, SP_AQUATIC_CONJURATION,
    SP_SUNBURN, SP_WEED_WHACKER,
    SP_MORE_SPORE, SP_SUN_BURST,
    SP_TELEPATHY, SP_CARRIED_AWAY,
    SP_SUPER_STENCH, SP_CUT_DOWN_TO_SIZE,
  ];
  return all.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
})();

const _staticCardsMap = new Map<string, CardDefinition>(
  ALL_STATIC_CARDS.map((c) => [c.id, c])
);

/** Single lookup for static card definitions by ID */
export function getStaticCardById(id: string): CardDefinition | null {
  return _staticCardsMap.get(id) ?? null;
}

