// ============================================================
//  TLL TimeSlayer — Public API Barrel
// ============================================================

// Types
export * from "./types";

// Constants
export * from "./constants";

// Pure utilities
export {
  makeEvent,
  resetSeq,
  randomInt,
  shuffleArray,
  nextInstanceId,
  isLaneLegal,
  phaseToPlayerId,
  isUnitPhase,
  isSpellPhase,
  getPlayerState,
  getOpponentId,
  computeNewMaxMana,
  applySuperBlock,
  createUnitInstance,
  cloneLane,
  cloneLanes,
  clonePlayer,
  cloneState,
  checkWinCondition,
  resolveDeathrattle,
  applyHeroDamage,
  applyUnitDamage,
} from "./utils";

// Combat
export { resolveCombat } from "./combat";

// Engine
export { GameEngine } from "./engine";

// Card Catalogue
export * from "./cards";

// Bot
export * from "./botTypes";
export { botDecideAction, botRunPhase, botInspectScores } from "./bot";

// Card Instance
export * from "./cardInstance";

// Bot Deck Generator
export * from "./BotDeckGenerator";

// Perspective Helper
export * from "./perspectiveHelper";
