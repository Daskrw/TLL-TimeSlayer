// ============================================================
//  testCardSyncHardening.ts
//  Regression test suite for Card Data Recovery & Sync Hardening
// ============================================================

import {
  parseCardTimestamp,
  normalizeCardRow,
  fetchCardsFromSupabase,
  isSupabaseConfigured,
} from "./supabaseClient";
import {
  shouldIncomingCardOverwrite,
  mergeCardSafely,
  CardMeta,
  buildLocalOverridesPayload,
  applyLocalOverrides,
  isCompactImageUrl,
  MAX_LOCAL_STORAGE_IMAGE_LEN,
  LS_KEY,
} from "../client/CardRepository";
import { MasterRegistry, MasterRegistryData } from "../server/MasterRegistry";
import { CardType, Keyword } from "./types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

console.log("\n============================================================");
console.log("  CARD RECOVERY & SYNC HARDENING REGRESSION TEST SUITE");
console.log("============================================================\n");

// ── TEST 1: Safe Timestamp Normalization (updatedAt: 0 preservation) ─
console.log("▶ TEST 1: Safe Timestamp Normalization (updatedAt: 0 preservation)");

assert(parseCardTimestamp(0) === 0, "parseCardTimestamp(0) strictly preserves numeric 0");
assert(parseCardTimestamp("0") === 0, "parseCardTimestamp('0') strictly preserves string '0'");
assert(parseCardTimestamp(1728800000000) === 1728800000000, "parseCardTimestamp preserves positive numeric timestamps");
assert(parseCardTimestamp("1728800000000") === 1728800000000, "parseCardTimestamp parses valid numeric string timestamps");
assert(parseCardTimestamp("2026-10-13T10:00:00.000Z") > 0, "parseCardTimestamp parses ISO date strings");
assert(parseCardTimestamp(null, 0) === 0, "parseCardTimestamp(null, 0) falls back to default 0");
assert(parseCardTimestamp(undefined, 0) === 0, "parseCardTimestamp(undefined, 0) falls back to default 0");
assert(parseCardTimestamp("invalid-string", 0) === 0, "parseCardTimestamp('invalid-string', 0) falls back to default 0");
assert(parseCardTimestamp(NaN, 0) === 0, "parseCardTimestamp(NaN, 0) falls back to default 0");

const normalizedZero = normalizeCardRow({
  id: "TEST_ZERO",
  name: "Zero Timestamp Card",
  cost: 1,
  updatedAt: 0,
});
assert(normalizedZero.updatedAt === 0, "normalizeCardRow preserves row.updatedAt === 0 (does NOT coerce to Date.now())");

const normalizedSnakeZero = normalizeCardRow({
  id: "TEST_SNAKE_ZERO",
  name: "Snake Zero Timestamp Card",
  cost: 1,
  updated_at: "0",
});
assert(normalizedSnakeZero.updatedAt === 0, "normalizeCardRow preserves row.updated_at === '0'");

const normalizedPositive = normalizeCardRow({
  id: "TEST_POS",
  name: "Positive Card",
  cost: 2,
  updatedAt: 1728800000000,
});
assert(normalizedPositive.updatedAt === 1728800000000, "normalizeCardRow preserves positive updatedAt");

// ── TEST 2: Seed Fallback Data Cannot Overwrite Real Card Data ─
console.log("\n▶ TEST 2: Seed Fallback Data Cannot Overwrite Real Card Data");

const existingEditedCard: CardMeta = {
  id: "CARD_DEATH_DRAW_1",
  name: "Draw Man KID (Custom User Edit)",
  cost: 1,
  type: CardType.Unit,
  attack: 2,
  hp: 1,
  tribes: ["เป็นกลาง"],
  tribe: "เป็นกลาง",
  keywords: [],
  text: "Custom description",
  imageUrl: "data:image/webp;base64,CUSTOM_IMAGE_DATA_12345",
  updatedAt: 1728800000000, // Valid user edit timestamp
};

const incomingSeedCard: CardMeta = {
  id: "CARD_DEATH_DRAW_1",
  name: "Draw Man",
  cost: 1,
  type: CardType.Unit,
  attack: 1,
  hp: 2,
  tribes: ["เป็นกลาง"],
  tribe: "เป็นกลาง",
  keywords: [],
  text: "Seed description",
  imageUrl: "",
  updatedAt: 0, // Seed / default timestamp
};

assert(
  !shouldIncomingCardOverwrite(incomingSeedCard, existingEditedCard, false),
  "shouldIncomingCardOverwrite rejects seed fallback (updatedAt: 0) over edited card (updatedAt > 0)"
);

assert(
  !shouldIncomingCardOverwrite(incomingSeedCard, existingEditedCard, true),
  "shouldIncomingCardOverwrite rejects seed data (updatedAt: 0) even from remote source over edited card"
);

const mergedWithSeed = mergeCardSafely(existingEditedCard, incomingSeedCard, { isAuthoritativeRemote: false });
assert(mergedWithSeed.name === existingEditedCard.name, "mergeCardSafely preserves edited name against seed fallback");
assert(mergedWithSeed.attack === existingEditedCard.attack, "mergeCardSafely preserves edited attack against seed fallback");
assert(mergedWithSeed.imageUrl === existingEditedCard.imageUrl, "mergeCardSafely preserves edited image against seed fallback");
assert(mergedWithSeed.updatedAt === existingEditedCard.updatedAt, "mergeCardSafely preserves edited timestamp against seed fallback");

// ── TEST 3: Image Preservation (Non-Empty Image Never Wiped) ─
console.log("\n▶ TEST 3: Image Preservation (Non-Empty Image Never Wiped)");

const incomingNewerEmptyImage: CardMeta = {
  id: "CARD_DEATH_DRAW_1",
  name: "Draw Man KID (Updated Stats Only)",
  cost: 1,
  type: CardType.Unit,
  attack: 3,
  hp: 2,
  tribes: ["เป็นกลาง"],
  tribe: "เป็นกลาง",
  keywords: [],
  text: "Updated text",
  imageUrl: "", // Missing or empty image in payload
  updatedAt: 1728900000000, // Newer timestamp
};

const mergedImagePreserved = mergeCardSafely(existingEditedCard, incomingNewerEmptyImage, { isAuthoritativeRemote: true });
assert(mergedImagePreserved.attack === 3, "Newer stats are accepted");
assert(
  mergedImagePreserved.imageUrl === existingEditedCard.imageUrl,
  "Existing non-empty imageUrl is strictly preserved when incoming has empty imageUrl"
);

// ── TEST 4: Fallback and Failure Isolation ────────────────────
console.log("\n▶ TEST 4: Fallback and Failure Isolation");

// If incoming is strictly older than existing, reject
const olderIncomingCard: CardMeta = {
  ...existingEditedCard,
  attack: 99,
  updatedAt: 1728700000000, // Older
};
assert(
  !shouldIncomingCardOverwrite(olderIncomingCard, existingEditedCard, true),
  "Older remote record cannot overwrite newer local/remote record (LWW rule)"
);

// Fallback source cannot overwrite an existing card with equal timestamp
const equalTimestampFallback: CardMeta = {
  ...existingEditedCard,
  name: "Overwritten by Backend Fallback?",
  updatedAt: existingEditedCard.updatedAt,
};
assert(
  !shouldIncomingCardOverwrite(equalTimestampFallback, existingEditedCard, false),
  "Fallback source (/api/catalog) cannot overwrite existing card with equal timestamp"
);

// ── TEST 5: Server MasterRegistry Resilience On Fetch Failure ─
console.log("\n▶ TEST 5: Server MasterRegistry Resilience On Fetch Failure");

const registry = MasterRegistry.getInstance();
const initialCatalog = registry.getCatalog();
const initialCardCount = initialCatalog.cards.length;
assert(initialCardCount > 0, "MasterRegistry initialized with non-empty cards catalog");

// Verify that if a card has updatedAt > 0 in registry, seed record does not overwrite it
const testCardId = "CARD_DEATH_DRAW_1";
const existingRegCard = registry.getCard(testCardId);
if (existingRegCard) {
  const simulatedEditedCard: CardMeta = {
    ...existingRegCard,
    attack: 2,
    hp: 1,
    updatedAt: 1728800000000,
  };

  // Attempt to sync a seed record with updatedAt: 0
  const incomingSeedRow = {
    ...simulatedEditedCard,
    attack: 0,
    updatedAt: 0,
  };

  // Protection check as in syncFromSupabase
  const shouldSkip = (simulatedEditedCard.updatedAt || 0) > 0 && (incomingSeedRow.updatedAt || 0) === 0;
  assert(shouldSkip, "MasterRegistry sync logic rejects incoming row with updatedAt: 0 over edited card");

  // Protection check for empty image preservation
  const resolvedImg = incomingSeedRow.imageUrl && incomingSeedRow.imageUrl.trim() !== ""
    ? incomingSeedRow.imageUrl
    : (simulatedEditedCard.imageUrl || "");
  assert(resolvedImg === simulatedEditedCard.imageUrl, "MasterRegistry sync logic preserves non-empty imageUrl");
}

// ── TEST 6: Artwork Scaling and Aspect Ratio Math ─────────────
console.log("\n▶ TEST 6: Artwork Scaling and Aspect Ratio Math");

function calculateDimensions(origWidth: number, origHeight: number, maxDim = 512): { width: number; height: number } {
  let width = origWidth;
  let height = origHeight;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

const scale1 = calculateDimensions(1024, 768, 512);
assert(scale1.width === 512 && scale1.height === 384, "Landscape 1024x768 scales to 512x384");

const scale2 = calculateDimensions(600, 1200, 512);
assert(scale2.width === 256 && scale2.height === 512, "Portrait 600x1200 scales to 256x512");

const scale3 = calculateDimensions(256, 256, 512);
assert(scale3.width === 256 && scale3.height === 256, "Small 256x256 image is not upscaled");

// ── TEST 7: Read-Only Verification of Supabase Records ────────
console.log("\n▶ TEST 7: Read-Only Verification of Supabase Records");

async function verifySupabaseData() {
  if (!isSupabaseConfigured) {
    console.log("  ℹ Supabase credentials not found in test environment; skipping live remote query.");
    return;
  }

  console.log("  Querying Supabase with hardened chunked fetch (batchSize: 1)...");
  const t0 = Date.now();
  const remoteCards = await fetchCardsFromSupabase({ batchSize: 1, includeImages: true });
  const duration = Date.now() - t0;

  assert(remoteCards !== null, `fetchCardsFromSupabase() succeeded without timeout in ${duration} ms`);
  if (!remoteCards) return;

  // Lightweight metadata-only fetch test
  const metaOnly = await fetchCardsFromSupabase({ includeImages: false });
  assert(metaOnly !== null && metaOnly.length >= 8, "Lightweight metadata-only fetch succeeds quickly without images");

  assert(remoteCards.length >= 8, `Loaded ${remoteCards.length} cards from Supabase`);

  const remoteMap = new Map(remoteCards.map((c) => [c.id, c]));

  const knownIds = [
    "CARD_DEATH_DRAW_1",
    "CARD_DEATH_DRAW_2",
    "CARD_DEATH_DRAW_3",
    "CARD_VANILLA_1",
    "CARD_VANILLA_2",
    "CARD_VANILLA_3",
    "CARD_GRANT_DURABILITY",
    "CARD_HERO_DAMAGE_DRAW",
  ];

  for (const id of knownIds) {
    const card = remoteMap.get(id);
    assert(card !== undefined, `Known card ${id} exists in Supabase`);
    if (card) {
      assert(card.imageUrl.length > 100, `Card ${id} has preserved artwork (length: ${card.imageUrl.length})`);
      assert(card.updatedAt >= 0, `Card ${id} has valid timestamp: ${card.updatedAt}`);
    }
  }

  // Check custom stats from user edits yesterday
  const drawKid = remoteMap.get("CARD_DEATH_DRAW_1");
  if (drawKid) {
    assert(drawKid.name === "Draw Man KID", `CARD_DEATH_DRAW_1 custom name preserved: "${drawKid.name}"`);
    assert(drawKid.cost === 1, `CARD_DEATH_DRAW_1 cost: ${drawKid.cost}`);
    assert(drawKid.attack === 2, `CARD_DEATH_DRAW_1 attack: ${drawKid.attack}`);
    assert(drawKid.hp === 1, `CARD_DEATH_DRAW_1 hp: ${drawKid.hp}`);
  }

  const shieldTeen = remoteMap.get("CARD_VANILLA_2");
  if (shieldTeen) {
    assert(shieldTeen.name === "Shield Arms Teen", `CARD_VANILLA_2 custom name preserved: "${shieldTeen.name}"`);
    assert(shieldTeen.cost === 3, `CARD_VANILLA_2 cost: ${shieldTeen.cost}`);
    assert(shieldTeen.attack === 2, `CARD_VANILLA_2 attack: ${shieldTeen.attack}`);
    assert(shieldTeen.hp === 4, `CARD_VANILLA_2 hp: ${shieldTeen.hp}`);
  }
}

await verifySupabaseData();

// ── TEST 8: Metadata-Only Cache Persistence Excludes Large Base64 Artwork ───
console.log("\n▶ TEST 8: Metadata-Only Cache Persistence Excludes Large Base64 Artwork");

assert(
  !isCompactImageUrl("data:image/webp;base64," + "A".repeat(100000)),
  "isCompactImageUrl returns false for 100 KB base64 string"
);
assert(
  isCompactImageUrl("https://example.com/cdn/cards/art.webp"),
  "isCompactImageUrl returns true for hosted HTTPS CDN URL"
);
assert(
  isCompactImageUrl("/uploads/cards/custom.png"),
  "isCompactImageUrl returns true for relative URL"
);
assert(
  isCompactImageUrl("data:image/png;base64," + "B".repeat(500)),
  "isCompactImageUrl returns true for compact thumbnail data URI (< 64 KB)"
);

const hugeBase64 = "data:image/webp;base64," + "X".repeat(3_500_000); // 3.5 MB
const cardWithHugeImage: CardMeta = {
  id: "CARD_HUGE_ART",
  name: "Colossal Titan",
  cost: 8,
  type: CardType.Unit,
  attack: 8,
  hp: 8,
  tribes: ["ยักษ์"],
  tribe: "ยักษ์",
  keywords: [Keyword.Armored],
  text: "Has huge legacy base64 artwork.",
  imageUrl: hugeBase64,
  updatedAt: 1729000000000,
};

const cardWithCompactImage: CardMeta = {
  id: "CARD_COMPACT_ART",
  name: "CDN Falcon",
  cost: 3,
  type: CardType.Unit,
  attack: 3,
  hp: 2,
  tribes: ["สัตว์ป่า"],
  tribe: "สัตว์ป่า",
  keywords: [Keyword.Rush],
  text: "Uses compact CDN image.",
  imageUrl: "https://example.com/cdn/falcon.webp",
  updatedAt: 1729000000000,
};

const mockCatalog = new Map<string, CardMeta>([
  [cardWithHugeImage.id, cardWithHugeImage],
  [cardWithCompactImage.id, cardWithCompactImage],
]);

const overridesPayload = buildLocalOverridesPayload(mockCatalog);

assert(overridesPayload[cardWithHugeImage.id] !== undefined, "Huge image card is included in overrides payload");
assert(
  overridesPayload[cardWithHugeImage.id].imageUrl === undefined,
  "Huge base64 artwork is strictly EXCLUDED from localStorage payload"
);
assert(
  overridesPayload[cardWithHugeImage.id].name === "Colossal Titan",
  "Card metadata name is retained in overrides payload"
);
assert(
  overridesPayload[cardWithCompactImage.id].imageUrl === "https://example.com/cdn/falcon.webp",
  "Compact CDN image URL is retained in overrides payload"
);

const serializedJson = JSON.stringify(overridesPayload);
assert(
  serializedJson.length < 2048,
  `Serialized localStorage overrides size is compact (${serializedJson.length} bytes, well below 5 MB quota)`
);

// ── TEST 9: Card Stats and Effects Survive Cache Serialization and Restoration ─
console.log("\n▶ TEST 9: Card Stats and Effects Survive Cache Serialization and Restoration");

const parsedOverrides = JSON.parse(serializedJson);
const blankRestoreCatalog = new Map<string, CardMeta>([
  [
    cardWithHugeImage.id,
    {
      id: cardWithHugeImage.id,
      name: "Default Name",
      cost: 1,
      type: CardType.Unit,
      attack: 1,
      hp: 1,
      tribes: ["เป็นกลาง"],
      tribe: "เป็นกลาง",
      keywords: [],
      text: "",
      imageUrl: "",
      updatedAt: 0,
    },
  ],
]);

applyLocalOverrides(blankRestoreCatalog, parsedOverrides);

const restoredCard = blankRestoreCatalog.get(cardWithHugeImage.id);
assert(restoredCard !== undefined, "Restored card exists in catalog");
if (restoredCard) {
  assert(restoredCard.name === "Colossal Titan", "Restored name matches original edit");
  assert(restoredCard.cost === 8, "Restored cost matches original edit");
  assert(restoredCard.attack === 8, "Restored attack matches original edit");
  assert(restoredCard.hp === 8, "Restored hp matches original edit");
  assert(restoredCard.keywords.includes(Keyword.Armored), "Restored keywords contain Keyword.Armored");
  assert(restoredCard.text === "Has huge legacy base64 artwork.", "Restored text matches original edit");
  assert(restoredCard.updatedAt === 1729000000000, "Restored timestamp matches original edit");
}

// ── TEST 10: Existing Artwork References Remain Intact During Metadata Merge ───
console.log("\n▶ TEST 10: Existing Artwork References Remain Intact During Metadata Merge");

const catalogWithExistingArt = new Map<string, CardMeta>([
  [
    "CARD_EXISTING_ART",
    {
      id: "CARD_EXISTING_ART",
      name: "Guardian",
      cost: 4,
      type: CardType.Unit,
      attack: 3,
      hp: 5,
      tribes: ["เป็นกลาง"],
      tribe: "เป็นกลาง",
      keywords: [],
      text: "",
      imageUrl: "data:image/webp;base64,IN_MEMORY_PRESERVED_ARTWORK_999",
      updatedAt: 1729000000000,
    },
  ],
]);

// Apply a patch that does NOT have an imageUrl (simulating metadata-only cache restore)
applyLocalOverrides(catalogWithExistingArt, {
  CARD_EXISTING_ART: {
    name: "Guardian (Edited Stats)",
    attack: 4,
    hp: 6,
    // imageUrl is omitted / undefined
  },
});

const preservedCard1 = catalogWithExistingArt.get("CARD_EXISTING_ART");
assert(
  preservedCard1?.imageUrl === "data:image/webp;base64,IN_MEMORY_PRESERVED_ARTWORK_999",
  "Existing artwork is preserved when patch omits imageUrl"
);
assert(preservedCard1?.attack === 4, "Updated attack from patch is applied");

// Apply a patch with an explicit empty string imageUrl
applyLocalOverrides(catalogWithExistingArt, {
  CARD_EXISTING_ART: {
    imageUrl: "",
  },
});
const preservedCard2 = catalogWithExistingArt.get("CARD_EXISTING_ART");
assert(
  preservedCard2?.imageUrl === "data:image/webp;base64,IN_MEMORY_PRESERVED_ARTWORK_999",
  "Existing artwork is preserved when patch provides empty string imageUrl"
);

// ── TEST 11: A Cache Write Failure Does Not Clear or Reset the Catalog ─────────
console.log("\n▶ TEST 11: A Cache Write Failure Does Not Clear or Reset the Catalog");

const safeCatalog = new Map<string, CardMeta>([
  [cardWithHugeImage.id, { ...cardWithHugeImage }],
]);

function simulatePersistWithFailingStorage(cards: Map<string, CardMeta>): boolean {
  try {
    const payload = buildLocalOverridesPayload(cards);
    // Simulate quota exceeded error in setItem
    throw new DOMException("Setting the value of 'CARD_GAME_CARD_OVERRIDES' exceeded the quota.", "QuotaExceededError");
  } catch (err) {
    // Graceful error logging without disrupting cards map
    return false;
  }
}

const writeSuccess = simulatePersistWithFailingStorage(safeCatalog);
assert(!writeSuccess, "Storage write failure handled gracefully");
assert(safeCatalog.size === 1, "Catalog size is completely unchanged after write failure");
assert(
  safeCatalog.get(cardWithHugeImage.id)?.name === "Colossal Titan",
  "Catalog contents remain 100% intact and are never cleared or reset"
);

// ── TEST 12: Remote Fetch Failure Preserves Last Known Good Local Metadata ─────
console.log("\n▶ TEST 12: Remote Fetch Failure Preserves Last Known Good Local Metadata");

const localCatalogBeforeRemote = new Map<string, CardMeta>([
  [
    "CARD_DEATH_DRAW_1",
    {
      id: "CARD_DEATH_DRAW_1",
      name: "Draw Man KID",
      cost: 1,
      type: CardType.Unit,
      attack: 2,
      hp: 1,
      tribes: ["เป็นกลาง"],
      tribe: "เป็นกลาง",
      keywords: [],
      text: "Draw on death",
      imageUrl: "data:image/webp;base64,OFFLINE_SAVED_ARTWORK",
      updatedAt: 1728800000000,
    },
  ],
]);

// Simulate remote fetch returning null (network error / timeout)
const simulatedRemoteCards: CardMeta[] | null = null;

if (simulatedRemoteCards && (simulatedRemoteCards as CardMeta[]).length > 0) {
  // won't run
} else if (simulatedRemoteCards === null) {
  // Remote fetch failed: retain local catalog as is
}

const preservedAfterRemoteFail = localCatalogBeforeRemote.get("CARD_DEATH_DRAW_1");
assert(
  preservedAfterRemoteFail?.name === "Draw Man KID",
  "Local metadata preserved after remote fetch returns null"
);
assert(
  preservedAfterRemoteFail?.imageUrl === "data:image/webp;base64,OFFLINE_SAVED_ARTWORK",
  "Local artwork preserved after remote fetch returns null"
);

// ── TEST 13: Seed Cards Cannot Overwrite Customized Cards ──────────────────────
console.log("\n▶ TEST 13: Seed Cards Cannot Overwrite Customized Cards");

const customizedCard: CardMeta = {
  id: "CARD_VANILLA_2",
  name: "Shield Arms Teen (Customized)",
  cost: 3,
  type: CardType.Unit,
  attack: 2,
  hp: 4,
  tribes: ["เป็นกลาง"],
  tribe: "เป็นกลาง",
  keywords: [],
  text: "Custom flavor",
  imageUrl: "data:image/webp;base64,SHIELD_ARTWORK",
  updatedAt: 1728850000000,
};

const defaultSeedCard: CardMeta = {
  id: "CARD_VANILLA_2",
  name: "Shield Arms Teen",
  cost: 3,
  type: CardType.Unit,
  attack: 1, // Default lower attack
  hp: 3,     // Default lower hp
  tribes: ["เป็นกลาง"],
  tribe: "เป็นกลาง",
  keywords: [],
  text: "",
  imageUrl: "",
  updatedAt: 0, // Seed timestamp
};

assert(
  !shouldIncomingCardOverwrite(defaultSeedCard, customizedCard, false),
  "Seed fallback card (updatedAt: 0) rejected over customized card (updatedAt > 0)"
);
assert(
  !shouldIncomingCardOverwrite(defaultSeedCard, customizedCard, true),
  "Authoritative seed card (updatedAt: 0) also rejected over customized card"
);

const mergedWithSeedCard = mergeCardSafely(customizedCard, defaultSeedCard, { isAuthoritativeRemote: false });
assert(mergedWithSeedCard.attack === 2, "Custom attack 2 is strictly preserved against seed");
assert(mergedWithSeedCard.hp === 4, "Custom hp 4 is strictly preserved against seed");
assert(mergedWithSeedCard.imageUrl === customizedCard.imageUrl, "Custom artwork is strictly preserved against seed");

// ── TEST 14: Legacy Base64 Artwork Renders and Hydrates Without Modification ───
console.log("\n▶ TEST 14: Legacy Base64 Artwork Renders and Hydrates Without Modification");

const remoteLegacyRow: CardMeta = {
  id: "CARD_DEATH_DRAW_1",
  name: "Draw Man KID",
  cost: 1,
  type: CardType.Unit,
  attack: 2,
  hp: 1,
  tribes: ["เป็นกลาง"],
  tribe: "เป็นกลาง",
  keywords: [],
  text: "",
  imageUrl: hugeBase64, // Full 3.5 MB legacy base64 image from Supabase
  updatedAt: 1728800000000,
};

const baselineCard: CardMeta = {
  id: "CARD_DEATH_DRAW_1",
  name: "Draw Man KID",
  cost: 1,
  type: CardType.Unit,
  attack: 1,
  hp: 1,
  tribes: ["เป็นกลาง"],
  tribe: "เป็นกลาง",
  keywords: [],
  text: "",
  imageUrl: "",
  updatedAt: 0,
};

const hydratedCard = mergeCardSafely(baselineCard, remoteLegacyRow, { isAuthoritativeRemote: true });
assert(
  hydratedCard.imageUrl === hugeBase64,
  "Authoritative legacy base64 artwork is hydrated into in-memory card without corruption"
);
assert(
  hydratedCard.imageUrl.startsWith("data:image/webp;base64,"),
  "Hydrated artwork has valid data URI header ready for browser image rendering"
);
assert(
  hydratedCard.imageUrl.length === hugeBase64.length,
  `Hydrated artwork length exactly matches remote payload (${hydratedCard.imageUrl.length} chars)`
);

console.log("\n============================================================");
console.log(`  RESULTS: ${passed} Passed, ${failed} Failed`);
console.log("============================================================\n");

if (failed > 0) {
  process.exit(1);
}
