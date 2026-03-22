import { getNextTargets } from "./board-next";
import type { GameState } from "./types";

type SquareShape = {
  next?: number[] | Record<string, string[]>;
  prev?: number[];
  nextOnLanding?: number[];
  prevOnLanding?: number[];
};

function getForwardTargets(sq: SquareShape | undefined, current: number): number[] {
  const nextField = sq?.next;
  if (nextField === undefined || nextField === null) {
    return current < 196 ? [current + 1] : [];
  }
  return getNextTargets(sq);
}

function advanceOneStep(
  current: number,
  targets: number[],
  activeChoices: Record<string, number>,
): number {
  const saved = activeChoices[current];
  return saved !== undefined && targets.includes(saved) ? saved : (targets[0] ?? current);
}

function getLandingHopTargets(
  landedSq: SquareShape | undefined,
  inverseMode: boolean,
): number[] | undefined {
  if (inverseMode && landedSq?.prevOnLanding?.length) {
    const nextTargets = getNextTargets(landedSq);
    return nextTargets?.length ? [nextTargets[0]] : undefined;
  }
  return landedSq?.nextOnLanding ?? landedSq?.prevOnLanding;
}

function applyLandingHop(
  current: number,
  squares: Record<string, SquareShape> | undefined,
  inverseMode: boolean,
): number {
  const landedSq = squares?.[String(current)];
  const landingHop = getLandingHopTargets(landedSq, inverseMode);
  return landingHop?.length ? landingHop[0] : current;
}

/**
 * Pure graph traversal for position simulation.
 * Used by orchestrator and validator for consistent movement logic.
 */
export function computeNewPositionFromState(
  state: GameState,
  playerId: string,
  currentPosition: number,
  roll: number,
): number {
  const board = state.board as Record<string, unknown> | undefined;
  const squares = board?.squares as Record<string, SquareShape> | undefined;
  const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
  const inverseMode = !!(player?.inverseMode as boolean | undefined);
  const activeChoices = (player?.activeChoices as Record<string, number>) ?? {};

  let current = currentPosition;

  for (let i = 0; i < roll; i++) {
    const sq = squares?.[String(current)];
    const targets = getForwardTargets(sq, current);
    current = advanceOneStep(current, targets, activeChoices);

    if (i === roll - 1) {
      current = applyLandingHop(current, squares, inverseMode);
    }
  }

  return current;
}
