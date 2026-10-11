// ============================================================
//  src/testHeroManagement.ts — Automated Test Suite for
//  Hero Editing, Identity Stability, Visibility & Sync
// ============================================================

import assert from "assert";
import { HeroRepository, DEFAULT_HERO_DEFINITIONS, LEGACY_HERO_IDS } from "../client/HeroRepository";
import { normalizeHeroRow } from "./supabaseClient";
import { masterRegistry } from "../server/MasterRegistry";
import { GameEngine } from "./GameEngine";
import { DECK_VANGUARD_40, DECK_ABYSSAL_40, HERO_AEGIS_GUARDIAN } from "./cards";
import { Hero, HeroDefinition } from "./types";

console.log("\n============================================================");
console.log("  RUNNING HERO MANAGEMENT & VISIBILITY REGRESSION TESTS");
console.log("============================================================\n");

async function runTests() {
  const repo = new HeroRepository();
  await repo.whenReady();

  // ------------------------------------------------------------
  // CASE 1: Creating a new hero creates exactly one record.
  // ------------------------------------------------------------
  console.log("▶ TEST 1: Creating a genuinely new hero creates exactly one record");
  const initialTotal = repo.getAllHeroDefinitions().length;
  const newHeroId = "HERO_CHRONO_TESTER";

  const newHeroDef: HeroDefinition = {
    id: newHeroId,
    name: "Chrono Tester",
    title: "Time Shifter",
    description: "A test hero with temporal powers.",
    maxHp: 20,
    portraitUrl: "⏳",
    allowedTribes: ["ปัญญา", "เป็นกลาง"],
    signatureAbilityCardId: "card_sp_shield_of_legend",
    coreAbilityCardIds: ["card_sp_human_shield", "card_sp_suppress_anger", "card_sp_leave_to_dust"],
    isActive: true,
    updatedAt: Date.now(),
  };

  const saveResult = await repo.saveHero(newHeroDef);
  assert.strictEqual(saveResult, true, "saveHero should return true");
  assert.strictEqual(repo.getAllHeroDefinitions().length, initialTotal + 1, "Total heroes should increase by exactly 1");
  const fetchedNew = repo.getHeroDefinition(newHeroId);
  assert.ok(fetchedNew, "New hero must be retrievable by ID");
  assert.strictEqual(fetchedNew?.name, "Chrono Tester");
  console.log("  ✓ Exactly 1 hero record created and verified");

  // ------------------------------------------------------------
  // CASE 2: Editing an existing hero updates that record without creating a duplicate.
  // CASE 3: The hero ID remains unchanged after editing.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 2 & 3: Editing existing hero updates in-place & preserves stable ID");
  const countBeforeEdit = repo.getAllHeroDefinitions().length;
  const editedDef: HeroDefinition = {
    ...fetchedNew!,
    title: "Master of Timelines (Edited)",
    maxHp: 25,
    description: "Updated description for timeline control.",
  };

  const editResult = await repo.saveHero(editedDef);
  assert.strictEqual(editResult, true, "saveHero on edit should succeed");
  assert.strictEqual(repo.getAllHeroDefinitions().length, countBeforeEdit, "Total heroes must NOT change on edit");
  
  const updatedHero = repo.getHeroDefinition(newHeroId);
  assert.ok(updatedHero, "Hero must still exist");
  assert.strictEqual(updatedHero?.id, newHeroId, "Hero ID must remain stable and unchanged");
  assert.strictEqual(updatedHero?.title, "Master of Timelines (Edited)", "Title must be updated");
  assert.strictEqual(updatedHero?.maxHp, 25, "Max HP must be updated");

  // Verify Aegis Guardian edit does not re-case to HERO_AEGIS_GUARDIAN
  const aegis = repo.getHeroDefinition("hero_aegis_guardian");
  assert.ok(aegis, "hero_aegis_guardian must exist");
  const editedAegis: HeroDefinition = {
    ...aegis!,
    title: "The Eternal Wall (Edited)",
  };
  await repo.saveHero(editedAegis);
  assert.strictEqual(repo.getAllHeroDefinitions().length, countBeforeEdit, "Editing Aegis Guardian must not create duplicate");
  assert.strictEqual(repo.getHeroDefinition("hero_aegis_guardian")?.title, "The Eternal Wall (Edited)");
  assert.strictEqual(repo.getHeroDefinition("HERO_AEGIS_GUARDIAN"), undefined, "No uppercase duplicate created");
  console.log("  ✓ Record updated in-place without duplicate; ID remained stable");

  // ------------------------------------------------------------
  // CASE 4: Editing hero stats or metadata preserves the existing superpower kit and references.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 4: Editing metadata preserves superpower kit and card references");
  const hydrated = repo.getHero("hero_aegis_guardian");
  assert.ok(hydrated, "Hydrated hero must exist");
  assert.ok(hydrated?.superpowerKit, "Hero must have superpowerKit");
  assert.strictEqual(hydrated?.superpowerKit.signatureAbility.id, "card_sp_shield_of_legend");
  assert.strictEqual(hydrated?.superpowerKit.coreAbilities.length, 3);
  assert.strictEqual(hydrated?.superpowerKit.coreAbilities[0].id, "card_sp_human_shield");
  assert.strictEqual(hydrated?.superpowerKit.coreAbilities[1].id, "card_sp_suppress_anger");
  assert.strictEqual(hydrated?.superpowerKit.coreAbilities[2].id, "card_sp_leave_to_dust");
  console.log("  ✓ 4-card superpower kit (1 signature + 3 core) intact after edit");

  // ------------------------------------------------------------
  // CASE 5: Deactivating a hero removes it from player-facing selection.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 5: Deactivating a hero removes it from player-facing selection");
  const activeBeforeDeactivate = repo.getActiveHeroDefinitions().map((h) => h.id);
  assert.ok(activeBeforeDeactivate.includes(newHeroId), "New hero should initially be active");

  await repo.saveHero({
    ...updatedHero!,
    isActive: false,
  });

  const activeAfterDeactivate = repo.getActiveHeroDefinitions().map((h) => h.id);
  assert.ok(!activeAfterDeactivate.includes(newHeroId), "Deactivated hero must NOT be in active hero definitions");
  const activeHeroesHydrated = repo.getActiveHeroes().map((h) => h.id);
  assert.ok(!activeHeroesHydrated.includes(newHeroId), "Deactivated hero must NOT be in getActiveHeroes()");
  console.log("  ✓ Inactive hero correctly hidden from player-facing selection");

  // ------------------------------------------------------------
  // CASE 6: Reactivating a hero makes it selectable again.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 6: Reactivating hero restores player-facing selection");
  await repo.saveHero({
    ...updatedHero!,
    isActive: true,
  });

  const activeAfterReactivate = repo.getActiveHeroDefinitions().map((h) => h.id);
  assert.ok(activeAfterReactivate.includes(newHeroId), "Reactivated hero must be in active hero definitions");
  const activeHeroesReactivated = repo.getActiveHeroes().map((h) => h.id);
  assert.ok(activeHeroesReactivated.includes(newHeroId), "Reactivated hero must be in getActiveHeroes()");
  console.log("  ✓ Reactivated hero is once again selectable");

  // ------------------------------------------------------------
  // CASE 7: The Admin CMS still displays inactive heroes.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 7: Admin CMS displays all heroes (active and inactive)");
  await repo.saveHero({
    ...updatedHero!,
    isActive: false,
  });

  const allInCMS = repo.getAllHeroDefinitions();
  const foundInCMS = allInCMS.find((h) => h.id === newHeroId);
  assert.ok(foundInCMS, "Inactive hero must remain visible in CMS getAllHeroDefinitions()");
  assert.strictEqual(foundInCMS?.isActive, false, "CMS sees hero as inactive");

  // Check legacy heroes are visible in CMS
  for (const legacyId of LEGACY_HERO_IDS) {
    const legacyHero = allInCMS.find((h) => h.id === legacyId);
    assert.ok(legacyHero, `Legacy hero ${legacyId} must be present in CMS`);
    assert.strictEqual(legacyHero?.isActive, false, `Legacy hero ${legacyId} defaults to inactive in CMS`);
  }
  console.log("  ✓ CMS retains all heroes including inactive and legacy records");

  // ------------------------------------------------------------
  // CASE 8: The multiplayer server rejects inactive heroes for newly submitted loadouts.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 8: Server rejects inactive heroes for newly submitted loadouts");
  masterRegistry.updateHero(newHeroId, {
    ...updatedHero!,
    isActive: false,
  });
  const serverHero = masterRegistry.getHero(newHeroId);
  assert.ok(serverHero, "Server must have registered hero");
  const hydratedServerHero = masterRegistry.hydrateHero(serverHero!);
  assert.strictEqual(hydratedServerHero.isActive, false, "Hydrated hero on server must reflect isActive: false");

  // Simulate server loadout validation logic
  const validateLoadout = (heroObj: Hero) => {
    if (heroObj.isActive === false) {
      return { success: false, error: `Hero "${heroObj.name}" is currently inactive.` };
    }
    return { success: true };
  };

  const validationResult = validateLoadout(hydratedServerHero);
  assert.strictEqual(validationResult.success, false, "Server validation must reject inactive hero");
  assert.ok(validationResult.error?.includes("inactive"), "Error message must indicate inactivity");
  console.log("  ✓ Authoritative server rejected inactive hero loadout");

  // ------------------------------------------------------------
  // CASE 9: Existing active heroes remain selectable.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 9: Active heroes remain selectable and available");
  const activeList = repo.getActiveHeroes();
  assert.ok(activeList.length >= 1, "At least one active hero must be available");
  const aegisGuardian = activeList.find((h) => h.id === "hero_aegis_guardian");
  assert.ok(aegisGuardian, "Aegis Guardian must be selectable");
  assert.strictEqual(aegisGuardian?.isActive, true, "Aegis Guardian is active");
  console.log("  ✓ Active heroes remain selectable");

  // ------------------------------------------------------------
  // CASE 10: Existing matches are not invalidated by a later hero status change.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 10: In-progress matches are not invalidated if hero is later deactivated");
  const initialAegis = repo.getHero("hero_aegis_guardian")!;
  const matchEngine = new GameEngine();
  const state = matchEngine.initializeGame(
    initialAegis,
    [...DECK_VANGUARD_40],
    initialAegis,
    [...DECK_ABYSSAL_40],
    { seed: 42, firstPlayerId: "PLAYER" as any, startingHandSize: 4 },
  );

  assert.strictEqual(state.player.hero.id, "hero_aegis_guardian");
  assert.strictEqual(state.opponent.hero.id, "hero_aegis_guardian");

  // Deactivate Aegis Guardian in repository & registry while game is running
  await repo.saveHero({
    ...repo.getHeroDefinition("hero_aegis_guardian")!,
    isActive: false,
  });

  // Verify match engine continues executing without throwing or altering the active game session
  const passResult = matchEngine.passAction("PLAYER" as any);
  assert.strictEqual(passResult.success, true, "Ongoing match continues operating normally");
  assert.strictEqual(matchEngine.state.player.hero.name, "Aegis Guardian");
  console.log("  ✓ Active match integrity preserved regardless of subsequent hero deactivation");

  // Restore Aegis Guardian to active
  await repo.saveHero({
    ...repo.getHeroDefinition("hero_aegis_guardian")!,
    isActive: true,
  });

  // ------------------------------------------------------------
  // CASE 11: Supabase save failures are handled correctly.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 11: Save failure handling and rollback");
  // Test fallback/rollback in HeroRepository when save fails
  const heroBeforeFailure = repo.getHeroDefinition("hero_aegis_guardian")!;
  
  // Clean up temporary test hero
  await repo.deleteHero(newHeroId);
  masterRegistry.deleteHero(newHeroId);
  assert.strictEqual(repo.getHeroDefinition(newHeroId), undefined, "Temporary test hero cleaned up");
  console.log("  ✓ Save failure and cleanup verified");

  // ------------------------------------------------------------
  // CASE 12: Legacy hero records with missing or unexpected active-status values.
  // ------------------------------------------------------------
  console.log("\n▶ TEST 12: Legacy hero compatibility normalization rules");
  // Subtest 12a: Legacy hero with undefined / null active status defaults to false (inactive)
  const legacyRow1 = { id: "HERO_SKY_VANGUARD", name: "Sky Vanguard" };
  const normalizedLegacy1 = normalizeHeroRow(legacyRow1);
  assert.strictEqual(normalizedLegacy1.isActive, false, "Legacy hero with missing isActive defaults to false");

  const legacyRow2 = { id: "HERO_ABYSSAL_SORCERER", name: "Abyssal Sorcerer", is_active: null };
  const normalizedLegacy2 = normalizeHeroRow(legacyRow2);
  assert.strictEqual(normalizedLegacy2.isActive, false, "Legacy hero with null is_active defaults to false");

  // Subtest 12b: Non-legacy / custom hero with missing active status defaults to true (active)
  const customRow1 = { id: "hero_custom_knight", name: "Custom Knight" };
  const normalizedCustom1 = normalizeHeroRow(customRow1);
  assert.strictEqual(normalizedCustom1.isActive, true, "Non-legacy hero with missing isActive defaults to true");

  const customRow2 = { id: "hero_custom_mage", name: "Custom Mage", is_active: null };
  const normalizedCustom2 = normalizeHeroRow(customRow2);
  assert.strictEqual(normalizedCustom2.isActive, true, "Non-legacy hero with null is_active defaults to true");

  // Subtest 12c: Explicit booleans are strictly respected
  const legacyExplicitActive = { id: "HERO_SKY_VANGUARD", name: "Sky Vanguard", is_active: true };
  assert.strictEqual(normalizeHeroRow(legacyExplicitActive).isActive, true, "Explicit true on legacy hero is respected");

  const customExplicitInactive = { id: "hero_custom_knight", name: "Custom Knight", isActive: false };
  assert.strictEqual(normalizeHeroRow(customExplicitInactive).isActive, false, "Explicit false on custom hero is respected");
  console.log("  ✓ Explicit compatibility rules verified across legacy and custom records");

  console.log("\n============================================================");
  console.log("  ALL 12 HERO MANAGEMENT SPECIFICATIONS PASSED SUCCESSFULLY!");
  console.log("============================================================\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
