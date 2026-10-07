// ============================================================
//  cardInstance.ts — Decoupled Card Instance Factory
//
//  Prevents memory reference leaks and keyword/stat bleeding
//  between player and bot decks, hands, graveyard, and board.
// ============================================================

import { CardDefinition, Keyword } from "./types";

export interface CardInstance extends CardDefinition {
  instanceId: string;
  currentAttack: number;
  currentHp: number;
  currentCost: number;
  keywords: Keyword[];
  buffs?: unknown[];
}

/**
 * Creates a fresh, deeply decoupled CardInstance from a CardDefinition.
 * Ensures that modifying keywords or stats on an instance in hand, deck, or field
 * never pollutes the master registry or another card instance.
 */
export function createCardInstance(definition: CardDefinition): CardInstance {
  if (!definition || typeof definition !== "object") {
    return {
      id: "DUMMY_CARD",
      name: "Tactical Unit",
      type: "Unit" as any,
      cost: 0,
      attack: 1,
      hp: 1,
      tribes: ["Neutral"],
      tribe: "Neutral",
      keywords: [],
      text: "",
      instanceId: `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      currentAttack: 1,
      currentHp: 1,
      currentCost: 0,
      buffs: [],
    };
  }

  // Deep clone using structuredClone with fallback
  let cloned: CardDefinition;
  try {
    cloned = typeof structuredClone === "function"
      ? structuredClone(definition)
      : JSON.parse(JSON.stringify(definition));
  } catch {
    cloned = { ...definition };
  }

  // Explicitly decouple keywords and tribes arrays
  const decoupledKeywords: Keyword[] = Array.isArray(definition.keywords)
    ? [...definition.keywords]
    : [];
  const decoupledTribes = Array.isArray(definition.tribes)
    ? [...definition.tribes]
    : (definition.tribe ? [definition.tribe] : ["เป็นกลาง"]);

  return {
    ...cloned,
    instanceId: `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    currentAttack: definition.attack ?? 0,
    currentHp: definition.hp ?? 0,
    currentCost: definition.cost ?? 0,
    tribes: decoupledTribes,
    tribe: decoupledTribes[0] || definition.tribe || "เป็นกลาง",
    keywords: decoupledKeywords,
    buffs: [],
  };
}

/**
 * Clones an array of cards into fresh, decoupled instances.
 */
export function cloneCards(cards: readonly CardDefinition[]): CardInstance[] {
  return cards.map((c) => createCardInstance(c));
}
