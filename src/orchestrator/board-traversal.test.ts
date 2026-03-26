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
  it("moves forward on normal dice roll even when retreatEffectsReversed is true", () => {
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
          retreatEffectsReversed: true,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 5, 3);

    // Normal dice always move forward; retreatEffectsReversed only affects landing hops / teleports policy
    expect(result).toBe(8);
  });

  it("moves forward on normal dice roll when retreatEffectsReversed is false", () => {
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
          retreatEffectsReversed: false,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 5, 3);

    expect(result).toBe(8);
  });

  it("ignores prevOnLanding on forward roll when retreatEffectsReversed (stay on landed square)", () => {
    const squares = makeSquares(25);
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
          retreatEffectsReversed: true,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 8, 2);

    // Roll 2 from 8: 8->9, 9->10. Land on 10. With retreatEffectsReversed, prevOnLanding is ignored — stay on 10
    expect(result).toBe(10);
  });

  it("still applies nextOnLanding when retreatEffectsReversed and square has both nextOnLanding and prevOnLanding", () => {
    const squares = makeSquares(25);
    squares["10"] = {
      next: [11],
      prev: [9],
      prevOnLanding: [5],
      nextOnLanding: [20],
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
          retreatEffectsReversed: true,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 8, 2);
    expect(result).toBe(20);
  });

  it("uses nextOnLanding (forward) with retreatEffectsReversed when no conflicting prevOnLanding behavior", () => {
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
          retreatEffectsReversed: true,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 2, 2);

    // Roll 2 from 2: land on 4. nextOnLanding [14] applies (forward bonus)
    expect(result).toBe(14);
  });

  it("moves backward when direction is backward", () => {
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
          position: 10,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 10, 3, "backward");

    // Roll 3 backward from 10: 10->9->8->7
    expect(result).toBe(7);
  });

  it("stays at 0 when backward roll would go below start", () => {
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
          position: 2,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 2, 5, "backward");

    // Roll 5 backward from 2: 2->1->0, then no prev from 0
    expect(result).toBe(0);
  });

  it("uses prevOnLanding when moving backward and landing on square with it", () => {
    const squares = makeSquares(25);
    squares["10"] = {
      next: [11],
      prev: [9],
      prevOnLanding: [3],
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
          position: 12,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    const result = computeNewPositionFromState(state, "p1", 12, 2, "backward");

    // Roll 2 backward from 12: 12->11->10. Land on 10, prevOnLanding [3] applies
    expect(result).toBe(3);
  });

  it("does not apply nextOnLanding on Kalimba ocean–forest one-shot portal (82); board effects teleport", () => {
    const squares: Record<
      string,
      {
        next: number[];
        prev: number[];
        nextOnLanding?: number[];
        oceanForestOneShotPortal?: boolean;
      }
    > = {
      "81": { next: [82], prev: [80] },
      "82": {
        next: [83],
        prev: [81],
        nextOnLanding: [45],
        oceanForestOneShotPortal: true,
      },
    };

    const state = {
      game: {
        name: "Kalimba",
        phase: "PLAYING" as const,
        turn: "p1",
        winner: null,
        playerOrder: ["p1"],
      },
      players: {
        p1: {
          id: "p1",
          name: "Alice",
          position: 81,
          activeChoices: {},
        },
      },
      board: { squares },
    } as GameState;

    expect(computeNewPositionFromState(state, "p1", 81, 1)).toBe(82);
  });
});
