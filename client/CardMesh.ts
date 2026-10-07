// ============================================================
//  CardMesh.ts — 2.5D card factory using CanvasTexture
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { CardDefinition, CardType, Keyword, PlayerId, UnitInstance } from "../src/types";
import {
  CARD_W, CARD_H, CARD_DEPTH,
  TRIBE_CSS,
} from "./visualConstants";
import { cardRepo } from "./CardRepository";
import { textures } from "./CardTextureManager";

// ─────────────────────────────────────────────────────────────
//  Canvas drawing helpers
// ─────────────────────────────────────────────────────────────

const CW = 256;
const CH = 360;

function costColor(cost: number): string {
  if (cost <= 1) return "#38bdf8";
  if (cost === 2) return "#4ade80";
  if (cost === 3) return "#fbbf24";
  if (cost === 4) return "#f97316";
  if (cost === 5) return "#c084fc";
  return "#f43f5e";
}

function tribeCss(tribe: string): string {
  return TRIBE_CSS[tribe] ?? TRIBE_CSS["default"] ?? "#888";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function keywordAbbr(kw: Keyword | string): string {
  const map: Record<string, string> = {
    [Keyword.Support]:       "สนับสนุน",
    [Keyword.Overkill]:      "โจมตีต่อเนื่อง",
    [Keyword.Strikethrough]: "เกลียดชังตำนาน",
    [Keyword.Aerial]:        "อากาศยาน",
    [Keyword.Naval]:         "กองเรือ",
    [Keyword.Lifesteal]:     "กลืนชีพ",
    [Keyword.Armored]:       "ทนทาน",
    [Keyword.Rush]:          "จู่โจม",
    [Keyword.Deathrattle]:   "เสียงสุดท้าย",
    [Keyword.Aura]:          "ออร่า",
  };
  return map[kw] ?? kw;
}

// ─────────────────────────────────────────────────────────────
//  Full card face (hand card)
// ─────────────────────────────────────────────────────────────

export function getCardTribes(card: CardDefinition | UnitInstance | { tribe?: string; tribes?: readonly (string | Tribe)[] }): string[] {
  if (card.tribes && card.tribes.length > 0) return [...card.tribes] as string[];
  if (card.tribe) return [card.tribe as string];
  return ["เป็นกลาง"];
}

export function getCardPrimaryTribe(card: CardDefinition | UnitInstance | { tribe?: string; tribes?: readonly (string | Tribe)[] }): string {
  return getCardTribes(card)[0] || "เป็นกลาง";
}

export function renderCardFaceCanvas(
  card: CardDefinition,
  currentHp?: number,
  currentAtk?: number,
  baseAtk?: number,
  baseHp?: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d")!;

  const primaryTribe = getCardPrimaryTribe(card);
  const border = tribeCss(primaryTribe);
  const hp     = currentHp ?? card.hp;
  const atk    = currentAtk ?? card.attack;
  const bAtk   = baseAtk ?? card.attack;
  const bHp    = baseHp ?? card.hp;

  // ── Background ───────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0,   "#12101e");
  bg.addColorStop(0.5, "#0c0a18");
  bg.addColorStop(1,   "#08060f");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, CW, CH, 14);
  ctx.fill();

  // ── Border glow ───────────────────────────────────────────────
  ctx.shadowColor = border;
  ctx.shadowBlur  = 12;
  ctx.strokeStyle = border;
  ctx.lineWidth   = 4;
  roundRect(ctx, 3, 3, CW - 6, CH - 6, 12);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── Top bar background ───────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, 6, 6, CW - 12, 34, 8);
  ctx.fill();

  // ── Card name ─────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font      = "bold 15px 'Inter', Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const nameStr = card.name.length > 16 ? card.name.slice(0, 14) + "…" : card.name;
  ctx.fillText(nameStr, 14, 23);

  // ── Cost badge ────────────────────────────────────────────────
  const cx = CW - 22, cy = 22, cr = 15;
  const costGrad = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy, cr);
  costGrad.addColorStop(0, "#ffe599");
  costGrad.addColorStop(1, "#cc8800");
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fillStyle = costGrad;
  ctx.fill();
  ctx.strokeStyle = "#ffdd44";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#1a0800";
  ctx.font = "bold 14px 'Inter', Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(card.cost), cx, cy + 1);

  // ── Art area ──────────────────────────────────────────────────
  const artY  = 46, artH = 155;
  const artBg = ctx.createLinearGradient(10, artY, 10, artY + artH);
  const base  = tribeGradientColors(primaryTribe);
  artBg.addColorStop(0, base[0]);
  artBg.addColorStop(1, base[1]);
  roundRect(ctx, 10, artY, CW - 20, artH, 6);
  ctx.fillStyle = artBg;
  ctx.fill();

  // Art grid lines (subtle)
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth   = 1;
  for (let i = 20; i < CW - 10; i += 24) {
    ctx.beginPath(); ctx.moveTo(i, artY); ctx.lineTo(i, artY + artH); ctx.stroke();
  }
  for (let j = artY + 18; j < artY + artH; j += 24) {
    ctx.beginPath(); ctx.moveTo(10, j); ctx.lineTo(CW - 10, j); ctx.stroke();
  }

  // Card art icon / emoji
  ctx.fillStyle  = "rgba(255,255,255,0.85)";
  ctx.font       = "64px Arial";
  ctx.textAlign  = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cardArtEmoji(card), CW / 2, artY + artH / 2);

  // ── Divider ───────────────────────────────────────────────────
  ctx.strokeStyle = border + "55";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(10, artY + artH + 6);
  ctx.lineTo(CW - 10, artY + artH + 6);
  ctx.stroke();

  // ── Keywords ─────────────────────────────────────────────────
  if (card.keywords.length > 0) {
    const kwText = card.keywords.map(keywordAbbr).join(" · ");
    ctx.fillStyle = "#aa99ff";
    ctx.font      = "bold 10px 'Inter', Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(kwText, CW / 2, artY + artH + 18);
  }

  // ── Flavor / rules text ───────────────────────────────────────
  if (card.text) {
    const lines = wrapText(ctx, card.text, 220, "10px 'Inter', Arial");
    ctx.fillStyle = "rgba(200,190,220,0.72)";
    ctx.font      = "10px 'Inter', Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, CW / 2, 225 + i * 13));
  }

  // ── Stats bar (units only) ────────────────────────────────────
  if (card.type === CardType.Unit) {
    drawAttackBadge(ctx, 22, CH - 24, atk, bAtk);
    drawHpBadge(ctx,    CW - 22, CH - 24, hp, bHp, bHp);
    // Tribe tag (can show multiple tribes separated by dot)
    const tribes = getCardTribes(card);
    ctx.fillStyle = border + "bb";
    ctx.font      = "bold 9px 'Inter', Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tribes.join(" · ").toUpperCase(), CW / 2, CH - 22);
  }

  return canvas;
}

// ─────────────────────────────────────────────────────────────
//  Compact unit badge (used for units on board)
// ─────────────────────────────────────────────────────────────

export function renderUnitBadgeCanvas(unit: UnitInstance): HTMLCanvasElement {
  const canvas  = document.createElement("canvas");
  canvas.width  = 128;
  canvas.height = 36;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 128, 36);

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  roundRect(ctx, 0, 0, 128, 36, 8);
  ctx.fill();

  // ATK
  ctx.fillStyle = "#ff8844";
  ctx.font      = "bold 14px 'Inter', Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`⚔ ${unit.attack}`, 8, 18);

  // HP
  ctx.fillStyle = "#44ee88";
  ctx.textAlign = "right";
  ctx.fillText(`${unit.currentHp} ♥`, 120, 18);

  return canvas;
}

// ─────────────────────────────────────────────────────────────
//  Mesh factory
// ─────────────────────────────────────────────────────────────

export interface CardMeshData {
  group:    THREE.Group;
  bodyMesh: THREE.Mesh;
  /** Call to redraw the front-face texture (e.g. HP changed). */
  updateTexture: (currentHp?: number, currentAtk?: number, baseAtk?: number, baseHp?: number) => void;
  card: CardDefinition;
  attackBadgeMesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hpBadgeMesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  attackCanvas?: HTMLCanvasElement;
  hpCanvas?: HTMLCanvasElement;
  attackTex?: THREE.CanvasTexture;
  hpTex?: THREE.CanvasTexture;
  currentAtk?: number;
  currentHp?: number;
  baseAtk?: number;
  baseHp?: number;
  updateBadges?: (
    currentAtk: number,
    currentHp: number,
    baseAtk?: number,
    baseHp?: number,
    options?: { animateDamage?: boolean; animateBuff?: boolean },
  ) => void;
  disposeBadges?: () => void;
}

export function createCardMesh(
  card: CardDefinition,
  currentHp?: number,
  currentAtk?: number,
  baseAtk?: number,
  baseHp?: number,
): CardMeshData {
  const group = new THREE.Group();

  let curAtk = currentAtk ?? card.attack;
  let curHp  = currentHp ?? card.hp;
  let bAtk   = baseAtk ?? card.attack;
  let bHp    = baseHp ?? card.hp;

  // BoxGeometry: 6 faces; index 4 = front (+Z face = card face)
  const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_DEPTH, 1, 1, 1);

  const backCanvas = document.createElement("canvas");
  backCanvas.width = CW; backCanvas.height = CH;
  drawCardBack(backCanvas.getContext("2d")!);
  const backTex  = new THREE.CanvasTexture(backCanvas);
  backTex.colorSpace = THREE.SRGBColorSpace;

  const repoCard = cardRepo.getCard(card.id);
  const activeCard = repoCard ? { ...card, ...repoCard } : card;

  let frontCanvas = renderCardFaceCanvas(activeCard, curHp, curAtk, bAtk, bHp);
  let frontTex    = new THREE.CanvasTexture(frontCanvas);
  frontTex.colorSpace = THREE.SRGBColorSpace;

  const sideMat = new THREE.MeshStandardMaterial({ color: 0x16161c, roughness: 0.8 });
  const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.35, metalness: 0.04 });
  const materials: THREE.Material[] = [
    sideMat, sideMat, sideMat, sideMat,
    frontMat,   // front face (+Z)
    new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.45, metalness: 0.04 }), // back face (-Z)
  ];

  const bodyMesh = new THREE.Mesh(geo, materials);
  group.add(bodyMesh);
  group.userData["cardId"] = card.id;

  const applyArtwork = () => {
    const meta = cardRepo.getCard(card.id);
    const artUrl = (card as any).imageUrl || meta?.imageUrl;
    if (artUrl) {
      textures.applyToMaterial(frontMat, artUrl);
    }
  };
  applyArtwork();

  // ─────────────────────────────────────────────────────────────
  //  Dedicated 2D CanvasTextures for Badges (Approach A)
  // ─────────────────────────────────────────────────────────────
  let attackBadgeMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;
  let hpBadgeMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;
  let attackCanvas: HTMLCanvasElement | undefined;
  let hpCanvas: HTMLCanvasElement | undefined;
  let attackTex: THREE.CanvasTexture | undefined;
  let hpTex: THREE.CanvasTexture | undefined;

  if (card.type === CardType.Unit) {
    const badgeGeo = new THREE.PlaneGeometry(0.50, 0.50);

    // 1. Attack Badge (bottom-left)
    attackCanvas = document.createElement("canvas");
    attackCanvas.width = 128;
    attackCanvas.height = 128;
    drawDynamicAttackBadge(attackCanvas, curAtk, bAtk);
    attackTex = new THREE.CanvasTexture(attackCanvas);
    attackTex.colorSpace = THREE.SRGBColorSpace;

    const attackMat = new THREE.MeshBasicMaterial({
      map: attackTex,
      transparent: true,
      depthWrite: false,
    });
    attackBadgeMesh = new THREE.Mesh(badgeGeo, attackMat);
    attackBadgeMesh.position.set(-0.58, -0.94, CARD_DEPTH / 2 + 0.006);
    attackBadgeMesh.userData = { isBadge: true, type: "attack", cardId: card.id };
    group.add(attackBadgeMesh);

    // 2. HP Badge (bottom-right)
    hpCanvas = document.createElement("canvas");
    hpCanvas.width = 128;
    hpCanvas.height = 128;
    drawDynamicHpBadge(hpCanvas, curHp, bHp);
    hpTex = new THREE.CanvasTexture(hpCanvas);
    hpTex.colorSpace = THREE.SRGBColorSpace;

    const hpMat = new THREE.MeshBasicMaterial({
      map: hpTex,
      transparent: true,
      depthWrite: false,
    });
    hpBadgeMesh = new THREE.Mesh(badgeGeo, hpMat);
    hpBadgeMesh.position.set(0.58, -0.94, CARD_DEPTH / 2 + 0.006);
    hpBadgeMesh.userData = { isBadge: true, type: "hp", cardId: card.id };
    group.add(hpBadgeMesh);
  }

  function updateBadges(
    newAtk: number,
    newHp: number,
    baseAtkVal: number = bAtk,
    baseHpVal: number = bHp,
    options?: { animateDamage?: boolean; animateBuff?: boolean },
  ): void {
    const prevAtk = curAtk;
    const prevHp = curHp;
    curAtk = newAtk;
    curHp = newHp;
    bAtk = baseAtkVal;
    bHp = baseHpVal;

    // Redraw attack badge
    if (attackCanvas && attackTex) {
      drawDynamicAttackBadge(attackCanvas, curAtk, bAtk);
      attackTex.needsUpdate = true;
    }

    // Redraw HP badge
    if (hpCanvas && hpTex) {
      drawDynamicHpBadge(hpCanvas, curHp, bHp);
      hpTex.needsUpdate = true;
    }

    const allowAnim = options?.animateDamage ?? true;
    const allowBuffAnim = options?.animateBuff ?? true;

    // Polish & Visual Feedback (GSAP)
    // 1. When HP decreases:
    if (allowAnim && newHp < prevHp) {
      // Shake the unit mesh slightly
      gsap.to(group.position, {
        x: "+=0.05",
        yoyo: true,
        repeat: 3,
        duration: 0.05,
      });
      // Flash the HP badge red momentarily
      if (hpBadgeMesh) {
        gsap.fromTo(
          hpBadgeMesh.material.color,
          { r: 1, g: 0.15, b: 0.15 },
          { r: 1, g: 1, b: 1, duration: 0.45, ease: "power2.out" },
        );
      }
    }

    // 2. When HP increases (heal / max HP buff):
    if (allowBuffAnim && newHp > prevHp) {
      if (hpBadgeMesh) {
        // Scale the badge up by 1.25x and ease back to 1.0x with a green pulse glow
        hpBadgeMesh.scale.set(1.25, 1.25, 1.25);
        gsap.to(hpBadgeMesh.scale, {
          x: 1.0,
          y: 1.0,
          z: 1.0,
          duration: 0.35,
          ease: "back.out(2)",
        });
        gsap.fromTo(
          hpBadgeMesh.material.color,
          { r: 0.2, g: 1, b: 0.3 },
          { r: 1, g: 1, b: 1, duration: 0.45, ease: "power2.out" },
        );
      }
    }

    // 3. When Attack increases (equipment / spell / aura buff):
    if (allowBuffAnim && newAtk > prevAtk) {
      if (attackBadgeMesh) {
        // Scale the badge up by 1.25x and ease back to 1.0x with a green pulse glow
        attackBadgeMesh.scale.set(1.25, 1.25, 1.25);
        gsap.to(attackBadgeMesh.scale, {
          x: 1.0,
          y: 1.0,
          z: 1.0,
          duration: 0.35,
          ease: "back.out(2)",
        });
        gsap.fromTo(
          attackBadgeMesh.material.color,
          { r: 0.2, g: 1, b: 0.3 },
          { r: 1, g: 1, b: 1, duration: 0.45, ease: "power2.out" },
        );
      }
    } else if (allowAnim && newAtk < prevAtk) {
      // Debuff / lost aura: flash red
      if (attackBadgeMesh) {
        gsap.fromTo(
          attackBadgeMesh.material.color,
          { r: 1, g: 0.2, b: 0.2 },
          { r: 1, g: 1, b: 1, duration: 0.45, ease: "power2.out" },
        );
      }
    }
  }

  function disposeBadges(): void {
    if (attackTex) attackTex.dispose();
    if (hpTex) hpTex.dispose();
    if (attackBadgeMesh) {
      attackBadgeMesh.geometry.dispose();
      attackBadgeMesh.material.dispose();
    }
    if (hpBadgeMesh) {
      hpBadgeMesh.geometry.dispose();
      hpBadgeMesh.material.dispose();
    }
  }

  function updateTexture(
    hp?: number,
    atk?: number,
    baseAtkVal?: number,
    baseHpVal?: number,
  ): void {
    if (hp !== undefined) curHp = hp;
    if (atk !== undefined) curAtk = atk;
    if (baseAtkVal !== undefined) bAtk = baseAtkVal;
    if (baseHpVal !== undefined) bHp = baseHpVal;

    const meta = cardRepo.getCard(card.id);
    const c = meta ? { ...card, ...meta } : card;
    frontCanvas = renderCardFaceCanvas(c, curHp, curAtk, bAtk, bHp);
    frontTex.dispose();
    frontTex = new THREE.CanvasTexture(frontCanvas);
    frontTex.colorSpace = THREE.SRGBColorSpace;
    frontMat.map = frontTex;
    frontMat.needsUpdate = true;
    applyArtwork();

    // Also sync dynamic 3D badges
    updateBadges(curAtk, curHp, bAtk, bHp, { animateDamage: false, animateBuff: false });
  }

  // Hot-reload: refresh active 3D card texture immediately when CMS edits/publishes
  const unsubscribe = cardRepo.subscribe((cards) => {
    if (cards.has(card.id)) {
      updateTexture(curHp, curAtk, bAtk, bHp);
    }
  });
  group.userData["unsubscribeCardRepo"] = unsubscribe;
  group.userData["disposeBadges"] = disposeBadges;

  return {
    group,
    bodyMesh,
    updateTexture,
    card,
    attackBadgeMesh,
    hpBadgeMesh,
    attackCanvas,
    hpCanvas,
    attackTex,
    hpTex,
    currentAtk: curAtk,
    currentHp: curHp,
    baseAtk: bAtk,
    baseHp: bHp,
    updateBadges,
    disposeBadges,
  };
}

let sharedBackTex: THREE.CanvasTexture | null = null;

export function getSharedCardBackTexture(): THREE.CanvasTexture {
  if (!sharedBackTex) {
    const backCanvas = document.createElement("canvas");
    backCanvas.width = CW;
    backCanvas.height = CH;
    drawCardBack(backCanvas.getContext("2d")!);
    sharedBackTex = new THREE.CanvasTexture(backCanvas);
    sharedBackTex.colorSpace = THREE.SRGBColorSpace;
  }
  return sharedBackTex;
}

export function createFaceDownCardMesh(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_DEPTH, 1, 1, 1);
  const backTex = getSharedCardBackTexture();
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x16161c, roughness: 0.8 });
  const backMat = new THREE.MeshStandardMaterial({
    map: backTex,
    roughness: 0.42,
    metalness: 0.08,
  });

  const materials: THREE.Material[] = [
    sideMat, sideMat, sideMat, sideMat,
    backMat, // front face (+Z)
    backMat, // back face (-Z)
  ];

  const mesh = new THREE.Mesh(geo, materials);
  mesh.castShadow = true;
  return mesh;
}

// ─────────────────────────────────────────────────────────────
//  Internal drawing helpers
// ─────────────────────────────────────────────────────────────

export function drawCardBack(ctx: CanvasRenderingContext2D): void {
  const canvas = ctx.canvas;
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#1a0a30");
  bg.addColorStop(1, "#0a0618");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 14);
  ctx.fill();

  ctx.strokeStyle = "#6644aa";
  ctx.lineWidth   = 4;
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 12);
  ctx.stroke();

  // Pattern
  ctx.strokeStyle = "rgba(120, 80, 200, 0.15)";
  ctx.lineWidth   = 1;
  for (let i = 0; i < canvas.width; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(0, i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(canvas.width - i, canvas.height); ctx.lineTo(canvas.width, canvas.height - i); ctx.stroke();
  }

  // Center emblem
  ctx.fillStyle  = "rgba(150, 100, 255, 0.2)";
  ctx.font       = "64px Arial";
  ctx.textAlign  = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚡", canvas.width / 2, canvas.height / 2);
}

function drawAttackBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  val: number,
  baseVal?: number,
): void {
  const r = 16;
  const g = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy, r);
  g.addColorStop(0, "#ff9944");
  g.addColorStop(1, "#aa3300");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "#ff8844";
  ctx.lineWidth = 2;
  ctx.stroke();

  let textColor = "#fff";
  if (baseVal !== undefined) {
    if (val > baseVal) textColor = "#39ff14";
    else if (val < baseVal) textColor = "#ff4444";
  }
  ctx.fillStyle = textColor;
  ctx.font = "bold 13px 'Inter', Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(val), cx, cy + 1);
}

function drawHpBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  current: number,
  max: number,
  baseMax?: number,
): void {
  const r  = 16;
  const bMax = baseMax ?? max;
  const isDamaged = current < bMax;
  const isBuffed = current > bMax;
  const t  = current / Math.max(max, 1);
  const c1 = isDamaged ? "#ff4444" : isBuffed ? "#39ff14" : t > 0.5 ? "#44ee88" : t > 0.25 ? "#ffcc44" : "#ff4444";
  const c2 = isDamaged ? "#aa0000" : isBuffed ? "#1b8a36" : t > 0.5 ? "#229944" : t > 0.25 ? "#aa8800" : "#aa0000";
  const g  = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy, r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = c1;
  ctx.lineWidth = 2;
  ctx.stroke();

  let textColor = "#fff";
  if (isDamaged) textColor = "#ff3b30";
  else if (isBuffed) textColor = "#39ff14";

  ctx.fillStyle = textColor;
  ctx.font = "bold 12px 'Inter', Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(current), cx, cy + 1);
}

// ─────────────────────────────────────────────────────────────
//  Dedicated 128x128 dynamic badge drawing for 3D unit meshes
// ─────────────────────────────────────────────────────────────

export function drawDynamicAttackBadge(
  canvas: HTMLCanvasElement,
  currentAttack: number,
  baseAttack: number,
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);

  const cx = 64, cy = 64, r = 52;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();

  // Background: Circular gradient
  const bgGrad = ctx.createRadialGradient(cx, cy - 14, 6, cx, cy, r);
  bgGrad.addColorStop(0, "#4a1c0d");
  bgGrad.addColorStop(0.7, "#280a04");
  bgGrad.addColorStop(1, "#120401");
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Glowing border
  ctx.shadowColor = "#ff7722";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "#ff8833";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner metallic rim
  ctx.strokeStyle = "rgba(255, 210, 140, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
  ctx.stroke();

  // Sword icon for ATK
  ctx.font = "20px 'Segoe UI Emoji', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 170, 70, 0.9)";
  ctx.fillText("⚔", cx, 30);

  // Dynamic Text Color Rules:
  // White (Base), Green (currentAttack > baseAttack), Red (currentAttack < baseAttack)
  let textColor = "#ffffff";
  let textShadow = "rgba(255, 255, 255, 0.5)";
  if (currentAttack > baseAttack) {
    textColor = "#39ff14"; // Green
    textShadow = "rgba(57, 255, 20, 0.85)";
  } else if (currentAttack < baseAttack) {
    textColor = "#ff3b30"; // Red
    textShadow = "rgba(255, 59, 48, 0.85)";
  }

  ctx.font = "bold 52px 'Inter', Arial, sans-serif";
  ctx.shadowColor = textShadow;
  ctx.shadowBlur = 12;
  ctx.fillStyle = textColor;
  ctx.fillText(String(currentAttack), cx, 78);

  ctx.restore();
}

export function drawDynamicHpBadge(
  canvas: HTMLCanvasElement,
  currentHp: number,
  baseHp: number,
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);

  const cx = 64, cy = 64, r = 52;
  const isDamaged = currentHp < baseHp;
  const isBuffed = currentHp > baseHp;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();

  // Background: Circular gradient
  const bgGrad = ctx.createRadialGradient(cx, cy - 14, 6, cx, cy, r);
  if (isDamaged) {
    bgGrad.addColorStop(0, "#440d0d");
    bgGrad.addColorStop(0.7, "#240404");
    bgGrad.addColorStop(1, "#120202");
  } else {
    bgGrad.addColorStop(0, "#0e3d1c");
    bgGrad.addColorStop(0.7, "#06240f");
    bgGrad.addColorStop(1, "#021207");
  }
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Glowing border
  const ringColor = isDamaged ? "#ff3b30" : isBuffed ? "#39ff14" : "#44ee88";
  ctx.shadowColor = ringColor;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner metallic rim
  ctx.strokeStyle = isDamaged ? "rgba(255, 160, 160, 0.4)" : "rgba(180, 255, 200, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
  ctx.stroke();

  // Heart icon for HP
  ctx.font = "20px 'Segoe UI Emoji', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isDamaged ? "rgba(255, 90, 90, 0.9)" : "rgba(80, 240, 140, 0.9)";
  ctx.fillText("♥", cx, 30);

  // Dynamic Text Color Rules:
  // White (Base/Full), Red (currentHp < baseHp), Green (Overmax/Buffed)
  let textColor = "#ffffff";
  let textShadow = "rgba(255, 255, 255, 0.5)";
  if (isDamaged) {
    textColor = "#ff3b30";
    textShadow = "rgba(255, 59, 48, 0.85)";
  } else if (isBuffed) {
    textColor = "#39ff14";
    textShadow = "rgba(57, 255, 20, 0.85)";
  }

  ctx.font = "bold 52px 'Inter', Arial, sans-serif";
  ctx.shadowColor = textShadow;
  ctx.shadowBlur = 12;
  ctx.fillStyle = textColor;
  ctx.fillText(String(currentHp), cx, 78);

  ctx.restore();
}

function tribeGradientColors(tribe: string): [string, string] {
  const map: Record<string, [string, string]> = {
    Plant:     ["#1a5a1a", "#0a2a0a"],
    Zombie:    ["#3a1a5a", "#1a0a2a"],
    Amphibian: ["#1a3a6a", "#0a1a3a"],
    Aerial:    ["#1a4a7a", "#0a2040"],
    Vanguard:  ["#6a4a10", "#302008"],
    Aquatic:   ["#0a4a60", "#052030"],
    Tempo:     ["#4a1a6a", "#200830"],
    Control:   ["#1a2a6a", "#0a1030"],
  };
  return map[tribe] ?? ["#2a2a3a", "#1a1a28"];
}

function typeEmoji(type: CardType): string {
  const m: Record<string, string> = {
    UNIT: "🛡", SPELL: "✨", EQUIPMENT: "⚙", ENVIRONMENT: "🌿", HERO_ABILITY: "⚡",
  };
  return m[type] ?? "?";
}

function cardArtEmoji(card: CardDefinition): string {
  const n = card.name.toLowerCase();
  if (n.includes("sky strike")) return "🦅";
  if (n.includes("aerial")) return "🪽";
  if (n.includes("tailwind")) return "💨";
  if (n.includes("glacial") || n.includes("gale") || n.includes("frost")) return "❄️";
  if (n.includes("tidal") || n.includes("wave")) return "🌊";
  if (n.includes("soothing") || n.includes("current")) return "💧";
  if (n.includes("coral") || n.includes("aegis")) return "🛡️";
  if (n.includes("elemental")) return "🌀";
  if (n.includes("pea")) return "🌿";
  if (n.includes("sunflower")) return "🌻";
  if (n.includes("lightning") || n.includes("zap") || n.includes("bolt")) return "⚡";
  if (n.includes("chomper")) return "🐊";
  if (n.includes("tall-nut") || n.includes("wall-nut")) return "🌰";
  if (n.includes("lily")) return "🪷";
  if (n.includes("roto") || n.includes("copter")) return "🚁";
  if (n.includes("thistle")) return "🌵";
  if (n.includes("bucket")) return "🪣";
  if (n.includes("cone")) return "⚠️";
  if (n.includes("football") || n.includes("all-star")) return "🏈";
  if (n.includes("imp")) return "😈";
  if (n.includes("gargantuar")) return "👹";
  if (n.includes("grave")) return "🪦";
  if (n.includes("bungee")) return "🪂";
  if (n.includes("smoke")) return "💨";
  if (n.includes("toxic") || n.includes("poison")) return "☣️";
  if (n.includes("rain") || n.includes("water")) return "🌧️";
  if (n.includes("fertilizer") || n.includes("potion")) return "🧪";
  if (n.includes("time") || n.includes("warp") || n.includes("slayer")) return "⏳";
  
  const tribes = getCardTribes(card);
  for (const tr of tribes) {
    if (tr === "ปัญญา") return "🧠";
    if (tr === "จอมพล") return "👑";
    if (tr === "จู่โจม") return "⚔️";
    if (tr === "รักษา") return "💖";
    if (tr === "พิทักษ์") return "🛡️";
    if (tr === "ยุทธศาสตร์") return "📜";
    if (tr === "จอมอาคม") return "✨";
    if (tr === "เป็นกลาง") return "⚪";
    if (tr === "Aerial") return "🦅";
    if (tr === "Aquatic") return "🌊";
    if (tr === "Vanguard") return "⚔️";
    if (tr === "Plant") return "🌱";
    if (tr === "Zombie") return "🧟";
    if (tr === "Amphibian") return "🐸";
  }
  return typeEmoji(card.type);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  font: string,
): string[] {
  ctx.font = font;
  const words  = text.split(" ");
  const lines: string[] = [];
  let   cur    = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

// ─────────────────────────────────────────────────────────────
//  Big Card Preview (Pinned Left Panel)
// ─────────────────────────────────────────────────────────────

export interface LiveUnitPreviewData {
  card: CardDefinition;
  unit: UnitInstance;
}

export function showBigCardPreview(target: CardDefinition | LiveUnitPreviewData | null): void {
  const panel = document.getElementById("big-card-preview");
  if (!panel) return;
  if (!target) {
    panel.classList.remove("visible");
    return;
  }

  const isLive = "unit" in target;
  const card: CardDefinition = isLive ? target.card : target;
  const liveUnit: UnitInstance | null = isLive ? target.unit : null;

  const costEl  = document.getElementById("prev-cost");
  const tribeEl = document.getElementById("prev-tribe");
  const nameEl  = document.getElementById("prev-name");
  const metaEl  = document.getElementById("prev-meta");
  const kwEl    = document.getElementById("prev-keywords");
  const textEl  = document.getElementById("prev-text");
  const statsEl = document.getElementById("prev-stats");
  const atkEl   = document.getElementById("prev-atk");
  const hpEl    = document.getElementById("prev-hp");

  const primaryTribe = getCardPrimaryTribe(card);
  const cardTribes = getCardTribes(card);
  const borderCol = tribeCss(primaryTribe);
  panel.style.setProperty("--prev-border", borderCol);
  panel.style.setProperty("--prev-glow", `${borderCol}55`);
  panel.style.setProperty("--cost-color", costColor(card.cost));

  if (costEl) costEl.textContent = String(card.cost);
  if (tribeEl) {
    tribeEl.textContent = cardTribes.join(" / ");
    tribeEl.style.borderColor = borderCol;
    tribeEl.style.color = borderCol;
  }
  if (nameEl) nameEl.textContent = card.name;

  // Real-time art display
  let artEl = document.getElementById("prev-art");
  if (!artEl && metaEl && metaEl.parentElement) {
    artEl = document.createElement("div");
    artEl.id = "prev-art";
    artEl.className = "prev-art";
    metaEl.insertAdjacentElement("afterend", artEl);
  }
  if (artEl) {
    const cardMeta = cardRepo.getCard(card.id);
    const artUrl = (card as any).imageUrl || cardMeta?.imageUrl;
    const [c1, c2] = tribeGradientColors(primaryTribe);
    artEl.style.borderColor = borderCol;
    if (artUrl) {
      artEl.style.background = `radial-gradient(circle at center, ${c1}33, ${c2}55)`;
      artEl.innerHTML = `<img src="${artUrl}" alt="${card.name}" style="width:100%;height:100%;object-fit:cover;object-position:center;border-radius:10px;" />`;
    } else {
      artEl.style.background = `radial-gradient(circle at center, ${c1}dd, ${c2}f0)`;
      artEl.innerHTML = `<span style="font-size:52px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6));">${cardArtEmoji(card)}</span>`;
    }
  }

  if (metaEl) {
    if (liveUnit) {
      const isPlayer = liveUnit.ownerId === PlayerId.Player;
      const side = isPlayer ? "Friendly" : "Enemy";
      const slotName = liveUnit.isSupport ? "Support (Backline)" : "Frontline";
      const laneLabels = ["Lane 1 (Aerial)", "Lane 2 (Ground)", "Lane 3 (Ground)", "Lane 4 (Water)"];
      const laneName = laneLabels[liveUnit.laneIndex] ?? `Lane ${liveUnit.laneIndex + 1}`;
      metaEl.textContent = `${side} Unit · ${laneName} · ${slotName}`;
      metaEl.style.color = isPlayer ? "#86efac" : "#fca5a5";
    } else {
      const laneReq = card.laneTypeRestriction ? ` · ${card.laneTypeRestriction}` : "";
      metaEl.textContent = `${card.type}${laneReq}`;
      metaEl.style.color = "#cbd5e1";
    }
  }

  if (kwEl) {
    kwEl.innerHTML = "";
    const activeKeywords = liveUnit ? liveUnit.keywords : card.keywords;
    for (const kw of activeKeywords) {
      const tag = document.createElement("span");
      tag.className = "kw-tag";
      tag.textContent = keywordAbbr(kw);
      kwEl.appendChild(tag);
    }

    if (liveUnit) {
      if (liveUnit.isFrozen) {
        const tag = document.createElement("span");
        tag.className = "kw-tag";
        tag.style.background = "rgba(59, 130, 246, 0.35)";
        tag.style.borderColor = "#60a5fa";
        tag.style.color = "#bfdbfe";
        tag.textContent = "❄️ FROZEN";
        kwEl.appendChild(tag);
      }
      if (liveUnit.hasShield) {
        const tag = document.createElement("span");
        tag.className = "kw-tag";
        tag.style.background = "rgba(245, 158, 11, 0.35)";
        tag.style.borderColor = "#fbbf24";
        tag.style.color = "#fef08a";
        tag.textContent = "🛡️ SHIELD";
        kwEl.appendChild(tag);
      }
      if (liveUnit.isDeadly) {
        const tag = document.createElement("span");
        tag.className = "kw-tag";
        tag.style.background = "rgba(225, 29, 72, 0.35)";
        tag.style.borderColor = "#f43f5e";
        tag.style.color = "#fecdd3";
        tag.textContent = "☠️ DEADLY";
        kwEl.appendChild(tag);
      }
      if (liveUnit.isSupport) {
        const tag = document.createElement("span");
        tag.className = "kw-tag";
        tag.style.background = "rgba(147, 51, 234, 0.35)";
        tag.style.borderColor = "#c084fc";
        tag.style.color = "#f3e8ff";
        tag.textContent = "🤝 SUPPORT";
        kwEl.appendChild(tag);
      }
      if (liveUnit.auraModifiers && liveUnit.auraModifiers.length > 0) {
        const totalAtk = liveUnit.auraModifiers.reduce((acc, m) => acc + m.attackBonus, 0);
        const totalHp = liveUnit.auraModifiers.reduce((acc, m) => acc + m.hpBonus, 0);
        const tag = document.createElement("span");
        tag.className = "kw-tag";
        tag.style.background = "rgba(234, 179, 8, 0.35)";
        tag.style.borderColor = "#facc15";
        tag.style.color = "#fef9c3";
        tag.textContent = `✨ AURA (+${totalAtk}/+${totalHp})`;
        kwEl.appendChild(tag);
      }
      if (liveUnit.auraEffect) {
        const tag = document.createElement("span");
        tag.className = "kw-tag";
        tag.style.background = "rgba(245, 158, 11, 0.3)";
        tag.style.borderColor = "#f59e0b";
        tag.style.color = "#fef08a";
        tag.textContent = "👑 AURA PROVIDER";
        kwEl.appendChild(tag);
      }
      if (liveUnit.attachedEquipment && liveUnit.attachedEquipment.length > 0) {
        for (const eq of liveUnit.attachedEquipment) {
          const tag = document.createElement("span");
          tag.className = "kw-tag";
          tag.style.background = "rgba(6, 182, 212, 0.35)";
          tag.style.borderColor = "#22d3ee";
          tag.style.color = "#cffafe";
          tag.textContent = `⚙️ ${eq.name.toUpperCase()}`;
          kwEl.appendChild(tag);
        }
      }
    }
  }

  if (textEl) {
    let desc = card.text ?? "";
    if (liveUnit) {
      if (liveUnit.attachedEquipment.length > 0) {
        const eqNames = liveUnit.attachedEquipment.map((e) => e.name).join(", ");
        desc += `\nGear: ${eqNames}`;
      }
      if (liveUnit.auraModifiers && liveUnit.auraModifiers.length > 0) {
        const auraDescs = liveUnit.auraModifiers
          .map((m) => `Aura (+${m.attackBonus}/+${m.hpBonus})`)
          .join(", ");
        desc += `\nAuras: ${auraDescs}`;
      }
    } else {
      if (card.equipmentEffect) {
        desc += `\nBuffs: +${card.equipmentEffect.attackBonus}/+${card.equipmentEffect.hpBonus}`;
      }
      if (card.environmentEffect?.damagePerTurnEnd) {
        desc += `\nDeals ${card.environmentEffect.damagePerTurnEnd} damage to all units in lane at turn end.`;
      }
    }
    
    // Highlight key keywords with strong tag
    const safeDesc = desc || "No additional rules.";
    const formattedDesc = safeDesc.replace(
      /\b(Rush|Strikethrough|Double Strike|DoubleStrike|Flying|Amphibious|Support|Deathrattle|Aura|Shield|Frozen|Deadly|Piercing)\b/gi,
      '<strong class="kw-highlight">$1</strong>',
    );
    textEl.innerHTML = formattedDesc;
  }

  if (statsEl) {
    if (card.type === CardType.Unit) {
      statsEl.style.display = "flex";
      const atkBox = atkEl ? (atkEl.parentElement as HTMLElement) : null;
      const hpBox = hpEl ? (hpEl.parentElement as HTMLElement) : null;

      if (liveUnit) {
        const baseAtk = card.attack;
        const curAtk = liveUnit.attack;
        const baseHp = card.hp;
        const curHp = liveUnit.currentHp;
        const maxHp = liveUnit.maxHp;

        // Visual Stat Highlights: If currentAttack > baseAttack, show text in green
        if (atkEl && atkBox) {
          if (curAtk > baseAtk) {
            atkEl.innerHTML = `${curAtk} <span style="font-size:12px;font-weight:700;color:#4ade80">(+${curAtk - baseAtk})</span>`;
            atkEl.style.color = "#4ade80";
            atkBox.style.borderColor = "#22c55e";
            atkBox.style.background = "rgba(34, 197, 94, 0.28)";
            atkBox.style.color = "#86efac";
          } else if (curAtk < baseAtk) {
            atkEl.innerHTML = `${curAtk} <span style="font-size:12px;font-weight:700;color:#f87171">(-${baseAtk - curAtk})</span>`;
            atkEl.style.color = "#f87171";
            atkBox.style.borderColor = "#ef4444";
            atkBox.style.background = "rgba(239, 68, 68, 0.28)";
            atkBox.style.color = "#fca5a5";
          } else {
            atkEl.textContent = String(curAtk);
            atkEl.style.color = "#ffaa66";
            atkBox.style.borderColor = "#ff7733";
            atkBox.style.background = "rgba(180, 60, 20, 0.35)";
            atkBox.style.color = "#ffaa66";
          }
        }

        // Visual Stat Highlights: If currentHp < baseHp, show text in red
        if (hpEl && hpBox) {
          if (curHp < baseHp) {
            hpEl.innerHTML = `${curHp}/${maxHp} <span style="font-size:12px;font-weight:700;color:#f87171">(-${baseHp - curHp})</span>`;
            hpEl.style.color = "#f87171";
            hpBox.style.borderColor = "#ef4444";
            hpBox.style.background = "rgba(239, 68, 68, 0.28)";
            hpBox.style.color = "#fca5a5";
          } else if (curHp > baseHp) {
            hpEl.innerHTML = `${curHp}/${maxHp} <span style="font-size:12px;font-weight:700;color:#4ade80">(+${curHp - baseHp})</span>`;
            hpEl.style.color = "#4ade80";
            hpBox.style.borderColor = "#22c55e";
            hpBox.style.background = "rgba(34, 197, 94, 0.28)";
            hpBox.style.color = "#86efac";
          } else {
            hpEl.textContent = `${curHp}/${maxHp}`;
            hpEl.style.color = "#66ff99";
            hpBox.style.borderColor = "#33dd66";
            hpBox.style.background = "rgba(20, 140, 60, 0.35)";
            hpBox.style.color = "#66ff99";
          }
        }
      } else {
        if (atkEl && atkBox) {
          atkEl.textContent = String(card.attack);
          atkEl.style.color = "#ffaa66";
          atkBox.style.borderColor = "#ff7733";
          atkBox.style.background = "rgba(180, 60, 20, 0.35)";
          atkBox.style.color = "#ffaa66";
        }
        if (hpEl && hpBox) {
          hpEl.textContent = String(card.hp);
          hpEl.style.color = "#66ff99";
          hpBox.style.borderColor = "#33dd66";
          hpBox.style.background = "rgba(20, 140, 60, 0.35)";
          hpBox.style.color = "#66ff99";
        }
      }
    } else {
      statsEl.style.display = "none";
    }
  }

  panel.classList.add("visible");
}

export function hideBigCardPreview(): void {
  const panel = document.getElementById("big-card-preview");
  if (panel) panel.classList.remove("visible");
}

