import { getWinPosition } from "./board-helpers";
import { getTargets } from "./board-next";
import type { GameState } from "./types";

type SquareShape = {
  next?: number[] | Record<string, string[]>;
  prev?: number[] | Record<string, string[]>;
  nextOnLanding?: number[];
  prevOnLanding?: number[];
  /** When true, do not apply `nextOnLanding`/`prevOnLanding` here; BoardEffectsHandler owns the hop (Kalimba 82→45). */
  oceanForestOneShotPortal?: boolean;
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
  retreatEffectsReversed: boolean,
): number[] | undefined {
  if (retreatEffectsReversed && landedSq?.prevOnLanding?.length) {
    return landedSq?.nextOnLanding;
  }
  return landedSq?.nextOnLanding ?? landedSq?.prevOnLanding;
}

function getLandingHopTargets(
  landedSq: SquareShape | undefined,
  retreatEffectsReversed: boolean,
  forward: boolean,
): number[] | undefined {
  return forward
    ? getForwardLandingHop(landedSq, retreatEffectsReversed)
    : (landedSq?.prevOnLanding ?? landedSq?.nextOnLanding);
}

function applyLandingHop(
  current: number,
  squares: Record<string, SquareShape> | undefined,
  retreatEffectsReversed: boolean,
  forward: boolean,
): number {
  const landedSq = squares?.[String(current)];
  if (landedSq?.oceanForestOneShotPortal === true) {
    return current;
  }
  const landingHop = getLandingHopTargets(landedSq, retreatEffectsReversed, forward);
  return landingHop?.length ? landingHop[0] : current;
}

/**
 * Slice of state needed to simulate movement. `retreatEffectsReversed` (after Kalimba ocean–forest penalty)
 * changes how forward landing hops resolve (`prevOnLanding` vs `nextOnLanding`); it is not roll direction —
 * normal dice always pass `direction: "forward"` regardless of this flag.
 */
type RollSimulationSlice = {
  squares: Record<string, SquareShape> | undefined;
  winPosition: number;
  retreatEffectsReversed: boolean;
  activeChoices: Record<string, number>;
};

function readRollContext(state: GameState, playerId: string): RollSimulationSlice {
  const board = state.board as Record<string, unknown> | undefined;
  const squares = board?.squares as Record<string, SquareShape> | undefined;
  const winPosition = getWinPosition(squares as Record<string, { effect?: string }> | undefined);
  const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
  const retreatEffectsReversed = player?.retreatEffectsReversed === true;
  const activeChoices = (player?.activeChoices as Record<string, number>) ?? {};
  return { squares, winPosition, retreatEffectsReversed, activeChoices };
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
  const { squares, retreatEffectsReversed, winPosition } = readRollContext(state, playerId);
  const forward = direction === "forward";
  let current = start;

  for (let i = 0; i < roll; i++) {
    const sq = squares?.[String(current)];
    const targets = getTargets(sq, current, forward, winPosition);
    current = advanceOneStep(current, targets, activeChoices);

    if (i === roll - 1) {
      current = applyLandingHop(current, squares, retreatEffectsReversed, forward);
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
/**
 * Result of applying a movement roll when forks may require an explicit choice mid-path.
 * If the roll would admit multiple landing squares (`distinctEndPositionsAfterRoll` > 1),
 * simulation stops on the fork square with `remainingSteps` left to apply after the player
 * sets `activeChoices[forkSquare]` (see `completeRollMovement` pending).
 */
export type ApplyRollMovementResult =
  | { kind: "complete"; finalPosition: number }
  | {
      kind: "forkPause";
      positionAtFork: number;
      remainingSteps: number;
      direction: RollMovementDirection;
    };

/**
 * Applies a roll like `simulateRollFromState`, but if the roll is ambiguous (multiple possible
 * end squares without stored fork choices), pauses on the first unresolved fork instead of
 * defaulting to `targets[0]`.
 */
export function applyRollMovementResolvingForks(
  state: GameState,
  playerId: string,
  start: number,
  roll: number,
  direction: RollMovementDirection = "forward",
): ApplyRollMovementResult {
  if (roll <= 0) {
    return { kind: "complete", finalPosition: start };
  }
  const { activeChoices } = readRollContext(state, playerId);
  if (distinctEndPositionsAfterRoll(state, playerId, start, roll, direction).size <= 1) {
    return {
      kind: "complete",
      finalPosition: simulateRollFromState(state, playerId, start, roll, direction, activeChoices),
    };
  }

  const { squares, retreatEffectsReversed, winPosition } = readRollContext(state, playerId);
  const forward = direction === "forward";
  let current = start;

  for (let i = 0; i < roll; i++) {
    const sq = squares?.[String(current)];
    const targets = getTargets(sq, current, forward, winPosition);
    const saved = activeChoices[current];
    const hasResolvedBranch = saved !== undefined && targets.includes(saved);
    if (targets.length > 1 && !hasResolvedBranch) {
      return {
        kind: "forkPause",
        positionAtFork: current,
        remainingSteps: roll - i,
        direction,
      };
    }
    current = advanceOneStep(current, targets, activeChoices);
    if (i === roll - 1) {
      current = applyLandingHop(current, squares, retreatEffectsReversed, forward);
    }
  }

  return { kind: "complete", finalPosition: current };
}

export function distinctEndPositionsAfterRoll(
  state: GameState,
  playerId: string,
  start: number,
  roll: number,
  direction: RollMovementDirection,
): Set<number> {
  const { squares, retreatEffectsReversed, activeChoices, winPosition } = readRollContext(
    state,
    playerId,
  );
  const forward = direction === "forward";
  const results = new Set<number>();

  function dfs(current: number, stepsLeft: number, choices: Record<string, number>): void {
    if (stepsLeft === 0) {
      results.add(current);
      return;
    }
    const sq = squares?.[String(current)];
    const targets = getTargets(sq, current, forward, winPosition);
    const saved = choices[current];
    const hasResolvedBranch = saved !== undefined && targets.includes(saved);
    const mustBranch = targets.length > 1 && !hasResolvedBranch;

    if (mustBranch) {
      for (const t of targets) {
        const nextChoices = { ...choices, [current]: t };
        const nextPos = t;
        if (stepsLeft === 1) {
          results.add(applyLandingHop(nextPos, squares, retreatEffectsReversed, forward));
        } else {
          dfs(nextPos, stepsLeft - 1, nextChoices);
        }
      }
      return;
    }

    const nextPos = advanceOneStep(current, targets, choices);
    if (stepsLeft === 1) {
      results.add(applyLandingHop(nextPos, squares, retreatEffectsReversed, forward));
    } else {
      dfs(nextPos, stepsLeft - 1, choices);
    }
  }

  dfs(start, roll, { ...activeChoices });
  return results;
}
