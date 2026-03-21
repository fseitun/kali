import type { GameExample } from "./kalimba";
import { KALIMBA_EXAMPLES } from "./kalimba";

/**
 * Returns typed examples for the given game. Used to build LLM prompt.
 * @param gameId - Game identifier (e.g. "kalimba")
 * @returns Array of user/actions examples, or empty array if unknown game
 */
export function getExamples(gameId: string): GameExample[] {
  switch (gameId) {
    case "kalimba":
      return KALIMBA_EXAMPLES;
    default:
      return [];
  }
}
