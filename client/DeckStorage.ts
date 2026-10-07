// ============================================================
//  DeckStorage.ts — localStorage CRUD for Custom Decks
//  Manages SavedDeck schema, default seeding, validation.
// ============================================================

import { CardDefinition, CardType } from "../src/types";
import { createCardInstance } from "../src/cardInstance";
import {
  DECK_VANGUARD_40,
  DECK_ABYSSAL_40,
  DECK_PLANTS_40,
  DECK_ZOMBIES_40,
  HERO_SKY_VANGUARD,
  HERO_ABYSSAL_SORCERER,
  HERO_SOLAR_FLARE,
  HERO_SUPER_BRAINZ,
} from "../src/cards";

// ─────────────────────────────────────────────────────────────
//  Schema
// ─────────────────────────────────────────────────────────────

export interface SavedDeck {
  id:        string;
  name:      string;
  heroId:    string;
  cardIds:   string[];   // 40 card IDs (with duplicates allowed)
  createdAt: number;
  updatedAt: number;
}

export interface DeckValidation {
  isValid:     boolean;
  cardCount:   number;
  errors:      string[];
}

// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "CARD_GAME_SAVED_DECKS";
const DECK_SIZE   = 40;
const MAX_COPIES  = 4;

// ─────────────────────────────────────────────────────────────
//  DeckStorage
// ─────────────────────────────────────────────────────────────

export class DeckStorage {
  // ── Read ─────────────────────────────────────────────────────

  public static loadAll(): SavedDeck[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SavedDeck[];
    } catch {
      return [];
    }
  }

  public static loadByHero(heroId: string): SavedDeck[] {
    return this.loadAll().filter((d) => d.heroId === heroId);
  }

  public static loadById(id: string): SavedDeck | null {
    return this.loadAll().find((d) => d.id === id) ?? null;
  }

  // ── Write ────────────────────────────────────────────────────

  public static save(deck: SavedDeck): void {
    const all = this.loadAll();
    const idx = all.findIndex((d) => d.id === deck.id);
    deck.updatedAt = Date.now();
    if (idx !== -1) {
      all[idx] = deck;
    } else {
      all.push(deck);
    }
    this.persist(all);
  }

  public static create(heroId: string, name: string, cardIds: string[]): SavedDeck {
    const now = Date.now();
    const deck: SavedDeck = {
      id:        `deck_${heroId}_${now}`,
      name,
      heroId,
      cardIds:   [...cardIds],
      createdAt: now,
      updatedAt: now,
    };
    this.save(deck);
    return deck;
  }

  public static duplicate(id: string): SavedDeck | null {
    const src = this.loadById(id);
    if (!src) return null;
    return this.create(src.heroId, `${src.name} (Copy)`, [...src.cardIds]);
  }

  public static delete(id: string): void {
    const all = this.loadAll().filter((d) => d.id !== id);
    this.persist(all);
  }

  public static rename(id: string, name: string): void {
    const all = this.loadAll();
    const deck = all.find((d) => d.id === id);
    if (deck) {
      deck.name = name;
      deck.updatedAt = Date.now();
      this.persist(all);
    }
  }

  public static updateCards(id: string, cardIds: string[]): void {
    const all = this.loadAll();
    const deck = all.find((d) => d.id === id);
    if (deck) {
      deck.cardIds = [...cardIds];
      deck.updatedAt = Date.now();
      this.persist(all);
    }
  }

  // ── Validation ────────────────────────────────────────────────

  public static validate(cardIds: string[], catalog: CardDefinition[]): DeckValidation {
    const errors: string[] = [];
    const catalogMap = new Map(catalog.map((c) => [c.id, c]));

    if (cardIds.length !== DECK_SIZE) {
      errors.push(`Deck must have exactly ${DECK_SIZE} cards (currently ${cardIds.length}).`);
    }

    const copyCounts = new Map<string, number>();
    for (const id of cardIds) {
      copyCounts.set(id, (copyCounts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of copyCounts) {
      if (count > MAX_COPIES) {
        const card = catalogMap.get(id);
        errors.push(`"${card?.name ?? id}" has ${count} copies (max ${MAX_COPIES}).`);
      }
    }

    for (const id of cardIds) {
      const card = catalogMap.get(id);
      if (card && card.type === CardType.HeroAbility) {
        errors.push(`Superpower cards cannot be placed in your main deck: "${card.name}".`);
      }
    }

    return {
      isValid:   errors.length === 0 && cardIds.length === DECK_SIZE,
      cardCount: cardIds.length,
      errors,
    };
  }

  // ── Default Seeding ───────────────────────────────────────────

  public static seedDefaults(): void {
    const existing = this.loadAll();
    const now = Date.now();

    const defaults: SavedDeck[] = [
      {
        id:        "deck_default_vanguard",
        name:      "Starter Sky Vanguard",
        heroId:    HERO_SKY_VANGUARD.id,
        cardIds:   DECK_VANGUARD_40.map((c) => c.id),
        createdAt: now,
        updatedAt: now,
      },
      {
        id:        "deck_default_abyssal",
        name:      "Starter Abyssal Depths",
        heroId:    HERO_ABYSSAL_SORCERER.id,
        cardIds:   DECK_ABYSSAL_40.map((c) => c.id),
        createdAt: now,
        updatedAt: now,
      },
      {
        id:        "deck_default_solar",
        name:      "Starter Solar Bloom",
        heroId:    HERO_SOLAR_FLARE.id,
        cardIds:   DECK_PLANTS_40.map((c) => c.id),
        createdAt: now,
        updatedAt: now,
      },
      {
        id:        "deck_default_brainz",
        name:      "Starter Psionic Horde",
        heroId:    HERO_SUPER_BRAINZ.id,
        cardIds:   DECK_ZOMBIES_40.map((c) => c.id),
        createdAt: now,
        updatedAt: now,
      },
    ];

    let changed = false;
    for (const def of defaults) {
      if (!existing.some((d) => d.id === def.id)) {
        existing.push(def);
        changed = true;
      }
    }
    if (changed) this.persist(existing);
  }

  // ── Private ────────────────────────────────────────────────────

  private static persist(decks: SavedDeck[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  }
}

// ─────────────────────────────────────────────────────────────
//  Card Catalog — all collectible (non-superpower) cards
// ─────────────────────────────────────────────────────────────

export function buildCardCatalog(allCards: CardDefinition[]): CardDefinition[] {
  return allCards.filter((c) => c.type !== CardType.HeroAbility);
}

// ─────────────────────────────────────────────────────────────
//  Hydrate IDs → CardDefinition[]
// ─────────────────────────────────────────────────────────────

export function hydrateCardIds(
  ids: string[],
  catalog: CardDefinition[],
): CardDefinition[] {
  const map = new Map(catalog.map((c) => [c.id, c]));
  return ids
    .map((id) => {
      const card = map.get(id);
      return card ? createCardInstance(card) : null;
    })
    .filter((c): c is CardDefinition => !!c);
}
