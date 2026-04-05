import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { applyRollMovementResolvingForks, computeNewPositionFromState } from "./board-traversal";
import { GamePhase, type GameState, type SquareData } from "./types";
import { resolveInitialState } from "@/game-loader/game-loader";
import type { GameConfigInput } from "@/game-loader/types";

const _dir = dirname(fileURLToPath(import.meta.url));
const kalimbaConfigPath = join(_dir, "../../public/games/kalimba/config.json");

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

describe("Product scenario: Compute New Position From State", () => {
  it("Expected outcome: Moves forward on normal dice roll even when retreat Effects Reversed is true", () => {
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

  it("Expected outcome: Moves forward on normal dice roll when retreat Effects Reversed is false", () => {
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

  it("Expected outcome: Ignores prev On Landing on forward roll when retreat Effects Reversed (stay on landed square)", () => {
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

  it("Expected outcome: Still applies next On Landing when retreat Effects Reversed and square has both next On Landing and prev On Landing", () => {
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

  it("Expected outcome: Uses next On Landing (forward) with retreat Effects Reversed when no conflicting prev On Landing behavior", () => {
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

  it("Expected outcome: Moves backward when direction is backward", () => {
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

  it("Expected outcome: Stays at 0 when backward roll would go below start", () => {
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

  it("Expected outcome: Uses prev On Landing when moving backward and landing on square with it", () => {
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

  it("Expected outcome: Does not apply next On Landing on Kalimba ocean forest one shot portal (82); board effects teleport", () => {
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

/** Kalimba-like arctic fork: 97→98→101, then 102 vs 105 (matches public/games/kalimba/config.json subset). */
function kalimbaArcticForkSquares(): Record<string, SquareData> {
  const squares: Record<string, SquareData> = {};
  for (let i = 90; i < 97; i++) {
    squares[String(i)] = { next: [i + 1], prev: i > 0 ? [i - 1] : [] };
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

describe("Product scenario: Apply Roll Movement Resolving Forks", () => {
  const baseGame = {
    name: "Kalimba",
    phase: "PLAYING" as const,
    turn: "p1",
    winner: null,
    playerOrder: ["p1"],
  };

  it("Expected outcome: Pauses on fork 101 when roll 3 from 97 without active Choices", () => {
    const state = {
      game: baseGame,
      players: {
        p1: { id: "p1", name: "A", position: 97, activeChoices: {} },
      },
      board: { squares: kalimbaArcticForkSquares() },
    } as GameState;

    expect(applyRollMovementResolvingForks(state, "p1", 97, 3, "forward")).toEqual({
      kind: "forkPause",
      positionAtFork: 101,
      remainingSteps: 1,
      direction: "forward",
    });
  });

  it("Expected outcome: Lands in one shot when active Choices fix the fork before rolling", () => {
    const state = {
      game: baseGame,
      players: {
        p1: { id: "p1", name: "A", position: 97, activeChoices: { 101: 105 } },
      },
      board: { squares: kalimbaArcticForkSquares() },
    } as GameState;

    const r = applyRollMovementResolvingForks(state, "p1", 97, 3, "forward");
    expect(r).toEqual({ kind: "complete", finalPosition: 105 });
  });

  it("Expected outcome: Uses single end fast path when roll cannot reach a divergent fork (roll 1 from 97)", () => {
    const state = {
      game: baseGame,
      players: {
        p1: { id: "p1", name: "A", position: 97, activeChoices: {} },
      },
      board: { squares: kalimbaArcticForkSquares() },
    } as GameState;

    expect(applyRollMovementResolvingForks(state, "p1", 97, 1, "forward")).toEqual({
      kind: "complete",
      finalPosition: 98,
    });
  });
});

describe("Product scenario: Apply Roll Movement Resolving Forks (Kalimba config from disk)", () => {
  it("Expected outcome: Roll 6 from 97 pauses at fork 101 with 4 steps remaining (penguin power check movement)", () => {
    const raw = readFileSync(kalimbaConfigPath, "utf-8");
    const config = JSON.parse(raw) as GameConfigInput;
    const base = resolveInitialState(config);
    const p2 = base.players.p2;
    if (!p2) {
      throw new Error("Kalimba state must include p2");
    }
    const state: GameState = {
      ...base,
      game: { ...base.game, phase: GamePhase.PLAYING, turn: "p2" },
      players: {
        ...base.players,
        p2: {
          ...p2,
          position: 97,
          activeChoices: { 0: 1 },
        },
      },
    };

    expect(applyRollMovementResolvingForks(state, "p2", 97, 6, "forward")).toEqual({
      kind: "forkPause",
      positionAtFork: 101,
      remainingSteps: 4,
      direction: "forward",
    });
  });
});
