// ============================================================
//  TargetingArrow.ts — 3D Curved Bezier Targeting Arrow & Reticle
//  Renders an interactive 3D arc from a dragged card to mouse/target
//  with valid target locking, animated reticle, and smooth retraction.
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { CardDefinition } from "../src/types";

export interface TargetCandidate {
  id: string;              // unit instanceId or "HERO_PLAYER" / "HERO_OPPONENT"
  type: "unit" | "hero";
  isPlayer: boolean;
  position: THREE.Vector3;
  meshGroup: THREE.Group;
}

export class TargetingArrow {
  private scene: THREE.Scene;
  private group: THREE.Group = new THREE.Group();

  // Curve components
  private active = false;
  private startPos = new THREE.Vector3();
  private currentEndPos = new THREE.Vector3();
  private targetSnappedPos: THREE.Vector3 | null = null;
  private activeCard: CardDefinition | null = null;

  // Visual Meshes
  private tubeMesh: THREE.Mesh | null = null;
  private arrowheadMesh: THREE.Mesh;
  private reticleGroup: THREE.Group = new THREE.Group();
  private reticleOuterRing!: THREE.Mesh;
  private reticleInnerRing!: THREE.Mesh;
  private reticleCross1!: THREE.Mesh;
  private reticleCross2!: THREE.Mesh;

  // Arrowhead and tube materials
  private lineMaterial: THREE.MeshBasicMaterial;
  private arrowMaterial: THREE.MeshStandardMaterial;
  private reticleMaterial: THREE.MeshBasicMaterial;

  // Curve points buffer
  private readonly NUM_POINTS = 36;
  private curvePoints: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);
    this.group.visible = false;

    // Materials
    this.lineMaterial = new THREE.MeshBasicMaterial({
      color: 0x44ddff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    this.arrowMaterial = new THREE.MeshStandardMaterial({
      color: 0x44ddff,
      emissive: 0x2288ff,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.6,
    });

    this.reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Arrowhead cone
    const arrowGeo = new THREE.ConeGeometry(0.38, 0.9, 16);
    arrowGeo.rotateX(Math.PI / 2); // align tip along +Z
    this.arrowheadMesh = new THREE.Mesh(arrowGeo, this.arrowMaterial);
    this.group.add(this.arrowheadMesh);

    // Build Reticle
    this.buildReticle();
    this.group.add(this.reticleGroup);
    this.reticleGroup.visible = false;
  }

  private buildReticle(): void {
    // Outer dashed ring
    const outerGeo = new THREE.RingGeometry(0.95, 1.08, 32);
    this.reticleOuterRing = new THREE.Mesh(outerGeo, this.reticleMaterial);
    this.reticleOuterRing.rotation.x = -Math.PI / 2;
    this.reticleGroup.add(this.reticleOuterRing);

    // Inner ring
    const innerGeo = new THREE.RingGeometry(0.5, 0.58, 32);
    this.reticleInnerRing = new THREE.Mesh(innerGeo, this.reticleMaterial);
    this.reticleInnerRing.rotation.x = -Math.PI / 2;
    this.reticleGroup.add(this.reticleInnerRing);

    // Crosshairs
    const barGeo1 = new THREE.PlaneGeometry(0.08, 0.45);
    this.reticleCross1 = new THREE.Mesh(barGeo1, this.reticleMaterial);
    this.reticleCross1.rotation.x = -Math.PI / 2;
    this.reticleCross1.position.set(0, 0.01, 0.78);
    this.reticleGroup.add(this.reticleCross1);

    const barGeo2 = new THREE.PlaneGeometry(0.45, 0.08);
    this.reticleCross2 = new THREE.Mesh(barGeo2, this.reticleMaterial);
    this.reticleCross2.rotation.x = -Math.PI / 2;
    this.reticleCross2.position.set(0.78, 0.01, 0);
    this.reticleGroup.add(this.reticleCross2);
  }

  public activate(start: THREE.Vector3, card: CardDefinition): void {
    this.active = true;
    this.activeCard = card;
    this.startPos.copy(start);
    this.startPos.y = Math.max(start.y, 1.4);
    this.currentEndPos.copy(start);
    this.targetSnappedPos = null;

    this.group.visible = true;
    this.group.scale.set(1, 1, 1);
    this.setValid(false);
  }

  public update(targetPos: THREE.Vector3, snappedPos: THREE.Vector3 | null, isValid: boolean): void {
    if (!this.active) return;

    this.targetSnappedPos = snappedPos;
    const dest = snappedPos ?? targetPos;
    this.currentEndPos.lerp(dest, 0.45);

    this.setValid(isValid);
    this.rebuildCurve(this.startPos, this.currentEndPos);

    if (snappedPos && isValid) {
      this.reticleGroup.visible = true;
      this.reticleGroup.position.copy(snappedPos);
      this.reticleGroup.position.y += 0.08;
    } else {
      this.reticleGroup.visible = false;
    }
  }

  private setValid(valid: boolean): void {
    const colHex = valid ? 0x00ff88 : 0x44ddff;
    const emHex = valid ? 0x00aa44 : 0x2288ff;

    this.lineMaterial.color.setHex(colHex);
    this.arrowMaterial.color.setHex(colHex);
    this.arrowMaterial.emissive.setHex(emHex);
    this.reticleMaterial.color.setHex(colHex);
  }

  private rebuildCurve(p0: THREE.Vector3, p2: THREE.Vector3): void {
    const dist = p0.distanceTo(p2);
    const mid = new THREE.Vector3().addVectors(p0, p2).multiplyScalar(0.5);

    // Height of the arch: scales smoothly with distance
    const arcHeight = Math.max(1.6, Math.min(dist * 0.42, 4.5));
    const p1 = new THREE.Vector3(mid.x, Math.max(p0.y, p2.y) + arcHeight, mid.z);

    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    this.curvePoints = curve.getPoints(this.NUM_POINTS);

    // Rebuild tube geometry
    if (this.tubeMesh) {
      this.group.remove(this.tubeMesh);
      this.tubeMesh.geometry.dispose();
      this.tubeMesh = null;
    }

    if (dist > 0.3) {
      const tubeGeo = new THREE.TubeGeometry(curve, 28, 0.055, 8, false);
      this.tubeMesh = new THREE.Mesh(tubeGeo, this.lineMaterial);
      this.group.add(this.tubeMesh);
    }

    // Orient and position arrowhead at p2 pointing in tangent direction
    this.arrowheadMesh.position.copy(p2);
    const tangent = curve.getTangent(1.0).normalize();
    const lookTarget = p2.clone().add(tangent);
    this.arrowheadMesh.lookAt(lookTarget);
  }

  public retract(onComplete?: () => void): void {
    if (!this.active) return;
    this.active = false;
    this.reticleGroup.visible = false;

    gsap.timeline({
      onComplete: () => {
        this.hide();
        onComplete?.();
      },
    })
      .to(this.currentEndPos, {
        duration: 0.22,
        x: this.startPos.x,
        y: this.startPos.y,
        z: this.startPos.z,
        ease: "power2.in",
        onUpdate: () => {
          this.rebuildCurve(this.startPos, this.currentEndPos);
        },
      })
      .to(this.group.scale, { duration: 0.12, x: 0, y: 0, z: 0, ease: "power2.in" }, "-=0.1");
  }

  public hide(): void {
    this.active = false;
    this.group.visible = false;
    this.reticleGroup.visible = false;
    if (this.tubeMesh) {
      this.group.remove(this.tubeMesh);
      this.tubeMesh.geometry.dispose();
      this.tubeMesh = null;
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  public getActiveCard(): CardDefinition | null {
    return this.activeCard;
  }

  public tick(dt: number): void {
    if (!this.active) return;

    // Reticle spin and subtle pulse
    if (this.reticleGroup.visible) {
      this.reticleOuterRing.rotation.z += dt * 1.8;
      this.reticleInnerRing.rotation.z -= dt * 2.4;
      const pulse = 1.0 + Math.sin(Date.now() * 0.008) * 0.08;
      this.reticleGroup.scale.set(pulse, pulse, pulse);
    }
  }
}
