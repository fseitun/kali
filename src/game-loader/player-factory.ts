import type { Player } from "@/orchestrator/types";

/**
 * Creates a default player for the given game. Player shape is game-specific.
 * @param gameId - Game identifier
 * @param id - Player id (e.g. "p1")
 * @param name - Display name (e.g. "Player 1")
 * @returns Default player state
 */
export function createDefaultPlayer(gameId: string, id: string, name: string): Player {
  switch (gameId) {
    case "kalimba":
      return {
        id,
        name,
        position: 0,
        hearts: 0,
        points: 0,
        items: [],
        instruments: [],
        bonusDiceNextTurn: false,
        activeChoices: {},
        skipTurns: 0,
        inverseMode: false,
      };
    default:
      return { id, name, position: 0 };
  }
}
