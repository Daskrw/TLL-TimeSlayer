// ============================================================
//  OpponentHandController.ts — Opponent 3D face-down cards & HUD
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { createFaceDownCardMesh } from "./CardMesh";

const OPP_HAND_BASE_Y = 1.95;
const OPP_HAND_BASE_Z = -8.1;
const OPP_CARD_SCALE  = 0.65;
const OPP_CARD_ROTX   = 0.82;

export class OpponentHandController {
  private scene: THREE.Scene;
  public group: THREE.Group = new THREE.Group();

  private cardMeshes: THREE.Group[] = [];
  private currentCount = 0;

  // 3D floating badge sprite
  private badgeSprite: THREE.Sprite | null = null;
  private badgeCanvas: HTMLCanvasElement;
  private badgeCtx: CanvasRenderingContext2D;
  private badgeTex: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);

    // Initialize 3D badge canvas
    this.badgeCanvas = document.createElement("canvas");
    this.badgeCanvas.width = 256;
    this.badgeCanvas.height = 80;
    this.badgeCtx = this.badgeCanvas.getContext("2d")!;
    this.badgeTex = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTex.colorSpace = THREE.SRGBColorSpace;

    this.createBadgeSprite();
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Updates the enemy hand size with face-down cards and synchronizes
   * both the 3D meshes and floating count badge.
   */
  public setHandCount(count: number, animate = true): void {
    const clampedCount = Math.max(0, count);
    this.currentCount = clampedCount;

    // 1. Synchronize mesh count (add or remove meshes)
    while (this.cardMeshes.length < clampedCount) {
      this.spawnFaceDownCard(animate);
    }
    while (this.cardMeshes.length > clampedCount) {
      this.removeFaceDownCard(animate);
    }

    // 2. Re-layout remaining cards in a compact fan
    this.layoutCards(animate);

    // 3. Update 3D floating badge
    this.updateBadgeSprite();
  }

  public getHandCount(): number {
    return this.currentCount;
  }

  public clear(): void {
    for (const cardGroup of this.cardMeshes) {
      this.group.remove(cardGroup);
    }
    this.cardMeshes = [];
    this.currentCount = 0;
    this.updateBadgeSprite();
  }

  public dispose(): void {
    this.clear();
    if (this.badgeSprite) {
      this.group.remove(this.badgeSprite);
      this.badgeTex.dispose();
      this.badgeSprite.material.dispose();
      this.badgeSprite = null;
    }
    this.scene.remove(this.group);
  }

  // ── Card Management ──────────────────────────────────────────

  private spawnFaceDownCard(animate: boolean): void {
    const cardGroup = new THREE.Group();
    const mesh = createFaceDownCardMesh();
    cardGroup.add(mesh);

    if (animate) {
      // Spawn from off-screen top/deck and zoom in
      cardGroup.position.set(0, 3.5, -9.5);
      cardGroup.scale.set(0.1, 0.1, 0.1);
      cardGroup.rotation.set(OPP_CARD_ROTX, 0, 0);
    } else {
      cardGroup.scale.set(OPP_CARD_SCALE, OPP_CARD_SCALE, OPP_CARD_SCALE);
      cardGroup.rotation.set(OPP_CARD_ROTX, 0, 0);
    }

    this.group.add(cardGroup);
    this.cardMeshes.push(cardGroup);
  }

  private removeFaceDownCard(animate: boolean): void {
    const cardGroup = this.cardMeshes.pop();
    if (!cardGroup) return;

    if (animate) {
      gsap.to(cardGroup.position, {
        duration: 0.28,
        y: 2.8,
        z: -6.5,
        ease: "power2.in",
      });
      gsap.to(cardGroup.scale, {
        duration: 0.28,
        x: 0.1,
        y: 0.1,
        z: 0.1,
        ease: "power2.in",
        onComplete: () => {
          this.group.remove(cardGroup);
        },
      });
    } else {
      this.group.remove(cardGroup);
    }
  }

  private layoutCards(animate: boolean): void {
    const total = this.cardMeshes.length;
    if (total === 0) return;

    const maxSpread = Math.min(total * 0.75, 4.8);
    const step      = total > 1 ? maxSpread / (total - 1) : 0;

    this.cardMeshes.forEach((cardGroup, i) => {
      const x         = total > 1 ? -maxSpread / 2 + i * step : 0;
      const curveDrop = Math.pow(x / (maxSpread / 2 + 0.01), 2) * 0.12;
      const targetY   = OPP_HAND_BASE_Y - curveDrop;
      const targetZ   = OPP_HAND_BASE_Z - Math.abs(x) * 0.04;
      const rotZ      = x * 0.035;
      const rotY      = -x * 0.025;

      if (animate) {
        gsap.to(cardGroup.position, {
          duration: 0.35,
          x,
          y: targetY,
          z: targetZ,
          ease: "power2.out",
        });
        gsap.to(cardGroup.rotation, {
          duration: 0.35,
          x: OPP_CARD_ROTX,
          y: rotY,
          z: rotZ,
          ease: "power2.out",
        });
        gsap.to(cardGroup.scale, {
          duration: 0.35,
          x: OPP_CARD_SCALE,
          y: OPP_CARD_SCALE,
          z: OPP_CARD_SCALE,
          ease: "back.out(1.2)",
        });
      } else {
        cardGroup.position.set(x, targetY, targetZ);
        cardGroup.rotation.set(OPP_CARD_ROTX, rotY, rotZ);
        cardGroup.scale.set(OPP_CARD_SCALE, OPP_CARD_SCALE, OPP_CARD_SCALE);
      }
    });
  }

  // ── 3D Floating Count Badge ──────────────────────────────────

  private createBadgeSprite(): void {
    const mat = new THREE.SpriteMaterial({
      map: this.badgeTex,
      transparent: true,
      depthTest: false,
    });
    this.badgeSprite = new THREE.Sprite(mat);
    this.badgeSprite.scale.set(2.4, 0.75, 1);
    this.group.add(this.badgeSprite);
    this.updateBadgeSprite();
  }

  private updateBadgeSprite(): void {
    const ctx = this.badgeCtx;
    const w = this.badgeCanvas.width;
    const h = this.badgeCanvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.currentCount === 0) {
      this.badgeTex.needsUpdate = true;
      if (this.badgeSprite) this.badgeSprite.visible = false;
      return;
    }

    if (this.badgeSprite) this.badgeSprite.visible = true;

    // Rounded background badge
    ctx.beginPath();
    const r = 24;
    ctx.moveTo(10 + r, 8);
    ctx.lineTo(w - 10 - r, 8);
    ctx.quadraticCurveTo(w - 10, 8, w - 10, 8 + r);
    ctx.lineTo(w - 10, h - 8 - r);
    ctx.quadraticCurveTo(w - 10, h - 8, w - 10 - r, h - 8);
    ctx.lineTo(10 + r, h - 8);
    ctx.quadraticCurveTo(10, h - 8, 10, h - 8 - r);
    ctx.lineTo(10, 8 + r);
    ctx.quadraticCurveTo(10, 8, 10 + r, 8);
    ctx.closePath();

    ctx.fillStyle = "rgba(10, 6, 26, 0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(160, 110, 255, 0.75)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text rendering: icon + "Cards: X / 11"
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "bold 28px 'Inter', Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`🎴 ${this.currentCount}`, w / 2 - 24, h / 2);

    ctx.font = "bold 20px 'Inter', Arial";
    ctx.fillStyle = "rgba(200, 185, 255, 0.7)";
    ctx.fillText(`/ 11`, w / 2 + 36, h / 2 + 2);

    this.badgeTex.needsUpdate = true;

    // Position the badge to the right flank of the fan
    if (this.badgeSprite) {
      const maxSpread = Math.min(this.currentCount * 0.75, 4.8);
      const targetX = Math.max(maxSpread / 2 + 1.25, 1.6);
      this.badgeSprite.position.set(targetX, OPP_HAND_BASE_Y + 0.15, OPP_HAND_BASE_Z);
    }
  }
}
