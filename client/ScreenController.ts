// ============================================================
//  client/ScreenController.ts — Centralized App State Router
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { GameController } from "./GameController";
import { MainMenu } from "./MainMenu";
import { LobbyModal } from "./LobbyModal";
import { DeckBuilderUI } from "./DeckBuilderUI";
import { CardCatalogModal } from "./CardCatalogModal";
import { SettingsModal, GraphicsQuality } from "./SettingsModal";
import { getAdminView } from "./AdminCardView";
import { heroRepo } from "./HeroRepository";
import {
  CAM_POS_X, CAM_POS_Y, CAM_POS_Z,
  CAM_TARGET_X, CAM_TARGET_Y, CAM_TARGET_Z,
} from "./visualConstants";
import { audioManager } from "./AudioManager";

export type GameScreen =
  | "MAIN_MENU"
  | "HERO_SELECT"
  | "DECK_BUILDER"
  | "MULTIPLAYER_LOBBY"
  | "IN_GAME"
  | "ADMIN"
  | "CARD_CATALOG"
  | "SETTINGS";

export type AppScreen = GameScreen;

export const MENU_CAM_X = 6.5;
export const MENU_CAM_Y = 16.5;
export const MENU_CAM_Z = 14.0;

export class ScreenController {
  private static instance: ScreenController;

  private currentScreen: AppScreen = "MAIN_MENU";
  private isNavigating: boolean = false;
  private navLockTimeout: ReturnType<typeof setTimeout> | null = null;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private gameCtrl!: GameController;
  private mainMenu!: MainMenu;
  private lobbyModal!: LobbyModal;
  private deckBuilder!: DeckBuilderUI;
  private cardCatalogModal!: CardCatalogModal;
  private settingsModal!: SettingsModal;

  private constructor() {}

  public static getInstance(): ScreenController {
    if (!ScreenController.instance) {
      ScreenController.instance = new ScreenController();
    }
    return ScreenController.instance;
  }

  public init(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    gameCtrl: GameController,
  ): void {
    this.camera = camera;
    this.renderer = renderer;
    this.gameCtrl = gameCtrl;

    // 1. Deck Builder
    this.deckBuilder = new DeckBuilderUI();
    this.deckBuilder.setOnFallbackToMenu(() => {
      this.setScreen("MAIN_MENU");
    });

    // 2. Card Catalog
    this.cardCatalogModal = new CardCatalogModal();

    // 3. Settings Modal
    this.settingsModal = new SettingsModal((quality) => {
      this.applyGraphicsQuality(quality);
    });
    this.applyGraphicsQuality(this.settingsModal.getGraphicsQuality());

    // 4. Lobby Modal
    this.lobbyModal = new LobbyModal({
      onStartLocalMatch: () => {
        this.setScreen("HERO_SELECT");
        this.gameCtrl.startLocalMatchFlow();
      },
      onOnlineRoomReady: (roomId, role) => {
        this.setScreen("HERO_SELECT");
        this.gameCtrl.startOnlineLoadoutFlow(roomId, role);
      },
      onClose: () => {
        this.setScreen("MAIN_MENU");
      },
    });

    // 5. Main Menu
    this.mainMenu = new MainMenu({
      onPlaySinglePlayer: () => {
        this.setScreen("HERO_SELECT");
        this.gameCtrl.startLocalMatchFlow();
      },
      onPlayOnline1v1: () => {
        this.setScreen("MULTIPLAYER_LOBBY");
      },
      onOpenDeckBuilder: () => {
        this.setScreen("DECK_BUILDER");
      },
      onOpenCardCatalog: () => {
        this.setScreen("CARD_CATALOG");
      },
      onOpenSettings: () => {
        this.setScreen("SETTINGS");
      },
      onOpenAdminCMS: () => {
        this.setScreen("ADMIN");
      },
    });

    // Connect GameController screen references
    this.gameCtrl.setScreenController(this);
    this.gameCtrl.setLobbyModal(this.lobbyModal);
    this.gameCtrl.setDeckBuilder(this.deckBuilder);

    // Initial Screen Setup
    this.bindGlobalKeyboard();
    this.setScreen("MAIN_MENU");
  }

  public getCurrentScreen(): AppScreen {
    return this.currentScreen;
  }

  // ── Screen Router ────────────────────────────────────────────

  public navigateTo(screen: AppScreen): void {
    this.setScreen(screen);
  }

  public returnToMainMenu(): void {
    console.log(`[Router] Navigating from ${this.currentScreen} to MAIN_MENU (Forced Unlock)`);
    // 1. Reset locks
    this.isNavigating = false;
    if (this.navLockTimeout) {
      clearTimeout(this.navLockTimeout);
      this.navLockTimeout = null;
    }

    const prev = this.currentScreen;
    // 2. Set destination state
    this.currentScreen = "MAIN_MENU";

    // 3. Teardown active match or setup if returning from match
    if (prev === "IN_GAME" || prev === "HERO_SELECT") {
      this.gameCtrl.teardownMatch();
    }

    // 4. Force hide all modals without trigger callbacks
    this.deckBuilder.hide(false);
    this.cardCatalogModal.hide(false);
    this.settingsModal.hide(false);
    this.lobbyModal.hideModal(false);
    if (this.gameCtrl?.overlay) {
      this.gameCtrl.overlay.hideHeroSelection();
      this.gameCtrl.overlay.hideGameOver();
      this.gameCtrl.overlay.hideMulligan();
    }
    getAdminView().close(false);

    // Toggle In-Game HUD overlay visibility
    const uiOverlay = document.getElementById("ui-overlay");
    if (uiOverlay) {
      uiOverlay.style.display = "none";
    }

    const modeSwitcher = document.getElementById("mode-switcher-container");
    if (modeSwitcher) {
      modeSwitcher.style.display = "none";
    }

    // 5. Render Main Menu
    this.animateCameraToMenu();
    this.mainMenu.show();
  }

  public setScreen(screen: AppScreen): void {
    console.log(`[Router] Navigating from ${this.currentScreen} to ${screen}`);

    if (screen === "MAIN_MENU") {
      this.returnToMainMenu();
      return;
    }

    if (screen === "IN_GAME") {
      // IN_GAME is an authoritative match transition: bypass navigation lock
      this.isNavigating = false;
      if (this.navLockTimeout) {
        clearTimeout(this.navLockTimeout);
        this.navLockTimeout = null;
      }
    } else if (this.isNavigating) {
      console.warn(`[Router] Mid-animation lock active, ignoring navigation to ${screen}`);
      return;
    }

    if (this.currentScreen === screen) {
      return;
    }

    this.isNavigating = screen !== "IN_GAME";
    if (this.navLockTimeout) {
      clearTimeout(this.navLockTimeout);
    }
    if (this.isNavigating) {
      this.navLockTimeout = setTimeout(() => {
        this.isNavigating = false;
        this.navLockTimeout = null;
      }, 450);
    }

    const prev = this.currentScreen;
    this.currentScreen = screen;

    // Teardown / Hide previous screen
    if (prev === "MAIN_MENU") {
      this.mainMenu.hide();
    }

    if (screen !== "MULTIPLAYER_LOBBY") {
      this.lobbyModal.hideModal(false);
    }

    if (screen !== "CARD_CATALOG") {
      this.cardCatalogModal.hide(false);
    }

    if (screen !== "SETTINGS") {
      this.settingsModal.hide(false);
    }

    if (screen !== "DECK_BUILDER") {
      this.deckBuilder.hide(false);
    }

    if (screen !== "HERO_SELECT" && this.gameCtrl?.overlay) {
      this.gameCtrl.overlay.hideHeroSelection();
    }

    if (screen !== "ADMIN") {
      getAdminView().close(false);
    }

    // Toggle In-Game HUD overlay visibility
    const uiOverlay = document.getElementById("ui-overlay");
    if (uiOverlay) {
      uiOverlay.style.display = screen === "IN_GAME" ? "block" : "none";
    }

    // Hide / Show mode switcher container
    const modeSwitcher = document.getElementById("mode-switcher-container");
    if (modeSwitcher) {
      modeSwitcher.style.display = (screen === "IN_GAME" || screen === "MULTIPLAYER_LOBBY") ? "flex" : "none";
    }

    // Setup target screen
    switch (screen) {
      case "HERO_SELECT": {
        this.isNavigating = false;
        if (this.navLockTimeout) {
          clearTimeout(this.navLockTimeout);
          this.navLockTimeout = null;
        }
        this.animateCameraToGame();
        break;
      }

      case "DECK_BUILDER": {
        const heroes = heroRepo.getAllHeroes();
        const hero = heroes[0];
        this.deckBuilder.show(
          hero,
          () => {
            this.returnToMainMenu();
          },
          () => {
            this.returnToMainMenu();
          },
        );
        break;
      }

      case "MULTIPLAYER_LOBBY": {
        this.lobbyModal.setMode("ONLINE_PVP");
        this.lobbyModal.showModal();
        break;
      }

      case "CARD_CATALOG": {
        this.cardCatalogModal.show(() => {
          this.returnToMainMenu();
        });
        break;
      }

      case "SETTINGS": {
        this.settingsModal.show(() => {
          this.returnToMainMenu();
        });
        break;
      }

      case "ADMIN": {
        getAdminView().open();
        break;
      }

      case "IN_GAME": {
        this.animateCameraToGame();
        break;
      }
    }
  }

  // ── Camera Control ───────────────────────────────────────────

  private animateCameraToMenu(): void {
    if (!this.camera) return;
    gsap.to(this.camera.position, {
      duration: 1.2,
      x: MENU_CAM_X,
      y: MENU_CAM_Y,
      z: MENU_CAM_Z,
      ease: "power2.inOut",
      onUpdate: () => {
        this.camera.lookAt(CAM_TARGET_X, CAM_TARGET_Y, CAM_TARGET_Z);
      },
    });
  }

  private animateCameraToGame(): void {
    if (!this.camera) return;
    gsap.to(this.camera.position, {
      duration: 0.95,
      x: CAM_POS_X,
      y: CAM_POS_Y,
      z: CAM_POS_Z,
      ease: "power3.out",
      onUpdate: () => {
        this.camera.lookAt(CAM_TARGET_X, CAM_TARGET_Y, CAM_TARGET_Z);
      },
    });
  }

  public update(time: number): void {
    // Subtle idle camera drift when on Main Menu
    if (this.currentScreen === "MAIN_MENU" && this.camera) {
      const offsetX = Math.sin(time * 0.00015) * 1.2;
      const offsetZ = Math.cos(time * 0.00015) * 0.8;
      this.camera.position.x = MENU_CAM_X + offsetX;
      this.camera.position.z = MENU_CAM_Z + offsetZ;
      this.camera.lookAt(CAM_TARGET_X, CAM_TARGET_Y, CAM_TARGET_Z);
    }
  }

  // ── Graphics Quality Adaptation ──────────────────────────────

  public applyGraphicsQuality(quality: GraphicsQuality): void {
    if (!this.renderer) return;

    if (quality === "LOW") {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMappingExposure = 1.0;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.toneMappingExposure = 1.15;
    }
  }

  // ── Global Keyboard Shortcuts ────────────────────────────────

  private bindGlobalKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      // Escape key returns to Main Menu from sub-modals if not already handled
      if (e.key === "Escape") {
        if (this.currentScreen !== "MAIN_MENU" && this.currentScreen !== "IN_GAME") {
          e.preventDefault();
          audioManager.playClick();
          this.returnToMainMenu();
        }
      }
    });
  }
}

export const screenController = ScreenController.getInstance();
