import { getNextTargets } from "./board-next";
import type { GameState } from "./types";

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
  const squares = board?.squares as
    | Record<
        string,
        {
          next?: number[] | Record<string, string[]>;
          prev?: number[];
          nextOnLanding?: number[];
          prevOnLanding?: number[];
        }
      >
    | undefined;
  const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
  const inverseMode = !!(player?.inverseMode as boolean | undefined);

  const activeChoices = (player?.activeChoices as Record<string, number>) ?? {};

  let current = currentPosition;

  for (let i = 0; i < roll; i++) {
    const sq = squares?.[String(current)];
    const nextField = sq?.next;
    const forwardDir =
      nextField === undefined || nextField === null
        ? current < 196
          ? [current + 1]
          : []
        : getNextTargets(sq);
    // Normal dice always moves forward; inverseMode does not flip direction
    const dir = forwardDir;

    const saved = activeChoices[current];
    current = saved !== undefined && dir.includes(saved) ? saved : (dir[0] ?? current);

    if (i === roll - 1) {
      const landedSq = squares?.[String(current)];
      // inverseMode: only forward landing hops; backward (prevOnLanding) gets inverted to first next
      let landingHop: number[] | undefined;
      if (inverseMode && landedSq?.prevOnLanding?.length) {
        const nextTargets = getNextTargets(landedSq);
        landingHop = nextTargets?.length ? [nextTargets[0]] : undefined;
      } else {
        landingHop = landedSq?.nextOnLanding ?? landedSq?.prevOnLanding;
      }
      if (landingHop?.length) current = landingHop[0];
    }
  }

  return current;
}
