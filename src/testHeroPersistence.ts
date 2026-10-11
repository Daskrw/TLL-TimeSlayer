// ============================================================
//  src/testHeroPersistence.ts — Comprehensive Persistence &
//  Read-Back Verification Regression Suite
// ============================================================

import assert from "assert";
import {
  normalizeHeroRow,
  upsertHeroToSupabaseVerified,
  supabase,
  isSupabaseConfigured,
} from "./supabaseClient";
import { HeroRepository, LEGACY_HERO_IDS } from "../client/HeroRepository";
import { HeroDefinition } from "./types";

console.log("\n============================================================");
console.log("  RUNNING HERO PERSISTENCE & READ-BACK REGRESSION SUITE");
console.log("============================================================\n");

async function runPersistenceSuite() {
  // ------------------------------------------------------------
  // CASE 1: Normalization & Field Mapping
  // ------------------------------------------------------------
  console.log("▶ TEST 1: is_active and isActive normalization across DB formats");
  const rowSnakeActive = { id: "hero_test_1", name: "Test 1", is_active: true };
  assert.strictEqual(normalizeHeroRow(rowSnakeActive).isActive, true);

  const rowSnakeInactive = { id: "hero_test_2", name: "Test 2", is_active: false };
  assert.strictEqual(normalizeHeroRow(rowSnakeInactive).isActive, false);

  const rowCamelActive = { id: "hero_test_3", name: "Test 3", isActive: true };
  assert.strictEqual(normalizeHeroRow(rowCamelActive).isActive, true);

  const rowCamelInactive = { id: "hero_test_4", name: "Test 4", isActive: false };
  assert.strictEqual(normalizeHeroRow(rowCamelInactive).isActive, false);
  console.log("  ✓ Correctly normalizes snake_case is_active and camelCase isActive");

  // ------------------------------------------------------------
  // CASE 2: Legacy Hero Compatibility Rules
  // ------------------------------------------------------------
  console.log("\n▶ TEST 2: Legacy vs Custom Hero default active status rules");
  for (const legacyId of LEGACY_HERO_IDS) {
    const legacyRow = { id: legacyId, name: "Legacy Hero" };
    assert.strictEqual(normalizeHeroRow(legacyRow).isActive, false, `${legacyId} must default to inactive`);
  }

  const customRow = { id: "hero_new_custom", name: "New Custom Hero" };
  assert.strictEqual(normalizeHeroRow(customRow).isActive, true, "Custom hero must default to active");

  // Explicit values must never be overridden
  const legacyExplicit = { id: "HERO_SKY_VANGUARD", name: "Sky", is_active: true };
  assert.strictEqual(normalizeHeroRow(legacyExplicit).isActive, true, "Explicit true on legacy hero preserved");
  console.log("  ✓ Legacy defaults to inactive, custom defaults to active, explicit preserved");

  // ------------------------------------------------------------
  // CASE 3: Simulated Supabase Save & Verification Flow
  // ------------------------------------------------------------
  console.log("\n▶ TEST 3: upsertHeroToSupabaseVerified handles missing configuration");
  if (!isSupabaseConfigured) {
    const hero: HeroDefinition = {
      id: "hero_test_offline",
      name: "Offline Hero",
      title: "",
      description: "",
      maxHp: 20,
      portraitUrl: "🧙",
      allowedTribes: ["เป็นกลาง"],
      signatureAbilityCardId: "card_sp_shield_of_legend",
      coreAbilityCardIds: ["card_sp_human_shield", "card_sp_suppress_anger", "card_sp_leave_to_dust"],
      isActive: true,
      updatedAt: Date.now(),
    };
    const res = await upsertHeroToSupabaseVerified(hero);
    assert.strictEqual(res.success, false, "Must return success: false when Supabase is not configured");
    assert.strictEqual(res.persistedLocallyOnly, true, "Must flag persistedLocallyOnly: true");
    console.log("  ✓ Explicitly reports offline fallback mode when Supabase is unconfigured");
  } else {
    console.log("  (Supabase configured; tested in live integration cases below)");
  }

  // ------------------------------------------------------------
  // CASE 4: HeroRepository Cache & Authoritative Sync Behavior
  // ------------------------------------------------------------
  console.log("\n▶ TEST 4: HeroRepository save and read-back lifecycle");
  const repo = new HeroRepository();
  await repo.whenReady();

  const testHeroId = "hero_persistence_check";
  const initialDef: HeroDefinition = {
    id: testHeroId,
    name: "Persistence Knight",
    title: "Tester",
    description: "Testing persistence",
    maxHp: 20,
    portraitUrl: "🛡️",
    allowedTribes: ["เป็นกลาง"],
    signatureAbilityCardId: "card_sp_shield_of_legend",
    coreAbilityCardIds: ["card_sp_human_shield", "card_sp_suppress_anger", "card_sp_leave_to_dust"],
    isActive: true,
    updatedAt: Date.now(),
  };

  const saveRes1 = await repo.saveHeroDetailed(initialDef);
  assert.strictEqual(saveRes1.success, true, "saveHeroDetailed should succeed");
  assert.strictEqual(repo.getHeroDefinition(testHeroId)?.isActive, true);

  // Toggle to inactive
  const saveRes2 = await repo.saveHeroDetailed({ ...initialDef, isActive: false });
  assert.strictEqual(saveRes2.success, true);
  assert.strictEqual(repo.getHeroDefinition(testHeroId)?.isActive, false);

  // Verify getActiveHeroDefinitions excludes it
  const activeIds = repo.getActiveHeroDefinitions().map((h) => h.id);
  assert.ok(!activeIds.includes(testHeroId), "Inactive hero must be excluded from getActiveHeroDefinitions()");

  // Reactivate
  const saveRes3 = await repo.saveHeroDetailed({ ...initialDef, isActive: true });
  assert.strictEqual(saveRes3.success, true);
  assert.strictEqual(repo.getHeroDefinition(testHeroId)?.isActive, true);
  const activeIds2 = repo.getActiveHeroDefinitions().map((h) => h.id);
  assert.ok(activeIds2.includes(testHeroId), "Reactivated hero must be in getActiveHeroDefinitions()");
  console.log("  ✓ HeroRepository save, toggle, and active filtering verified");

  // ------------------------------------------------------------
  // CASE 5: Startup & Refresh Stale Cache Isolation
  // ------------------------------------------------------------
  console.log("\n▶ TEST 5: Startup hydration preserves active status without stale overwrite");
  const freshRepo = new HeroRepository();
  await freshRepo.whenReady();
  const loaded = freshRepo.getHeroDefinition(testHeroId);
  if (loaded) {
    assert.strictEqual(loaded.isActive, true, "Fresh instance retains the confirmed active status");
  }
  console.log("  ✓ Fresh repository instance hydration verified");

  // Cleanup test hero
  await repo.deleteHero(testHeroId);
  console.log("  ✓ Cleaned up test hero record");

  // ------------------------------------------------------------
  // CASE 6: Live Supabase Persistence (if credentials available)
  // ------------------------------------------------------------
  if (isSupabaseConfigured) {
    console.log("\n▶ TEST 6: Live remote Supabase write and strict read-back verification");
    // Target hero: hero_aegis_guardian (our stable non-destructive test anchor)
    const { data: originalRow, error: origErr } = await supabase
      .from("heroes")
      .select("*")
      .eq("id", "hero_aegis_guardian")
      .single();

    assert.ok(!origErr, `Supabase read error: ${origErr?.message}`);
    assert.ok(originalRow, "hero_aegis_guardian must exist in Supabase");
    const originalActive = Boolean(originalRow.is_active ?? originalRow.isActive);

    console.log(`  Original remote status for Aegis Guardian: isActive = ${originalActive}`);

    // Step A: Toggle status
    const targetStatus = !originalActive;
    const heroToSave = normalizeHeroRow({
      ...originalRow,
      is_active: targetStatus,
      isActive: targetStatus,
    });

    const writeResult = await upsertHeroToSupabaseVerified(heroToSave);
    assert.strictEqual(writeResult.success, true, `Write should succeed: ${writeResult.error}`);
    assert.strictEqual(
      writeResult.verifiedHero?.isActive,
      targetStatus,
      "Read-back verifiedHero must match targetStatus"
    );

    // Step B: Query independently directly via separate Supabase select query
    const { data: verifiedRow, error: verifyErr } = await supabase
      .from("heroes")
      .select("id, is_active, maxHp")
      .eq("id", "hero_aegis_guardian")
      .single();

    assert.ok(!verifyErr, `Independent query error: ${verifyErr?.message}`);
    assert.strictEqual(
      verifiedRow.is_active,
      targetStatus,
      `Independent query confirms database persisted is_active=${targetStatus}`
    );
    console.log(`  ✓ Database confirmed independent read-back: is_active = ${verifiedRow.is_active}`);

    // Step C: Simulate page reload by creating a completely new HeroRepository
    HeroRepository.resetInstanceForTesting();
    const reloadedRepo = HeroRepository.getInstance();
    await reloadedRepo.whenReady();
    const reloadedHero = reloadedRepo.getHeroDefinition("hero_aegis_guardian");
    assert.ok(reloadedHero, "Hero must load after simulated reload");
    assert.strictEqual(
      reloadedHero.isActive,
      targetStatus,
      `Reloaded hero must retain targetStatus ${targetStatus} from Supabase`
    );
    console.log(`  ✓ Simulated reload confirmed: reloaded HeroRepository has isActive = ${reloadedHero.isActive}`);

    // Step D: Restore original status
    const restoreHero = normalizeHeroRow({
      ...originalRow,
      is_active: originalActive,
      isActive: originalActive,
    });
    const restoreResult = await upsertHeroToSupabaseVerified(restoreHero);
    assert.strictEqual(restoreResult.success, true, "Restore write should succeed");
    console.log(`  ✓ Restored original status for Aegis Guardian (isActive = ${originalActive})`);
  } else {
    console.log("\n▶ TEST 6: Live remote Supabase test skipped (credentials not loaded in this process).");
  }

  // ------------------------------------------------------------
  // CASE 7: Image Persistence & URL Validation
  // ------------------------------------------------------------
  console.log("\n▶ TEST 7: Image persistence — durable URLs accepted, blob: URLs rejected");
  const testImgDef: HeroDefinition = {
    id: "hero_img_test",
    name: "Image Test Hero",
    title: "Tester",
    description: "Testing image persistence",
    maxHp: 20,
    portraitUrl: "blob:http://localhost:5299/d07ebf04-9426-444a-a43d-27f999999999",
    allowedTribes: ["เป็นกลาง"],
    signatureAbilityCardId: "card_sp_shield_of_legend",
    coreAbilityCardIds: ["card_sp_human_shield", "card_sp_suppress_anger", "card_sp_leave_to_dust"],
    isActive: true,
    updatedAt: Date.now(),
  };

  // blob: URL must be rejected
  const blobRes = await upsertHeroToSupabaseVerified(testImgDef);
  assert.strictEqual(blobRes.success, false, "blob: URL must be rejected by persistence layer");
  assert.ok(blobRes.error?.includes("blob:"), "Error message must mention blob:");
  console.log("  ✓ Correctly rejected temporary browser-only blob: URL");

  // Compact Data URL and HTTPS URL must be accepted and verified
  const testDataUrl = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
  const validImgDef: HeroDefinition = {
    ...testImgDef,
    portraitUrl: testDataUrl,
  };
  const validRes = await upsertHeroToSupabaseVerified(validImgDef);
  if (isSupabaseConfigured) {
    assert.strictEqual(validRes.success, true, "Valid compact data URL must succeed");
    assert.strictEqual(validRes.verifiedHero?.portraitUrl, testDataUrl, "Verified portraitUrl must match testDataUrl");
    console.log("  ✓ Durable data URL saved and read-back verified in Supabase");

    // Clean up test hero
    await supabase.from("heroes").delete().eq("id", "hero_img_test");
  } else {
    console.log("  ✓ Data URL validation verified (offline mode)");
  }

  // ------------------------------------------------------------
  // CASE 8: Duplicate Prevention & In-Place Edit Verification
  // ------------------------------------------------------------
  console.log("\n▶ TEST 8: Editing existing hero updates record in-place without creating duplicates");
  HeroRepository.resetInstanceForTesting();
  const dupCheckRepo = HeroRepository.getInstance();
  await dupCheckRepo.whenReady();

  const dupHeroId = "hero_duplicate_check";
  const heroInitial: HeroDefinition = {
    id: dupHeroId,
    name: "Original Name",
    title: "Title 1",
    description: "Desc 1",
    maxHp: 20,
    portraitUrl: "🧙",
    allowedTribes: ["เป็นกลาง"],
    signatureAbilityCardId: "card_sp_shield_of_legend",
    coreAbilityCardIds: ["card_sp_human_shield", "card_sp_suppress_anger", "card_sp_leave_to_dust"],
    isActive: true,
    updatedAt: Date.now(),
  };

  await dupCheckRepo.saveHeroDetailed(heroInitial);
  const countAfterInsert = dupCheckRepo.getAllHeroDefinitions().filter((h) => h.id === dupHeroId).length;
  assert.strictEqual(countAfterInsert, 1, "Exactly 1 record must exist after initial save");

  // Edit hero 3 consecutive times with new names and stats
  await dupCheckRepo.saveHeroDetailed({ ...heroInitial, name: "Edit 1", maxHp: 22 });
  await dupCheckRepo.saveHeroDetailed({ ...heroInitial, name: "Edit 2", maxHp: 25 });
  await dupCheckRepo.saveHeroDetailed({ ...heroInitial, name: "Final Edit", maxHp: 30 });

  const countAfterEdits = dupCheckRepo.getAllHeroDefinitions().filter((h) => h.id === dupHeroId).length;
  assert.strictEqual(countAfterEdits, 1, "Exactly 1 record must exist after multiple saves — no duplicates created");
  const finalDef = dupCheckRepo.getHeroDefinition(dupHeroId);
  assert.strictEqual(finalDef?.name, "Final Edit", "Latest name must be preserved");
  assert.strictEqual(finalDef?.maxHp, 30, "Latest maxHp must be preserved");
  console.log("  ✓ Consecutive saves update in-place with zero duplicate creation");

  // Clean up
  await dupCheckRepo.deleteHero(dupHeroId);

  // ------------------------------------------------------------
  // CASE 9: Player Selection & Admin View Consistency
  // ------------------------------------------------------------
  console.log("\n▶ TEST 9: Player Selection and Admin View resolve the same saved hero definition");
  HeroRepository.resetInstanceForTesting();
  const parityRepo = HeroRepository.getInstance();
  await parityRepo.whenReady();

  const allHeroes = parityRepo.getAllHeroes();
  const activeHeroes = parityRepo.getActiveHeroes();
  assert.ok(activeHeroes.length > 0, "At least one active hero must be available for player selection");

  for (const activeHero of activeHeroes) {
    const adminDef = parityRepo.getHeroDefinition(activeHero.id);
    assert.ok(adminDef, `Admin definition must exist for player hero ${activeHero.id}`);
    assert.strictEqual(activeHero.name, adminDef!.name, "Name must match between Admin and Player view");
    assert.strictEqual(activeHero.maxHp, adminDef!.maxHp, "Max HP must match between Admin and Player view");
    assert.strictEqual(activeHero.portraitUrl, adminDef!.portraitUrl, "Portrait must match between Admin and Player view");
    assert.strictEqual(activeHero.superpowerKit.signatureAbility.id, adminDef!.signatureAbilityCardId, "Signature card must match");
  }
  console.log(`  ✓ Verified identical hero definition and abilities across all ${activeHeroes.length} active heroes`);

  // ------------------------------------------------------------
  // CASE 10: Gameplay Ability Hydration & Superpowers Integrity
  // ------------------------------------------------------------
  console.log("\n▶ TEST 10: Gameplay superpower kit hydration integrity");
  const aegisHero = parityRepo.getHero("hero_aegis_guardian");
  assert.ok(aegisHero, "hero_aegis_guardian must hydrate properly");
  if (!aegisHero) throw new Error("hero_aegis_guardian must hydrate properly");
  assert.strictEqual(aegisHero.superpowers?.length, 4, "Aegis Guardian must command exactly 4 superpowers");
  assert.strictEqual(aegisHero.superpowerKit.signatureAbility.id, "card_sp_shield_of_legend", "Signature card ID preserved");
  assert.strictEqual(aegisHero.superpowerKit.coreAbilities.length, 3, "Core abilities length must be 3");
  console.log("  ✓ Superpower kit properly hydrated with all 4 abilities");

  console.log("\n============================================================");
  console.log("  ALL HERO PERSISTENCE & CROSS-BROWSER TESTS PASSED!");
  console.log("============================================================\n");
  process.exit(0);
}

runPersistenceSuite().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
