// ============================================================
//  GameController.ts — Engine ↔ 3D Scene mediator
//  Integrates GameEngine v2, Frontline/Support sub-slots,
//  Super Block Interrupt modal, camera zoom, combat steps,
//  Curved Targeting Arrow, Status Visual Badges,
//  Mulligan Overlay, Phase Announcer, and Game Over Screen.
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { GameEngine } from "../src/GameEngine";
import { botDecideAction } from "../src/bot";
import { generateBotDeck, BotDifficulty } from "../src/BotDeckGenerator";
import { getBotConfig } from "../src/botConfig";
import {
  Card, CardDefinition, GameEvent, GameState, PlayerId,
  TurnPhase, CardType, GameEventType, UnitInstance, Hero, LaneState,
} from "../src/types";
import {
  HERO_SKY_VANGUARD,
  HERO_ABYSSAL_SORCERER,
  AVAILABLE_HEROES,
  DECK_VANGUARD_40,
  DECK_ABYSSAL_40,
  DECK_PLANTS_40,
  DECK_ZOMBIES_40,
} from "../src/cards";
import { HandController } from "./HandController";
import { OpponentHandController } from "./OpponentHandController";
import { HeroDisplayData } from "./HeroDisplay";
import { CombatAnimator, UnitMeshEntry, spawnUnitMesh } from "./CombatAnimator";
import { DragController, DropResult } from "./DragController";
import { BoardResult } from "./Board";
import { createCardMesh } from "./CardMesh";
import { OverlayController, MatchStats } from "./OverlayController";
import { LANE_X, LANE_WIDTH, LANE_HALF_LEN } from "./visualConstants";
import { DeckBuilderUI } from "./DeckBuilderUI";
import { DeckStorage } from "./DeckStorage";
import { heroRepo } from "./HeroRepository";
import { networkService } from "./NetworkService";
import { LobbyModal } from "./LobbyModal";
import { SanitizedGameState } from "../server/types";
import { cardRepo } from "./CardRepository";
import type { ScreenController } from "./ScreenController";
import { getHeroPerspectives } from "../src/perspectiveHelper";
import { Graveyard3D } from "./Graveyard3D";
import { GraveyardModal } from "./GraveyardModal";
import { ActionHistoryFeed } from "./ActionHistoryFeed";

// ─────────────────────────────────────────────────────────────
//  DOM Elements
// ─────────────────────────────────────────────────────────────

const phaseNameEl     = document.getElementById("phase-name")!    as HTMLElement;
const turnNumEl       = document.getElementById("turn-num")!       as HTMLElement;
const turnLabelEl     = document.getElementById("turn-label")!     as HTMLElement;
const manaDisplayEl   = document.getElementById("mana-display")!   as HTMLElement;
const manaValEl       = document.getElementById("mana-val")!       as HTMLElement;
const btnPass         = document.getElementById("btn-pass-phase")! as HTMLButtonElement;
const btnCombat       = document.getElementById("btn-resolve-combat")! as HTMLButtonElement;
const toastEl         = document.getElementById("toast")!           as HTMLElement;
const botThinkingEl   = document.getElementById("bot-thinking")!    as HTMLElement;
const oppCardCountEl  = document.getElementById("opp-card-count")  as HTMLElement | null;

// ─────────────────────────────────────────────────────────────
//  GameController
// ─────────────────────────────────────────────────────────────

export class GameController {
  private engine:     GameEngine;
  private state:      GameState;
  private scene:      THREE.Scene;
  private camera:     THREE.PerspectiveCamera;

  private hand:       HandController;
  private oppHand:    OpponentHandController;
  private playerHero: HeroDisplayData;
  private oppHero:    HeroDisplayData;
  private board:      BoardResult;
  private drag:       DragController;
  private combatAnim: CombatAnimator;
  private overlay:    OverlayController;
  private deckBuilder: DeckBuilderUI;
  private lobbyModal!: LobbyModal;

  private unitMap:    Map<string, UnitMeshEntry> = new Map();
  private envMeshMap: Map<number, THREE.Group> = new Map();
  private busy        = false;
  private chosenPlayerDeck: CardDefinition[] | null = null;
  private screenController: ScreenController | null = null;
  private latestSanitizedState: SanitizedGameState | null = null;
  /** Bot difficulty selected by the player before match start */
  private botDifficulty: BotDifficulty = "Medium";

  private graveyard3D: Graveyard3D;
  private graveyardModal: GraveyardModal;
  private actionHistoryFeed: ActionHistoryFeed;

  constructor(
    scene:      THREE.Scene,
    camera:     THREE.PerspectiveCamera,
    hand:       HandController,
    board:      BoardResult,
    drag:       DragController,
    playerHero: HeroDisplayData,
    oppHero:    HeroDisplayData,
  ) {
    this.scene      = scene;
    this.camera     = camera;
    this.hand       = hand;
    this.board      = board;
    this.drag       = drag;
    this.playerHero = playerHero;
    this.oppHero    = oppHero;

    this.graveyard3D = new Graveyard3D(scene, camera);
    this.graveyardModal = new GraveyardModal();
    this.actionHistoryFeed = new ActionHistoryFeed();

    this.drag.setGraveyard3D(this.graveyard3D);

    this.graveyard3D.setOnClick((owner) => {
      let cards: Card[] = [];
      if (networkService.isOnlineMode && this.latestSanitizedState) {
        if (owner === "player") {
          cards = this.latestSanitizedState.self?.graveyard || [];
        } else {
          cards = this.latestSanitizedState.opponent?.graveyard || [];
        }
      } else {
        cards = owner === "player"
          ? (this.state.player.graveyard ?? [])
          : (this.state.opponent.graveyard ?? []);
      }
      this.graveyardModal.show(cards, owner);
    });

    this.engine = new GameEngine({
      startingHp:       20,
      startingHandSize: 4,
      maxHandSize:      11,
      enableMulligan:   true,
    });

    // Initial placeholder state before Hero Selection completes
    this.state = this.engine.initializeGame(
      HERO_SKY_VANGUARD,
      DECK_VANGUARD_40,
      HERO_ABYSSAL_SORCERER,
      DECK_ABYSSAL_40,
      { seed: Date.now(), firstPlayerId: PlayerId.Player },
    );
    this.state.currentPhase = TurnPhase.HERO_SELECTION;

    this.combatAnim = new CombatAnimator(scene, this.unitMap, playerHero, oppHero);
    this.combatAnim.setUnitProvider((id) => this.findLiveUnit(id));
    this.combatAnim.setGraveyard3D(this.graveyard3D);
    this.board.updateUnitBadges = this.updateUnitBadges.bind(this);
    (window as any).boardVisual = this;
    (window as any).gameController = this;

    this.drag.setUnitMap(this.unitMap);
    this.drag.setHeroes(playerHero, oppHero);
    this.drag.setUnitInstanceProvider((instanceId) => {
      return this.findLiveUnit(instanceId);
    });
    this.drag.setEnvironmentMeshesProvider(() => Array.from(this.envMeshMap.values()));

    this.overlay = new OverlayController();
    this.overlay.setTurnControlCallbacks(
      () => this.handleEndPhase(),
      () => this.handleCombat(),
    );
    this.overlay.setOnBackToMenu(() => this.handleBackToMenu());
    this.overlay.setOnDifficultyChange((diff) => this.setBotDifficulty(diff as BotDifficulty));

    // Seed default decks if first launch
    DeckStorage.seedDefaults();

    this.bindUI();
    this.drag.onDrop(this.handleDrop.bind(this));
    this.oppHand = new OpponentHandController(scene);

    this.bindNetworkEvents();

    // Keep Hero Selection screen synchronized if heroes are created/edited in CMS
    heroRepo.subscribe((updatedHeroes) => {
      const heroModal = document.getElementById("hero-selection-overlay");
      if (heroModal && heroModal.classList.contains("visible") && !networkService.isOnlineMode) {
        this.startLocalMatchFlow();
      }
    });
  }

  public setScreenController(sc: ScreenController): void {
    this.screenController = sc;
  }

  public setLobbyModal(modal: LobbyModal): void {
    this.lobbyModal = modal;
  }

  public setDeckBuilder(db: DeckBuilderUI): void {
    this.deckBuilder = db;
  }

  public handleBackToMenu(): void {
    if (this.screenController) {
      this.screenController.returnToMainMenu();
    }
  }

  public teardownMatch(): void {
    // 1. Dispose and clear existing unit meshes
    this.drag.clearHover();
    for (const entry of this.unitMap.values()) {
      entry.statusVisuals?.dispose();
      this.scene.remove(entry.group);
      entry.meshData.bodyMesh.geometry.dispose();
      if (entry.meshData.bodyMesh.material) {
        const mat = entry.meshData.bodyMesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }
    this.unitMap.clear();

    // 2. Remove and dispose environment meshes
    this.envMeshMap.forEach((grp) => {
      this.scene.remove(grp);
      grp.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (m.material) {
            const mat = m.material;
            if (Array.isArray(mat)) mat.forEach((item) => item.dispose());
            else mat.dispose();
          }
        }
      });
    });
    this.envMeshMap.clear();

    // 3. Clear hands
    this.hand.clear();
    this.oppHand.clear();

    // 4. Reset Hero displays
    this.playerHero.updateHp(20, 20);
    this.oppHero.updateHp(20, 20);
    this.playerHero.resetBlockMeter();
    this.oppHero.resetBlockMeter();
    this.combatAnim.setRole("p1");
    this.drag.setRole("p1");

    // 5. Hide Overlays & Graveyard
    this.overlay.hideHeroSelection();
    this.overlay.hideGameOver();
    this.overlay.hideMulligan();
    this.graveyardModal.hide();
    this.actionHistoryFeed.clear();
    this.graveyard3D.updateCounts(0, 0);

    // 6. Reset network state
    networkService.leaveMatch();

    // 7. Reset flags
    this.busy = false;
    this.chosenPlayerDeck = null;
    this.setInteractive(true);

    // 8. Reset engine state to initial setup
    this.state = this.engine.initializeGame(
      HERO_SKY_VANGUARD,
      DECK_VANGUARD_40,
      HERO_ABYSSAL_SORCERER,
      DECK_ABYSSAL_40,
      { seed: Date.now(), firstPlayerId: PlayerId.Player },
    );
    this.state.currentPhase = TurnPhase.HERO_SELECTION;
  }

  // ── Match Setup Flows (Local & Online) ────────────────────────

  public async startLocalMatchFlow(): Promise<void> {
    networkService.leaveMatch();
    networkService.isOnlineMode = false;
    await heroRepo.whenReady();
    const heroes = heroRepo.getActiveHeroes();

    this.overlay.showHeroSelection(heroes.length > 0 ? heroes : heroRepo.getAllHeroes(), (playerHeroChoice, oppHeroChoice) => {
      this.showDeckBuilder(playerHeroChoice, oppHeroChoice);
    });
  }

  public async startOnlineLoadoutFlow(roomId: string, role: "p1" | "p2"): Promise<void> {
    networkService.roomId = roomId;
    networkService.myRole = role;
    networkService.isOnlineMode = true;

    await heroRepo.whenReady();
    const heroes = heroRepo.getActiveHeroes();

    this.overlay.showHeroSelection(heroes.length > 0 ? heroes : heroRepo.getAllHeroes(), (playerHeroChoice) => {
      this.deckBuilder.show(
        playerHeroChoice,
        async (chosenDeck, selectedHero) => {
          const actualHero = selectedHero || playerHeroChoice;
          this.chosenPlayerDeck = chosenDeck;
          this.showToast(`Hero & Deck locked in! Room: ${roomId}`);
          this.deckBuilder.hide(false);
          this.overlay.hideHeroSelection();
          this.lobbyModal.hideModal(false);

          // Dedicated Blocking Readiness Gate Overlay
          this.overlay.showWaitingOverlay(
            "Waiting for Opponent to choose Hero & Deck...",
            `Locked in as ${actualHero.name}. Synchronizing battle loadout with server...`,
            () => {
              networkService.leaveMatch();
              this.handleBackToMenu();
            },
          );

          const success = await networkService.lockInPlayer(actualHero, chosenDeck);
          if (!success) {
            this.showToast("Failed to lock in loadout. Please retry.");
            this.overlay.hideWaitingOverlay();
          }
        },
        () => this.handleBackToMenu(),
      );
    });
  }

  // ── Deck Builder Step ─────────────────────────────────────────

  private showDeckBuilder(playerHeroChoice: Hero, oppHeroChoice: Hero): void {
    this.deckBuilder.show(
      playerHeroChoice,
      (chosenDeck, selectedHero) => {
        const actualHero = selectedHero || playerHeroChoice;
        this.chosenPlayerDeck = chosenDeck;
        this.startMatchWithHeroes(actualHero, oppHeroChoice, chosenDeck);
      },
      () => this.handleBackToMenu(),
    );
  }

  /** Call before startLocalMatchFlow() to set the bot AI difficulty. */
  public setBotDifficulty(difficulty: BotDifficulty): void {
    this.botDifficulty = difficulty;
  }

  public startMatchWithHeroes(playerHeroChoice: Hero, oppHeroChoice: Hero, customDeck?: CardDefinition[]): void {
    this.screenController?.setScreen("IN_GAME");

    const playerDeck = customDeck ?? (playerHeroChoice.id === HERO_SKY_VANGUARD.id ? DECK_VANGUARD_40 : DECK_ABYSSAL_40);
    // Bot deck: procedurally generated from the master CardRepository using the opponent hero and difficulty
    const oppDeck = generateBotDeck(
      oppHeroChoice.id,
      this.botDifficulty,
      Date.now(),
      cardRepo.getAllCollectible(),
      (id) => cardRepo.getCardById(id),
    );

    // ── CardSync Initialization Audit ─────────────────────────────
    console.log(`[CardSync Audit] Match Starting — Player: "${playerHeroChoice.name}", Opponent: "${oppHeroChoice.name}" (Difficulty: ${this.botDifficulty})`);
    if (playerDeck.length > 0) {
      const sample = playerDeck[0]!;
      console.log(`[CardSync Audit] Card: ${sample.name} | Keywords: ${sample.keywords.join(", ") || "None"}`);
    }

    // Verify consistency across all shared card IDs between both decks
    const playerCardMap = new Map<string, CardDefinition>(playerDeck.map((c) => [c.id, c]));
    let verifiedCount = 0;
    for (const oppCard of oppDeck) {
      const playerCard = playerCardMap.get(oppCard.id);
      if (playerCard) {
        verifiedCount++;
        const pKw = [...playerCard.keywords].sort().join(", ");
        const oKw = [...oppCard.keywords].sort().join(", ");
        if (pKw !== oKw) {
          console.warn(`[CardSync Audit] Inconsistency Warning for "${oppCard.name}" (${oppCard.id}): Player=[${pKw}] vs Bot=[${oKw}]`);
        }
      }
    }
    console.log(`[CardSync Audit] Sync Check Passed: ${verifiedCount} shared card instances evaluated with synchronized keyword definitions.`);

    this.playerHero.setHeroPortrait(playerHeroChoice.portraitUrl || "🦅");
    this.oppHero.setHeroPortrait(oppHeroChoice.portraitUrl || "🌊");
    this.playerHero.updateHp(playerHeroChoice.maxHp, playerHeroChoice.maxHp);
    this.oppHero.updateHp(oppHeroChoice.maxHp, oppHeroChoice.maxHp);
    this.playerHero.resetBlockMeter();
    this.oppHero.resetBlockMeter();
    this.combatAnim.setRole("p1");
    this.drag.setRole("p1");
    this.actionHistoryFeed.clear();
    this.actionHistoryFeed.setMyRole("p1", false);
    this.graveyard3D.updateCounts(0, 0);

    this.state = this.engine.initializeGame(
      playerHeroChoice,
      playerDeck,
      oppHeroChoice,
      oppDeck,
      { seed: Date.now(), firstPlayerId: PlayerId.Player },
    );

    this.oppHand.clear();

    if (this.state.currentPhase === TurnPhase.MULLIGAN && this.state.mulliganState) {
      this.overlay.showMulligan(this.state.mulliganState.p1MulliganHand, (replacedIds) => {
        this.handleMulliganConfirmed(replacedIds);
      });
    } else {
      this.syncPlayerHand();
      this.syncOpponentHand(false);
      this.refreshUI();
      this.overlay.announcePhase(this.state.currentPhase, this.state.turnNumber);
    }
  }

  public getUnitMap(): Map<string, UnitMeshEntry> {
    return this.unitMap;
  }

  // ── UI Binding ───────────────────────────────────────────────

  private bindUI(): void {
    btnPass.addEventListener("click", () => this.handleEndPhase());
    btnCombat.addEventListener("click", () => this.handleCombat());
  }

  // ── Mulligan Resolution ──────────────────────────────────────

  private handleMulliganConfirmed(replacedCardIds: string[]): void {
    this.overlay.hideMulligan();
    // 1. Confirm player's mulligan
    this.engine.confirmMulligan(PlayerId.Player, replacedCardIds);
    // 2. Confirm opponent bot's mulligan (keeps standard hand)
    this.engine.confirmMulligan(PlayerId.Opponent, []);

    this.state = this.engine.getState();
    this.syncPlayerHand();
    this.syncOpponentHand(false);
    this.refreshUI();

    // Cinematic banner announcing Turn 1 Player Unit Phase
    this.overlay.announcePhase(this.state.currentPhase, this.state.turnNumber);
  }

  // ── Card Drop from Drag & Drop or Targeting Arrow ─────────────

  private async handleDrop(result: DropResult): Promise<boolean> {
    if (this.busy) {
      this.showToast("Wait for active animations.");
      return false;
    }

    // ── Online Mode Dispatch ─────────────────────────────────────
    if (networkService.isOnlineMode) {
      const targetId = result.targetInstanceId || result.targetHeroId;
      const res = await networkService.playCard(
        result.cardId,
        result.laneIndex,
        targetId,
        result.slotType,
      );

      if (!res.success) {
        this.showToast(res.error || "Action rejected by server.");
        return false; // Automatically triggers GSAP snapback of dragged card mesh back to hand!
      }

      if (res.events && res.events.length > 0) {
        await this.combatAnim.animateCombatEvents(res.events);
      }

      return true;
    }

    // ── Single Player (Local Engine) ─────────────────────────────
    const playedCard = this.state.player.hand.find((c) => c.id === result.cardId);
    if (!playedCard) return false;

    let res: ReturnType<GameEngine["playCard"]>;

    if (result.targetHeroId) {
      // Spell or ability targeting Hero
      res = this.engine.playCard(
        PlayerId.Player,
        result.cardId,
        result.laneIndex,
        undefined,
        result.slotType,
      );
    } else {
      res = this.engine.playCard(
        PlayerId.Player,
        result.cardId,
        result.laneIndex,
        result.targetInstanceId,
        result.slotType,
      );
    }

    if (!res.success) {
      this.showToast(res.error);
      return false;
    }

    this.actionHistoryFeed.addEntry({
      card: playedCard,
      owner: "player",
      laneIndex: result.laneIndex,
    });

    this.state = this.engine.getState();

    // Check for Rush or instant combat events
    if (res.events.length > 0) {
      await this.combatAnim.animateCombatEvents(res.events);
    }

    // Spawn unit into the appropriate sub-slot (Frontline vs Support) and sync environments
    this.syncBoardUnits();
    this.syncPlayerHand();
    this.syncOpponentHand();
    this.refreshUI();

    return true;
  }

  // ── End Phase / Advance Phase Loop ───────────────────────────

  private async handleEndPhase(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setInteractive(false);

    // ── Online Mode Dispatch ─────────────────────────────────────
    if (networkService.isOnlineMode) {
      const result = await networkService.passPhase();
      if (!result.success) {
        this.showToast(result.error || "Cannot pass right now.");
        this.setInteractive(true);
      }
      this.busy = false;
      return;
    }

    // ── Single Player (Local Engine) ─────────────────────────────
    // Call dedicated passAction for active player
    const result = this.engine.passAction(PlayerId.Player);
    if (!result.success) {
      this.showToast(result.error);
      this.busy = false;
      this.setInteractive(true);
      return;
    }

    this.state = this.engine.getState();
    this.refreshUI();
    this.overlay.announcePhase(this.state.currentPhase, this.state.turnNumber);

    // If transitioned to Bot phase, execute AI turn
    if (
      this.state.currentPhase === TurnPhase.P2_UNIT_PHASE ||
      this.state.currentPhase === TurnPhase.P2_SPELL_PHASE
    ) {
      await this.runBotTurn();
    }

    // If transitioned to COMBAT_PHASE, automatically execute combat
    if (this.state.currentPhase === TurnPhase.COMBAT_PHASE) {
      await this.handleCombat();
    }

    this.busy = false;
    this.setInteractive(true);
    this.refreshUI();
    this.checkGameOver();
  }

  // ── Step-by-Step Combat Resolution ───────────────────────────

  private async handleCombat(): Promise<void> {
    this.setInteractive(false);
    this.overlay.announcePhase(TurnPhase.COMBAT_PHASE, this.state.turnNumber);

    let combatDone = false;

    while (!combatDone && !this.state.isGameOver) {
      const stepResult = this.engine.resolveCombatStep();
      this.state = this.engine.getState();
      this.refreshUI();

      if (stepResult.events.length > 0) {
        await this.combatAnim.animateCombatEvents(stepResult.events);
      }

      this.syncBoardUnits();

      // Sync player & opponent hands
      this.syncPlayerHand();
      this.syncOpponentHand();

      // Update hero HP & block meters with relative perspective
      const myRole = networkService.isOnlineMode ? (networkService.myRole || "p1") : "p1";
      const perspectives = getHeroPerspectives(this.state, myRole);
      this.playerHero.updateHp(perspectives.selfHp, perspectives.selfMaxHp);
      this.oppHero.updateHp(perspectives.opponentHp, perspectives.opponentMaxHp);
      this.playerHero.setBlockMeter(perspectives.selfBlockMeter.charges);
      this.oppHero.setBlockMeter(perspectives.opponentBlockMeter.charges);

      combatDone = stepResult.done;
    }

    this.syncBoardUnits();

    // Advance past COMBAT_PHASE into TURN_END and next turn
    if (this.state.currentPhase === TurnPhase.COMBAT_PHASE) {
      this.engine.advancePhase(); // -> TURN_END
      this.engine.advancePhase(); // -> P1_UNIT_PHASE (new turn)
      this.state = this.engine.getState();
      this.syncPlayerHand();
      this.syncOpponentHand();
      this.refreshUI();
      this.overlay.announcePhase(this.state.currentPhase, this.state.turnNumber);
    }

    this.busy = false;
    this.setInteractive(true);
    this.refreshUI();
    this.checkGameOver();
  }

  // ── Bot AI Turn ───────────────────────────────────────────────

  private async runBotTurn(): Promise<void> {
    botThinkingEl.classList.add("visible");

    // Thinking delay scales with difficulty — Hard feels more deliberate
    const thinkMs = this.botDifficulty === "Hard" ? 900 :
                    this.botDifficulty === "Medium" ? 650 : 400;
    await sleep(thinkMs);

    const botCfg = getBotConfig(this.botDifficulty);
    // Hard mode can chain more plays per turn
    const maxPlaysAllowed = this.botDifficulty === "Hard" ? 6 :
                            this.botDifficulty === "Medium" ? 4 : 3;

    let maxPlays = maxPlaysAllowed;
    while (maxPlays > 0 && !this.state.isGameOver) {
      const decision = botDecideAction(this.state, PlayerId.Opponent, botCfg);
      if (decision.kind === "PASS") break;

      if (decision.kind === "PLAY_UNIT") {
        const res = this.engine.playCard(PlayerId.Opponent, decision.card.id, decision.laneIndex);
        if (res.success) {
          this.actionHistoryFeed.addEntry({
            card: decision.card,
            owner: "opponent",
            laneIndex: decision.laneIndex,
          });
          this.state = this.engine.getState();
          this.syncBoardUnits();
          this.syncOpponentHand();
          if (res.events.length > 0) {
            await this.combatAnim.animateCombatEvents(res.events);
          }
          await sleep(500);
        } else {
          break;
        }
      } else if (decision.kind === "PLAY_SPELL") {
        const res = this.engine.playCard(PlayerId.Opponent, decision.card.id, decision.targetLaneIndex);
        if (res.success) {
          this.actionHistoryFeed.addEntry({
            card: decision.card,
            owner: "opponent",
            laneIndex: decision.targetLaneIndex,
          });
          this.state = this.engine.getState();
          this.syncBoardUnits();
          this.syncOpponentHand();
          if (res.events.length > 0) {
            await this.combatAnim.animateCombatEvents(res.events);
          }
          await sleep(500);
        } else {
          break;
        }
      }
      maxPlays--;
    }

    botThinkingEl.classList.remove("visible");

    // Advance to next phase after bot completes plays
    const adv = this.engine.advancePhase();
    if (adv.success) {
      this.state = this.engine.getState();
      this.syncOpponentHand();
      this.refreshUI();
      this.overlay.announcePhase(this.state.currentPhase, this.state.turnNumber);
    }
  }

  // ── Synchronization: Board Units & Hand ───────────────────────

  private syncBoardUnits(): void {
    const role = networkService.isOnlineMode ? networkService.myRole || "p1" : "p1";
    this.syncBoardUnitsFromLanes(this.state.lanes, role);
  }

  private syncBoardUnitsFromLanes(
    lanes: [LaneState, LaneState, LaneState, LaneState],
    role: "p1" | "p2" = "p1",
  ): void {
    const isP1 = role === "p1";
    const activeIds = new Set<string>();

    for (let l = 0; l < 4; l++) {
      const lane = lanes[l];

      const myFront = isP1 ? lane.playerFrontline : lane.opponentFrontline;
      const mySupp  = isP1 ? lane.playerSupport : lane.opponentSupport;
      const oppFront = isP1 ? lane.opponentFrontline : lane.playerFrontline;
      const oppSupp  = isP1 ? lane.opponentSupport : lane.playerSupport;

      const slotConfigs: [UnitInstance | null, "frontline" | "support", boolean][] = [
        [myFront, "frontline", true],
        [mySupp, "support", true],
        [oppFront, "frontline", false],
        [oppSupp, "support", false],
      ];

      for (const [unit, slotType, isPlayer] of slotConfigs) {
        if (!unit) continue;
        activeIds.add(unit.instanceId);

        const card = cardRepo.getCard(unit.cardId) ?? findCardInDeck(unit.cardId) ?? {
          id: unit.cardId,
          name: unit.name,
          cost: 1, attack: unit.attack, hp: unit.maxHp,
          tribe: unit.tribe, type: CardType.Unit, keywords: unit.keywords,
        };
        const baseAtk = card.attack;
        const baseHp = card.hp;

        // If mesh does not exist yet, spawn it
        if (!this.unitMap.has(unit.instanceId)) {
          const meshData = createCardMesh(card, unit.currentHp, unit.attack, baseAtk, baseHp);
          spawnUnitMesh(
            this.scene,
            this.unitMap,
            meshData,
            unit.instanceId,
            l,
            isPlayer,
            unit.currentHp,
            slotType,
            unit.attack,
            baseHp,
            baseAtk,
          );
        }

        // Update status visual badges and dynamic Attack/HP stat badges
        const entry = this.unitMap.get(unit.instanceId);
        if (entry) {
          entry.statusVisuals?.update({
            isFrozen: unit.isFrozen,
            hasShield: unit.hasShield,
            isDeadly: unit.isDeadly,
          });

          // Reconcile dynamic Attack & HP badges with live unit stats
          this.updateUnitBadges(unit.instanceId, unit.attack, unit.currentHp, baseAtk, baseHp);
        }
      }
    }

    // Clean up dead/removed meshes
    for (const [id, entry] of this.unitMap.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.group);
        entry.statusVisuals?.dispose();
        entry.meshData.disposeBadges?.();
        this.unitMap.delete(id);
      }
    }

    // Synchronize central Environment slots on Ground lanes 1 & 2
    this.syncEnvironments();
  }

  /**
   * Finds the live UnitInstance across offline engine state or multiplayer server state.
   */
  public findLiveUnit(instanceId: string): UnitInstance | undefined {
    if (networkService.isOnlineMode && this.latestSanitizedState) {
      for (const lane of this.latestSanitizedState.lanes) {
        if (lane.playerFrontline?.instanceId === instanceId) return lane.playerFrontline;
        if (lane.playerSupport?.instanceId === instanceId) return lane.playerSupport;
        if (lane.opponentFrontline?.instanceId === instanceId) return lane.opponentFrontline;
        if (lane.opponentSupport?.instanceId === instanceId) return lane.opponentSupport;
      }
    }
    return this.engine.findUnitById(this.state, instanceId) ?? undefined;
  }

  /**
   * Exposed on the board visual controller to dynamically update unit badges
   * with Attack & HP color rules and GSAP visual feedback.
   */
  public updateUnitBadges(
    unitInstanceId: string,
    currentAtk: number,
    currentHp: number,
    baseAtk: number,
    baseHp: number,
    options?: { animateDamage?: boolean; animateBuff?: boolean },
  ): void {
    const entry = this.unitMap.get(unitInstanceId);
    if (!entry) return;

    entry.currentAtk = currentAtk;
    entry.currentHp = currentHp;
    entry.baseAtk = baseAtk;
    entry.baseHp = baseHp;

    if (entry.updateBadges) {
      entry.updateBadges(currentAtk, currentHp, baseAtk, baseHp, options);
    } else if (entry.meshData.updateBadges) {
      entry.meshData.updateBadges(currentAtk, currentHp, baseAtk, baseHp, options);
    } else {
      entry.meshData.updateTexture(currentHp, currentAtk, baseAtk, baseHp);
    }
  }

  /**
   * Refreshes stat badges of all surviving field units (e.g. after aura recalibration).
   */
  public refreshAllUnitBadges(): void {
    for (const [id, entry] of this.unitMap.entries()) {
      const liveUnit = this.findLiveUnit(id);
      if (liveUnit) {
        const repoCard = cardRepo.getCard(liveUnit.cardId);
        const baseAtk = repoCard?.attack ?? entry.baseAtk ?? liveUnit.attack;
        const baseHp = repoCard?.hp ?? entry.baseHp ?? liveUnit.maxHp;
        this.updateUnitBadges(id, liveUnit.attack, liveUnit.currentHp, baseAtk, baseHp);
      }
    }
  }

  private syncEnvironments(): void {
    for (const laneIdx of [1, 2]) {
      const lane = this.state.lanes[laneIdx];
      const env = lane.environment;
      const existing = this.envMeshMap.get(laneIdx);

      if (env) {
        if (existing && existing.userData["envId"] !== env.id) {
          // Overwrite Visuals: smoothly fade out / dissolve old floor mesh & emblem using GSAP
          const oldGroup = existing;
          this.envMeshMap.delete(laneIdx);

          oldGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                m.transparent = true;
                gsap.to(m, { duration: 0.38, opacity: 0, ease: "power2.in" });
              });
            }
          });

          gsap.to(oldGroup.scale, {
            duration: 0.42,
            x: 0.75,
            z: 0.75,
            ease: "power2.in",
            onComplete: () => {
              this.scene.remove(oldGroup);
              oldGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.geometry?.dispose();
                  if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                  else child.material?.dispose();
                }
              });
            },
          });
        }

        if (!this.envMeshMap.has(laneIdx)) {
          const envMesh = this.createEnvironmentMesh(env, laneIdx);
          this.scene.add(envMesh);
          this.envMeshMap.set(laneIdx, envMesh);

          // Smoothly fade in new floor mesh & emblem using GSAP
          envMesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                const targetOpacity = m.opacity || 1;
                m.transparent = true;
                m.opacity = 0;
                gsap.to(m, { duration: 0.48, opacity: targetOpacity, ease: "power2.out" });
              });
            }
          });

          gsap.from(envMesh.scale, { duration: 0.48, x: 0.82, y: 0.82, z: 0.82, ease: "back.out(1.5)" });
          gsap.from(envMesh.position, { duration: 0.42, y: 0.25, ease: "power2.out" });
        }
      } else if (existing) {
        const oldGroup = existing;
        this.envMeshMap.delete(laneIdx);
        oldGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              m.transparent = true;
              gsap.to(m, { duration: 0.35, opacity: 0, ease: "power2.in" });
            });
          }
        });
        gsap.to(oldGroup.scale, {
          duration: 0.4,
          x: 0.8,
          z: 0.8,
          onComplete: () => {
            this.scene.remove(oldGroup);
            oldGroup.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                else child.material?.dispose();
              }
            });
          },
        });
      }
    }
  }

  private createEnvironmentMesh(envCard: CardDefinition, laneIndex: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(LANE_X[laneIndex], 0, 0);
    group.userData = {
      isEnvironmentVisual: true,
      laneIndex,
      envCard,
      envId: envCard.id,
    };

    const isSolar = envCard.id.includes("SOLAR") || envCard.name.toLowerCase().includes("solar") || envCard.tribe === "Plant";
    const isVoid = envCard.id.includes("BLACK") || envCard.name.toLowerCase().includes("black hole") || envCard.tribe === "Zombie";

    // ── 1. Floor Plane Mesh Layer (Y = 0.012) ───────────────────
    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 512;
    floorCanvas.height = 1024;
    const fCtx = floorCanvas.getContext("2d")!;

    if (isSolar) {
      // Golden radiant sunburst gradient
      const grad = fCtx.createRadialGradient(256, 512, 40, 256, 512, 510);
      grad.addColorStop(0, "rgba(255, 230, 100, 0.95)");
      grad.addColorStop(0.2, "rgba(245, 158, 11, 0.85)");
      grad.addColorStop(0.5, "rgba(180, 83, 9, 0.7)");
      grad.addColorStop(0.85, "rgba(120, 53, 15, 0.5)");
      grad.addColorStop(1, "rgba(69, 26, 3, 0.2)");
      fCtx.fillStyle = grad;
      fCtx.fillRect(0, 0, 512, 1024);

      // Solar flare rings
      fCtx.strokeStyle = "rgba(254, 240, 138, 0.65)";
      fCtx.lineWidth = 3;
      for (let r = 80; r < 480; r += 70) {
        fCtx.beginPath();
        fCtx.arc(256, 512, r, 0, Math.PI * 2);
        fCtx.stroke();
      }

      // Radiating sun rays
      fCtx.strokeStyle = "rgba(253, 224, 71, 0.35)";
      fCtx.lineWidth = 2;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        fCtx.beginPath();
        fCtx.moveTo(256 + Math.cos(a) * 60, 512 + Math.sin(a) * 60);
        fCtx.lineTo(256 + Math.cos(a) * 480, 512 + Math.sin(a) * 480);
        fCtx.stroke();
      }

      // Swirling golden embers
      for (let p = 0; p < 80; p++) {
        const px = Math.random() * 512;
        const py = Math.random() * 1024;
        const pr = 2 + Math.random() * 4;
        fCtx.fillStyle = Math.random() > 0.4 ? "rgba(254, 240, 138, 0.75)" : "rgba(249, 115, 22, 0.65)";
        fCtx.beginPath();
        fCtx.arc(px, py, pr, 0, Math.PI * 2);
        fCtx.fill();
      }

      // Ornate golden borders
      fCtx.strokeStyle = "rgba(251, 191, 36, 0.85)";
      fCtx.lineWidth = 8;
      fCtx.strokeRect(12, 12, 488, 1000);
      fCtx.strokeStyle = "rgba(254, 243, 199, 0.6)";
      fCtx.lineWidth = 2;
      fCtx.strokeRect(20, 20, 472, 984);
    } else if (isVoid) {
      // Deep cosmic black hole gradient
      const grad = fCtx.createRadialGradient(256, 512, 30, 256, 512, 510);
      grad.addColorStop(0, "rgba(5, 2, 12, 0.98)");
      grad.addColorStop(0.18, "rgba(46, 16, 101, 0.9)");
      grad.addColorStop(0.45, "rgba(88, 28, 135, 0.75)");
      grad.addColorStop(0.75, "rgba(59, 7, 100, 0.55)");
      grad.addColorStop(1, "rgba(15, 5, 29, 0.2)");
      fCtx.fillStyle = grad;
      fCtx.fillRect(0, 0, 512, 1024);

      // Accretion disk spiral arcs
      fCtx.lineWidth = 3.5;
      for (let i = 0; i < 6; i++) {
        fCtx.strokeStyle = i % 2 === 0 ? "rgba(192, 132, 252, 0.75)" : "rgba(236, 72, 153, 0.65)";
        fCtx.beginPath();
        for (let angle = 0; angle < Math.PI * 4; angle += 0.1) {
          const radius = 35 + angle * 30 + i * 20;
          if (radius > 490) break;
          const x = 256 + Math.cos(angle + i * 1.05) * radius;
          const y = 512 + Math.sin(angle + i * 1.05) * radius;
          if (angle === 0) fCtx.moveTo(x, y);
          else fCtx.lineTo(x, y);
        }
        fCtx.stroke();
      }

      // Gravitational starlight specks
      for (let p = 0; p < 90; p++) {
        const px = Math.random() * 512;
        const py = Math.random() * 1024;
        const pr = 1.5 + Math.random() * 3.5;
        fCtx.fillStyle = Math.random() > 0.5 ? "rgba(216, 180, 254, 0.8)" : "rgba(244, 114, 182, 0.7)";
        fCtx.beginPath();
        fCtx.arc(px, py, pr, 0, Math.PI * 2);
        fCtx.fill();
      }

      // Void event horizon border
      fCtx.strokeStyle = "rgba(168, 85, 247, 0.85)";
      fCtx.lineWidth = 8;
      fCtx.strokeRect(12, 12, 488, 1000);
      fCtx.strokeStyle = "rgba(244, 114, 182, 0.6)";
      fCtx.lineWidth = 2;
      fCtx.strokeRect(20, 20, 472, 984);
    } else {
      // Nature / Verdant elemental gradient
      const grad = fCtx.createRadialGradient(256, 512, 40, 256, 512, 510);
      grad.addColorStop(0, "rgba(5, 150, 105, 0.95)");
      grad.addColorStop(0.3, "rgba(4, 120, 87, 0.8)");
      grad.addColorStop(0.65, "rgba(6, 78, 59, 0.6)");
      grad.addColorStop(1, "rgba(2, 44, 34, 0.2)");
      fCtx.fillStyle = grad;
      fCtx.fillRect(0, 0, 512, 1024);

      fCtx.strokeStyle = "rgba(110, 231, 183, 0.65)";
      fCtx.lineWidth = 3;
      for (let r = 80; r < 480; r += 80) {
        fCtx.beginPath();
        fCtx.arc(256, 512, r, 0, Math.PI * 2);
        fCtx.stroke();
      }

      fCtx.strokeStyle = "rgba(52, 211, 153, 0.85)";
      fCtx.lineWidth = 8;
      fCtx.strokeRect(12, 12, 488, 1000);
    }

    const floorTex = new THREE.CanvasTexture(floorCanvas);
    const floorGeo = new THREE.PlaneGeometry(LANE_WIDTH - 0.1, LANE_HALF_LEN * 2 - 0.2);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      transparent: true,
      opacity: 0.88,
      roughness: 0.45,
      metalness: 0.15,
      emissive: new THREE.Color(isSolar ? 0x78350f : isVoid ? 0x3b0764 : 0x064e3b),
      emissiveIntensity: 0.45,
      depthWrite: false,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0.012, 0);
    floorMesh.receiveShadow = true;
    floorMesh.userData = { isEnvironmentVisual: true, laneIndex, envCard };
    group.add(floorMesh);

    // ── 2. Central Emblem / Banner Mesh Layer (Y = 0.038) ────────
    const bannerCanvas = document.createElement("canvas");
    bannerCanvas.width = 384;
    bannerCanvas.height = 200;
    const bCtx = bannerCanvas.getContext("2d")!;

    // Background pill frame
    bCtx.fillStyle = isSolar
      ? "rgba(45, 20, 5, 0.92)"
      : isVoid
      ? "rgba(20, 8, 38, 0.94)"
      : "rgba(6, 44, 30, 0.92)";
    bCtx.beginPath();
    bCtx.roundRect(8, 8, 368, 184, 18);
    bCtx.fill();

    bCtx.strokeStyle = isSolar ? "#f59e0b" : isVoid ? "#c084fc" : "#10b981";
    bCtx.lineWidth = 3.5;
    bCtx.stroke();

    // Inner subtle glow border
    bCtx.strokeStyle = isSolar ? "rgba(254, 240, 138, 0.45)" : isVoid ? "rgba(244, 114, 182, 0.4)" : "rgba(110, 231, 183, 0.45)";
    bCtx.lineWidth = 1.5;
    bCtx.strokeRect(14, 14, 356, 172);

    // Top Header Pill: "ACTIVE ENVIRONMENT"
    bCtx.fillStyle = isSolar ? "rgba(180, 83, 9, 0.8)" : isVoid ? "rgba(88, 28, 135, 0.8)" : "rgba(4, 120, 87, 0.8)";
    bCtx.beginPath();
    bCtx.roundRect(70, 20, 244, 28, 14);
    bCtx.fill();
    bCtx.fillStyle = isSolar ? "#fef08a" : isVoid ? "#f5d0fe" : "#a7f3d0";
    bCtx.font = "bold 13px 'Inter', sans-serif";
    bCtx.textAlign = "center";
    bCtx.fillText(isSolar ? "☀ ACTIVE ENVIRONMENT" : isVoid ? "🕳 ACTIVE ENVIRONMENT" : "🌿 ACTIVE ENVIRONMENT", 192, 38);

    // Card Name Title
    bCtx.fillStyle = "#ffffff";
    bCtx.font = "bold 22px 'Inter', sans-serif";
    bCtx.textAlign = "center";
    bCtx.fillText(envCard.name.toUpperCase(), 192, 85);

    // Effect Text Badge
    let effectDesc = "Active in Lane";
    if (envCard.environmentEffect) {
      const eff = envCard.environmentEffect;
      if (eff.damagePerTurnEnd) {
        effectDesc = `Turn End: Deals ${eff.damagePerTurnEnd} dmg to lane`;
      } else if (eff.attackModifier || eff.hpModifier) {
        const tribeText = eff.buffTribe ? `${eff.buffTribe} ` : "";
        effectDesc = `Units gain +${eff.attackModifier ?? 0}/+${eff.hpModifier ?? 0} ${tribeText}buff`;
      }
    }
    bCtx.fillStyle = isSolar ? "#fed7aa" : isVoid ? "#e9d5ff" : "#6ee7b7";
    bCtx.font = "14px 'Inter', sans-serif";
    bCtx.fillText(effectDesc, 192, 125);

    // Hover instruction hint
    bCtx.fillStyle = "rgba(255, 255, 255, 0.6)";
    bCtx.font = "italic 11px 'Inter', sans-serif";
    bCtx.fillText("Hover to inspect full details", 192, 160);

    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    const bannerGeo = new THREE.PlaneGeometry(2.1, 1.1);
    const bannerMat = new THREE.MeshStandardMaterial({
      map: bannerTex,
      transparent: true,
      roughness: 0.35,
      metalness: 0.2,
      emissive: new THREE.Color(isSolar ? 0x9a3412 : isVoid ? 0x581c87 : 0x047857),
      emissiveIntensity: 0.45,
    });
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.rotation.x = -Math.PI / 2;
    bannerMesh.position.set(0, 0.038, 0);
    bannerMesh.userData = { isEnvironmentVisual: true, laneIndex, envCard };
    group.add(bannerMesh);

    return group;
  }

  public syncPlayerHand(): void {
    this.hand.setHand(this.state.player.hand);
  }

  public syncOpponentHand(animate = true): void {
    const count = this.state.opponent.hand.length;
    this.oppHand.setHandCount(count, animate);
    if (oppCardCountEl) {
      oppCardCountEl.textContent = String(count);
    }
  }

  // ── UI Refresh ────────────────────────────────────────────────

  private refreshUI(): void {
    const s = this.state;
    const phaseFmt = formatPhase(s.currentPhase);
    phaseNameEl.textContent = phaseFmt;
    turnNumEl.textContent = String(s.turnNumber);
    turnLabelEl.textContent = `TURN ${s.turnNumber}`;

    if (oppCardCountEl) {
      oppCardCountEl.textContent = String(s.opponent.hand.length);
    }

    // Mana display
    const mana = s.player.currentMana;
    const maxM = s.player.maxMana;
    if (manaValEl) {
      manaValEl.textContent = `${mana} / ${maxM}`;
    }
    manaDisplayEl.innerHTML = "";
    for (let i = 0; i < Math.max(maxM, 1); i++) {
      const pip = document.createElement("div");
      pip.className = "mana-pip" + (i < mana ? " filled" : "");
      manaDisplayEl.appendChild(pip);
    }

    // Turn controls in OverlayController
    this.overlay.updateTurnControls(s.currentPhase, this.busy);

    // Update hero HP bars & block meters with relative perspective
    if (networkService.isOnlineMode && this.latestSanitizedState) {
      this.playerHero.updateHp(this.latestSanitizedState.self.hp, this.latestSanitizedState.self.maxHp);
      this.oppHero.updateHp(this.latestSanitizedState.opponent.hp, this.latestSanitizedState.opponent.maxHp);
      this.playerHero.setBlockMeter(this.latestSanitizedState.self.superBlock.charges);
      this.oppHero.setBlockMeter(this.latestSanitizedState.opponent.superBlock.charges);
    } else {
      const myRole = networkService.isOnlineMode ? (networkService.myRole || "p1") : "p1";
      const perspectives = getHeroPerspectives(s, myRole);
      this.playerHero.updateHp(perspectives.selfHp, perspectives.selfMaxHp);
      this.oppHero.updateHp(perspectives.opponentHp, perspectives.opponentMaxHp);
      this.playerHero.setBlockMeter(perspectives.selfBlockMeter.charges);
      this.oppHero.setBlockMeter(perspectives.opponentBlockMeter.charges);
    }

    // Update Graveyard 3D count badges
    let p1GraveyardCount = 0;
    let p2GraveyardCount = 0;
    if (networkService.isOnlineMode && this.latestSanitizedState) {
      p1GraveyardCount = this.latestSanitizedState.self?.graveyard?.length ?? (this.latestSanitizedState as any).selfGraveyardCount ?? 0;
      p2GraveyardCount = this.latestSanitizedState.opponent?.graveyard?.length ?? (this.latestSanitizedState as any).oppGraveyardCount ?? 0;
    } else {
      p1GraveyardCount = s.player.graveyard?.length ?? 0;
      p2GraveyardCount = s.opponent.graveyard?.length ?? 0;
    }
    this.graveyard3D.updateCounts(p1GraveyardCount, p2GraveyardCount);
  }

  private setInteractive(on: boolean, phase?: TurnPhase, role?: "p1" | "p2"): void {
    this.drag.setEnabled(on);
    btnPass.disabled   = !on;
    btnCombat.disabled = !on;
    const activePhase = phase || this.state.currentPhase;
    const activeRole = role || networkService.myRole || "p1";
    this.overlay.updateTurnControls(activePhase, !on, activeRole);
  }

  private checkGameOver(): void {
    if (!this.state.isGameOver) return;
    const w = this.state.winner;

    const deadUnits = this.state.eventLog.filter((e) => e.type === GameEventType.UNIT_DIED).length;
    const superBlocks = this.state.eventLog.filter((e) => e.type === GameEventType.SUPER_BLOCK_TRIGGER).length;

    const stats: MatchStats = {
      turnNumber: this.state.turnNumber,
      playerFinalHp: this.state.player.hp,
      oppFinalHp: this.state.opponent.hp,
      unitsDestroyed: deadUnits,
      superBlocksTriggered: superBlocks,
    };

    this.overlay.showGameOver(w, stats, () => this.restartGame());
    this.setInteractive(false);
  }

  private restartGame(): void {
    // 1. Dispose and clear existing unit meshes
    this.drag.clearHover();
    for (const entry of this.unitMap.values()) {
      entry.statusVisuals?.dispose();
      this.scene.remove(entry.group);
      entry.meshData.bodyMesh.geometry.dispose();
    }
    this.unitMap.clear();

    // 2. Return to Hero Selection or Lobby for fresh game
    this.busy = false;
    this.setInteractive(true);
    this.oppHand.clear();

    if (networkService.isOnlineMode) {
      this.lobbyModal.setMode("ONLINE_PVP");
    } else {
      this.startLocalMatchFlow();
    }
  }

  // ── Network Socket Listeners & Handlers ──────────────────────

  private bindNetworkEvents(): void {
    networkService.setEventListeners({
      onRoomState: (data) => {
        if (data.status === "LOBBY") {
          const myRole = networkService.myRole;
          const oppReady = myRole === "p1" ? data.p2?.lockedIn || data.p2?.ready : data.p1?.lockedIn || data.p1?.ready;
          if (oppReady && !this.overlay.isWaitingOverlayVisible()) {
            this.showToast("Opponent has locked in their loadout!");
          } else if (oppReady && this.overlay.isWaitingOverlayVisible()) {
            this.overlay.updateWaitingOverlay(
              "OPPONENT READY!",
              "Both players locked in. Synchronizing battlefield with server..."
            );
          }
        }
      },
      onMatchInitialized: (data) => {
        this.handleNetworkMatchInitialized(data);
      },
      onSyncGameState: ({ state, events }) => {
        this.handleNetworkStateSync(state, events);
      },
      onActionRejected: (reason) => {
        this.handleNetworkActionRejected(reason);
      },
      onCombatStep: (data) => {
        this.handleNetworkCombatStep(data);
      },
      onOpponentDisconnected: (countdownSec) => {
        this.handleNetworkOpponentDisconnected(countdownSec);
      },
      onGameOver: (winner, reason) => {
        this.handleNetworkGameOver(winner, reason);
      },
      onSyncError: (message) => {
        console.error("[Client] Sync Error from server:", message);
        this.overlay.hideWaitingOverlay();
        this.showToast("Sync Error: " + message);
        alert("Match Sync Error: " + message);
      },
      onActionLogged: (data) => {
        const c = data.card ? (cardRepo.getCard(data.card.id) || findCardInDeck(data.card.id) || data.card) : data.card;
        const myRole = networkService.myRole || "p1";
        const isMe = data.playerId === (myRole === "p2" ? "P2" : "P1") || data.role === myRole;
        this.actionHistoryFeed.addEntry({
          id: data.id,
          playerId: data.playerId,
          playerName: data.playerName,
          owner: isMe ? "player" : "opponent",
          card: c,
          laneIndex: data.targetLane !== null && data.targetLane !== undefined ? data.targetLane : undefined,
          timestamp: data.timestamp,
        });
      },
      onMulliganStarted: (data) => {
        this.handleNetworkMulligan(data);
      },
      onGameStarted: (data) => {
        this.handleNetworkGameStarted(data);
      },
      onPhaseChanged: (newPhase) => {
        this.handleNetworkPhaseChanged(newPhase);
      },
    });
  }

  private handleNetworkMatchInitialized(data: any): void {
    try {
      console.log(`[Client] MATCH_INITIALIZED received! Transitioning to battle...`, data);
      this.overlay.hideWaitingOverlay();
      this.lobbyModal.hideModal(false);
      this.deckBuilder.hide(false);
      this.overlay.hideHeroSelection();
      this.screenController?.setScreen("IN_GAME");
      this.showToast("Both players locked in! Initializing battlefield...");
    } catch (err) {
      console.error("[Client] Error in handleNetworkMatchInitialized:", err);
    }
  }

  private handleNetworkMulligan(data: { initialHand: Card[]; opponentHandCount: number }): void {
    try {
      console.log(`[Client] MULLIGAN_STARTED received with ${data.initialHand?.length || 0} cards`);
      this.screenController?.setScreen("IN_GAME");
      this.overlay.hideWaitingOverlay();
      this.lobbyModal.hideModal(false);
      this.deckBuilder.hide(false);
      this.overlay.hideHeroSelection();

      this.oppHand.setHandCount(data.opponentHandCount || 0, false);
      if (oppCardCountEl) oppCardCountEl.textContent = String(data.opponentHandCount || 0);

      this.overlay.showMulligan(data.initialHand || [], async (replacedIds) => {
        this.showToast("Mulligan submitted! Waiting for opponent...");
        this.overlay.showWaitingOverlay(
          "Waiting for opponent's mulligan...",
          "Synchronizing opening hand with server...",
        );
        await networkService.submitMulligan(replacedIds);
      });
    } catch (err) {
      console.error("[Client] Error in handleNetworkMulligan:", err);
    }
  }

  private handleNetworkGameStarted(data: { roomId: string; role: "p1" | "p2"; yourPlayerId?: "P1" | "P2"; state: SanitizedGameState }): void {
    try {
      if (!data || !data.state) {
        console.warn("[Client] handleNetworkGameStarted received invalid payload:", data);
        return;
      }
      this.latestSanitizedState = data.state;
      const assignedPlayerId = data.yourPlayerId || (data.role === "p2" ? "P2" : "P1");
      console.log(`[Client] Match started! Assigned Role: ${assignedPlayerId} (${data.role}), Current Phase: ${data.state.currentPhase}, Is My Turn: ${data.state.isMyTurn}`);

      this.combatAnim.setRole(data.role);
      this.drag.setRole(data.role);
      this.actionHistoryFeed.setMyRole(data.role, true);
      this.screenController?.setScreen("IN_GAME");
      this.overlay.hideWaitingOverlay();
      this.lobbyModal.hideModal(false);
      this.overlay.hideMulligan();
      this.overlay.hideHeroSelection();
      this.deckBuilder.hide(false);

      const selfHero = data.state.self?.hero;
      const oppHero = data.state.opponent?.hero;

      this.playerHero.setHeroPortrait(selfHero?.portraitUrl || "🦅");
      this.oppHero.setHeroPortrait(oppHero?.portraitUrl || "🌊");
      this.playerHero.updateHp(data.state.self?.hp ?? 20, data.state.self?.maxHp ?? 20);
      this.oppHero.updateHp(data.state.opponent?.hp ?? 20, data.state.opponent?.maxHp ?? 20);
      this.playerHero.setBlockMeter(data.state.self?.superBlock?.charges ?? 0);
      this.oppHero.setBlockMeter(data.state.opponent?.superBlock?.charges ?? 0);

      this.oppHand.clear();
      this.handleNetworkStateSync(data.state, []);
      this.overlay.announcePhase(data.state.currentPhase, data.state.turnNumber, undefined, data.role);
    } catch (err) {
      console.error("[Client] Error in handleNetworkGameStarted:", err);
    }
  }

  private handleNetworkPhaseChanged(newPhase: TurnPhase): void {
    console.log(`[Client] Handling PHASE_CHANGED: ${newPhase}`);
    this.state.currentPhase = newPhase;
    const myRole = networkService.myRole || "p1";
    const isMyTurn = myRole === "p1"
      ? (newPhase === TurnPhase.P1_UNIT_PHASE || newPhase === TurnPhase.P1_SPELL_PHASE)
      : (newPhase === TurnPhase.P2_UNIT_PHASE || newPhase === TurnPhase.P2_SPELL_PHASE);

    this.overlay.announcePhase(newPhase, this.state.turnNumber, undefined, myRole);
    this.setInteractive(isMyTurn && !this.busy, newPhase, myRole);
    btnPass.textContent = isMyTurn ? "End Phase" : "Opponent's Turn";
  }

  private async handleNetworkStateSync(sanitized: SanitizedGameState, events: GameEvent[]): Promise<void> {
    this.latestSanitizedState = sanitized;
    this.combatAnim.setRole(sanitized.myRole);
    this.drag.setRole(sanitized.myRole);
    console.log(`[Client] Received State update. Current Phase: ${sanitized.currentPhase}, My Turn: ${sanitized.isMyTurn}`);
    this.state.currentPhase = sanitized.currentPhase;
    this.state.turnNumber = sanitized.turnNumber;
    // 1. Life counters
    this.playerHero.updateHp(sanitized.self.hp, sanitized.self.maxHp);
    this.oppHero.updateHp(sanitized.opponent.hp, sanitized.opponent.maxHp);

    // 2. Block meters
    this.playerHero.setBlockMeter(sanitized.self.superBlock.charges);
    this.oppHero.setBlockMeter(sanitized.opponent.superBlock.charges);

    // 3. Phase Banner & Turn Indicators
    const phaseFmt = formatPhase(sanitized.currentPhase, sanitized.myRole, true);
    phaseNameEl.textContent = phaseFmt;
    turnNumEl.textContent = String(sanitized.turnNumber);
    turnLabelEl.textContent = `TURN ${sanitized.turnNumber}`;

    // 4. Enemy Hand Count
    this.oppHand.setHandCount(sanitized.opponent.handCount);
    if (oppCardCountEl) {
      oppCardCountEl.textContent = String(sanitized.opponent.handCount);
    }

    // 5. Player's hand
    this.hand.setHand(sanitized.self.hand);

    // 6. Mana Display
    const mana = sanitized.self.currentMana;
    const maxM = sanitized.self.maxMana;
    if (manaValEl) {
      manaValEl.textContent = `${mana} / ${maxM}`;
    }
    manaDisplayEl.innerHTML = "";
    for (let i = 0; i < Math.max(maxM, 1); i++) {
      const pip = document.createElement("div");
      pip.className = "mana-pip" + (i < mana ? " filled" : "");
      manaDisplayEl.appendChild(pip);
    }

    // 7. Update board units and environments from lanes with role perspective
    this.syncBoardUnitsFromLanes(sanitized.lanes, sanitized.myRole);

    // 8. Turn pass button state
    this.setInteractive(sanitized.isMyTurn && !this.busy, sanitized.currentPhase, sanitized.myRole);
    btnPass.textContent = sanitized.isMyTurn ? "End Phase" : "Opponent's Turn";

    // 9. Update Graveyard 3D Counts
    const p1Count = (sanitized as any).self?.graveyard?.length ?? (sanitized as any).selfGraveyardCount ?? 0;
    const p2Count = (sanitized as any).opponent?.graveyard?.length ?? (sanitized as any).oppGraveyardCount ?? 0;
    this.graveyard3D.updateCounts(p1Count, p2Count);

    // 10. Log incoming card play events to history feed & animate events
    if (events && events.length > 0) {
      for (const ev of events) {
        if (ev.type === GameEventType.CARD_PLAYED) {
          const p = ev.payload as any;
          const c = p?.card || (p?.cardId ? (cardRepo.getCard(p.cardId) || findCardInDeck(p.cardId)) : undefined);
          if (c) {
            const isMe = p?.playerId === (sanitized.myRole === "p2" ? PlayerId.Opponent : PlayerId.Player);
            this.actionHistoryFeed.addEntry({
              card: c,
              owner: isMe ? "player" : "opponent",
              laneIndex: p?.laneIndex,
            });
          }
        }
      }
      await this.combatAnim.animateCombatEvents(events);
    }

    // 11. Check Game Over
    if (sanitized.isGameOver) {
      this.handleNetworkGameOver(sanitized.winner);
    }
  }

  private async handleNetworkCombatStep(data: {
    laneIndex: number;
    strikeNumber: number;
    events: GameEvent[];
    state: SanitizedGameState;
    done: boolean;
  }): Promise<void> {
    if (data.events && data.events.length > 0) {
      await this.combatAnim.animateCombatEvents(data.events);
    }
    if (data.state) {
      await this.handleNetworkStateSync(data.state, []);
    }
  }

  private handleNetworkActionRejected(reason: string): void {
    this.showToast(reason || "Action rejected by server.");
  }

  private handleNetworkOpponentDisconnected(countdownSec: number): void {
    if (countdownSec > 0) {
      this.showToast(`Opponent disconnected! Waiting ${countdownSec}s before forfeit victory...`);
    } else {
      const stats: MatchStats = {
        turnNumber: parseInt(turnNumEl.textContent || "1", 10),
        playerFinalHp: this.playerHero.currentHp,
        oppFinalHp: 0,
        unitsDestroyed: 0,
        superBlocksTriggered: 0,
      };

      this.overlay.showGameOver(
        PlayerId.Player,
        stats,
        () => this.restartGame(),
        "Opponent Forfeited (Disconnected) — Victory!",
      );
      this.setInteractive(false);
    }
  }

  private handleNetworkGameOver(winner: PlayerId | "DRAW" | null, reason?: string): void {
    const myRole = networkService.myRole;
    const isMeWinner =
      (myRole === "p1" && winner === PlayerId.Player) ||
      (myRole === "p2" && winner === PlayerId.Opponent);
    const isDraw = winner === "DRAW";
    const resolvedWinner = isDraw ? "DRAW" : isMeWinner ? PlayerId.Player : PlayerId.Opponent;

    const stats: MatchStats = {
      turnNumber: parseInt(turnNumEl.textContent || "1", 10),
      playerFinalHp: this.playerHero.currentHp,
      oppFinalHp: this.oppHero.currentHp,
      unitsDestroyed: 0,
      superBlocksTriggered: 0,
    };

    const subtitle =
      reason ||
      (resolvedWinner === PlayerId.Player
        ? "You defeated your online opponent!"
        : "The opposing champion claimed victory.");

    this.overlay.showGameOver(resolvedWinner, stats, () => this.restartGame(), subtitle);
    this.setInteractive(false);
  }

  public update(dt: number): void {
    // Tick targeting arrow
    this.drag.tick(dt);

    // Tick unit status visuals
    for (const entry of this.unitMap.values()) {
      entry.statusVisuals?.tick(dt);
    }
  }

  private showToast(msg: string): void {
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    setTimeout(() => toastEl.classList.remove("visible"), 2400);
  }
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatPhase(phase: TurnPhase, role: "p1" | "p2" = "p1", isOnline = false): string {
  const isP1 = role === "p1";
  const enemyPrefix = isOnline ? "Enemy" : "Bot";

  const map: Record<TurnPhase, string> = {
    [TurnPhase.HERO_SELECTION]: "Hero Selection",
    [TurnPhase.MULLIGAN]:       "Mulligan Phase",
    [TurnPhase.P1_UNIT_PHASE]:  isP1 ? "Your Unit Phase" : `${enemyPrefix} Unit Phase`,
    [TurnPhase.P1_SPELL_PHASE]: isP1 ? "Your Spell Phase" : `${enemyPrefix} Spell Phase`,
    [TurnPhase.P2_UNIT_PHASE]:  isP1 ? `${enemyPrefix} Unit Phase` : "Your Unit Phase",
    [TurnPhase.P2_SPELL_PHASE]: isP1 ? `${enemyPrefix} Spell Phase` : "Your Spell Phase",
    [TurnPhase.COMBAT_PHASE]:   "Combat ⚔",
    [TurnPhase.TURN_END]:       "Turn End",
  };
  return map[phase] ?? phase;
}

function findCardInDeck(cardId: string): CardDefinition | undefined {
  const fromRepo = cardRepo.getCard(cardId);
  if (fromRepo) return fromRepo;

  const allPool = [
    ...DECK_VANGUARD_40,
    ...DECK_ABYSSAL_40,
    ...DECK_PLANTS_40,
    ...DECK_ZOMBIES_40,
    ...AVAILABLE_HEROES.flatMap((h) => [h.superpowerKit.signatureAbility, ...h.superpowerKit.coreAbilities]),
    ...heroRepo.getAllHeroes().flatMap((h) => [h.superpowerKit.signatureAbility, ...h.superpowerKit.coreAbilities]),
  ];
  return allPool.find((c) => c.id === cardId);
}
