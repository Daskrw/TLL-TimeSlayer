// ============================================================
//  CardRepository.ts
//  Data access layer for card definitions.
//  – Authoritative Cloud source: Supabase PostgreSQL (cards table)
//  – Authoritative Node source: /api/catalog master_registry
//  – Fallback: localStorage cached copy and static catalogue (src/cards.ts)
//  – Reactive: subscribers notified when card data changes + Realtime sync
// ============================================================

import { CardDefinition, CardType } from "../src/types";
import * as StaticCards from "../src/cards";
import {
  fetchCardsFromSupabase,
  upsertCardToSupabase,
  normalizeCardRow,
  supabase,
} from "../src/supabaseClient";

// ─────────────────────────────────────────────────────────────
//  CardMeta — extended card definition with CMS fields
// ─────────────────────────────────────────────────────────────

export interface CardMeta extends CardDefinition {
  imageUrl: string;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────
//  All static cards, deduplicated by ID
// ─────────────────────────────────────────────────────────────

const STATIC_COLLECTIBLE: CardDefinition[] = StaticCards.ALL_STATIC_CARDS;

// ─────────────────────────────────────────────────────────────
//  Persistence Key (Offline / Cache Fallback)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  Persistence Key & Storage Quota Boundaries
// ─────────────────────────────────────────────────────────────

export const LS_KEY = "CARD_GAME_CARD_OVERRIDES";

/**
 * Maximum string length for an image URL permitted into localStorage.
 * Standard browser localStorage quotas are ~5 MB across the entire origin.
 * Large base64 data URIs (e.g. 3-4 MB per card across 8 cards = ~26 MB) will exceed this quota.
 * Hosted URLs (https://..., /uploads/...) or tiny thumbnails <= 64 KB are permitted.
 */
export const MAX_LOCAL_STORAGE_IMAGE_LEN = 65536;

export function isCompactImageUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.length <= MAX_LOCAL_STORAGE_IMAGE_LEN;
}

export function buildLocalOverridesPayload(
  cards: Iterable<[string, CardMeta]>
): Record<string, Partial<CardMeta>> {
  const overrides: Record<string, Partial<CardMeta>> = {};
  for (const [id, meta] of cards) {
    if (meta.imageUrl || (meta.updatedAt !== undefined && meta.updatedAt > 0)) {
      const entry: Partial<CardMeta> = {
        updatedAt: meta.updatedAt,
        name: meta.name,
        cost: meta.cost,
        type: meta.type,
        attack: meta.attack,
        hp: meta.hp,
        tribes: meta.tribes ? [...meta.tribes] : (meta.tribe ? [meta.tribe] : ["เป็นกลาง"]),
        tribe: meta.tribe || (meta.tribes?.[0] ?? "เป็นกลาง"),
        keywords: Array.isArray(meta.keywords) ? [...meta.keywords] : [],
        ...(meta.text !== undefined ? { text: meta.text } : {}),
      };
      // Only include compact image URLs (e.g. CDN URLs, hosted paths, small thumbnails <= 64KB).
      // Large base64 artwork (> 64KB) is excluded to avoid QuotaExceededError in localStorage.
      if (isCompactImageUrl(meta.imageUrl)) {
        entry.imageUrl = meta.imageUrl;
      }
      overrides[id] = entry;
    }
  }
  return overrides;
}

export function applyLocalOverrides(
  cards: Map<string, CardMeta>,
  overrides: Record<string, Partial<CardMeta>>
): void {
  for (const [id, patch] of Object.entries(overrides)) {
    const existing = cards.get(id);
    if (existing) {
      const { imageUrl, ...metadata } = patch;
      Object.assign(existing, metadata);
      // Strictly preserve existing non-empty image if patch does not provide a non-empty image
      if (imageUrl && imageUrl.trim() !== "") {
        existing.imageUrl = imageUrl;
      }
    } else {
      cards.set(id, {
        ...patch,
        imageUrl: patch.imageUrl || "",
      } as CardMeta);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Targeted IndexedDB Offline Artwork Cache
// ─────────────────────────────────────────────────────────────

const IDB_NAME = "tll_artwork_store";
const IDB_STORE = "artwork";

function openArtworkDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveArtworkToIDB(id: string, imageUrl: string): Promise<void> {
  if (!id || !imageUrl || typeof window === "undefined" || !window.indexedDB) return;
  try {
    const db = await openArtworkDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(imageUrl, id);
  } catch {
    // Non-fatal: IndexedDB write failure should never block application
  }
}

export async function loadArtworkFromIDB(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (typeof window === "undefined" || !window.indexedDB) return map;
  try {
    const db = await openArtworkDB();
    if (!db) return map;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          map.set(cursor.key as string, cursor.value as string);
          cursor.continue();
        } else {
          resolve(map);
        }
      };
      req.onerror = () => resolve(map);
    });
  } catch {
    return map;
  }
}

// ─────────────────────────────────────────────────────────────
//  Conflict Resolution & Sync Hardening Rules
// ─────────────────────────────────────────────────────────────

/**
 * Evaluates whether an incoming card record should overwrite an existing record.
 * Rules:
 *  1. A seed/default record with updatedAt === 0 CANNOT overwrite an existing record with updatedAt > 0.
 *  2. Fallback seed data must not overwrite valid edited stats, effects, names, or fields.
 *  3. LWW timestamp comparison: if incoming is older than existing, reject.
 *  4. Fallback data (isAuthoritativeRemote === false) cannot overwrite existing records with equal or newer timestamps.
 */
export function shouldIncomingCardOverwrite(
  incoming: CardMeta,
  existing: CardMeta | undefined,
  isAuthoritativeRemote = false,
): boolean {
  if (!existing) return true;

  const existingUpdated = existing.updatedAt ?? 0;
  const incomingUpdated = incoming.updatedAt ?? 0;

  // Rule 1: A seed/default record with updatedAt: 0 cannot overwrite an edited record with updatedAt > 0
  if (incomingUpdated === 0 && existingUpdated > 0) {
    return false;
  }

  // Rule 2: If incoming is fallback data (e.g. /api/catalog fallback or static seed):
  // Never overwrite an existing record that has updatedAt > 0 or has local edits
  if (!isAuthoritativeRemote) {
    if (existingUpdated > 0) {
      return false;
    }
    if (incomingUpdated < existingUpdated) {
      return false;
    }
  }

  // Rule 3: LWW timestamp comparison
  if (incomingUpdated > 0 && existingUpdated > 0 && incomingUpdated < existingUpdated) {
    return false;
  }

  return true;
}

/**
 * Safely merges incoming card metadata into an existing card definition.
 * Enforces image preservation:
 *  - Fallback data or incomplete records must NEVER replace a non-empty existing image with an empty image.
 */
export function mergeCardSafely(
  existing: CardMeta | undefined,
  incoming: CardMeta,
  options: { isAuthoritativeRemote?: boolean } = {},
): CardMeta {
  if (!existing) {
    return { ...incoming };
  }

  const { isAuthoritativeRemote = false } = options;
  const canOverwrite = shouldIncomingCardOverwrite(incoming, existing, isAuthoritativeRemote);

  if (!canOverwrite) {
    return existing;
  }

  // Incoming is eligible to overwrite.
  // Rule: An existing non-empty image must never be wiped out by an empty incoming image
  const resolvedImageUrl =
    incoming.imageUrl && incoming.imageUrl.trim() !== ""
      ? incoming.imageUrl
      : (existing.imageUrl || "");

  return {
    ...existing,
    ...incoming,
    imageUrl: resolvedImageUrl,
  };
}

export type ChangeListener = (cards: Map<string, CardMeta>) => void;

export class CardRepository {
  private static _instance: CardRepository | null = null;

  private cards = new Map<string, CardMeta>();
  private listeners = new Set<ChangeListener>();
  private ready = false;
  private _readyP: Promise<void>;
  private _resolve!: () => void;

  private constructor() {
    this._readyP = new Promise((res) => {
      this._resolve = res;
    });
    this.bootstrap();
    this.initRealtime();
  }

  public static getInstance(): CardRepository {
    if (!CardRepository._instance) {
      CardRepository._instance = new CardRepository();
    }
    return CardRepository._instance;
  }

  // ── Ready guard ───────────────────────────────────────────────

  /** Resolves once the initial card list has been loaded. */
  public whenReady(): Promise<void> {
    return this._readyP;
  }

  // ── Realtime Synchronization ──────────────────────────────────

  private initRealtime(): void {
    try {
      supabase
        .channel("public:cards")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cards" },
          (payload) => {
            console.log("[CardRepository] Realtime card change received from Supabase:", payload.eventType);
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const row = normalizeCardRow(payload.new);
              const existing = this.cards.get(row.id);
              const merged = mergeCardSafely(existing, row, { isAuthoritativeRemote: true });
              this.cards.set(row.id, merged);
              if (merged.imageUrl && !isCompactImageUrl(merged.imageUrl)) {
                saveArtworkToIDB(merged.id, merged.imageUrl);
              }
              this.persistLocalOverrides();
              this.notify();
            } else if (payload.eventType === "DELETE") {
              const old = payload.old as { id: string };
              if (old?.id) {
                this.cards.delete(old.id);
                this.persistLocalOverrides();
                this.notify();
              }
            }
          },
        )
        .subscribe();
    } catch (err) {
      console.warn("[CardRepository] Failed to initialize Supabase Realtime channel:", err);
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────

  private async bootstrap(): Promise<void> {
    // 1. Seed from static catalogue as baseline
    for (const card of STATIC_COLLECTIBLE) {
      this.cards.set(card.id, {
        ...card,
        tribes: card.tribes && card.tribes.length > 0 ? [...card.tribes] : [card.tribe || "เป็นกลาง"],
        tribe: card.tribe || card.tribes?.[0] || "เป็นกลาง",
        imageUrl: "",
        updatedAt: 0,
      });
    }

    // 2. Read cached overrides from localStorage for instantaneous first render
    this.mergeLocalOverrides();

    // 2b. Hydrate artwork from targeted IndexedDB cache if available (offline-safe)
    try {
      const cachedArt = await loadArtworkFromIDB();
      if (cachedArt && cachedArt.size > 0) {
        for (const [id, art] of cachedArt) {
          const existing = this.cards.get(id);
          if (existing && (!existing.imageUrl || existing.imageUrl.trim() === "")) {
            existing.imageUrl = art;
          }
        }
      }
    } catch {
      // Non-fatal IDB read failure
    }

    // 3. Fetch authoritative catalog from Supabase & Backend REST
    try {
      await this.fetchRemote();
    } catch (err) {
      console.warn("[CardRepository] Remote catalog fetch fallback:", err);
    } finally {
      this.ready = true;
      this._resolve();
      this.notify();
    }
  }

  // ── Local offline cache overrides ─────────────────────────────

  private mergeLocalOverrides(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const overrides = JSON.parse(raw) as Record<string, Partial<CardMeta>>;
      applyLocalOverrides(this.cards, overrides);
    } catch {
      // ignore parse errors
    }
  }

  private persistLocalOverrides(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const overrides = buildLocalOverridesPayload(this.cards);
      localStorage.setItem(LS_KEY, JSON.stringify(overrides));
    } catch (err) {
      console.warn("[CardRepository] Failed to write localStorage cache:", err);
    }
  }

  // ── Remote Adapter (Supabase & Backend REST API) ──────────────

  public async fetchRemote(): Promise<void> {
    // 1. Try Supabase Cloud PostgreSQL
    try {
      const supabaseCards = await fetchCardsFromSupabase();
      if (supabaseCards && supabaseCards.length > 0) {
        for (const row of supabaseCards) {
          const existing = this.cards.get(row.id);
          const merged = mergeCardSafely(existing, row, { isAuthoritativeRemote: true });
          this.cards.set(row.id, merged);
          if (row.imageUrl && !isCompactImageUrl(row.imageUrl)) {
            saveArtworkToIDB(row.id, row.imageUrl);
          }
        }
        this.persistLocalOverrides();
        console.log(`[CardRepository] Loaded ${supabaseCards.length} authoritative cards from Supabase PostgreSQL`);
        return;
      }
      if (supabaseCards === null) {
        console.warn("[CardRepository] Supabase fetch returned null (error or timeout); preserving existing cards.");
      } else if (supabaseCards.length === 0) {
        console.warn("[CardRepository] Supabase returned 0 cards; preserving existing cards.");
      }
    } catch (err) {
      console.error("[CardRepository] Supabase fetchRemote error:", err);
    }

    // 2. Try Node.js Backend REST API (Fallback source)
    try {
      const endpoint = typeof window !== "undefined"
        ? "/api/catalog"
        : `http://localhost:${(typeof process !== "undefined" && process?.env?.PORT) || 3000}/api/catalog`;
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        if (data.cards && Array.isArray(data.cards) && data.cards.length > 0) {
          let updatedAny = false;
          for (const rawCard of data.cards) {
            const card = normalizeCardRow(rawCard);
            const existing = this.cards.get(card.id);
            if (shouldIncomingCardOverwrite(card, existing, false)) {
              const merged = mergeCardSafely(existing, card, { isAuthoritativeRemote: false });
              if (merged !== existing) {
                this.cards.set(card.id, merged);
                updatedAny = true;
                if (merged.imageUrl && !isCompactImageUrl(merged.imageUrl)) {
                  saveArtworkToIDB(merged.id, merged.imageUrl);
                }
              }
            }
          }
          if (updatedAny) {
            this.persistLocalOverrides();
          }
          console.log(`[CardRepository] Processed ${data.cards.length} cards from Backend Master Registry fallback`);
        }
      }
    } catch (err) {
      console.warn("[CardRepository] Backend REST fetch skipped:", err);
    }
  }

  /** Push card update to Supabase & Backend server */
  private async pushRemote(meta: CardMeta): Promise<boolean> {
    let supabaseSuccess = false;
    // 1. Push to Supabase PostgreSQL
    try {
      supabaseSuccess = await upsertCardToSupabase(meta);
      if (supabaseSuccess) {
        console.log(`[CardRepository] Card "${meta.name}" (${meta.id}) successfully saved to Supabase.`);
      } else {
        console.error(`[CardRepository] Failed to upsert card "${meta.name}" (${meta.id}) to Supabase.`);
      }
    } catch (err) {
      console.error("[CardRepository] Supabase push error:", err);
    }

    // 2. Push to Node.js Backend REST endpoint
    try {
      await fetch("/api/admin/update-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: meta.id, card: meta }),
      });
    } catch (err) {
      console.warn("[CardRepository] Backend REST API push skipped:", err);
    }

    return supabaseSuccess;
  }

  // ── Public API ───────────────────────────────────────────────

  public setCatalog(cards: CardMeta[], _heroes?: any[]): void {
    for (const card of cards) {
      const existing = this.cards.get(card.id);
      const merged = mergeCardSafely(existing, card, { isAuthoritativeRemote: false });
      this.cards.set(card.id, {
        ...merged,
        tribes: merged.tribes && merged.tribes.length > 0 ? merged.tribes : (merged.tribe ? [merged.tribe] : ["เป็นกลาง"]),
        tribe: merged.tribe || merged.tribes?.[0] || "เป็นกลาง",
      });
      if (merged.imageUrl && !isCompactImageUrl(merged.imageUrl)) {
        saveArtworkToIDB(merged.id, merged.imageUrl);
      }
    }
    this.persistLocalOverrides();
    this.notify();
  }

  public fetchCards(): Map<string, CardMeta> {
    return new Map(this.cards);
  }

  public getCard(id: string): CardMeta | null {
    return this.cards.get(id) ?? null;
  }

  public getCardById(id: string): CardMeta | null {
    return this.getCard(id);
  }

  public static getCardById(id: string): CardDefinition | null {
    if (CardRepository._instance) {
      const found = CardRepository._instance.getCard(id);
      if (found) return found;
    }
    return StaticCards.getStaticCardById(id);
  }

  public getAll(): CardMeta[] {
    return Array.from(this.cards.values());
  }

  public getAllCollectible(): CardMeta[] {
    return this.getAll().filter((c) => c.type !== CardType.HeroAbility);
  }

  // ── Public Write API ──────────────────────────────────────────

  public async updateCard(id: string, patch: Partial<CardMeta>): Promise<boolean> {
    const existing = this.cards.get(id);
    const updated: CardMeta = existing
      ? { ...existing, ...patch, updatedAt: Date.now() }
      : ({
          id,
          name: patch.name || id,
          cost: patch.cost ?? 1,
          type: patch.type || CardType.Unit,
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

    this.cards.set(id, updated);
    this.persistLocalOverrides();
    if (updated.imageUrl && !isCompactImageUrl(updated.imageUrl)) {
      saveArtworkToIDB(id, updated.imageUrl);
    }
    const ok = await this.pushRemote(updated);
    this.notify();
    return ok;
  }

  public async upsertCard(meta: CardMeta): Promise<boolean> {
    meta.updatedAt = Date.now();
    this.cards.set(meta.id, meta);
    this.persistLocalOverrides();
    if (meta.imageUrl && !isCompactImageUrl(meta.imageUrl)) {
      saveArtworkToIDB(meta.id, meta.imageUrl);
    }
    const ok = await this.pushRemote(meta);
    this.notify();
    return ok;
  }

  // ── Subscriptions ─────────────────────────────────────────────

  public subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.fetchCards();
    for (const l of this.listeners) l(snapshot);
  }
}

// Singleton accessor
export const cardRepo = CardRepository.getInstance();

export async function initializeGameData(): Promise<void> {
  await cardRepo.whenReady();
}
