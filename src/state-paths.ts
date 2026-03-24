/**
 * Canonical dot paths for {@link StateManager} get/set and primitive `path` fields.
 * Use these helpers in TypeScript to avoid typos; wire format stays the same for JSON/LLM.
 */

/** Prefix for per-player paths: `players.<id>.<field>`. */
export const STATE_PLAYERS_PREFIX = "players." as const;

/** Stable paths under `GameState.game`. */
export const GAME_PATH = {
  turn: "game.turn",
  phase: "game.phase",
  winner: "game.winner",
  pending: "game.pending",
  playerOrder: "game.playerOrder",
  lastRoll: "game.lastRoll",
  lastAnswer: "game.lastAnswer",
} as const;

/**
 * Dot path under `players.<playerId>` (e.g. position, hearts, activeChoices.0).
 */
export function playerStatePath(playerId: string, ...segments: (string | number)[]): string {
  return ["players", playerId, ...segments.map(String)].join(".");
}
