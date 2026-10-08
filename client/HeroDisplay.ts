// ============================================================
//  HeroDisplay.ts — High-Impact Hero HUDs & Block Meters
//  - Massive ~120px-130px scale Hero Avatars with crisp 512px rendering
//  - Prominent 8-Segment Opponent Super Block Meter & HP Pill
//  - State-difference guarded animations (zero looping/flashing on sync)
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import {
  HERO_HP_BAR_W, HERO_HP_BAR_H,
  BLOCK_SEGMENTS,
  PLAYER_HERO_X, PLAYER_HERO_Z, OPP_HERO_Z,
  ANIM_BLOCK_FILL, ANIM_SHIELD_BURST,
} from "./visualConstants";
import { PlayerId } from "../src/types";

// Visual sizing constants
const MASSIVE_AVATAR_R = 1.45; // 2.9 units diameter (~120px visual footprint)
const SEG_W = 0.34;
const SEG_H = 0.18;
const SEG_GAP = 0.055;

export interface HeroDisplayData {
  group: THREE.Group;
  updateHp(hp: number, maxHp: number): void;
  fillBlockSegments(count: number): void;
  resetBlockMeter(): void;
  setBlockMeter(count: number): void;
  shieldBurst(vfxScene: THREE.Scene): void;
  shake(): void;
  setHeroPortrait(portraitOrEmoji: string): void;
  currentHp: number;
}

export function createHeroDisplay(
  scene: THREE.Scene,
  id: PlayerId,
  maxHp: number,
  startHp: number,
): HeroDisplayData {
  const isPlayer = id === PlayerId.Player;
  const worldX = isPlayer ? PLAYER_HERO_X : 0;
  const worldZ = isPlayer ? PLAYER_HERO_Z : OPP_HERO_Z;
  const group = new THREE.Group();
  group.position.set(worldX, 0, worldZ);
  scene.add(group);

  // ── Decorative Bottom Pedestal ────────────────────────────────
  const baseGeo = new THREE.CylinderGeometry(MASSIVE_AVATAR_R + 0.35, MASSIVE_AVATAR_R + 0.45, 0.05, 48);
  const baseMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x081326 : 0x1a060d,
    roughness: 0.4,
    metalness: 0.8,
    transparent: true,
    opacity: 0.9,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.set(0, 0.01, 0);
  group.add(baseMesh);

  // Glowing Outer Pedestal Halo
  const haloGeo = new THREE.RingGeometry(MASSIVE_AVATAR_R + 0.32, MASSIVE_AVATAR_R + 0.42, 48);
  const haloMat = new THREE.MeshBasicMaterial({
    color: isPlayer ? 0x38bdf8 : 0xf43f5e,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  haloMesh.rotation.x = -Math.PI / 2;
  haloMesh.position.set(0, 0.036, 0);
  group.add(haloMesh);

  // ── Massive Avatar Disc ───────────────────────────────────────
  const avatarGeo = new THREE.CylinderGeometry(MASSIVE_AVATAR_R, MASSIVE_AVATAR_R, 0.12, 48);
  const avatarMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x0f172a : 0x18080c,
    emissive: new THREE.Color(isPlayer ? 0x1e3a8a : 0x450a0a),
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.85,
  });
  const avatar = new THREE.Mesh(avatarGeo, avatarMat);
  avatar.position.set(0, 0.06, 0);
  avatar.castShadow = true;
  group.add(avatar);

  // Dynamic Glowing Metallic Bezel Ring (Sapphire for Self, Ruby for Opponent)
  const ringGeo = new THREE.TorusGeometry(MASSIVE_AVATAR_R + 0.04, 0.055, 16, 64);
  const ringMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x38bdf8 : 0xef4444,
    emissive: new THREE.Color(isPlayer ? 0x0284c7 : 0xdc2626),
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0.9,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.set(0, 0.11, 0);
  group.add(ringMesh);

  // 8 Perimeter Gemstone Studs
  const studGeo = new THREE.OctahedronGeometry(0.085, 0);
  const studMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x7dd3fc : 0xfca5a5,
    emissive: isPlayer ? 0x0284c7 : 0xdc2626,
    emissiveIntensity: 1.0,
    roughness: 0.1,
    metalness: 0.7,
  });
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const stud = new THREE.Mesh(studGeo, studMat);
    stud.position.set(
      Math.cos(angle) * (MASSIVE_AVATAR_R + 0.04),
      0.12,
      Math.sin(angle) * (MASSIVE_AVATAR_R + 0.04),
    );
    group.add(stud);
  }

  // ── High-Res Hero Portrait Canvas (512x512) ───────────────────
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 512;
  const lctx = labelCanvas.getContext("2d")!;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.minFilter = THREE.LinearFilter;
  labelTex.magFilter = THREE.LinearFilter;

  const labelGeo = new THREE.PlaneGeometry(MASSIVE_AVATAR_R * 1.88, MASSIVE_AVATAR_R * 1.88);
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.rotation.x = -Math.PI / 2;
  labelMesh.position.set(0, 0.13, 0);
  group.add(labelMesh);

  // ── HP Bar with Ghost HP Feedback ────────────────────────────
  const hpBarW = isPlayer ? 2.8 : HERO_HP_BAR_W;
  const hpBarGroup = new THREE.Group();
  // Self: stacked toward top of console; Opponent: clearly in front facing camera
  hpBarGroup.position.set(0, 0, isPlayer ? -1.85 : 1.75);
  group.add(hpBarGroup);

  const hpBgGeo = new THREE.PlaneGeometry(hpBarW, HERO_HP_BAR_H);
  const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x0f0510 });
  const hpBg = new THREE.Mesh(hpBgGeo, hpBgMat);
  hpBg.rotation.x = -Math.PI / 2;
  hpBg.position.set(0, 0.01, 0);
  hpBarGroup.add(hpBg);

  const hpGhostGeo = new THREE.PlaneGeometry(hpBarW, HERO_HP_BAR_H);
  const hpGhostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
  const hpGhost = new THREE.Mesh(hpGhostGeo, hpGhostMat);
  hpGhost.rotation.x = -Math.PI / 2;
  hpGhost.position.set(0, 0.018, 0);
  hpBarGroup.add(hpGhost);

  const hpFillGeo = new THREE.PlaneGeometry(hpBarW, HERO_HP_BAR_H);
  const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthWrite: false });
  const hpFill = new THREE.Mesh(hpFillGeo, hpFillMat);
  hpFill.rotation.x = -Math.PI / 2;
  hpFill.position.set(0, 0.022, 0);
  hpBarGroup.add(hpFill);

  // HP Text Sprite (Ruby Gem Badge)
  let hpCanvas = makeHpCanvas(startHp, maxHp, isPlayer);
  let hpTex = new THREE.CanvasTexture(hpCanvas);
  const hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true }));
  hpSprite.scale.set(2.4, 0.72, 1);
  hpSprite.position.set(0, 0.45, 0);
  hpBarGroup.add(hpSprite);

  // ── 8-Segment Super Block Meter ───────────────────────────────
  const segGroup = new THREE.Group();
  // Self: stacked at bottom of console; Opponent: directly in front of HP pill facing camera!
  segGroup.position.set(0, 0, isPlayer ? 1.85 : 2.45);
  group.add(segGroup);

  const totalW = BLOCK_SEGMENTS * SEG_W + (BLOCK_SEGMENTS - 1) * SEG_GAP;
  const segMeshes: THREE.Mesh[] = [];

  for (let s = 0; s < BLOCK_SEGMENTS; s++) {
    const x = -totalW / 2 + s * (SEG_W + SEG_GAP) + SEG_W / 2;
    const geo = new THREE.BoxGeometry(SEG_W, 0.08, SEG_H);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0f1124,
      emissive: new THREE.Color(0x060714),
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7,
      roughness: 0.3,
      metalness: 0.8,
    });
    const seg = new THREE.Mesh(geo, mat);
    seg.position.set(x, 0.04, 0);
    segGroup.add(seg);
    segMeshes.push(seg);
  }

  // Block Meter Label Sprite
  const bmLabelCanvas = document.createElement("canvas");
  bmLabelCanvas.width = 256;
  bmLabelCanvas.height = 36;
  const bmCtx = bmLabelCanvas.getContext("2d")!;
  const bmTex = new THREE.CanvasTexture(bmLabelCanvas);
  const bmLabelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bmTex, transparent: true }));
  bmLabelSprite.scale.set(2.4, 0.34, 1);
  bmLabelSprite.position.set(0, 0.22, isPlayer ? 0.32 : -0.28);
  segGroup.add(bmLabelSprite);

  function redrawBlockMeterLabel(charges: number): void {
    bmCtx.clearRect(0, 0, 256, 36);
    bmCtx.shadowColor = isPlayer ? "rgba(56, 189, 248, 0.8)" : "rgba(244, 63, 94, 0.8)";
    bmCtx.shadowBlur = 8;
    bmCtx.fillStyle = isPlayer ? "#bae6fd" : "#fecdd3";
    bmCtx.font = "bold 13px 'Inter', sans-serif";
    bmCtx.textAlign = "center";
    bmCtx.textBaseline = "middle";
    bmCtx.fillText(`SUPER BLOCK  [ ${charges} / 8 ]`, 128, 18);
    bmTex.needsUpdate = true;
  }
  redrawBlockMeterLabel(0);

  // ── Animation State Caching (Zero-Deduplication Engine) ────────
  let curHp = startHp;
  let prevHp = startHp;
  let prevMaxHp = maxHp;
  let prevBlockCharges = 0;
  let filledSegments = 0;
  let isShaking = false;
  let hasInitialized = false;

  // ── Shield Burst VFX Ring ─────────────────────────────────────
  function makeRing(): THREE.Mesh {
    const geo = new THREE.RingGeometry(1.2, 1.6, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: isPlayer ? 0x38bdf8 : 0xef4444,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  // ── Public API Implementation ─────────────────────────────────

  function updateHp(hp: number, newMaxHp: number): void {
    // Zero-overhead guard: skip if values haven't changed
    if (hasInitialized && hp === prevHp && newMaxHp === prevMaxHp) {
      return;
    }

    const oldHp = curHp;
    curHp = hp;
    const effectiveMax = newMaxHp || maxHp;
    const t = Math.max(0, Math.min(1, hp / effectiveMax));
    const oldT = Math.max(0, Math.min(1, oldHp / effectiveMax));

    hpFill.scale.x = t;
    hpFill.position.x = -(hpBarW / 2) * (1 - t);

    const col = t > 0.5 ? 0x22c55e : t > 0.25 ? 0xf59e0b : 0xef4444;
    (hpFillMat as THREE.MeshBasicMaterial).color.setHex(col);

    // Only animate Ghost damage feedback if damage was actually sustained
    if (hasInitialized && hp < oldHp) {
      hpGhost.scale.x = oldT;
      hpGhost.position.x = -(hpBarW / 2) * (1 - oldT);
      (hpGhostMat as THREE.MeshBasicMaterial).color.setHex(0xffffff);
      hpGhostMat.opacity = 0.95;

      gsap.timeline()
        .to((hpGhostMat as THREE.MeshBasicMaterial).color, { duration: 0.12, r: 0.9, g: 0.15, b: 0.2, ease: "none" })
        .to(hpGhost.scale, { duration: 0.4, delay: 0.18, x: t, ease: "power2.out" }, "<")
        .to(hpGhost.position, { duration: 0.4, delay: 0.18, x: -(hpBarW / 2) * (1 - t), ease: "power2.out" }, "<")
        .to(hpGhostMat, { duration: 0.2, opacity: 0 }, "-=0.1");

      // Subtle avatar damage recoil
      gsap.fromTo(avatar.scale, { x: 1.08, y: 1.08, z: 1.08 }, { x: 1, y: 1, z: 1, duration: 0.3, ease: "back.out(2)" });
    } else {
      hpGhost.scale.x = t;
      hpGhost.position.x = -(hpBarW / 2) * (1 - t);
      hpGhostMat.opacity = 0;
    }

    // Redraw text badge
    hpCanvas = makeHpCanvas(hp, effectiveMax, isPlayer);
    hpTex.dispose();
    hpTex = new THREE.CanvasTexture(hpCanvas);
    (hpSprite.material as THREE.SpriteMaterial).map = hpTex;
    (hpSprite.material as THREE.SpriteMaterial).needsUpdate = true;

    prevHp = hp;
    prevMaxHp = effectiveMax;
    hasInitialized = true;
  }

  function setBlockMeter(count: number): void {
    const target = Math.max(0, Math.min(count, BLOCK_SEGMENTS));
    // Guard against redundant execution
    if (hasInitialized && target === prevBlockCharges) {
      return;
    }

    for (let i = 0; i < BLOCK_SEGMENTS; i++) {
      const segMesh = segMeshes[i];
      const mat = segMesh.material as THREE.MeshStandardMaterial;
      if (i < target) {
        // Active segment glow
        const isNewCharge = i >= prevBlockCharges;
        mat.color.setHex(isPlayer ? 0x38bdf8 : 0xf43f5e);
        mat.emissive.setHex(isPlayer ? 0x0284c7 : 0xdc2626);
        mat.opacity = 1.0;
        mat.emissiveIntensity = 2.4;

        if (isNewCharge && hasInitialized) {
          gsap.fromTo(segMesh.scale, { y: 1.8 }, { y: 1.0, duration: 0.35, ease: "elastic.out(1.5, 0.4)" });
        }
      } else {
        // Inactive translucent slot
        mat.color.setHex(0x0f1124);
        mat.emissive.setHex(0x060714);
        mat.opacity = 0.65;
        mat.emissiveIntensity = 0.2;
      }
      mat.needsUpdate = true;
    }

    filledSegments = target;
    prevBlockCharges = target;
    redrawBlockMeterLabel(target);
  }

  function fillBlockSegments(count: number): void {
    setBlockMeter(filledSegments + count);
  }

  function resetBlockMeter(): void {
    setBlockMeter(0);
  }

  function shieldBurst(vfxScene: THREE.Scene): void {
    // Flash all segments
    for (const seg of segMeshes) {
      const mat = seg.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0xffffff);
      mat.emissive.setHex(0xffffff);
      mat.emissiveIntensity = 3.5;
      mat.needsUpdate = true;
    }

    // Burst energy rings
    for (let r = 0; r < 3; r++) {
      const ring = makeRing();
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(group.position);
      ring.position.y = 0.12;
      vfxScene.add(ring);
      const mat = ring.material as THREE.MeshBasicMaterial;

      gsap.timeline()
        .to(mat, { duration: 0.1, delay: r * 0.12, opacity: 0.95 })
        .to(ring.scale, { duration: ANIM_SHIELD_BURST, delay: r * 0.12, x: 4.5, y: 4.5, z: 4.5, ease: "power2.out" }, "<")
        .to(mat, { duration: ANIM_SHIELD_BURST * 0.5, opacity: 0, onComplete: () => vfxScene.remove(ring) }, "-=0.3");
    }

    gsap.delayedCall(0.5, resetBlockMeter);
  }

  function shake(): void {
    if (isShaking) return;
    isShaking = true;
    const orig = group.position.clone();
    gsap.timeline({ onComplete: () => { isShaking = false; group.position.copy(orig); } })
      .to(group.position, { duration: 0.05, x: orig.x + 0.25 })
      .to(group.position, { duration: 0.05, x: orig.x - 0.25 })
      .to(group.position, { duration: 0.05, x: orig.x + 0.12 })
      .to(group.position, { duration: 0.05, x: orig.x });
  }

  function renderPortraitCanvas(imgOrEmoji: HTMLImageElement | string): void {
    lctx.clearRect(0, 0, 512, 512);

    // Dark sleek backdrop
    const grad = lctx.createRadialGradient(256, 256, 40, 256, 256, 256);
    grad.addColorStop(0, isPlayer ? "#1e293b" : "#2a0a14");
    grad.addColorStop(1, isPlayer ? "#090d16" : "#120308");
    lctx.fillStyle = grad;
    lctx.beginPath();
    lctx.arc(256, 256, 240, 0, Math.PI * 2);
    lctx.fill();

    if (typeof imgOrEmoji !== "string" && imgOrEmoji) {
      try {
        lctx.save();
        lctx.beginPath();
        lctx.arc(256, 256, 236, 0, Math.PI * 2);
        lctx.clip();

        // Aspect ratio cover calculation
        const imgW = imgOrEmoji.width || 512;
        const imgH = imgOrEmoji.height || 512;
        const scale = Math.max(512 / imgW, 512 / imgH);
        const nw = imgW * scale;
        const nh = imgH * scale;
        const nx = (512 - nw) / 2;
        const ny = (512 - nh) / 2;
        lctx.drawImage(imgOrEmoji, nx, ny, nw, nh);
        lctx.restore();

        // Sleek inner border shadow
        lctx.strokeStyle = isPlayer ? "rgba(56, 189, 248, 0.75)" : "rgba(244, 63, 94, 0.75)";
        lctx.lineWidth = 10;
        lctx.beginPath();
        lctx.arc(256, 256, 236, 0, Math.PI * 2);
        lctx.stroke();
      } catch (err) {
        console.warn("[HeroDisplay] Error rendering image to canvas, falling back to emoji:", err);
        renderPortraitCanvas(isPlayer ? "🧙" : "🤖");
        return;
      }
    } else {
      const fallbackStr = isPlayer ? "🧙" : "🤖";
      const rawText = (typeof imgOrEmoji === "string" ? imgOrEmoji : "").trim();
      const textToDraw = (!rawText || rawText.toLowerCase() === "loading" || rawText.toLowerCase() === "uploading...")
        ? fallbackStr
        : rawText;

      lctx.font = "200px 'Segoe UI Emoji', Arial";
      lctx.textAlign = "center";
      lctx.textBaseline = "middle";
      lctx.shadowColor = isPlayer ? "rgba(56, 189, 248, 0.8)" : "rgba(244, 63, 94, 0.8)";
      lctx.shadowBlur = 24;
      lctx.fillText(textToDraw, 256, 256);
    }
    labelTex.needsUpdate = true;
  }

  function setHeroPortrait(portraitOrEmoji: string): void {
    const p = (portraitOrEmoji || "").trim();
    const fallbackEmoji = isPlayer ? "🧙" : "🤖";

    if (!p || p.toLowerCase() === "loading" || p.toLowerCase() === "uploading...") {
      renderPortraitCanvas(fallbackEmoji);
      return;
    }

    if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("data:") || p.startsWith("/") || p.startsWith("./")) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        renderPortraitCanvas(img);
      };
      img.onerror = () => {
        console.warn("[HeroDisplay] Failed to load hero portrait URL:", p);
        renderPortraitCanvas(fallbackEmoji);
      };
      img.src = p;
    } else {
      renderPortraitCanvas(p || fallbackEmoji);
    }
  }

  // Initial portrait paint
  setHeroPortrait(isPlayer ? "🧙" : "🤖");

  return {
    group,
    updateHp,
    fillBlockSegments,
    resetBlockMeter,
    setBlockMeter,
    shieldBurst,
    shake,
    setHeroPortrait,
    get currentHp() { return curHp; },
  };
}

// ─────────────────────────────────────────────────────────────
//  Internal Helpers
// ─────────────────────────────────────────────────────────────

function makeHpCanvas(hp: number, max: number, isPlayer: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 320, 96);

  const t = Math.max(0, hp / (max || 1));
  const col = t > 0.5 ? "#22c55e" : t > 0.25 ? "#f59e0b" : "#ef4444";

  // Ruby/Sapphire Gem Pill Base
  ctx.fillStyle = isPlayer ? "rgba(8, 16, 36, 0.95)" : "rgba(28, 6, 14, 0.95)";
  ctx.strokeStyle = col;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(10, 10, 300, 76, 38);
  ctx.fill();
  ctx.stroke();

  // Glassmorphic Inner Highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(16, 16, 288, 64, 32);
  ctx.stroke();

  // HP Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.fillText(`♥ ${hp} / ${max}`, 160, 48);

  return canvas;
}
