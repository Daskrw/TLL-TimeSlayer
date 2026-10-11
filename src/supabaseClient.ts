// ============================================================
//  supabaseClient.ts — Authoritative Supabase Cloud DB & Storage Client
//  P0 HARDENED: No hardcoded credentials. Throws at startup if env missing.
// ============================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CardDefinition, HeroDefinition } from "./types";

// Minimal CMS-extended card type (mirrors client/CardRepository.CardMeta)
// Defined locally to avoid importing browser-only client/ modules.
export interface CardMeta extends CardDefinition {
  imageUrl: string;
  updatedAt: number;
}

// ── Env Validation ─────────────────────────────────────────────
// We support both Vite (import.meta.env) and Node (process.env) contexts.

function resolveEnv(key: string): string {
  // 0. Window global injection (e.g. injected by server or HTML in production SPA)
  try {
    if (typeof window !== "undefined" && (window as any).__SUPABASE_ENV__) {
      const winVal = (window as any).__SUPABASE_ENV__[key];
      if (typeof winVal === "string" && winVal.trim() !== "") return winVal.trim();
      const cleanKey = key.replace(/^VITE_/, "");
      const cleanVal = (window as any).__SUPABASE_ENV__[cleanKey];
      if (typeof cleanVal === "string" && cleanVal.trim() !== "") return cleanVal.trim();
    }
  } catch {}

  // 1. Vite client bundle (import.meta.env.*)
  try {
    if (typeof import.meta !== "undefined" && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (typeof val === "string" && val.trim() !== "") return val.trim();
    }
  } catch {}

  // 2. Node.js server / testing (process.env.*)
  try {
    if (typeof process !== "undefined" && process?.env) {
      const val = process.env[key];
      if (typeof val === "string" && val.trim() !== "") return val.trim();
    }
  } catch {}

  return "";
}

const rawUrl = resolveEnv("VITE_SUPABASE_URL") || resolveEnv("SUPABASE_URL");
const rawAnonKey = resolveEnv("VITE_SUPABASE_ANON_KEY") || resolveEnv("SUPABASE_ANON_KEY");

export const isSupabaseConfigured: boolean = Boolean(
  rawUrl &&
  rawAnonKey &&
  !rawUrl.includes("placeholder")
);

const supabaseUrl = isSupabaseConfigured ? rawUrl : "https://placeholder.supabase.co";
const supabaseAnonKey = isSupabaseConfigured ? rawAnonKey : "placeholder-anon-key";

if (!isSupabaseConfigured) {
  console.warn(
    "[supabaseClient] Notice: Supabase credentials not found in environment. " +
    "Running in offline / local catalogue fallback mode.",
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const STORAGE_BUCKET = "card-art";

// ── Database Operations: Cards ────────────────────────────────

export function normalizeCardRow(row: any): CardMeta {
  if (!row) {
    return {
      id: "CARD_UNKNOWN",
      name: "Unknown Card",
      cost: 1,
      type: "UNIT" as any,
      attack: 1,
      hp: 1,
      tribes: ["เป็นกลาง"],
      tribe: "เป็นกลาง",
      keywords: [],
      text: "",
      imageUrl: "",
      updatedAt: Date.now(),
    };
  }

  const rawTribes = Array.isArray(row.tribes)
    ? row.tribes
    : (row.tribe ? [row.tribe] : ["เป็นกลาง"]);
  const rawKeywords = Array.isArray(row.keywords) ? row.keywords : [];
  const text = row.text ?? row.description ?? "";
  const imageUrl = row.imageUrl ?? row.image_url ?? "";

  return {
    id: String(row.id || "").trim(),
    name: String(row.name || row.id || "Card").trim(),
    cost: Number(row.cost ?? 1) || 0,
    type: String(row.type || "UNIT").toUpperCase() as any,
    attack: Number(row.attack ?? 0),
    hp: Number(row.hp ?? 0),
    tribes: rawTribes.length > 0 ? rawTribes : ["เป็นกลาง"],
    tribe: row.tribe || rawTribes[0] || "เป็นกลาง",
    keywords: rawKeywords,
    text: String(text || ""),
    imageUrl: String(imageUrl || ""),
    updatedAt: Number(row.updatedAt ?? row.updated_at ?? Date.now()) || Date.now(),
  };
}

export async function fetchCardsFromSupabase(): Promise<CardMeta[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from("cards").select("*");
    if (error) {
      console.error("[Supabase] Error fetching cards:", error.message, error);
      return null;
    }
    if (!data || !Array.isArray(data)) return [];
    return data.map((row) => normalizeCardRow(row));
  } catch (err) {
    console.error("[Supabase] Failed to connect to cards table:", err);
    return null;
  }
}

export async function upsertCardToSupabase(card: CardMeta): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const payload: Record<string, any> = {
      id: card.id,
      name: card.name,
      cost: card.cost ?? 1,
      type: card.type || "UNIT",
      attack: card.attack ?? null,
      hp: card.hp ?? null,
      tribes: card.tribes && card.tribes.length > 0 ? card.tribes : (card.tribe ? [card.tribe] : ["เป็นกลาง"]),
      tribe: card.tribe || card.tribes?.[0] || "เป็นกลาง",
      keywords: card.keywords || [],
      text: card.text || null,
      imageUrl: card.imageUrl || "",
      updatedAt: card.updatedAt || Date.now(),
    };

    let { error } = await supabase.from("cards").upsert(payload, { onConflict: "id" });

    // Fallback if schema was created with unquoted / snake_case column names
    if (error && (error.message?.includes("column") || error.code === "PGRST204")) {
      const snakePayload = {
        id: card.id,
        name: card.name,
        cost: card.cost ?? 1,
        type: card.type || "UNIT",
        attack: card.attack ?? null,
        hp: card.hp ?? null,
        tribes: card.tribes && card.tribes.length > 0 ? card.tribes : (card.tribe ? [card.tribe] : ["เป็นกลาง"]),
        tribe: card.tribe || card.tribes?.[0] || "เป็นกลาง",
        keywords: card.keywords || [],
        description: card.text || null,
        image_url: card.imageUrl || "",
        updated_at: card.updatedAt || Date.now(),
      };
      const retry = await supabase.from("cards").upsert(snakePayload, { onConflict: "id" });
      error = retry.error;
    }

    if (error) {
      console.error("[Supabase] Error upserting card:", error.message, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Exception upserting card:", err);
    return false;
  }
}

export async function deleteCardFromSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) {
      console.error("[Supabase] Error deleting card:", error.message, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Exception deleting card:", err);
    return false;
  }
}

// ── Database Operations: Heroes ───────────────────────────────

export function normalizeHeroRow(row: any): HeroDefinition {
  if (!row) {
    return {
      id: "HERO_UNKNOWN",
      name: "Unknown Hero",
      title: "",
      description: "",
      maxHp: 20,
      portraitUrl: "🧙",
      allowedTribes: ["เป็นกลาง"],
      signatureAbilityCardId: "",
      coreAbilityCardIds: ["SP_AERIAL_SURGE", "SP_TAILWIND_DRAFT", "SP_GLACIAL_GALE"],
      isActive: true,
      updatedAt: Date.now(),
    };
  }

  const portrait = String(row.portraitUrl ?? row.portrait_url ?? "🧙").trim();
  const safePortrait = (!portrait || portrait.toLowerCase() === "loading" || portrait.toLowerCase() === "uploading..." || portrait.startsWith("blob:"))
    ? "🧙"
    : portrait;
  const rawCores = Array.isArray(row.coreAbilityCardIds ?? row.core_ability_card_ids)
    ? (row.coreAbilityCardIds ?? row.core_ability_card_ids)
    : [];

  const rawId = String(row.id || "").trim();
  const isLegacy = LEGACY_HERO_IDS.includes(rawId);
  const rawActive = row.isActive ?? row.is_active;
  let isActive: boolean;
  if (typeof rawActive === "boolean") {
    isActive = rawActive;
  } else if (rawActive === undefined || rawActive === null) {
    // Explicit Compatibility Rule:
    // Legacy records with missing/null active status default to false (inactive).
    // Non-legacy / custom hero records default to true (active).
    isActive = !isLegacy;
  } else {
    isActive = Boolean(rawActive);
  }

  return {
    id: rawId,
    name: String(row.name || row.id || "Hero").trim(),
    title: String(row.title ?? "").trim(),
    description: String(row.description ?? "").trim(),
    maxHp: Number(row.maxHp ?? row.max_hp ?? 20) || 20,
    portraitUrl: safePortrait,
    allowedTribes: Array.isArray(row.allowedTribes ?? row.allowed_tribes)
      ? (row.allowedTribes ?? row.allowed_tribes)
      : ["เป็นกลาง"],
    signatureAbilityCardId: String(row.signatureAbilityCardId ?? row.signature_ability_card_id ?? "").trim(),
    coreAbilityCardIds: [
      String(rawCores[0] || "SP_AERIAL_SURGE"),
      String(rawCores[1] || "SP_TAILWIND_DRAFT"),
      String(rawCores[2] || "SP_GLACIAL_GALE"),
    ],
    isActive,
    updatedAt: Number(row.updatedAt ?? row.updated_at ?? Date.now()) || Date.now(),
  };
}

export const LEGACY_HERO_IDS = [
  "HERO_SKY_VANGUARD",
  "HERO_ABYSSAL_SORCERER",
  "HERO_SOLAR_FLARE",
  "HERO_SUPER_BRAINZ",
];

/** Preserved for backwards compatibility; does not delete heroes */
export async function clearLegacyHeroesFromSupabase(): Promise<void> {
  // Intentionally no-op: legacy heroes must not be deleted from Supabase
}

export async function fetchHeroesFromSupabase(): Promise<HeroDefinition[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from("heroes").select("*");
    if (error) {
      console.error("[Supabase] Error fetching heroes:", error.message, error);
      return null;
    }
    if (!data || !Array.isArray(data)) return [];

    return data.map((row) => normalizeHeroRow(row));
  } catch (err) {
    console.error("[Supabase] Failed to connect to heroes table:", err);
    return null;
  }
}

export interface UpsertHeroResult {
  success: boolean;
  persistedLocallyOnly?: boolean;
  error?: string;
  verifiedHero?: HeroDefinition;
}

export async function upsertHeroToSupabase(hero: HeroDefinition): Promise<boolean> {
  const res = await upsertHeroToSupabaseVerified(hero);
  return res.success;
}

/**
 * Persists a HeroDefinition to remote Supabase and performs strict read-back verification.
 * 
 * Rules:
 * 1. Target column for active status in deployed Supabase schema is `is_active` (boolean).
 * 2. CamelCase columns `maxHp`, `portraitUrl`, `signatureAbilityCardId`, `coreAbilityCardIds`, `updatedAt`
 *    are quoted in schema, so they must be sent in camelCase.
 * 3. Never strip active status or report false success if active column fails.
 * 4. Read back the row immediately after upsert to verify stable ID and persisted active value.
 */
export async function upsertHeroToSupabaseVerified(hero: HeroDefinition): Promise<UpsertHeroResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      persistedLocallyOnly: true,
      error: "Supabase credentials are not configured in runtime environment (offline fallback mode).",
    };
  }

  try {
    const rawPortrait = String(hero.portraitUrl || "").trim();
    if (rawPortrait.startsWith("blob:")) {
      return {
        success: false,
        error: "Temporary browser-only blob: URLs cannot be persisted to database. Use a durable data URL or hosted image URL.",
      };
    }

    const safePortrait = (!rawPortrait || rawPortrait.toLowerCase() === "loading" || rawPortrait.toLowerCase() === "uploading...")
      ? "🧙"
      : rawPortrait;

    const isActive = hero.isActive !== false;

    // Primary payload matching deployed Supabase PostgreSQL schema:
    // Notice: `is_active` is the snake_case column in remote database,
    // while `maxHp`, `portraitUrl`, `signatureAbilityCardId`, `coreAbilityCardIds`, `updatedAt` are camelCase.
    const payload: Record<string, any> = {
      id: hero.id,
      name: hero.name,
      title: hero.title || "",
      description: hero.description || "",
      maxHp: hero.maxHp || 20,
      portraitUrl: safePortrait,
      allowedTribes: hero.allowedTribes || [],
      signatureAbilityCardId: hero.signatureAbilityCardId || "",
      coreAbilityCardIds: hero.coreAbilityCardIds || [],
      is_active: isActive,
      updatedAt: hero.updatedAt || Date.now(),
    };

    let { error } = await supabase.from("heroes").upsert(payload, { onConflict: "id" });

    // Fallback attempt ONLY if database schema uses quoted "isActive" column instead of "is_active"
    if (error && (error.message?.includes("is_active") || error.message?.includes("column") || error.code === "PGRST204")) {
      const camelActivePayload = { ...payload };
      delete camelActivePayload.is_active;
      camelActivePayload.isActive = isActive;

      const retryCamel = await supabase.from("heroes").upsert(camelActivePayload, { onConflict: "id" });
      if (!retryCamel.error) {
        error = null;
      } else {
        // Fallback attempt if table uses fully snake_case columns
        const allSnakePayload = {
          id: hero.id,
          name: hero.name,
          title: hero.title || "",
          description: hero.description || "",
          max_hp: hero.maxHp || 20,
          portrait_url: safePortrait,
          allowed_tribes: hero.allowedTribes || [],
          signature_ability_card_id: hero.signatureAbilityCardId || "",
          core_ability_card_ids: hero.coreAbilityCardIds || [],
          is_active: isActive,
          updated_at: hero.updatedAt || Date.now(),
        };
        const retrySnake = await supabase.from("heroes").upsert(allSnakePayload, { onConflict: "id" });
        if (!retrySnake.error) {
          error = null;
        }
      }
    }

    if (error) {
      console.error("[Supabase] Error upserting hero to database:", error.message, error);
      return {
        success: false,
        error: `Supabase write error (${error.code || "UNKNOWN"}): ${error.message}`,
      };
    }

    // ── STEP 4: Strict Read-Back Verification ────────────────────
    // Read the hero record back from Supabase to verify persistence
    const { data: readBackRow, error: readBackError } = await supabase
      .from("heroes")
      .select("*")
      .eq("id", hero.id)
      .single();

    if (readBackError || !readBackRow) {
      const msg = `Read-back verification failed: Record "${hero.id}" could not be retrieved from Supabase after write.`;
      console.error("[Supabase]", msg, readBackError);
      return {
        success: false,
        error: msg,
      };
    }

    // Verify stable ID
    if (String(readBackRow.id).trim() !== String(hero.id).trim()) {
      const msg = `Read-back verification failed: ID mismatch (expected "${hero.id}", got "${readBackRow.id}").`;
      console.error("[Supabase]", msg);
      return {
        success: false,
        error: msg,
      };
    }

    // Verify persisted active status
    const persistedRawActive = readBackRow.is_active ?? readBackRow.isActive;
    if (typeof persistedRawActive !== "boolean" || persistedRawActive !== isActive) {
      const msg = `Read-back verification failed: isActive mismatch for "${hero.id}" (expected ${isActive}, but remote database stored ${persistedRawActive}).`;
      console.error("[Supabase]", msg);
      return {
        success: false,
        error: msg,
      };
    }

    const verifiedHero = normalizeHeroRow(readBackRow);
    return {
      success: true,
      verifiedHero,
    };
  } catch (err: any) {
    console.error("[Supabase] Exception during upsertHeroToSupabaseVerified:", err);
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Updates only the active status of an existing hero in Supabase with strict read-back verification.
 */
export async function toggleHeroActiveInSupabase(id: string, isActive: boolean): Promise<UpsertHeroResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      persistedLocallyOnly: true,
      error: "Supabase credentials are not configured in runtime environment (offline fallback mode).",
    };
  }

  try {
    let { error } = await supabase
      .from("heroes")
      .update({ is_active: isActive, updatedAt: Date.now() })
      .eq("id", id);

    // Fallback if schema was created with camelCase "isActive"
    if (error && (error.message?.includes("is_active") || error.message?.includes("column") || error.code === "PGRST204")) {
      const retry = await supabase
        .from("heroes")
        .update({ isActive: isActive, updatedAt: Date.now() })
        .eq("id", id);
      error = retry.error;
    }

    if (error) {
      console.error("[Supabase] Error updating hero active status:", error.message, error);
      return {
        success: false,
        error: `Supabase write error (${error.code || "UNKNOWN"}): ${error.message}`,
      };
    }

    // Strict read-back verification
    const { data: readBackRow, error: readBackError } = await supabase
      .from("heroes")
      .select("*")
      .eq("id", id)
      .single();

    if (readBackError || !readBackRow) {
      return {
        success: false,
        error: `Read-back verification failed for hero "${id}" after active toggle.`,
      };
    }

    const persistedActive = readBackRow.is_active ?? readBackRow.isActive;
    if (typeof persistedActive === "boolean" && persistedActive !== isActive) {
      return {
        success: false,
        error: `Active status mismatch for hero "${id}" (expected ${isActive}, got ${persistedActive}).`,
      };
    }

    const verifiedHero = normalizeHeroRow(readBackRow);
    return {
      success: true,
      verifiedHero,
    };
  } catch (err: any) {
    console.error("[Supabase] Exception during toggleHeroActiveInSupabase:", err);
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

export async function deleteHeroFromSupabase(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("heroes").delete().eq("id", id);
    if (error) {
      console.warn("[Supabase] Error deleting hero:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase] Exception deleting hero:", err);
    return false;
  }
}

// ── Storage Operations: Asset Upload ──────────────────────────

export async function uploadAssetToSupabaseStorage(
  fileOrBase64: File | { filename: string; dataUrl: string },
): Promise<string | null> {
  if (!isSupabaseConfigured) {
    console.warn("[Supabase] Storage upload skipped: Supabase credentials not configured.");
    return null;
  }
  try {
    let fileBody: Blob | File;
    let filename: string;

    if (fileOrBase64 instanceof File) {
      fileBody = fileOrBase64;
      const ext = fileOrBase64.name.split(".").pop() || "png";
      const clean = fileOrBase64.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
      filename = `${clean}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    } else {
      const dataUrl = fileOrBase64.dataUrl;
      let ext = "png";
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
      if (match && match[1]) {
        ext = match[1] === "jpeg" ? "jpg" : match[1].replace("+xml", "");
      }
      const base64Data = dataUrl.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      fileBody = new Blob([byteArray], { type: `image/${ext}` });

      const clean = (fileOrBase64.filename || "art").replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
      filename = `${clean}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    }

    // Attempt upload to Supabase Storage Bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(`uploads/${filename}`, fileBody, {
        cacheControl: "31536000",
        upsert: true,
      });

    if (uploadError) {
      console.warn("[Supabase Storage] Upload error:", uploadError.message);
      return null;
    }

    // Obtain public URL
    const { data: publicData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uploadData.path);

    console.log(`[Supabase Storage] Uploaded: ${publicData.publicUrl}`);
    return publicData.publicUrl;
  } catch (err) {
    console.warn("[Supabase Storage] Exception during asset upload:", err);
    return null;
  }
}
