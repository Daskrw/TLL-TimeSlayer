// ============================================================
//  StatusVisuals.ts — 3D Visual Badges & Overlays on Card Meshes
//  Renders Frozen frost overlay, Golden Shield bubble, Deadly skull badge,
//  and handles Support sub-slot depth offset.
// ============================================================

import * as THREE from "three";
import { CARD_W, CARD_H } from "./visualConstants";
import { UnitMeshEntry } from "./CombatAnimator";

export interface UnitStatusState {
  isFrozen: boolean;
  hasShield: boolean;
  isDeadly: boolean;
}

export class StatusVisuals {
  private entry: UnitMeshEntry;
  private container: THREE.Group;

  // Frozen components
  private frozenMesh: THREE.Mesh | null = null;

  // Shield components
  private shieldGroup: THREE.Group | null = null;
  private shieldOuterRing: THREE.Mesh | null = null;
  private shieldInnerRing: THREE.Mesh | null = null;
  private shieldBubble: THREE.Mesh | null = null;

  // Deadly components
  private deadlyBadge: THREE.Mesh | null = null;

  constructor(entry: UnitMeshEntry) {
    this.entry = entry;
    this.container = new THREE.Group();
    // Position container right on top of the card's body
    this.entry.group.add(this.container);

    this.buildFrozenOverlay();
    this.buildShieldBubble();
    this.buildDeadlyBadge();
  }

  // ── 1. Frozen: Light blue frosted overlay + icicle icon ─────

  private buildFrozenOverlay(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;

    // Ice frosted gradient
    const grad = ctx.createLinearGradient(0, 0, 256, 360);
    grad.addColorStop(0,   "rgba(140, 220, 255, 0.72)");
    grad.addColorStop(0.5, "rgba(90, 180, 255, 0.55)");
    grad.addColorStop(1,   "rgba(160, 230, 255, 0.78)");
    ctx.fillStyle = grad;
    ctx.roundRect(4, 4, 248, 352, 14);
    ctx.fill();

    // Frost borders & crystalline cracks
    ctx.strokeStyle = "rgba(220, 245, 255, 0.9)";
    ctx.lineWidth = 4;
    ctx.roundRect(6, 6, 244, 348, 12);
    ctx.stroke();

    // Ice cracks
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, 40); ctx.lineTo(90, 110); ctx.lineTo(80, 160);
    ctx.moveTo(220, 50); ctx.lineTo(170, 130); ctx.lineTo(190, 180);
    ctx.moveTo(40, 310); ctx.lineTo(100, 240); ctx.lineTo(130, 270);
    ctx.stroke();

    // Frost snowflake emblem in center
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = "72px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❄️", 128, 180);

    // "FROZEN" banner at top
    ctx.fillStyle = "rgba(10, 40, 80, 0.85)";
    ctx.roundRect(48, 20, 160, 30, 15);
    ctx.fill();
    ctx.strokeStyle = "#88ddff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#e0f7ff";
    ctx.font = "bold 14px 'Inter', Arial";
    ctx.fillText("FROZEN", 128, 35);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(CARD_W * 0.96, CARD_H * 0.96);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    this.frozenMesh = new THREE.Mesh(geo, mat);
    // Sit slightly above the card face
    this.frozenMesh.position.set(0, 0, 0.025);
    this.frozenMesh.visible = false;
    this.container.add(this.frozenMesh);
  }

  // ── 2. Shield: Golden bubble & translucent outline ──────────

  private buildShieldBubble(): void {
    this.shieldGroup = new THREE.Group();
    this.shieldGroup.visible = false;

    // Golden translucent bubble sphere
    const bubbleGeo = new THREE.SphereGeometry(1.45, 24, 24);
    bubbleGeo.scale(1.0, 1.35, 0.65);
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffaa00,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      metalness: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shieldBubble = new THREE.Mesh(bubbleGeo, bubbleMat);
    this.shieldGroup.add(this.shieldBubble);

    // Outer rotating golden ring
    const ringGeo = new THREE.RingGeometry(1.52, 1.62, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shieldOuterRing = new THREE.Mesh(ringGeo, ringMat);
    this.shieldGroup.add(this.shieldOuterRing);

    // Inner ring with subtle tilt
    const innerGeo = new THREE.RingGeometry(1.36, 1.42, 36);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shieldInnerRing = new THREE.Mesh(innerGeo, innerMat);
    this.shieldInnerRing.rotation.x = 0.2;
    this.shieldGroup.add(this.shieldInnerRing);

    this.container.add(this.shieldGroup);
  }

  // ── 3. Deadly: Poison drop / skull badge next to Attack counter

  private buildDeadlyBadge(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    // Dark venom radial background
    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 60);
    grad.addColorStop(0, "#2c003e");
    grad.addColorStop(0.7, "#12001a");
    grad.addColorStop(1, "#050008");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();

    // Toxic green glowing outline
    ctx.strokeStyle = "#39ff14";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Inner subtle ring
    ctx.strokeStyle = "#b300ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Skull icon
    ctx.fillStyle = "#ffffff";
    ctx.font = "64px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("☠️", 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(0.55, 0.55);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });

    this.deadlyBadge = new THREE.Mesh(geo, mat);
    // Position: bottom-left near attack counter (attack counter is at roughly x = -0.58, y = -0.92)
    this.deadlyBadge.position.set(-0.58, -0.62, 0.035);
    this.deadlyBadge.visible = false;
    this.container.add(this.deadlyBadge);
  }

  // ── Public Update API ───────────────────────────────────────

  public update(status: UnitStatusState): void {
    if (this.frozenMesh) {
      this.frozenMesh.visible = !!status.isFrozen;
    }
    if (this.shieldGroup) {
      this.shieldGroup.visible = !!status.hasShield;
    }
    if (this.deadlyBadge) {
      this.deadlyBadge.visible = !!status.isDeadly;
    }
  }

  public tick(dt: number): void {
    if (this.shieldGroup && this.shieldGroup.visible) {
      if (this.shieldOuterRing) {
        this.shieldOuterRing.rotation.z += dt * 1.2;
      }
      if (this.shieldInnerRing) {
        this.shieldInnerRing.rotation.z -= dt * 1.6;
      }
      if (this.shieldBubble) {
        const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.04;
        this.shieldBubble.scale.set(1.0 * pulse, 1.35 * pulse, 0.65 * pulse);
      }
    }

    if (this.deadlyBadge && this.deadlyBadge.visible) {
      const scale = 1.0 + Math.sin(Date.now() * 0.007) * 0.06;
      this.deadlyBadge.scale.set(scale, scale, 1);
    }
  }

  public dispose(): void {
    this.entry.group.remove(this.container);
    if (this.frozenMesh) {
      (this.frozenMesh.material as THREE.Material).dispose();
      this.frozenMesh.geometry.dispose();
    }
    if (this.shieldBubble) {
      (this.shieldBubble.material as THREE.Material).dispose();
      this.shieldBubble.geometry.dispose();
    }
    if (this.deadlyBadge) {
      (this.deadlyBadge.material as THREE.Material).dispose();
      this.deadlyBadge.geometry.dispose();
    }
  }
}
