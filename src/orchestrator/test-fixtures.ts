import { GamePhase, type GameState, type Player } from "./types";

export function createPlayingStateFixture(params: {
  turn?: string;
  playerOrder?: string[];
  players: Record<string, Player>;
  squares: Record<string, Record<string, unknown>>;
  winner?: string | null;
  lastRoll?: number;
  pending?: Record<string, unknown>;
}): GameState {
  const {
    turn = "p1",
    playerOrder = ["p1", "p2"],
    players,
    squares,
    winner = null,
    lastRoll = 0,
    pending,
  } = params;

  return {
    game: {
      name: "Test Game",
      phase: GamePhase.PLAYING,
      turn,
      playerOrder,
      winner,
      lastRoll,
      ...(pending !== undefined ? { pending } : {}),
    },
    players,
    board: {
      squares: {
        ...squares,
        ...(squares["100"] ? {} : { "100": { effect: "win" } }),
      },
    },
  };
}
