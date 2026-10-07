import { GameState, Hero, PlayerId, SuperBlockMeter } from "./types";

export interface HeroPerspectives {
  selfHero: Hero;
  selfBlockMeter: SuperBlockMeter;
  opponentHero: Hero;
  opponentBlockMeter: SuperBlockMeter;
  selfHp: number;
  selfMaxHp: number;
  opponentHp: number;
  opponentMaxHp: number;
}

export type PlayerPerspectiveId = "P1" | "P2" | "p1" | "p2" | PlayerId;

/**
 * Resolves dynamic perspective mapping (Self vs Opponent) for Hero and Block Meter.
 * Supports:
 *  - Flat format: { p1Hero, p2Hero, p1BlockMeter, p2BlockMeter }
 *  - Full engine GameState: gameState.player and gameState.opponent
 *  - SanitizedGameState: gameState.self and gameState.opponent
 */
export function getHeroPerspectives(
  gameState: GameState | any,
  myPlayerId: PlayerPerspectiveId = "P1",
): HeroPerspectives {
  const isP1 = myPlayerId === "P1" || myPlayerId === "p1" || myPlayerId === PlayerId.Player;

  // 1. Support flat properties if provided directly
  const flatP1Hero: Hero | undefined = (gameState as any).p1Hero;
  const flatP2Hero: Hero | undefined = (gameState as any).p2Hero;
  const flatP1Block: SuperBlockMeter | undefined = (gameState as any).p1BlockMeter;
  const flatP2Block: SuperBlockMeter | undefined = (gameState as any).p2BlockMeter;

  // 2. Support standard GameState (player = P1, opponent = P2)
  const defaultMeter: SuperBlockMeter = { charges: 0, triggerCount: 0, superBlockTriggered: false };
  const p1Hero = flatP1Hero ?? gameState.player?.hero;
  const p2Hero = flatP2Hero ?? gameState.opponent?.hero;

  const p1BlockMeter = flatP1Block ?? gameState.player?.superBlock ?? defaultMeter;
  const p2BlockMeter = flatP2Block ?? gameState.opponent?.superBlock ?? defaultMeter;

  const p1Hp = (gameState as any).p1Hp ?? gameState.player?.hp ?? p1Hero?.maxHp ?? 20;
  const p1MaxHp = (gameState as any).p1MaxHp ?? gameState.player?.maxHp ?? p1Hero?.maxHp ?? 20;
  const p2Hp = (gameState as any).p2Hp ?? gameState.opponent?.hp ?? p2Hero?.maxHp ?? 20;
  const p2MaxHp = (gameState as any).p2MaxHp ?? gameState.opponent?.maxHp ?? p2Hero?.maxHp ?? 20;

  return {
    selfHero: isP1 ? p1Hero : p2Hero,
    selfBlockMeter: isP1 ? p1BlockMeter : p2BlockMeter,
    opponentHero: isP1 ? p2Hero : p1Hero,
    opponentBlockMeter: isP1 ? p2BlockMeter : p1BlockMeter,
    selfHp: isP1 ? p1Hp : p2Hp,
    selfMaxHp: isP1 ? p1MaxHp : p2MaxHp,
    opponentHp: isP1 ? p2Hp : p1Hp,
    opponentMaxHp: isP1 ? p2MaxHp : p1MaxHp,
  };
}
