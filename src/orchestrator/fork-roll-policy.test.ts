import { describe, it, expect } from "vitest";
import {
  getEnforceableForkContext,
  getMovementDirectionForState,
  getPendingForkPromptIfAny,
} from "./fork-roll-policy";
import { GamePhase } from "./types";
import type { GameState, SquareData } from "./types";

/** Fork at 101 (102 vs 105); enough of Kalimba arctic strip for traversal. */
function kalimbaForkAt101Squares(): Record<string, SquareData> {
  const squares: Record<string, SquareData> = {};
  for (let i = 90; i < 97; i++) {
    squares[String(i)] = { next: [i + 1], prev: i > 90 ? [i - 1] : [] };
  }
  squares["97"] = { name: "Penguin", power: 2, prev: [96] } as SquareData;
  squares["98"] = { next: [101], prev: [97] } as SquareData;
  squares["99"] = { prev: [96] } as SquareData;
  squares["100"] = { prev: [99] } as SquareData;
  squares["101"] = {
    next: { "102": ["102", "down"], "105": ["105", "polar bear", "up"] },
    prev: { "98": ["98", "down"], "100": ["100", "up"] },
    name: "Walrus",
    power: 3,
  } as SquareData;
  squares["102"] = { prev: [101] } as SquareData;
  squares["105"] = { prev: [101] } as SquareData;
  return squares;
}

function stateAtWalrusFork101(pending: Record<string, unknown> | null): GameState {
  return {
    game: {
      name: "Kalimba",
      phase: GamePhase.PLAYING,
      turn: "p1",
      playerOrder: ["p1"],
      winner: null,
      lastRoll: null,
      pending,
    },
    players: {
      p1: { id: "p1", name: "F", position: 101, activeChoices: {} },
    },
    board: { squares: kalimbaForkAt101Squares() },
  } as unknown as GameState;
}

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

describe("getEnforceableForkContext (no enforceable fork while encounter pending)", () => {
  it("returns null when riddle is pending for current player on a fork square (invariant: no DECISION+riddle collision)", () => {
    const state = stateAtWalrusFork101({
      kind: "riddle",
      playerId: "p1",
      position: 101,
      power: 3,
      correctOption: "A) Pescado",
      riddleOptions: ["A) Pescado", "B) Plancton", "C) Krill", "D) Frutas"],
    });
    expect(getEnforceableForkContext(state)).toBeNull();
    expect(getPendingForkPromptIfAny(state)).toBeNull();
  });

  it("still returns fork context when pending is completeRollMovement at the fork", () => {
    const state = stateAtWalrusFork101({
      kind: "completeRollMovement",
      playerId: "p1",
      remainingSteps: 1,
      direction: "forward",
    });
    const ctx = getEnforceableForkContext(state);
    expect(ctx).not.toBeNull();
    expect(ctx?.position).toBe(101);
    expect(ctx?.decisionPoint.prompt).toContain("102");
    expect(ctx?.decisionPoint.prompt).toContain("105");
    expect(getPendingForkPromptIfAny(state)).toBe(ctx?.decisionPoint.prompt ?? null);
  });
});
