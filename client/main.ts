// ============================================================
//  main.ts — Three.js scene bootstrap + animation loop
// ============================================================

import * as THREE from "three";
import { BoardResult, createBoard } from "./Board";
import { HandController } from "./HandController";
import { HeroDisplayData, createHeroDisplay } from "./HeroDisplay";
import { DragController } from "./DragController";
import { GameController } from "./GameController";
import { PlayerId } from "../src/types";
import { getAdminView } from "./AdminCardView";
import { screenController } from "./ScreenController";
import { initializeGameData } from "./CardRepository";
import { heroRepo } from "./HeroRepository";

import {
  CAM_POS_X, CAM_POS_Y, CAM_POS_Z,
  CAM_TARGET_Y, CAM_TARGET_Z, CAM_FOV,
  BOARD_HALF_W, LANE_HALF_LEN,
} from "./visualConstants";

// Preload authoritative master catalog & heroes from Supabase / Backend
Promise.all([
  initializeGameData(),
  heroRepo.whenReady(),
]).catch((err) => {
  console.warn("[main.ts] Data hydration notice:", err);
});

// ─────────────────────────────────────────────────────────────
//  Renderer + Scene
// ─────────────────────────────────────────────────────────────

const container = document.getElementById("canvas-container")!;

const renderer = new THREE.WebGLRenderer({
  antialias:  true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x04060f);
scene.fog        = new THREE.FogExp2(0x04060f, 0.032);

// ─────────────────────────────────────────────────────────────
//  Camera
// ─────────────────────────────────────────────────────────────

const camera = new THREE.PerspectiveCamera(
  CAM_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  120,
);
camera.position.set(CAM_POS_X, CAM_POS_Y, CAM_POS_Z);
camera.lookAt(0, CAM_TARGET_Y, CAM_TARGET_Z);

// ─────────────────────────────────────────────────────────────
//  Lighting
// ─────────────────────────────────────────────────────────────

// Ambient — cool blue fill
const ambient = new THREE.AmbientLight(0x2233aa, 0.9);
scene.add(ambient);

// Main directional — warm overhead key light
const dirLight = new THREE.DirectionalLight(0xfff5e8, 2.4);
dirLight.position.set(4, 14, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far  = 50;
dirLight.shadow.camera.left  = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top   = 12;
dirLight.shadow.camera.bottom = -12;
dirLight.shadow.bias = -0.001;
scene.add(dirLight);

// Rim light — subtle purple from behind
const rimLight = new THREE.DirectionalLight(0x9955ff, 0.55);
rimLight.position.set(-6, 8, -10);
scene.add(rimLight);

// Hero area warm fills
const playerLight = new THREE.PointLight(0x4488ff, 1.2, 8);
playerLight.position.set(0, 2, 7.5);
scene.add(playerLight);

const oppLight = new THREE.PointLight(0xff5544, 1.0, 8);
oppLight.position.set(0, 2, -7.5);
scene.add(oppLight);

// ─────────────────────────────────────────────────────────────
//  Starfield background
// ─────────────────────────────────────────────────────────────

function addStarfield(): void {
  const starGeo = new THREE.BufferGeometry();
  const count   = 1200;
  const pos     = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3 + 0] = (Math.random() - 0.5) * 150;
    pos[i * 3 + 1] = Math.random() * 50 + 5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 150;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({
    color:       0xffffff,
    size:        0.06,
    sizeAttenuation: true,
    transparent: true,
    opacity:     0.7,
  });
  scene.add(new THREE.Points(starGeo, starMat));
}
addStarfield();

// ─────────────────────────────────────────────────────────────
//  Game objects
// ─────────────────────────────────────────────────────────────

const board    = createBoard(scene);
const hand     = new HandController(scene);

const playerHero = createHeroDisplay(scene, PlayerId.Player,   20, 20);
const oppHero    = createHeroDisplay(scene, PlayerId.Opponent, 20, 20);

const drag = new DragController(camera, renderer, hand, board, scene);
drag.setHeroes(playerHero, oppHero);

const gameCtrl = new GameController(
  scene, camera, hand, board, drag, playerHero, oppHero,
);

(window as any).game = gameCtrl;

// Initialize Central App Screen Controller & Main Menu
screenController.init(camera, renderer, gameCtrl);
(window as any).screenController = screenController;

// In-Game HUD Menu Button
const inGameMenuBtn = document.getElementById("btn-in-game-menu");
if (inGameMenuBtn) {
  inGameMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    screenController.returnToMainMenu();
  });
}

// Initialize Admin Card Management View (Ctrl+Shift+A or #admin)
const adminView = getAdminView();
(window as any).adminView = adminView;

const cmsBtn = document.getElementById("btn-admin-cms");
if (cmsBtn) {
  cmsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    screenController.setScreen("ADMIN");
  });
}

// ─────────────────────────────────────────────────────────────
//  Animation loop
// ─────────────────────────────────────────────────────────────

let elapsed = 0;

function animate(time: number): void {
  requestAnimationFrame(animate);

  const dt = Math.min((time - elapsed) / 1000, 0.05);
  elapsed  = time;

  // Update board systems (water waves, mist particles, floating clouds)
  board.update(dt);

  // Update game controller systems (targeting arrow & status visuals)
  gameCtrl.update(dt);

  // Update screen controller (idle camera drift & transitions)
  screenController.update(time);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// ─────────────────────────────────────────────────────────────
//  Resize handler
// ─────────────────────────────────────────────────────────────

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
