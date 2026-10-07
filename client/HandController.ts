// ============================================================
//  HandController.ts — Player hand: curved layout + hover
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { CardDefinition } from "../src/types";
import { createCardMesh, CardMeshData } from "./CardMesh";
import {
  CARD_W, CARD_H, CARD_HOVER_LIFT, CARD_HOVER_SCALE,
  HAND_Z, HAND_Y, ANIM_HAND_RETURN,
} from "./visualConstants";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface HandSlot {
  cardData:  CardMeshData;
  basePos:   THREE.Vector3;
  baseRotY:  number;
  baseRotX:  number;
  hovered:   boolean;
  dragging:  boolean;
  index:     number;   // position in hand array
}

// ─────────────────────────────────────────────────────────────
//  HandController
// ─────────────────────────────────────────────────────────────

export class HandController {
  private scene:   THREE.Scene;
  private slots:   HandSlot[] = [];
  public  group:   THREE.Group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);
  }

  // ── Public API ──────────────────────────────────────────────

  /** Replace the entire hand with a new list of card definitions. */
  setHand(cards: CardDefinition[]): void {
    this.clear();
    cards.forEach((card, i) => this.addCard(card, i, cards.length));
  }

  /** Add one card and re-layout the hand. */
  addCard(card: CardDefinition, index: number, total: number): void {
    const data = createCardMesh(card);
    const slot: HandSlot = {
      cardData: data,
      basePos:  new THREE.Vector3(),
      baseRotY: 0,
      baseRotX: -0.75,
      hovered:  false,
      dragging: false,
      index,
    };
    this.group.add(data.group);
    this.slots.push(slot);
    this.layoutSlot(slot, index, total);
  }

  /** Remove a card by its definition id and re-layout remaining. */
  removeCardById(cardId: string): void {
    const idx = this.slots.findIndex(s => s.cardData.card.id === cardId);
    if (idx === -1) return;
    const [slot] = this.slots.splice(idx, 1);
    this.group.remove(slot.cardData.group);
    slot.cardData.bodyMesh.geometry.dispose();
    this.relayout();
  }

  /** Returns all slot groups (for raycasting). */
  getSlotGroups(): THREE.Group[] {
    return this.slots.map(s => s.cardData.group);
  }

  /** Find the slot for a given THREE.Object3D (from raycaster). */
  findSlotByObject(obj: THREE.Object3D): HandSlot | undefined {
    for (const slot of this.slots) {
      if (slot.cardData.group === obj || slot.cardData.group.children.includes(obj as THREE.Mesh)) {
        return slot;
      }
    }
    return undefined;
  }

  /** Elevate a card (hover state). */
  setHovered(slot: HandSlot, hovered: boolean): void {
    if (slot.hovered === hovered) return;
    slot.hovered = hovered;
    if (slot.dragging) return;

    const g = slot.cardData.group;
    const targetY = hovered ? slot.basePos.y + 0.75 : slot.basePos.y;
    const targetZ = hovered ? slot.basePos.z - 0.65 : slot.basePos.z;
    const targetS = hovered ? CARD_HOVER_SCALE : 1.0;
    const targetX = hovered ? -0.62 : slot.baseRotX;

    gsap.to(g.position, { duration: 0.22, y: targetY, z: targetZ, ease: "power2.out" });
    gsap.to(g.scale,    { duration: 0.22, x: targetS, y: targetS, z: targetS, ease: "power2.out" });
    gsap.to(g.rotation, { duration: 0.22, x: targetX, ease: "power2.out" });
  }

  /** Detach a card from hand for dragging (returns the group). */
  startDrag(slot: HandSlot): THREE.Group {
    slot.dragging = true;
    slot.hovered  = false;
    // Move to top of scene for clean dragging
    this.group.remove(slot.cardData.group);
    this.scene.add(slot.cardData.group);
    return slot.cardData.group;
  }

  /** Return a card from dragging back to its hand position. */
  cancelDrag(slot: HandSlot): void {
    slot.dragging = false;
    this.scene.remove(slot.cardData.group);
    this.group.add(slot.cardData.group);

    const g = slot.cardData.group;
    gsap.to(g.position, { duration: ANIM_HAND_RETURN, x: slot.basePos.x, y: slot.basePos.y, z: slot.basePos.z, ease: "back.out(1.4)" });
    gsap.to(g.scale,    { duration: ANIM_HAND_RETURN, x: 1, y: 1, z: 1, ease: "power2.out" });
    gsap.to(g.rotation, { duration: ANIM_HAND_RETURN, x: slot.baseRotX, y: slot.baseRotY, ease: "power2.out" });
  }

  /** Permanently remove the played card (it'll appear in lane). */
  confirmPlay(slot: HandSlot): void {
    const idx = this.slots.indexOf(slot);
    if (idx !== -1) this.slots.splice(idx, 1);
    this.scene.remove(slot.cardData.group);
    this.relayout();
  }

  private clear(): void {
    for (const s of this.slots) {
      this.group.remove(s.cardData.group);
    }
    this.slots = [];
  }

  private relayout(): void {
    const n = this.slots.length;
    this.slots.forEach((slot, i) => {
      slot.index = i;
      this.layoutSlot(slot, i, n);
    });
  }

  private layoutSlot(slot: HandSlot, index: number, total: number): void {
    const maxSpread  = Math.min(total * 1.6, 7.5);
    const step       = total > 1 ? maxSpread / (total - 1) : 0;
    const x          = total > 1 ? -maxSpread / 2 + index * step : 0;
    // Slight parabolic dip toward edges
    const curveDrop  = Math.pow(x / (maxSpread / 2 + 0.01), 2) * 0.18;
    const y          = HAND_Y - curveDrop;
    // Tilt cards slightly inward from edges
    const rotY       = -x * 0.028;
    const rotX       = -0.75;

    slot.basePos.set(x, y, HAND_Z);
    slot.baseRotY = rotY;
    slot.baseRotX = rotX;

    const g = slot.cardData.group;
    // Initial placement (no animation for first layout)
    g.position.set(x, y, HAND_Z);
    g.rotation.set(rotX, rotY, -x * 0.02);
  }
}
