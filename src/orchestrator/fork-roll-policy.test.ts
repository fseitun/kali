import { describe, it, expect } from "vitest";
import { getEnforceableForkContext, getMovementDirectionForState } from "./fork-roll-policy";
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

describe("getEnforceableForkContext", () => {
  it("returns null when powerCheck is pending for current player even at a fork", () => {
    const state = {
      game: {
        name: "Test",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
        lastRoll: null,
        pending: {
          kind: "powerCheck",
          playerId: "p1",
          position: 5,
          power: 3,
          riddleCorrect: false,
          phase: "powerCheck",
        },
      },
      players: {
        p1: { id: "p1", name: "A", position: 5, activeChoices: {} },
      },
      board: { squares: { "5": { next: [6, 7], prev: [4] } } },
    } as unknown as GameState;

    expect(getEnforceableForkContext(state)).toBeNull();
  });

  it("returns fork context when no encounter pending and fork choice matters", () => {
    const state = {
      game: {
        name: "Test",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
        lastRoll: null,
        pending: null,
      },
      players: {
        p1: { id: "p1", name: "A", position: 5, activeChoices: {} },
      },
      board: { squares: { "5": { next: [6, 7], prev: [4] } } },
    } as unknown as GameState;

    const ctx = getEnforceableForkContext(state);
    expect(ctx).not.toBeNull();
    expect(ctx?.position).toBe(5);
  });
});
