// ============================================================
//  Board.ts — 3D board: table, 4 distinct lanes, 2 sub-slots
//  (Frontline & Support), mist particles, water shader
// ============================================================

import * as THREE from "three";
import {
  LANE_COUNT, LANE_WIDTH, LANE_HALF_LEN, LANE_X, BOARD_HALF_W,
  LANE_COLOR, LANE_EMISSIVE, COLOR_VALID_SLOT, COLOR_INVALID_SLOT,
  PLAYER_FRONTLINE_Z, PLAYER_SUPPORT_Z, OPP_FRONTLINE_Z, OPP_SUPPORT_Z,
  Z_TABLE, Z_LANE, Z_SLOT,
} from "./visualConstants";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface SlotMesh {
  laneIndex:   number;
  isPlayer:    boolean;
  slotType:    "frontline" | "support" | "environment";
  worldX:      number;
  worldZ:      number;
  marker:      THREE.Mesh;
  badgeMesh?:  THREE.Mesh;
}

export interface BoardResult {
  group:            THREE.Group;
  slotMeshes:       SlotMesh[];           // frontline, support, and central environment slots
  laneFloorMeshes:  THREE.Mesh[];
  setSlotHighlight(
    laneIndex: number,
    isPlayer: boolean,
    state: "valid" | "invalid" | "off",
    slotType?: "frontline" | "support" | "environment",
  ): void;
  setLaneFloorHighlight(
    laneIndex: number,
    state: "valid" | "invalid" | "off",
  ): void;
  cloudGroups:      THREE.Group[];        // aerial lane floating clouds
  mistParticles:    THREE.Points;         // Lane 0 mist particle system
  waterMaterial:    THREE.MeshStandardMaterial; // animated UV ripple material
  update(delta: number): void;
  updateUnitBadges?(
    unitInstanceId: string,
    currentAtk: number,
    currentHp: number,
    baseAtk: number,
    baseHp: number,
    options?: { animateDamage?: boolean; animateBuff?: boolean },
  ): void;
}

// ─────────────────────────────────────────────────────────────
//  Board factory
// ─────────────────────────────────────────────────────────────

export function createBoard(scene: THREE.Scene): BoardResult {
  const group = new THREE.Group();
  scene.add(group);

  // ── Table base ────────────────────────────────────────────────
  const tableGeo = new THREE.BoxGeometry(
    BOARD_HALF_W * 2 + 1.6,
    0.28,
    LANE_HALF_LEN * 2 + 2.8,
  );
  const tableMat = new THREE.MeshStandardMaterial({
    color:     0x0b0714,
    roughness: 0.9,
    metalness: 0.08,
  });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.set(0, -0.14, 0);
  table.receiveShadow = true;
  group.add(table);

  // Outer border with rich rune gold trim
  addEdgeTrim(group);

  // ── Midfield clash divider (Arcane Energy & Gold Trim) ─────────
  const clashGroup = createClashDivider();
  group.add(clashGroup);

  // ── 4 Visually Distinct Lanes ─────────────────────────────────
  let waterMat!: THREE.MeshStandardMaterial;
  const cloudGroups: THREE.Group[] = [];
  const laneFloorMeshes: THREE.Mesh[] = [];
  const laneBorderMeshes: THREE.Mesh[] = [];
  const combatArrows: THREE.Mesh[] = [];

  for (let i = 0; i < LANE_COUNT; i++) {
    const isAerial = i === 0;
    const isWater  = i === 3;
    const isGround = i === 1 || i === 2;

    const laneY = isAerial ? 0.22 : Z_LANE; // Aerial floating sky platform
    const laneGeo = new THREE.PlaneGeometry(LANE_WIDTH - 0.08, LANE_HALF_LEN * 2 - 0.08);
    const laneMat = new THREE.MeshStandardMaterial({
      color:     LANE_COLOR[i],
      emissive:  new THREE.Color(LANE_EMISSIVE[i]),
      emissiveIntensity: 0.35,
      roughness: isWater ? 0.1 : 0.8,
      metalness: isWater ? 0.3 : 0.1,
      transparent: isWater,
      opacity: isWater ? 0.88 : 1.0,
    });

    const laneMesh = new THREE.Mesh(laneGeo, laneMat);
    laneMesh.rotation.x = -Math.PI / 2;
    laneMesh.position.set(LANE_X[i], laneY, 0);
    laneMesh.receiveShadow = true;
    laneMesh.userData = { isLaneFloor: true, laneIndex: i };
    group.add(laneMesh);
    laneFloorMeshes.push(laneMesh);

    // Glowing border outline for environment drop feedback
    const borderGeo = new THREE.PlaneGeometry(LANE_WIDTH - 0.04, LANE_HALF_LEN * 2 - 0.04);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.rotation.x = -Math.PI / 2;
    borderMesh.position.set(LANE_X[i], laneY + 0.003, 0);
    group.add(borderMesh);
    laneBorderMeshes.push(borderMesh);

    // ── Directional Combat Indicator Chevrons (pointing from Player to Opponent) ──
    const arrowMesh = createLaneCombatArrows(LANE_X[i], isAerial ? 0.23 : 0.022);
    group.add(arrowMesh);
    combatArrows.push(arrowMesh);

    // ── Lane 0: Aerial Floating Sky Platform ───────────────────
    if (isAerial) {
      laneMat.map = createSkyTexture();
      // Floating platform base slab
      const slabGeo = new THREE.BoxGeometry(LANE_WIDTH - 0.06, 0.22, LANE_HALF_LEN * 2 - 0.06);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x243b55,
        roughness: 0.7,
        metalness: 0.2,
      });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(LANE_X[i], 0.11, 0);
      group.add(slab);

      // Gold sky border
      addPlatformTrim(group, LANE_X[i], 0.225);

      // Floating clouds
      const cg = createCloudGroup(LANE_X[i]);
      group.add(cg);
      cloudGroups.push(cg);
    }

    // ── Lane 1 & 2: Grassy / Stone Terrain ────────────────────
    if (isGround) {
      laneMat.map = createGrassStoneTexture(i === 1 ? "#1b4d24" : "#245229");
      addStoneAccents(group, LANE_X[i]);
    }

    // ── Lane 3: Blue Transparent Water Surface ────────────────
    if (isWater) {
      laneMat.map = createWaterTexture();
      waterMat = laneMat;

      // Riverbed underneath
      const bedGeo = new THREE.PlaneGeometry(LANE_WIDTH - 0.08, LANE_HALF_LEN * 2 - 0.08);
      const bedMat = new THREE.MeshStandardMaterial({ color: 0x051025, roughness: 0.9 });
      const bed = new THREE.Mesh(bedGeo, bedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(LANE_X[i], -0.05, 0);
      group.add(bed);
    }

    // Vertical separator with metallic bevel and runic dots
    if (i < LANE_COUNT - 1) {
      const sepX = LANE_X[i] + LANE_WIDTH / 2;
      addLaneDivider(group, sepX);
    }

    // Lane header badge
    addLaneLabel(group, i, LANE_X[i], isAerial ? 0.24 : 0.02);
  }

  // ── Lane 0 Mist Particle System ──────────────────────────────
  const mistParticles = createMistParticles(LANE_X[0]);
  group.add(mistParticles);

  // ── 2 Sub-Slots per Side per Lane (Frontline & Support) ───────
  const slotMeshes: SlotMesh[] = [];

  for (let i = 0; i < LANE_COUNT; i++) {
    const isAerial = i === 0;
    const baseElevation = isAerial ? 0.23 : Z_SLOT;

    // Player sub-slots
    const pFront = createSubSlotMesh(i, true, "frontline", LANE_X[i], PLAYER_FRONTLINE_Z, baseElevation);
    const pSupp  = createSubSlotMesh(i, true, "support",   LANE_X[i], PLAYER_SUPPORT_Z,   baseElevation);
    group.add(pFront.marker);
    group.add(pSupp.marker);
    slotMeshes.push(pFront, pSupp);

    // Opponent sub-slots
    const oFront = createSubSlotMesh(i, false, "frontline", LANE_X[i], OPP_FRONTLINE_Z, baseElevation);
    const oSupp  = createSubSlotMesh(i, false, "support",   LANE_X[i], OPP_SUPPORT_Z,   baseElevation);
    group.add(oFront.marker);
    group.add(oSupp.marker);
    slotMeshes.push(oFront, oSupp);
  }

  // ── Dedicated Central Environment Slots (Lanes 1 & 2 Ground) ────
  for (const envLaneIdx of [1, 2]) {
    const envSlot = createEnvironmentSlotMesh(envLaneIdx, LANE_X[envLaneIdx], 0, 0.026);
    group.add(envSlot.marker);
    slotMeshes.push(envSlot);
  }

  // ── API: Set Slot Highlight ──────────────────────────────────
  function setSlotHighlight(
    laneIndex: number,
    isPlayer: boolean,
    state: "valid" | "invalid" | "off",
    slotType?: "frontline" | "support" | "environment",
  ): void {
    const matches = slotMeshes.filter(
      (s) =>
        s.laneIndex === laneIndex &&
        (s.slotType === "environment" || s.isPlayer === isPlayer) &&
        (slotType === undefined || s.slotType === slotType),
    );

    for (const slot of matches) {
      const mat = slot.marker.material as THREE.MeshBasicMaterial;
      switch (state) {
        case "valid":
          mat.color.setHex(slot.slotType === "environment" ? 0x10b981 : COLOR_VALID_SLOT);
          mat.opacity = 0.82;
          break;
        case "invalid":
          mat.color.setHex(COLOR_INVALID_SLOT);
          mat.opacity = 0.65;
          break;
        case "off":
        default:
          if (slot.slotType === "frontline") {
            mat.color.setHex(0x4a9eff);
            mat.opacity = 0.32;
          } else if (slot.slotType === "support") {
            mat.color.setHex(0xab7fff);
            mat.opacity = 0.32;
          } else {
            mat.color.setHex(0x059669);
            mat.opacity = 0.42;
          }
      }
    }
  }

  // ── API: Set Lane Floor Highlight (Emissive Glow for Environment Targeting) ──
  function setLaneFloorHighlight(
    laneIndex: number,
    state: "valid" | "invalid" | "off",
  ): void {
    const laneMesh = laneFloorMeshes[laneIndex];
    const borderMesh = laneBorderMeshes[laneIndex];
    if (!laneMesh) return;
    const mat = laneMesh.material as THREE.MeshStandardMaterial;
    const bMat = borderMesh?.material as THREE.MeshBasicMaterial;

    if (state === "valid") {
      mat.emissive.setHex(0x10b981); // Radiant emerald/cyan glow
      mat.emissiveIntensity = 0.88;
      if (bMat) {
        bMat.color.setHex(0x34d399);
        bMat.opacity = 0.95;
      }
    } else if (state === "invalid") {
      mat.emissive.setHex(0xef4444); // Reddish rejection glow
      mat.emissiveIntensity = 0.65;
      if (bMat) {
        bMat.color.setHex(0xf87171);
        bMat.opacity = 0.8;
      }
    } else {
      mat.emissive.setHex(LANE_EMISSIVE[laneIndex]);
      mat.emissiveIntensity = 0.35;
      if (bMat) {
        bMat.opacity = 0;
      }
    }
  }

  // ── Per-Frame Update (Water Waves, Mist Motion & Combat Arrows) ─────
  let time = 0;
  function update(delta: number): void {
    time += delta;
    if (waterMat && waterMat.map) {
      waterMat.map.offset.y = (time * 0.06) % 1;
      waterMat.map.offset.x = Math.sin(time * 0.4) * 0.02;
    }

    // Mist particle drifting
    const pos = mistParticles.geometry.attributes.position as THREE.BufferAttribute;
    const count = pos.count;
    for (let j = 0; j < count; j++) {
      let y = pos.getY(j) + delta * 0.25;
      if (y > 2.2) y = 0.25;
      pos.setY(j, y);
    }
    pos.needsUpdate = true;

    // Cloud swaying
    for (let c = 0; c < cloudGroups.length; c++) {
      cloudGroups[c].position.z = Math.sin(time * 0.3 + c) * 0.35;
    }

    // Directional combat arrow pulsing
    const arrowPulse = 0.28 + Math.sin(time * 3.2) * 0.18;
    for (const arrow of combatArrows) {
      const aMat = arrow.material as THREE.MeshBasicMaterial;
      if (aMat) {
        aMat.opacity = Math.max(0.1, arrowPulse);
      }
    }
  }

  return {
    group,
    slotMeshes,
    laneFloorMeshes,
    setSlotHighlight,
    setLaneFloorHighlight,
    cloudGroups,
    mistParticles,
    waterMaterial: waterMat,
    update,
  };
}

// ─────────────────────────────────────────────────────────────
//  Internal Helpers: Sub-Slot Mesh Factory
// ─────────────────────────────────────────────────────────────

function createSubSlotMesh(
  laneIndex: number,
  isPlayer: boolean,
  slotType: "frontline" | "support",
  worldX: number,
  worldZ: number,
  elevation: number,
): SlotMesh {
  const isFront = slotType === "frontline";
  const w = LANE_WIDTH - 0.32;
  const h = 2.15;

  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 180;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 256, 180);

  // Base slot frame
  ctx.strokeStyle = isFront ? "rgba(74, 158, 255, 0.85)" : "rgba(171, 127, 255, 0.75)";
  ctx.lineWidth = 4;
  if (!isFront) {
    ctx.setLineDash([8, 6]);
  }
  ctx.strokeRect(6, 6, 244, 168);
  ctx.setLineDash([]);

  // Corner brackets
  ctx.fillStyle = isFront ? "#4a9eff" : "#ab7fff";
  const cSize = 12;
  ctx.fillRect(4, 4, cSize, 4);
  ctx.fillRect(4, 4, 4, cSize);
  ctx.fillRect(252 - cSize, 4, cSize, 4);
  ctx.fillRect(248, 4, 4, cSize);
  ctx.fillRect(4, 172, cSize, 4);
  ctx.fillRect(4, 176 - cSize, 4, cSize);
  ctx.fillRect(252 - cSize, 172, cSize, 4);
  ctx.fillRect(248, 176 - cSize, 4, cSize);

  // Badge pill
  ctx.fillStyle = isFront ? "rgba(20, 60, 120, 0.7)" : "rgba(60, 25, 100, 0.7)";
  ctx.beginPath();
  ctx.roundRect(48, 72, 160, 36, 18);
  ctx.fill();
  ctx.strokeStyle = isFront ? "#4a9eff" : "#ab7fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Badge Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isFront ? "FRONTLINE" : "SUPPORT", 128, 90);

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    color: isFront ? 0x4a9eff : 0xab7fff,
  });

  const marker = new THREE.Mesh(geo, mat);
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(worldX, elevation, worldZ);

  return {
    laneIndex,
    isPlayer,
    slotType,
    worldX,
    worldZ,
    marker,
  };
}

function createEnvironmentSlotMesh(
  laneIndex: number,
  worldX: number,
  worldZ: number,
  elevation: number,
): SlotMesh {
  const w = LANE_WIDTH - 0.28;
  const h = 1.45;

  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 140;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 140);

  // Emerald Nature Rune frame
  ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 6]);
  ctx.strokeRect(6, 6, 244, 128);
  ctx.setLineDash([]);

  // Corner brackets
  ctx.fillStyle = "#10b981";
  const cSize = 14;
  ctx.fillRect(4, 4, cSize, 4);
  ctx.fillRect(4, 4, 4, cSize);
  ctx.fillRect(252 - cSize, 4, cSize, 4);
  ctx.fillRect(248, 4, 4, cSize);
  ctx.fillRect(4, 132, cSize, 4);
  ctx.fillRect(4, 136 - cSize, 4, cSize);
  ctx.fillRect(252 - cSize, 132, cSize, 4);
  ctx.fillRect(248, 136 - cSize, 4, cSize);

  // Central Badge pill
  ctx.fillStyle = "rgba(6, 78, 59, 0.85)";
  ctx.beginPath();
  ctx.roundRect(40, 50, 176, 38, 19);
  ctx.fill();
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Badge Text
  ctx.fillStyle = "#ecfdf5";
  ctx.font = "bold 16px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🌿 ENVIRONMENT", 128, 69);

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    color: 0x059669,
  });

  const marker = new THREE.Mesh(geo, mat);
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(worldX, elevation, worldZ);
  marker.userData = { isEnvironmentSlot: true, laneIndex };

  return {
    laneIndex,
    isPlayer: true,
    slotType: "environment",
    worldX,
    worldZ,
    marker,
  };
}

// ─────────────────────────────────────────────────────────────
//  Environment Textures & Detail VFX
// ─────────────────────────────────────────────────────────────

function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0,   "#1a3b5c");
  grad.addColorStop(0.5, "#25537d");
  grad.addColorStop(1,   "#1a3b5c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Soft sky cloud whisps
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (let i = 0; i < 12; i++) {
    const cx = Math.random() * 256;
    const cy = Math.random() * 512;
    const cr = 20 + Math.random() * 45;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createGrassStoneTexture(primaryGreen: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = primaryGreen;
  ctx.fillRect(0, 0, 256, 512);

  // Subtle stone tiles / runes
  ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
  ctx.lineWidth = 2;
  for (let y = 32; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  for (let x = 32; x < 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Grass specks
  for (let s = 0; s < 60; s++) {
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(100, 220, 100, 0.15)" : "rgba(20, 50, 20, 0.2)";
    ctx.fillRect(Math.random() * 256, Math.random() * 512, 3, 3);
  }

  return new THREE.CanvasTexture(canvas);
}

function createWaterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0,   "#092756");
  grad.addColorStop(0.5, "#0b3b75");
  grad.addColorStop(1,   "#092756");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Water caustics & wavy lines
  for (let y = 0; y < 512; y += 16) {
    ctx.strokeStyle = `rgba(120, 200, 255, ${0.14 + Math.random() * 0.1})`;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 8) {
      ctx.lineTo(x, y + Math.sin((x + y) * 0.08) * 5);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return tex;
}

function createMistParticles(laneX: number): THREE.Points {
  const count = 220;
  const geo   = new THREE.BufferGeometry();
  const pos   = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    pos[i * 3 + 0] = laneX + (Math.random() - 0.5) * (LANE_WIDTH - 0.4);
    pos[i * 3 + 1] = 0.25 + Math.random() * 1.8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * (LANE_HALF_LEN * 2 - 0.8);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color:       0xddeeff,
    size:        0.18,
    transparent: true,
    opacity:     0.45,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });

  return new THREE.Points(geo, mat);
}

function createCloudGroup(laneX: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(laneX, 0, 0);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xf0f5ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  const positions: [number, number, number, number, number][] = [
    [-0.3, 0.95, -3.8, 1.2, 0.45],
    [ 0.4, 1.05,  0.2, 1.0, 0.38],
    [-0.2, 1.15,  3.5, 1.3, 0.42],
    [ 0.3, 0.85, -1.2, 0.9, 0.32],
  ];

  for (const [x, y, z, rx, rz] of positions) {
    const geo  = new THREE.SphereGeometry(rx * 0.5, 12, 8);
    const mesh = new THREE.Mesh(geo, cloudMat);
    mesh.scale.set(1, 0.3, rz / rx);
    mesh.position.set(x, y, z);
    g.add(mesh);
  }

  return g;
}

function addStoneAccents(parent: THREE.Group, laneX: number): void {
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x444b42,
    roughness: 0.9,
    metalness: 0.1,
  });

  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    const geo = new THREE.BoxGeometry(0.18, 0.04, 0.18);
    const m1  = new THREE.Mesh(geo, stoneMat);
    m1.position.set(laneX - (LANE_WIDTH / 2 - 0.14), 0.02, z);
    const m2  = new THREE.Mesh(geo, stoneMat);
    m2.position.set(laneX + (LANE_WIDTH / 2 - 0.14), 0.02, z);
    parent.add(m1, m2);
  }
}

function addPlatformTrim(parent: THREE.Group, laneX: number, y: number): void {
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xffd066 });
  const w = LANE_WIDTH - 0.06;
  const l = LANE_HALF_LEN * 2 - 0.06;
  const t = 0.05;

  const strips: [number, number, number, number, number][] = [
    [laneX, y,  l / 2, w, t],
    [laneX, y, -l / 2, w, t],
    [laneX - w / 2, y, 0, t, l],
    [laneX + w / 2, y, 0, t, l],
  ];

  for (const [x, elev, z, sw, sl] of strips) {
    const geo  = new THREE.PlaneGeometry(sw, sl);
    const mesh = new THREE.Mesh(geo, trimMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, elev, z);
    parent.add(mesh);
  }
}

function addEdgeTrim(parent: THREE.Group): void {
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x8c64ff });
  const hw = BOARD_HALF_W;
  const hl = LANE_HALF_LEN;
  const t  = 0.14;
  const strips: { pos: [number, number, number]; size: [number, number] }[] = [
    { pos: [0, 0.008,  hl + t / 2], size: [hw * 2 + t * 2, t] },
    { pos: [0, 0.008, -hl - t / 2], size: [hw * 2 + t * 2, t] },
    { pos: [ hw + t / 2, 0.008, 0], size: [t, hl * 2] },
    { pos: [-hw - t / 2, 0.008, 0], size: [t, hl * 2] },
  ];

  for (const s of strips) {
    const geo  = new THREE.PlaneGeometry(s.size[0], s.size[1]);
    const mesh = new THREE.Mesh(geo, edgeMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(...s.pos);
    parent.add(mesh);
  }
}

function createClashDivider(): THREE.Group {
  const g = new THREE.Group();

  // Core energy beam
  const divGeo = new THREE.PlaneGeometry(BOARD_HALF_W * 2, 0.12);
  const divMat = new THREE.MeshBasicMaterial({
    color: 0xd946ef, // Arcane fuchsia / magenta energy
    transparent: true,
    opacity: 0.85,
  });
  const div = new THREE.Mesh(divGeo, divMat);
  div.rotation.x = -Math.PI / 2;
  div.position.set(0, 0.016, 0);
  g.add(div);

  // Outer golden rail borders
  const railGeo = new THREE.PlaneGeometry(BOARD_HALF_W * 2, 0.03);
  const railMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.75 });
  const railNorth = new THREE.Mesh(railGeo, railMat);
  railNorth.rotation.x = -Math.PI / 2;
  railNorth.position.set(0, 0.017, -0.07);
  const railSouth = new THREE.Mesh(railGeo, railMat);
  railSouth.rotation.x = -Math.PI / 2;
  railSouth.position.set(0, 0.017, 0.07);
  g.add(railNorth, railSouth);

  // Diamond clash center gem
  const diamondGeo = new THREE.OctahedronGeometry(0.12, 0);
  const diamondMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd946ef,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.8,
  });
  const diamond = new THREE.Mesh(diamondGeo, diamondMat);
  diamond.position.set(0, 0.05, 0);
  diamond.rotation.y = Math.PI / 4;
  g.add(diamond);

  return g;
}

function createLaneCombatArrows(laneX: number, elev: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 256);

  // Draw 3 glowing combat chevrons pointing toward Opponent (-Z)
  ctx.strokeStyle = "rgba(251, 191, 36, 0.9)"; // Golden amber
  ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const yCoords = [190, 128, 66];
  for (const y of yCoords) {
    ctx.beginPath();
    ctx.moveTo(24, y + 22);
    ctx.lineTo(64, y - 18);
    ctx.lineTo(104, y + 22);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(32, y + 20);
    ctx.lineTo(64, y - 12);
    ctx.lineTo(96, y + 20);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(0.9, 1.8);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(laneX, elev, 0); // Placed at midfield clash point
  return mesh;
}

function addLaneDivider(parent: THREE.Group, sepX: number): void {
  // Main separator body
  const sepGeo = new THREE.PlaneGeometry(0.06, LANE_HALF_LEN * 2);
  const sepMat = new THREE.MeshBasicMaterial({
    color: 0xd4af37, // Polished brass / gold
    transparent: true,
    opacity: 0.75,
  });
  const sep = new THREE.Mesh(sepGeo, sepMat);
  sep.rotation.x = -Math.PI / 2;
  sep.position.set(sepX, 0.02, 0);
  parent.add(sep);

  // Subtle metallic bevel shadow line
  const shadowGeo = new THREE.PlaneGeometry(0.02, LANE_HALF_LEN * 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.6,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(sepX + 0.04, 0.019, 0);
  parent.add(shadow);
}

function addLaneLabel(parent: THREE.Group, index: number, laneX: number, elev: number): void {
  const laneNames = ["0 · AERIAL ☁", "1 · GROUND 🌿", "2 · GROUND 🌿", "3 · WATER 💧"];
  const canvas = document.createElement("canvas");
  canvas.width = 384; canvas.height = 72;
  const ctx = canvas.getContext("2d")!;

  // Glassmorphic metallic badge background
  const grad = ctx.createLinearGradient(0, 0, 0, 72);
  grad.addColorStop(0, "rgba(30, 20, 50, 0.92)");
  grad.addColorStop(1, "rgba(10, 5, 20, 0.95)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(8, 6, 368, 60, 12);
  ctx.fill();

  // Ornate double border
  ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 12, 356, 48);

  // Label text
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 22px 'Outfit', 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(251, 191, 36, 0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText(laneNames[index]!, 192, 36);

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(2.2, 0.42);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(laneX, elev, -LANE_HALF_LEN + 0.38);
  parent.add(mesh);
}
