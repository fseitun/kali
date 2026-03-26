import { describe, it, expect } from "vitest";
import { getMovementDirectionForState } from "./fork-roll-policy";
import { GamePhase } from "./types";
import type { GameState } from "./types";

function baseState(player: { retreatEffectsReversed?: boolean }): GameState {
  return {
    game: {
      name: "Kalimba",
      phase: GamePhase.PLAYING,
      turn: "p1",
      playerOrder: ["p1"],
      winner: null,
      lastRoll: null,
      pending: { kind: "directional", playerId: "p1", dice: 2 },
    },
    players: {
      p1: {
        id: "p1",
        name: "A",
        position: 55,
        retreatEffectsReversed: player.retreatEffectsReversed ?? false,
      },
    },
    board: { squares: {} },
  } as unknown as GameState;
}

describe("getMovementDirectionForState", () => {
  it("returns backward for directional pending when retreatEffectsReversed is false", () => {
    const state = baseState({ retreatEffectsReversed: false });
    expect(getMovementDirectionForState(state, "p1")).toBe("backward");
  });

  it("returns forward for directional pending when retreatEffectsReversed is true", () => {
    const state = baseState({ retreatEffectsReversed: true });
    expect(getMovementDirectionForState(state, "p1")).toBe("forward");
  });
});
