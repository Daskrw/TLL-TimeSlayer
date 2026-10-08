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
  // Vite client bundle (import.meta.env.*)
  const viteVal = typeof import.meta !== "undefined" ? (import.meta as any).env?.[key] : undefined;
  if (viteVal) return viteVal;

  // Node.js server / Jest
  const nodeVal = typeof process !== "undefined" ? process.env?.[key] : undefined;
  if (nodeVal) return nodeVal;

  return "";
}

const supabaseUrl = resolveEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = resolveEnv("VITE_SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseAnonKey) {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");
  throw new Error(
    `[supabaseClient] FATAL: Missing required environment variable(s): ${missing.join(", ")}. ` +
    "Copy .env.example → .env and fill in your project credentials.",
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

export async function fetchCardsFromSupabase(): Promise<CardMeta[] | null> {
  try {
    const { data, error } = await supabase.from("cards").select("*");
    if (error) {
      console.warn("[Supabase] Error fetching cards:", error.message);
      return null;
    }
    return data as CardMeta[];
  } catch (err) {
    console.warn("[Supabase] Failed to connect to cards table:", err);
    return null;
  }
}

export async function upsertCardToSupabase(card: CardMeta): Promise<boolean> {
  try {
    const { error } = await supabase.from("cards").upsert(
      {
        id: card.id,
        name: card.name,
        cost: card.cost,
        type: card.type,
        attack: card.attack ?? null,
        hp: card.hp ?? null,
        tribes: card.tribes || (card.tribe ? [card.tribe] : ["เป็นกลาง"]),
        tribe: card.tribe || card.tribes?.[0] || "เป็นกลาง",
        keywords: card.keywords || [],
        text: card.text || null,
        imageUrl: card.imageUrl || "",
        updatedAt: card.updatedAt || Date.now(),
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("[Supabase] Error upserting card:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase] Exception upserting card:", err);
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
      updatedAt: Date.now(),
    };
  }

  const portrait = row.portraitUrl ?? row.portrait_url ?? "🧙";
  const safePortrait = (!portrait || portrait === "loading" || portrait === "Uploading...") ? "🧙" : portrait;
  const rawCores = Array.isArray(row.coreAbilityCardIds ?? row.core_ability_card_ids)
    ? (row.coreAbilityCardIds ?? row.core_ability_card_ids)
    : [];

  return {
    id: String(row.id || "").trim(),
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
    updatedAt: Number(row.updatedAt ?? row.updated_at ?? Date.now()) || Date.now(),
  };
}

export async function fetchHeroesFromSupabase(): Promise<HeroDefinition[] | null> {
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

export async function upsertHeroToSupabase(hero: HeroDefinition): Promise<boolean> {
  try {
    const safePortrait = (!hero.portraitUrl || hero.portraitUrl === "loading" || hero.portraitUrl === "Uploading...")
      ? "🧙"
      : hero.portraitUrl;

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
      updatedAt: hero.updatedAt || Date.now(),
    };

    let { error } = await supabase.from("heroes").upsert(payload, { onConflict: "id" });

    // Fallback if schema was created with unquoted / snake_case column names
    if (error && (error.message?.includes("column") || error.code === "PGRST204")) {
      const snakePayload = {
        id: hero.id,
        name: hero.name,
        title: hero.title || "",
        description: hero.description || "",
        max_hp: hero.maxHp || 20,
        portrait_url: safePortrait,
        allowed_tribes: hero.allowedTribes || [],
        signature_ability_card_id: hero.signatureAbilityCardId || "",
        core_ability_card_ids: hero.coreAbilityCardIds || [],
        updated_at: hero.updatedAt || Date.now(),
      };
      const retry = await supabase.from("heroes").upsert(snakePayload, { onConflict: "id" });
      error = retry.error;
    }

    if (error) {
      console.error("[Supabase] Error upserting hero:", error.message, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Exception upserting hero:", err);
    return false;
  }
}

export async function deleteHeroFromSupabase(id: string): Promise<boolean> {
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
