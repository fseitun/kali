import { getNextTargets, getTargets } from "./board-next";
import type { GameState } from "./types";

type SquareShape = {
  next?: number[] | Record<string, string[]>;
  prev?: number[];
  nextOnLanding?: number[];
  prevOnLanding?: number[];
};

export type RollMovementDirection = "forward" | "backward";

function advanceOneStep(
  current: number,
  targets: number[],
  activeChoices: Record<string, number>,
): number {
  const saved = activeChoices[current];
  return saved !== undefined && targets.includes(saved) ? saved : (targets[0] ?? current);
}

function getForwardLandingHop(
  landedSq: SquareShape | undefined,
  inverseMode: boolean,
): number[] | undefined {
  if (inverseMode && landedSq?.prevOnLanding?.length) {
    const nextTargets = getNextTargets(landedSq);
    return nextTargets?.length ? [nextTargets[0]] : undefined;
  }
  return landedSq?.nextOnLanding ?? landedSq?.prevOnLanding;
}

function getLandingHopTargets(
  landedSq: SquareShape | undefined,
  inverseMode: boolean,
  forward: boolean,
): number[] | undefined {
  return forward
    ? getForwardLandingHop(landedSq, inverseMode)
    : (landedSq?.prevOnLanding ?? landedSq?.nextOnLanding);
}

function applyLandingHop(
  current: number,
  squares: Record<string, SquareShape> | undefined,
  inverseMode: boolean,
  forward: boolean,
): number {
  const landedSq = squares?.[String(current)];
  const landingHop = getLandingHopTargets(landedSq, inverseMode, forward);
  return landingHop?.length ? landingHop[0] : current;
}

/**
 * Slice of state needed to simulate movement. `inverseMode` is a **player flag** that changes how
 * forward landing hops resolve (see `getForwardLandingHop`); it is not the same as movement
 * {@link RollMovementDirection} — normal dice always pass `direction: "forward"` regardless of inverseMode.
 */
type RollSimulationSlice = {
  squares: Record<string, SquareShape> | undefined;
  /** Player inverse-mode flag for landing-hop rules on forward steps, not roll direction. */
  inverseMode: boolean;
  activeChoices: Record<string, number>;
};

function readRollContext(state: GameState, playerId: string): RollSimulationSlice {
  const board = state.board as Record<string, unknown> | undefined;
  const squares = board?.squares as Record<string, SquareShape> | undefined;
  const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
  const inverseMode = !!(player?.inverseMode as boolean | undefined);
  const activeChoices = (player?.activeChoices as Record<string, number>) ?? {};
  return { squares, inverseMode, activeChoices };
}

/**
 * Simulates a full roll from `start` using the same step and landing-hop rules as gameplay.
 * `activeChoices` is explicit so enumeration can pass temporary overrides.
 */
export function simulateRollFromState(
  state: GameState,
  playerId: string,
  start: number,
  roll: number,
  direction: RollMovementDirection,
  activeChoices: Record<string, number>,
): number {
  const { squares, inverseMode } = readRollContext(state, playerId);
  const forward = direction === "forward";
  let current = start;

  for (let i = 0; i < roll; i++) {
    const sq = squares?.[String(current)];
    const targets = getTargets(sq, current, forward);
    current = advanceOneStep(current, targets, activeChoices);

    if (i === roll - 1) {
      current = applyLandingHop(current, squares, inverseMode, forward);
    }
  }

  return current;
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
  direction: RollMovementDirection = "forward",
): number {
  const { activeChoices } = readRollContext(state, playerId);
  return simulateRollFromState(state, playerId, currentPosition, roll, direction, activeChoices);
}

/**
 * All distinct landing squares after exactly `roll` steps, branching at every fork where
 * `activeChoices` does not already fix the branch. Uses the same step/landing-hop rules as
 * `simulateRollFromState`.
 */
export function distinctEndPositionsAfterRoll(
  state: GameState,
  playerId: string,
  start: number,
  roll: number,
  direction: RollMovementDirection,
): Set<number> {
  const { squares, inverseMode, activeChoices } = readRollContext(state, playerId);
  const forward = direction === "forward";
  const results = new Set<number>();

  function dfs(current: number, stepsLeft: number, choices: Record<string, number>): void {
    if (stepsLeft === 0) {
      results.add(current);
      return;
    }
    const sq = squares?.[String(current)];
    const targets = getTargets(sq, current, forward);
    const saved = choices[current];
    const hasResolvedBranch = saved !== undefined && targets.includes(saved);
    const mustBranch = targets.length > 1 && !hasResolvedBranch;

    if (mustBranch) {
      for (const t of targets) {
        const nextChoices = { ...choices, [current]: t };
        const nextPos = t;
        if (stepsLeft === 1) {
          results.add(applyLandingHop(nextPos, squares, inverseMode, forward));
        } else {
          dfs(nextPos, stepsLeft - 1, nextChoices);
        }
      }
      return;
    }

    const nextPos = advanceOneStep(current, targets, choices);
    if (stepsLeft === 1) {
      results.add(applyLandingHop(nextPos, squares, inverseMode, forward));
    } else {
      dfs(nextPos, stepsLeft - 1, choices);
    }
  }

  dfs(start, roll, { ...activeChoices });
  return results;
}
