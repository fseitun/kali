import { describe, it, expect } from "vitest";
import { computeNewPositionFromState } from "./board-traversal";
import type { GameState, SquareData } from "./types";

function makeSquares(upTo: number): Record<string, SquareData> {
  const sq: Record<string, SquareData> = {};
  for (let i = 0; i <= upTo; i++) {
    sq[String(i)] = {
      next: i < upTo ? [i + 1] : [],
      prev: i > 0 ? [i - 1] : [],
    };
  }
  return sq;
}

describe("computeNewPositionFromState", () => {
  it("moves forward on normal dice roll even when inverseMode is true", () => {
    const squares = makeSquares(20);
    const state: GameState = {
      game: {
        name: "Test",
        phase: "PLAYING",
        turn: "p1",
        winner: null,
        playerOrder: ["p1"],
      },
      players: {
        p1: {
          id: "p1",
          name: "Alice",
          position: 5,
          inverseMode: true,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 5, 3);

    // With inverseMode, normal dice should still move FORWARD (5 + 3 = 8), not backward
    expect(result).toBe(8);
  });

  it("moves forward on normal dice roll when inverseMode is false", () => {
    const squares = makeSquares(20);
    const state: GameState = {
      game: {
        name: "Test",
        phase: "PLAYING",
        turn: "p1",
        winner: null,
        playerOrder: ["p1"],
      },
      players: {
        p1: {
          id: "p1",
          name: "Alice",
          position: 5,
          inverseMode: false,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 5, 3);

    expect(result).toBe(8);
  });

  it("inverts prevOnLanding to forward when inverseMode", () => {
    const squares = makeSquares(25);
    // Square 10 has prevOnLanding (backward penalty) - when inverseMode, should use first next instead
    squares["10"] = {
      next: [11],
      prev: [9],
      prevOnLanding: [5],
    };

    const state: GameState = {
      game: {
        name: "Test",
        phase: "PLAYING",
        turn: "p1",
        winner: null,
        playerOrder: ["p1"],
      },
      players: {
        p1: {
          id: "p1",
          name: "Alice",
          position: 8,
          inverseMode: true,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 8, 2);

    // Roll 2 from 8: 8->9, 9->10. Land on 10. With inverseMode, prevOnLanding [5] is inverted to first next [11]
    expect(result).toBe(11);
  });

  it("uses nextOnLanding (forward) regardless of inverseMode", () => {
    const squares = makeSquares(100);
    squares["4"] = {
      next: [5],
      prev: [3],
      nextOnLanding: [14],
    };

    const state: GameState = {
      game: {
        name: "Test",
        phase: "PLAYING",
        turn: "p1",
        winner: null,
        playerOrder: ["p1"],
      },
      players: {
        p1: {
          id: "p1",
          name: "Alice",
          position: 2,
          inverseMode: true,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 2, 2);

    // Roll 2 from 2: land on 4. nextOnLanding [14] applies (forward bonus)
    expect(result).toBe(14);
  });
});
