// ============================================================
//  CardRepository.ts
//  Data access layer for card definitions.
//  – Authoritative Cloud source: Supabase PostgreSQL (cards table)
//  – Authoritative Node source: /api/catalog master_registry
//  – Fallback: localStorage cached copy and static catalogue (src/cards.ts)
//  – Reactive: subscribers notified when card data changes + Realtime sync
// ============================================================

import { CardDefinition, CardType, Keyword } from "../src/types";
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

const LS_KEY = "CARD_GAME_CARD_OVERRIDES";

// ─────────────────────────────────────────────────────────────
//  CardRepository (Singleton)
// ─────────────────────────────────────────────────────────────

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
              this.cards.set(row.id, row);
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
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const overrides = JSON.parse(raw) as Record<string, Partial<CardMeta>>;
      for (const [id, patch] of Object.entries(overrides)) {
        const existing = this.cards.get(id);
        if (existing) {
          Object.assign(existing, patch);
        } else {
          this.cards.set(id, patch as CardMeta);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  private persistLocalOverrides(): void {
    try {
      const overrides: Record<string, Partial<CardMeta>> = {};
      for (const [id, meta] of this.cards) {
        if (meta.imageUrl || meta.updatedAt > 0) {
          const entry: Partial<CardMeta> = {
            imageUrl: meta.imageUrl,
            updatedAt: meta.updatedAt,
            name: meta.name,
            cost: meta.cost,
            attack: meta.attack,
            hp: meta.hp,
            tribes: meta.tribes ? [...meta.tribes] : (meta.tribe ? [meta.tribe] : ["เป็นกลาง"]),
            tribe: meta.tribe || (meta.tribes?.[0] ?? "เป็นกลาง"),
            keywords: [...meta.keywords],
            ...(meta.text !== undefined ? { text: meta.text } : {}),
          };
          overrides[id] = entry;
        }
      }
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
          this.cards.set(row.id, row);
        }
        this.persistLocalOverrides();
        console.log(`[CardRepository] Loaded ${supabaseCards.length} authoritative cards from Supabase PostgreSQL`);
        return;
      }
    } catch (err) {
      console.error("[CardRepository] Supabase fetchRemote error:", err);
    }

    // 2. Try Node.js Backend REST API
    try {
      const response = await fetch("/api/catalog");
      if (response.ok) {
        const data = await response.json();
        if (data.cards && Array.isArray(data.cards)) {
          for (const rawCard of data.cards) {
            const card = normalizeCardRow(rawCard);
            const existing = this.cards.get(card.id);
            if (!existing || (card.updatedAt && card.updatedAt >= (existing.updatedAt || 0))) {
              this.cards.set(card.id, card);
            }
          }
          this.persistLocalOverrides();
          console.log(`[CardRepository] Synced ${data.cards.length} cards from Backend Master Registry`);
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
      this.cards.set(card.id, {
        ...card,
        tribes: card.tribes && card.tribes.length > 0 ? card.tribes : (card.tribe ? [card.tribe] : ["เป็นกลาง"]),
        tribe: card.tribe || card.tribes?.[0] || "เป็นกลาง",
      });
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
    const ok = await this.pushRemote(updated);
    this.notify();
    return ok;
  }

  public async upsertCard(meta: CardMeta): Promise<boolean> {
    meta.updatedAt = Date.now();
    this.cards.set(meta.id, meta);
    this.persistLocalOverrides();
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
