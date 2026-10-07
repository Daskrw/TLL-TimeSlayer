// ============================================================
//  DragController.ts — Raycaster-based Drag & Drop with
//  3D Curved Targeting Arrow, Frontline/Support sub-slots,
//  Environment & Equipment targeting, and Big Card Preview.
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { CardDefinition, CardType, Keyword, PlayerId, UnitInstance } from "../src/types";
import { HandController, HandSlot } from "./HandController";
import { BoardResult, SlotMesh } from "./Board";
import { UnitMeshEntry } from "./CombatAnimator";
import { HeroDisplayData } from "./HeroDisplay";
import { TargetingArrow } from "./TargetingArrow";
import { showBigCardPreview } from "./CardMesh";
import { Graveyard3D } from "./Graveyard3D";
import {
  ANIM_CARD_PLAY,
  HAND_Y, HAND_Z,
  LANE_X, LANE_COUNT, LANE_WIDTH,
} from "./visualConstants";

const Z_DRAGGING = 1.25;

export interface DropResult {
  cardId:            string;
  laneIndex:         number;
  slotType?:         "frontline" | "support" | undefined;
  targetInstanceId?: string | undefined;
  targetHeroId?:     PlayerId | undefined;
}

interface TargetCandidate {
  id: string;
  type: "unit" | "hero";
  isPlayer: boolean;
  laneIndex?: number;
  position: THREE.Vector3;
}

export function isTargetedCard(card: CardDefinition): boolean {
  // Explicitly non-targeted cards never use targeting arrow
  if (
    card.targetType === "NONE" ||
    card.targetType === "ANY_FIELD_POSITION" ||
    card.targetType === "ALL_ENEMIES"
  ) {
    return false;
  }
  if (card.type === CardType.Equipment) return true;
  if (
    card.targetType === "FRIENDLY_UNIT" ||
    card.targetType === "ENEMY_UNIT" ||
    card.targetType === "SINGLE_UNIT" ||
    card.targetType === "ENEMY_HERO" ||
    card.targetType === "ANY_HERO"
  ) {
    return true;
  }
  if (
    (card.type === CardType.Spell || card.type === CardType.HeroAbility) &&
    card.spellEffect?.target &&
    card.spellEffect.target !== "ALL_UNITS" &&
    card.spellEffect.target !== "LANE"
  ) {
    return true;
  }
  return false;
}

export function isNonTargetedSpell(card: CardDefinition): boolean {
  if (card.type !== CardType.Spell && card.type !== CardType.HeroAbility) {
    return false;
  }
  return !isTargetedCard(card);
}

export class DragController {
  private raycaster   = new THREE.Raycaster();
  private mouse       = new THREE.Vector2();
  private dragPlane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Z_DRAGGING);
  private boardPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06);
  private planeTarget = new THREE.Vector3();

  private camera:     THREE.PerspectiveCamera;
  private renderer:   THREE.WebGLRenderer;
  private hand:       HandController;
  private board:      BoardResult;
  private unitMap:    Map<string, UnitMeshEntry>;
  private playerHero: HeroDisplayData | null = null;
  private oppHero:    HeroDisplayData | null = null;
  private myRole:     "p1" | "p2" = "p1";

  // Targeting arrow
  private targetingArrow: TargetingArrow;
  private isTargeting = false;
  private targetedCandidate: TargetCandidate | null = null;

  private activeSlot:     HandSlot | null = null;
  private dragGroup:      THREE.Group | null = null;
  private hoveredSlot:    HandSlot | null = null;
  private hoveredFieldEntry: UnitMeshEntry | null = null;
  private targetSlotMesh: SlotMesh | null = null;
  private targetUnitId:   string | null = null;
  private enabled     = true;
  private onDropCb:   ((result: DropResult) => Promise<boolean> | boolean) | null = null;
  private onHoverCb:  ((card: CardDefinition | null, screenX: number, screenY: number) => void) | null = null;
  private unitInstanceProvider: ((instanceId: string) => UnitInstance | undefined) | null = null;
  private envMeshesProvider: (() => THREE.Object3D[]) | null = null;
  private graveyard3D: Graveyard3D | null = null;

  constructor(
    camera:     THREE.PerspectiveCamera,
    renderer:   THREE.WebGLRenderer,
    hand:       HandController,
    board:      BoardResult,
    scene:      THREE.Scene,
    unitMap:    Map<string, UnitMeshEntry> = new Map(),
  ) {
    this.camera   = camera;
    this.renderer = renderer;
    this.hand     = hand;
    this.board    = board;
    this.unitMap  = unitMap;

    this.targetingArrow = new TargetingArrow(scene);
    this.bindEvents();
  }

  public setGraveyard3D(graveyard: Graveyard3D): void {
    this.graveyard3D = graveyard;
  }

  public setUnitMap(map: Map<string, UnitMeshEntry>): void {
    this.unitMap = map;
  }

  public setHeroes(playerHero: HeroDisplayData, oppHero: HeroDisplayData): void {
    this.playerHero = playerHero;
    this.oppHero    = oppHero;
  }

  public setRole(role: "p1" | "p2" | "P1" | "P2"): void {
    this.myRole = (role === "p2" || role === "P2") ? "p2" : "p1";
  }

  public setEnabled(v: boolean): void {
    this.enabled = v;
  }

  public onDrop(cb: (result: DropResult) => Promise<boolean> | boolean): void {
    this.onDropCb = cb;
  }

  public setUnitInstanceProvider(provider: (instanceId: string) => UnitInstance | undefined): void {
    this.unitInstanceProvider = provider;
  }

  public setEnvironmentMeshesProvider(provider: () => THREE.Object3D[]): void {
    this.envMeshesProvider = provider;
  }

  public onCardHover(cb: (card: CardDefinition | null, x: number, y: number) => void): void {
    this.onHoverCb = cb;
  }

  public clearHover(): void {
    if (this.hoveredSlot) {
      this.hand.setHovered(this.hoveredSlot, false);
      this.hoveredSlot = null;
    }
    if (this.hoveredFieldEntry) {
      this.setFieldUnitHovered(this.hoveredFieldEntry, false);
      this.hoveredFieldEntry = null;
    }
    showBigCardPreview(null);
    this.onHoverCb?.(null, 0, 0);
  }

  public dispose(): void {
    const el = this.renderer.domElement;
    el.removeEventListener("mousemove",  this.handleMouseMove);
    el.removeEventListener("mousedown",  this.handleMouseDown);
    el.removeEventListener("mouseup",    this.handleMouseUp);
    el.removeEventListener("mouseleave", this.handleMouseLeave);
  }

  // ── Event bindings ───────────────────────────────────────────

  private bindEvents(): void {
    const el = this.renderer.domElement;
    el.addEventListener("mousemove",  this.handleMouseMove);
    el.addEventListener("mousedown",  this.handleMouseDown);
    el.addEventListener("mouseup",    this.handleMouseUp);
    el.addEventListener("mouseleave", this.handleMouseLeave);
  }

  private handleMouseLeave = (e: MouseEvent): void => {
    this.handleMouseUp(e);
    this.clearHover();
  };

  private updateMouse(e: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  }

  // ── Mouse events ─────────────────────────────────────────────

  private handleMouseMove = (e: MouseEvent): void => {
    this.updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.isTargeting && this.activeSlot) {
      // 1. In targeting arrow mode: calculate curve and snap to valid candidate
      this.raycaster.ray.intersectPlane(this.boardPlane, this.planeTarget);
      if (this.planeTarget) {
        this.updateTargetingCandidates();
      }
    } else if (this.activeSlot && this.dragGroup) {
      // 2. In normal card drag mode: move card mesh along drag plane
      this.raycaster.ray.intersectPlane(this.dragPlane, this.planeTarget);
      if (this.planeTarget) {
        this.dragGroup.position.set(this.planeTarget.x, Z_DRAGGING, this.planeTarget.z);
        this.dragGroup.rotation.x = -0.08;
      }
      this.updateSlotHighlight();
    } else {
      this.graveyard3D?.onPointerMove(this.raycaster);
      this.checkAllHovers(e.clientX, e.clientY);
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.enabled || e.button !== 0) return;
    this.updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.hoveredFieldEntry) {
      this.setFieldUnitHovered(this.hoveredFieldEntry, false);
      this.hoveredFieldEntry = null;
    }

    // 0. Check Graveyard click
    if (this.graveyard3D?.onPointerDown(this.raycaster)) {
      return;
    }

    // Test against hand cards
    const groups = this.hand.getSlotGroups();
    const objects = groups.flatMap((g) => [...g.children]);
    const hits = this.raycaster.intersectObjects(objects, true);

    if (hits.length === 0) return;

    const hitObj = hits[0].object;
    const slot   = this.hand.findSlotByObject(hitObj.parent ?? hitObj);
    if (!slot) return;

    const card = slot.cardData.card;

    if (isTargetedCard(card)) {
      // ── Start Targeted Spell / Ability Arrow Mode ───────────
      this.isTargeting = true;
      this.activeSlot = slot;
      this.dragGroup = null;

      // Card elevates and glows poised in hand position
      const pos = slot.cardData.group.position;
      gsap.to(pos, { duration: 0.22, y: HAND_Y + 0.85, z: HAND_Z - 0.55, ease: "power2.out" });
      gsap.to(slot.cardData.group.scale, { duration: 0.22, x: 1.25, y: 1.25, z: 1.25, ease: "power2.out" });

      const arrowStart = new THREE.Vector3(pos.x, pos.y + 0.3, pos.z - 0.2);
      this.targetingArrow.activate(arrowStart, card);

      // Initial raycast
      this.raycaster.ray.intersectPlane(this.boardPlane, this.planeTarget);
      if (this.planeTarget) {
        this.targetingArrow.update(this.planeTarget, null, false);
      }
    } else {
      // ── Start Normal Unit / Environment Slot Drag ────────────
      this.isTargeting = false;
      this.activeSlot = slot;
      this.dragGroup  = this.hand.startDrag(slot);

      this.raycaster.ray.intersectPlane(this.dragPlane, this.planeTarget);
      this.dragGroup.position.set(this.planeTarget.x, Z_DRAGGING, this.planeTarget.z);
      this.dragGroup.rotation.x = -0.08;

      gsap.to(this.dragGroup.scale, { duration: 0.15, x: 1.12, y: 1.12, z: 1.12, ease: "power2.out" });
      this.showAllSlots(slot.cardData.card);
    }
  };

  private handleMouseUp = async (_e: MouseEvent): Promise<void> => {
    if (this.isTargeting) {
      const slot = this.activeSlot;
      const candidate = this.targetedCandidate;

      if (slot && candidate) {
        // ── Attempt Cast on Valid Target ───────────────────────
        const card = slot.cardData.card;
        let targetHeroId: PlayerId | undefined = undefined;
        if (candidate.type === "hero") {
          const isSelf = candidate.isPlayer;
          const isP1 = this.myRole === "p1";
          targetHeroId = (isSelf === isP1) ? PlayerId.Player : PlayerId.Opponent;
        }

        const resPromise = this.onDropCb?.({
          cardId: card.id,
          laneIndex: candidate.laneIndex ?? 0,
          targetInstanceId: candidate.type === "unit" ? candidate.id : undefined,
          targetHeroId,
        });

        const success = resPromise instanceof Promise ? await resPromise : Boolean(resPromise);

        if (success) {
          this.targetingArrow.hide();
          this.hand.confirmPlay(slot);
        } else {
          this.targetingArrow.retract();
          this.hand.cancelDrag(slot);
        }
      } else if (slot) {
        // ── Retract Smoothly on Invalid Ground ────────────────
        this.targetingArrow.retract();
        this.hand.cancelDrag(slot);
      }

      this.isTargeting = false;
      this.targetedCandidate = null;
      this.activeSlot = null;
      this.dragGroup = null;
      showBigCardPreview(null);
      return;
    }

    // ── Normal Card Drag Drop / Cancel ────────────────────────
    if (!this.activeSlot || !this.dragGroup) return;

    const slot = this.activeSlot;
    const card = slot.cardData.card;

    // ── Flexible Board Drop for Non-Targeted Spells ──────────
    if (isNonTargetedSpell(card)) {
      this.raycaster.ray.intersectPlane(this.boardPlane, this.planeTarget);
      const isOverBoard =
        this.planeTarget &&
        Math.abs(this.planeTarget.x) < 7.5 &&
        this.planeTarget.z < (HAND_Z - 1.2) &&
        this.planeTarget.z > -8.5;

      if (isOverBoard) {
        let lane = 1;
        let minD = Infinity;
        for (let i = 0; i < LANE_X.length; i++) {
          const d = Math.abs(this.planeTarget.x - LANE_X[i]);
          if (d < minD) {
            minD = d;
            lane = i;
          }
        }

        const resPromise = this.onDropCb?.({
          cardId: card.id,
          laneIndex: lane,
        });

        const success = resPromise instanceof Promise ? await resPromise : Boolean(resPromise);

        if (success) {
          await this.animateSpellDissolve(this.dragGroup, this.planeTarget);
          this.hand.confirmPlay(slot);
        } else {
          this.hand.cancelDrag(slot);
        }
      } else {
        this.hand.cancelDrag(slot);
      }

      this.hideAllSlots();
      this.activeSlot     = null;
      this.dragGroup      = null;
      this.targetSlotMesh = null;
      this.targetUnitId   = null;
      showBigCardPreview(null);
      return;
    }

    if (this.targetSlotMesh || this.targetUnitId) {
      const lane = this.targetSlotMesh ? this.targetSlotMesh.laneIndex : 1;
      const targetSlot = this.targetSlotMesh;
      const slotType = targetSlot && targetSlot.slotType !== "environment" ? targetSlot.slotType : undefined;

      const resPromise = this.onDropCb?.({
        cardId: card.id,
        laneIndex: lane,
        ...(slotType ? { slotType } : {}),
        ...(this.targetUnitId ? { targetInstanceId: this.targetUnitId } : {}),
      });

      const success = resPromise instanceof Promise ? await resPromise : Boolean(resPromise);

      if (success) {
        const dest = targetSlot
          ? new THREE.Vector3(targetSlot.worldX, 0.08, targetSlot.worldZ)
          : new THREE.Vector3(0, 0.1, 0);

        gsap.timeline()
          .to(this.dragGroup.position, {
            duration: ANIM_CARD_PLAY,
            x: dest.x, y: dest.y + 0.5, z: dest.z,
            ease: "power3.out",
          })
          .to(this.dragGroup.position, {
            duration: 0.12,
            y: dest.y,
            ease: "power2.in",
          })
          .to(this.dragGroup.rotation, {
            duration: ANIM_CARD_PLAY,
            x: -Math.PI / 2 + 0.05,
            y: 0,
            z: 0,
            ease: "power2.out",
          }, "<");

        gsap.delayedCall(ANIM_CARD_PLAY + 0.12, () => {
          this.hand.confirmPlay(slot);
        });
      } else {
        // Failed drop (insufficient mana or rule rejection): smoothly snap card back to hand
        this.hand.cancelDrag(slot);
      }
    } else {
      // Invalid drop target: smoothly snap card back to hand
      this.hand.cancelDrag(this.activeSlot);
    }

    this.hideAllSlots();
    this.activeSlot     = null;
    this.dragGroup      = null;
    this.targetSlotMesh = null;
    this.targetUnitId   = null;
    showBigCardPreview(null);
  };

  private animateSpellDissolve(dragGroup: THREE.Group, hitPos: THREE.Vector3): Promise<void> {
    return new Promise((resolve) => {
      const targetPos = new THREE.Vector3(hitPos.x, 2.2, hitPos.z);

      gsap.to(dragGroup.position, {
        duration: 0.32,
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        ease: "power2.out",
      });

      gsap.to(dragGroup.scale, {
        duration: 0.28,
        x: 1.35,
        y: 1.35,
        z: 1.35,
        ease: "back.out(1.5)",
      });

      dragGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => {
              m.transparent = true;
              gsap.to(m, { duration: 0.35, delay: 0.15, opacity: 0, ease: "power2.in" });
              if ("emissive" in m) {
                gsap.to(m.emissive, { duration: 0.2, r: 1.0, g: 0.85, b: 0.3 });
              }
            });
          } else if (child.material) {
            child.material.transparent = true;
            gsap.to(child.material, { duration: 0.35, delay: 0.15, opacity: 0, ease: "power2.in" });
            if ("emissive" in child.material) {
              gsap.to(child.material.emissive, { duration: 0.2, r: 1.0, g: 0.85, b: 0.3 });
            }
          }
        }
      });

      gsap.to(dragGroup.rotation, {
        duration: 0.45,
        y: Math.PI * 0.75,
        x: -0.2,
        ease: "power2.in",
        onComplete: () => resolve(),
      });
    });
  }

  // ── Targeting Candidates & Snapping ─────────────────────────

  private updateTargetingCandidates(): void {
    if (!this.activeSlot) return;
    const card = this.activeSlot.cardData.card;
    const candidates: TargetCandidate[] = [];

    // 1. Collect Unit instances
    for (const entry of this.unitMap.values()) {
      candidates.push({
        id: entry.instanceId,
        type: "unit",
        isPlayer: entry.isPlayer,
        laneIndex: entry.laneIndex,
        position: entry.group.position.clone(),
      });
    }

    // 2. Collect Hero targets
    if (this.oppHero) {
      candidates.push({
        id: "HERO_OPPONENT",
        type: "hero",
        isPlayer: false,
        laneIndex: 0,
        position: this.oppHero.group.position.clone(),
      });
    }
    if (this.playerHero) {
      candidates.push({
        id: "HERO_PLAYER",
        type: "hero",
        isPlayer: true,
        laneIndex: 0,
        position: this.playerHero.group.position.clone(),
      });
    }

    // 3. Find closest valid candidate under cursor within snap radius
    let bestCandidate: TargetCandidate | null = null;
    let minDist = 1.75; // snap threshold in world units

    for (const c of candidates) {
      if (!this.isValidTarget(card, c)) continue;
      const snapRadius = c.type === "hero" ? 2.4 : 1.75;
      const d = c.position.distanceTo(this.planeTarget);
      if (d < snapRadius && (bestCandidate === null || d < minDist)) {
        minDist = d;
        bestCandidate = c;
      }
    }

    this.targetedCandidate = bestCandidate;

    if (bestCandidate) {
      this.targetingArrow.update(this.planeTarget, bestCandidate.position, true);
    } else {
      this.targetingArrow.update(this.planeTarget, null, false);
    }
  }

  private isValidTarget(card: CardDefinition, candidate: TargetCandidate): boolean {
    if (candidate.type === "unit") {
      if (card.type === CardType.Equipment) return candidate.isPlayer;
      if (card.targetType === "FRIENDLY_UNIT") return candidate.isPlayer;
      if (card.targetType === "ENEMY_UNIT") return !candidate.isPlayer;
      if (card.targetType === "SINGLE_UNIT") return true;

      if (card.spellEffect) {
        const eff = card.spellEffect;
        if (eff.buffAttack || eff.buffHp) return candidate.isPlayer;
        if (eff.damage) return !candidate.isPlayer;
        if (eff.target === "UNIT" || eff.target === "ANY") return true;
      }
      return true;
    } else if (candidate.type === "hero") {
      if (card.type === CardType.Equipment) return false;
      if (card.targetType === "ENEMY_HERO") return !candidate.isPlayer;
      if (card.targetType === "ANY_HERO") return true;

      if (card.spellEffect) {
        const eff = card.spellEffect;
        if (eff.damage && !candidate.isPlayer) return true;
        if (eff.heal && candidate.isPlayer) return true;
        if (eff.target === "HERO" || eff.target === "ANY") {
          return eff.damage ? !candidate.isPlayer : true;
        }
      }
    }
    return false;
  }

  // ── Slot Highlighting & Validation (Units / Environments) ──

  private updateSlotHighlight(): void {
    if (!this.activeSlot || !this.dragGroup) return;
    const card = this.activeSlot.cardData.card;

    if (isNonTargetedSpell(card)) {
      this.raycaster.ray.intersectPlane(this.boardPlane, this.planeTarget);
      const isOverBoard =
        this.planeTarget &&
        Math.abs(this.planeTarget.x) < 7.5 &&
        this.planeTarget.z < (HAND_Z - 1.2) &&
        this.planeTarget.z > -8.5;

      for (const s of this.board.slotMeshes) {
        this.board.setSlotHighlight(s.laneIndex, true, isOverBoard ? "valid" : "off", s.slotType);
      }
      return;
    }

    if (card.type === CardType.Environment) {
      // 1. Raycast specifically against central environment collider meshes
      const envColliders = this.board.slotMeshes
        .filter((s) => s.slotType === "environment")
        .map((s) => s.marker);
      const hits = this.raycaster.intersectObjects(envColliders, true);

      let targetSlot: SlotMesh | null = null;
      if (hits.length > 0) {
        let hitObj: THREE.Object3D | null = hits[0].object;
        while (hitObj) {
          if (hitObj.userData && hitObj.userData.isEnvironmentSlot) {
            const lIdx = hitObj.userData.laneIndex;
            targetSlot = this.board.slotMeshes.find((s) => s.slotType === "environment" && s.laneIndex === lIdx) ?? null;
            break;
          }
          hitObj = hitObj.parent;
        }
      }

      // 2. Also check which lane floor the cursor is over
      this.raycaster.ray.intersectPlane(this.boardPlane, this.planeTarget);
      let hoveredLane = -1;
      if (this.planeTarget) {
        let minD = 999;
        for (let i = 0; i < LANE_X.length; i++) {
          const d = Math.abs(this.planeTarget.x - LANE_X[i]);
          if (d < (LANE_WIDTH * 0.55) && d < minD) {
            minD = d;
            hoveredLane = i;
          }
        }
      }

      const activeLane = targetSlot ? targetSlot.laneIndex : (hoveredLane === 1 || hoveredLane === 2 ? hoveredLane : -1);

      // 3. Highlight lane floors: Lane 1 and 2 valid glow, Lane 0 and 3 invalid glow
      for (let i = 0; i < LANE_COUNT; i++) {
        if (i === activeLane && (i === 1 || i === 2)) {
          this.board.setLaneFloorHighlight(i, "valid");
        } else if (i === hoveredLane && (i === 0 || i === 3)) {
          this.board.setLaneFloorHighlight(i, "invalid");
        } else {
          this.board.setLaneFloorHighlight(i, "off");
        }
      }

      if (activeLane === 1 || activeLane === 2) {
        const slot = this.board.slotMeshes.find((s) => s.slotType === "environment" && s.laneIndex === activeLane);
        this.targetSlotMesh = slot ?? null;
        for (const s of this.board.slotMeshes) {
          if (s.slotType === "environment") {
            this.board.setSlotHighlight(s.laneIndex, true, s.laneIndex === activeLane ? "valid" : "off", "environment");
          } else {
            this.board.setSlotHighlight(s.laneIndex, s.isPlayer, "off", s.slotType);
          }
        }
      } else {
        this.targetSlotMesh = null;
        for (const s of this.board.slotMeshes) {
          this.board.setSlotHighlight(s.laneIndex, s.isPlayer, "off", s.slotType);
        }
      }
      return;
    }

    const dx = this.dragGroup.position.x;
    const dz = this.dragGroup.position.z;

    let bestSlot: SlotMesh | null = null;
    let minDist = 999;

    for (const slot of this.board.slotMeshes) {
      if (!slot.isPlayer || slot.slotType === "environment") continue;

      const xDist = Math.abs(slot.worldX - dx);
      const zDist = Math.abs(slot.worldZ - dz);
      const totalDist = xDist + zDist;

      if (xDist < 1.6 && zDist < 1.8 && totalDist < minDist) {
        minDist = totalDist;
        bestSlot = slot;
      }
    }

    // Reset highlights
    for (const s of this.board.slotMeshes) {
      if (s === bestSlot) continue;
      this.board.setSlotHighlight(s.laneIndex, true, "off", s.slotType);
    }

    if (bestSlot) {
      const valid = this.isDropValid(card, bestSlot);
      this.board.setSlotHighlight(bestSlot.laneIndex, true, valid ? "valid" : "invalid", bestSlot.slotType);
      this.targetSlotMesh = valid ? bestSlot : null;
    } else {
      this.targetSlotMesh = null;
    }
  }

  private isDropValid(card: CardDefinition, slot: SlotMesh): boolean {
    if (card.type === CardType.Environment) {
      return slot.slotType === "environment" && (slot.laneIndex === 1 || slot.laneIndex === 2);
    }

    if (card.type !== CardType.Unit) {
      return false;
    }

    if (slot.slotType === "environment") {
      return false;
    }

    // Lane type requirements
    if (slot.laneIndex === 0 && !card.keywords.includes(Keyword.Flying)) {
      return false;
    }
    if (slot.laneIndex === 3 && !card.keywords.includes(Keyword.Amphibious)) {
      return false;
    }

    // Sub-slot logic:
    // Units with 'Support' keyword can be placed directly into SupportSlot or FrontlineSlot.
    // Regular units can ONLY be placed into the FrontlineSlot.
    if (slot.slotType === "support") {
      return card.keywords.includes(Keyword.Support);
    }

    return true;
  }

  private showAllSlots(card: CardDefinition): void {
    if (isNonTargetedSpell(card)) {
      for (const slot of this.board.slotMeshes) {
        this.board.setSlotHighlight(slot.laneIndex, true, "valid", slot.slotType);
      }
      return;
    }

    if (card.type === CardType.Environment) {
      for (const slot of this.board.slotMeshes) {
        if (slot.slotType === "environment") {
          const valid = this.isDropValid(card, slot);
          this.board.setSlotHighlight(slot.laneIndex, true, valid ? "valid" : "invalid", "environment");
        }
      }
      this.board.setLaneFloorHighlight(1, "valid");
      this.board.setLaneFloorHighlight(2, "valid");
      return;
    }

    for (const slot of this.board.slotMeshes) {
      if (!slot.isPlayer || slot.slotType === "environment") continue;
      const valid = this.isDropValid(card, slot);
      this.board.setSlotHighlight(slot.laneIndex, true, valid ? "valid" : "invalid", slot.slotType);
    }
  }

  private hideAllSlots(): void {
    for (const slot of this.board.slotMeshes) {
      this.board.setSlotHighlight(slot.laneIndex, slot.isPlayer, "off", slot.slotType);
    }
    for (let i = 0; i < LANE_COUNT; i++) {
      this.board.setLaneFloorHighlight(i, "off");
    }
  }

  // ── Card Hover Detection (Hand & Board) ───────────────────────

  private checkAllHovers(screenX: number, screenY: number): void {
    if (this.activeSlot || this.isTargeting) return;

    // 1. Check hand cards first
    const handGroups = this.hand.getSlotGroups();
    const handObjects = handGroups.flatMap((g) => [...g.children]);
    const handHits = this.raycaster.intersectObjects(handObjects, true);

    if (handHits.length > 0) {
      // Unhover field unit if cursor transitioned to a hand card
      if (this.hoveredFieldEntry) {
        this.setFieldUnitHovered(this.hoveredFieldEntry, false);
        this.hoveredFieldEntry = null;
      }

      const hitObj = handHits[0].object;
      const slot = this.hand.findSlotByObject(hitObj.parent ?? hitObj);

      if (this.hoveredSlot && this.hoveredSlot !== slot) {
        this.hand.setHovered(this.hoveredSlot, false);
      }
      if (slot) {
        this.hand.setHovered(slot, true);
        this.hoveredSlot = slot;
        showBigCardPreview(slot.cardData.card);
        this.onHoverCb?.(slot.cardData.card, screenX, screenY);
        return;
      }
    } else if (this.hoveredSlot) {
      this.hand.setHovered(this.hoveredSlot, false);
      this.hoveredSlot = null;
    }

    // 2. Check units on the 3D board (both Player & Opponent units)
    if (this.unitMap.size > 0) {
      const unitGroups: THREE.Object3D[] = [];
      for (const entry of this.unitMap.values()) {
        unitGroups.push(entry.group);
      }

      const unitHits = this.raycaster.intersectObjects(unitGroups, true);
      if (unitHits.length > 0) {
        const hit = unitHits[0];
        let current: THREE.Object3D | null = hit.object;
        let instanceId: string | undefined = undefined;

        // Efficient O(1) identification from userData hierarchy
        while (current) {
          if (current.userData && current.userData.isFieldUnit && current.userData.instanceId) {
            instanceId = current.userData.instanceId;
            break;
          }
          current = current.parent;
        }

        if (instanceId && this.unitMap.has(instanceId)) {
          const entry = this.unitMap.get(instanceId)!;

          // Subtle elevation / scale feedback on the field unit itself
          if (this.hoveredFieldEntry !== entry) {
            if (this.hoveredFieldEntry) {
              this.setFieldUnitHovered(this.hoveredFieldEntry, false);
            }
            this.hoveredFieldEntry = entry;
            this.setFieldUnitHovered(entry, true);
          }

          // Fetch real-time live UnitInstance state from GameEngine
          const liveUnit = this.unitInstanceProvider?.(entry.instanceId);
          if (liveUnit) {
            showBigCardPreview({ card: entry.meshData.card, unit: liveUnit });
          } else {
            showBigCardPreview(entry.meshData.card);
          }
          this.onHoverCb?.(entry.meshData.card, screenX, screenY);
          return;
        }
      }
    }

    // Reset field unit hover if cursor moved away from any field unit
    if (this.hoveredFieldEntry) {
      this.setFieldUnitHovered(this.hoveredFieldEntry, false);
      this.hoveredFieldEntry = null;
    }

    // 3. Check active Environment meshes on the board (floor planes & central emblems)
    if (this.envMeshesProvider) {
      const envMeshes = this.envMeshesProvider();
      if (envMeshes.length > 0) {
        const envHits = this.raycaster.intersectObjects(envMeshes, true);
        if (envHits.length > 0) {
          let current: THREE.Object3D | null = envHits[0].object;
          let envCard: CardDefinition | null = null;
          while (current) {
            if (current.userData && current.userData.envCard) {
              envCard = current.userData.envCard;
              break;
            }
            current = current.parent;
          }

          if (envCard) {
            showBigCardPreview(envCard);
            this.onHoverCb?.(envCard, screenX, screenY);
            return;
          }
        }
      }
    }

    // 4. No card hovered (in hand, on field, or environment) — reset / hide preview panel
    showBigCardPreview(null);
    this.onHoverCb?.(null, 0, 0);
  }

  private setFieldUnitHovered(entry: UnitMeshEntry, hovered: boolean): void {
    const isFront = entry.slotType === "frontline";
    const baseElev = entry.laneIndex === 0 ? 0.28 : 0.06;
    const defaultElev = isFront ? baseElev : baseElev - 0.028;
    const targetScale = isFront ? 1.0 : 0.94;

    if (hovered) {
      gsap.to(entry.group.position, {
        duration: 0.16,
        y: defaultElev + 0.1,
        ease: "power2.out",
        overwrite: "auto",
      });
      gsap.to(entry.group.scale, {
        duration: 0.16,
        x: targetScale * 1.06,
        y: targetScale * 1.06,
        z: targetScale * 1.06,
        ease: "power2.out",
        overwrite: "auto",
      });
    } else {
      gsap.to(entry.group.position, {
        duration: 0.16,
        y: defaultElev,
        ease: "power2.out",
        overwrite: "auto",
      });
      gsap.to(entry.group.scale, {
        duration: 0.16,
        x: targetScale,
        y: targetScale,
        z: targetScale,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
  }

  public tick(dt: number): void {
    this.targetingArrow.tick(dt);
  }
}
