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
    const dir = inverseMode ? (sq?.prev ?? (current > 0 ? [current - 1] : [])) : forwardDir;

    const saved = activeChoices[current];
    current = saved !== undefined && dir.includes(saved) ? saved : (dir[0] ?? current);

    if (i === roll - 1) {
      const landedSq = squares?.[String(current)];
      const landingHop = inverseMode ? landedSq?.prevOnLanding : landedSq?.nextOnLanding;
      if (landingHop?.length) current = landingHop[0];
    }
  }

  return current;
}
