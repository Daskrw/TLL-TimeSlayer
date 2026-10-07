// ============================================================
//  Graveyard3D.ts — 3D Battlefield Graveyard Piles & Visuals
//
//  Renders interactive 3D graveyard pedestals next to player and
//  opponent decks, dynamic count badges, hover/click raycasting,
//  and cinematic card death/spell fly-to-graveyard animations.
// ============================================================

import * as THREE from "three";
import gsap from "gsap";

export interface GraveyardClickCallback {
  (owner: "player" | "opponent"): void;
}

export class Graveyard3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  public playerGroup: THREE.Group;
  public oppGroup: THREE.Group;

  private playerBadgeSprite!: THREE.Sprite;
  private oppBadgeSprite!: THREE.Sprite;
  private playerBadgeTex!: THREE.CanvasTexture;
  private oppBadgeTex!: THREE.CanvasTexture;

  private playerMat!: THREE.MeshStandardMaterial;
  private oppMat!: THREE.MeshStandardMaterial;

  private p1Count = 0;
  private p2Count = 0;

  private isHoveredPlayer = false;
  private isHoveredOpp = false;

  private onClickCb: GraveyardClickCallback | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;

    this.playerGroup = new THREE.Group();
    this.oppGroup = new THREE.Group();

    this.buildPlayerGraveyard();
    this.buildOpponentGraveyard();

    this.scene.add(this.playerGroup);
    this.scene.add(this.oppGroup);
  }

  // ── Build 3D Piles ───────────────────────────────────────────

  private buildPlayerGraveyard(): void {
    // Position: right side near player deck / hero
    this.playerGroup.position.set(7.5, 0.08, 1.8);

    // 1. Pedestal base
    const baseGeo = new THREE.BoxGeometry(2.0, 0.16, 2.7);
    this.playerMat = new THREE.MeshStandardMaterial({
      color: 0x141026,
      roughness: 0.6,
      metalness: 0.4,
      emissive: 0x22184a,
      emissiveIntensity: 0.3,
    });
    const base = new THREE.Mesh(baseGeo, this.playerMat);
    base.receiveShadow = true;
    base.userData = { isGraveyard: true, owner: "player" };
    this.playerGroup.add(base);

    // 2. Glowing Rune Edge Trim
    const trimGeo = new THREE.EdgesGeometry(baseGeo);
    const trimMat = new THREE.LineBasicMaterial({ color: 0x8b5cf6, linewidth: 2 });
    const trim = new THREE.LineSegments(trimGeo, trimMat);
    this.playerGroup.add(trim);

    // 3. Stacked Card Slab
    const slabGeo = new THREE.BoxGeometry(1.6, 0.18, 2.3);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x2e1065,
      roughness: 0.8,
      metalness: 0.2,
      emissive: 0x6d28d9,
      emissiveIntensity: 0.25,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.12, 0);
    slab.userData = { isGraveyard: true, owner: "player" };
    this.playerGroup.add(slab);

    // 4. Count Badge Sprite
    this.playerBadgeTex = this.createBadgeTexture("🪦 0", "#a78bfa");
    const spriteMat = new THREE.SpriteMaterial({
      map: this.playerBadgeTex,
      transparent: true,
      depthTest: false,
    });
    this.playerBadgeSprite = new THREE.Sprite(spriteMat);
    this.playerBadgeSprite.position.set(0, 0.7, 0);
    this.playerBadgeSprite.scale.set(2.4, 1.2, 1);
    this.playerGroup.add(this.playerBadgeSprite);
  }

  private buildOpponentGraveyard(): void {
    // Position: left side near opponent deck
    this.oppGroup.position.set(-7.5, 0.08, -1.8);

    // 1. Pedestal base
    const baseGeo = new THREE.BoxGeometry(2.0, 0.16, 2.7);
    this.oppMat = new THREE.MeshStandardMaterial({
      color: 0x261014,
      roughness: 0.6,
      metalness: 0.4,
      emissive: 0x4a1820,
      emissiveIntensity: 0.3,
    });
    const base = new THREE.Mesh(baseGeo, this.oppMat);
    base.receiveShadow = true;
    base.userData = { isGraveyard: true, owner: "opponent" };
    this.oppGroup.add(base);

    // 2. Glowing Rune Edge Trim
    const trimGeo = new THREE.EdgesGeometry(baseGeo);
    const trimMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    const trim = new THREE.LineSegments(trimGeo, trimMat);
    this.oppGroup.add(trim);

    // 3. Stacked Card Slab
    const slabGeo = new THREE.BoxGeometry(1.6, 0.18, 2.3);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x4c0519,
      roughness: 0.8,
      metalness: 0.2,
      emissive: 0x9f1239,
      emissiveIntensity: 0.25,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.12, 0);
    slab.userData = { isGraveyard: true, owner: "opponent" };
    this.oppGroup.add(slab);

    // 4. Count Badge Sprite
    this.oppBadgeTex = this.createBadgeTexture("🪦 0", "#fca5a5");
    const spriteMat = new THREE.SpriteMaterial({
      map: this.oppBadgeTex,
      transparent: true,
      depthTest: false,
    });
    this.oppBadgeSprite = new THREE.Sprite(spriteMat);
    this.oppBadgeSprite.position.set(0, 0.7, 0);
    this.oppBadgeSprite.scale.set(2.4, 1.2, 1);
    this.oppGroup.add(this.oppBadgeSprite);
  }

  // ── Badge Texture Generator ──────────────────────────────────

  private createBadgeTexture(text: string, accentColor: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    // Pill background
    ctx.fillStyle = "rgba(10, 6, 25, 0.88)";
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(16, 24, 224, 80, 40);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ── Update Counts ────────────────────────────────────────────

  public updateCounts(p1Count: number, p2Count: number): void {
    if (this.p1Count !== p1Count) {
      this.p1Count = p1Count;
      this.updatePlayerBadgeText(`🪦 ${p1Count}`);
      this.pulseGroup(this.playerGroup);
    }
    if (this.p2Count !== p2Count) {
      this.p2Count = p2Count;
      this.updateOppBadgeText(`🪦 ${p2Count}`);
      this.pulseGroup(this.oppGroup);
    }
  }

  private updatePlayerBadgeText(text: string): void {
    const canvas = this.playerBadgeTex.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 128);

    ctx.fillStyle = "rgba(10, 6, 25, 0.88)";
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(16, 24, 224, 80, 40);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 64);

    this.playerBadgeTex.needsUpdate = true;
  }

  private updateOppBadgeText(text: string): void {
    const canvas = this.oppBadgeTex.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 128);

    ctx.fillStyle = "rgba(10, 6, 25, 0.88)";
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(16, 24, 224, 80, 40);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 64);

    this.oppBadgeTex.needsUpdate = true;
  }

  private pulseGroup(group: THREE.Group): void {
    gsap.timeline()
      .to(group.scale, { duration: 0.15, x: 1.15, y: 1.25, z: 1.15, ease: "back.out(2)" })
      .to(group.scale, { duration: 0.25, x: 1.0, y: 1.0, z: 1.0, ease: "power2.out" });
  }

  // ── Raycasting & Interaction ─────────────────────────────────

  public onPointerMove(raycaster: THREE.Raycaster): boolean {
    const hits = raycaster.intersectObjects([this.playerGroup, this.oppGroup], true);
    let hitGraveyard = false;

    let hitPlayer = false;
    let hitOpp = false;

    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.playerGroup && obj !== this.oppGroup) {
        if (obj.userData?.isGraveyard) {
          if (obj.userData.owner === "player") hitPlayer = true;
          if (obj.userData.owner === "opponent") hitOpp = true;
          hitGraveyard = true;
          break;
        }
        obj = obj.parent;
      }
    }

    if (hitPlayer !== this.isHoveredPlayer) {
      this.isHoveredPlayer = hitPlayer;
      this.playerMat.emissiveIntensity = hitPlayer ? 0.8 : 0.3;
      gsap.to(this.playerGroup.position, { duration: 0.2, y: hitPlayer ? 0.2 : 0.08, ease: "power2.out" });
    }

    if (hitOpp !== this.isHoveredOpp) {
      this.isHoveredOpp = hitOpp;
      this.oppMat.emissiveIntensity = hitOpp ? 0.8 : 0.3;
      gsap.to(this.oppGroup.position, { duration: 0.2, y: hitOpp ? 0.2 : 0.08, ease: "power2.out" });
    }

    return hitGraveyard;
  }

  public onPointerDown(raycaster: THREE.Raycaster): boolean {
    const hits = raycaster.intersectObjects([this.playerGroup, this.oppGroup], true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.playerGroup && obj !== this.oppGroup) {
        if (obj.userData?.isGraveyard) {
          const owner = obj.userData.owner as "player" | "opponent";
          this.onClickCb?.(owner);
          return true;
        }
        obj = obj.parent;
      }
    }
    return false;
  }

  public setOnClick(cb: GraveyardClickCallback): void {
    this.onClickCb = cb;
  }

  // ── Fly to Graveyard Animation ───────────────────────────────

  public animateCardToGraveyard(
    sourceWorldPos: THREE.Vector3,
    isPlayer: boolean,
  ): Promise<void> {
    return new Promise((resolve) => {
      const targetPos = isPlayer
        ? this.playerGroup.position.clone().add(new THREE.Vector3(0, 0.2, 0))
        : this.oppGroup.position.clone().add(new THREE.Vector3(0, 0.2, 0));

      const ghostGeo = new THREE.BoxGeometry(1.2, 0.02, 1.7);
      const ghostMat = new THREE.MeshStandardMaterial({
        color: isPlayer ? 0xa78bfa : 0xf87171,
        emissive: isPlayer ? 0x8b5cf6 : 0xef4444,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.9,
      });
      const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
      ghostMesh.position.copy(sourceWorldPos);
      this.scene.add(ghostMesh);

      const midY = Math.max(sourceWorldPos.y, targetPos.y) + 2.0;

      const tl = gsap.timeline({
        onComplete: () => {
          this.scene.remove(ghostMesh);
          ghostGeo.dispose();
          ghostMat.dispose();
          this.pulseGroup(isPlayer ? this.playerGroup : this.oppGroup);
          resolve();
        },
      });

      tl.to(ghostMesh.position, {
        duration: 0.45,
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        ease: "power2.inOut",
      })
      .to(ghostMesh.rotation, {
        duration: 0.45,
        y: Math.PI * 2,
        x: -Math.PI / 2,
        ease: "power1.inOut",
      }, "<")
      .to(ghostMesh.scale, {
        duration: 0.45,
        x: 0.2,
        y: 0.2,
        z: 0.2,
        ease: "power2.in",
      }, "<")
      .to(ghostMat, {
        duration: 0.45,
        opacity: 0,
        ease: "power2.in",
      }, "<");
    });
  }
}
