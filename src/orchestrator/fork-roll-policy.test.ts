import { describe, it, expect } from "vitest";
import {
  getEnforceableForkContext,
  getMovementDirectionForState,
  getPendingForkPromptIfAny,
  hasMovementForkBlockingPlay,
} from "./fork-roll-policy";
import { GamePhase } from "./types";
import type { GameState, SquareData } from "./types";

/** Fork at 101 (102 vs 105); enough of Kalimba arctic strip for traversal. */
function kalimbaForkAt101Squares(): Record<string, SquareData> {
  const squares: Record<string, SquareData> = {};
  for (let i = 90; i < 97; i++) {
    squares[String(i)] = { next: [i + 1], prev: i > 90 ? [i - 1] : [] };
  }
  squares["97"] = { name: "Penguin", power: 2, prev: [96] };
  squares["98"] = { next: [101], prev: [97] };
  squares["99"] = { prev: [96] };
  squares["100"] = { prev: [99] };
  squares["101"] = {
    next: { "102": ["102", "down"], "105": ["105", "polar bear", "up"] },
    prev: { "98": ["98", "down"], "100": ["100", "up"] },
    name: "Walrus",
    power: 3,
  };
  squares["102"] = { prev: [101] };
  squares["105"] = { prev: [101] };
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
  };
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
  };
}

/** Backward-only fork at 106 (prev 104 or 105); 106 has a single forward edge. */
function backwardOnlyForkAt106(): Record<string, SquareData> {
  return {
    "103": { next: [104], prev: [102] },
    "104": { next: [106], prev: [103] },
    "105": { next: [106], prev: [104] },
    "106": {
      next: [107],
      prev: { "104": ["104"], "105": ["105"] },
    },
    "107": { prev: [106] },
  };
}

function stateAtBackwardForkAt106(pending: Record<string, unknown> | null): GameState {
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
      p1: { id: "p1", name: "F", position: 106, activeChoices: {} },
    },
    board: { squares: backwardOnlyForkAt106() },
  };
}

/** Fork at 10 whose two branches rejoin on landing, so no roll length can tell them apart. */
function rejoiningForkAt10(): Record<string, SquareData> {
  return {
    "9": { next: [10], prev: [8] },
    "10": { next: { "11": ["11", "izquierda"], "12": ["12", "derecha"] }, prev: [9] },
    "11": { next: [13], nextOnLanding: [13], prev: [10] },
    "12": { next: [13], nextOnLanding: [13], prev: [10] },
    "13": { next: [14], prev: [11] },
  };
}

function stateAtRejoiningFork(pending: Record<string, unknown> | null): GameState {
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
      p1: { id: "p1", name: "F", position: 10, activeChoices: {} },
    },
    board: { squares: rejoiningForkAt10() },
  };
}

describe("Product scenario: Fork paused mid-move is always asked", () => {
  it("Expected outcome: Asks the fork that paused the move even when both branches rejoin", () => {
    // The remainder can only run once activeChoices fixes the branch: skipping the question
    // strands the pending, and turn advancement is blocked behind it forever.
    const state = stateAtRejoiningFork({
      kind: "completeRollMovement",
      playerId: "p1",
      remainingSteps: 1,
      direction: "forward",
    });

    expect(getEnforceableForkContext(state)?.position).toBe(10);
    expect(getPendingForkPromptIfAny(state)).not.toBeNull();
    expect(hasMovementForkBlockingPlay(state)).toBe(true);
  });

  it("Expected outcome: Leaves a rejoining fork unasked when no move is paused on it", () => {
    const state = stateAtRejoiningFork(null);

    expect(getEnforceableForkContext(state)).toBeNull();
    expect(hasMovementForkBlockingPlay(state)).toBe(false);
  });

  it("Expected outcome: Ignores a paused move that belongs to another player", () => {
    const state = stateAtRejoiningFork({
      kind: "completeRollMovement",
      playerId: "p2",
      remainingSteps: 1,
      direction: "forward",
    });

    expect(getEnforceableForkContext(state)).toBeNull();
  });
});

describe("Product scenario: Get Movement Direction For State", () => {
  it("Expected outcome: Returns backward for directional pending when retreat Effects Reversed is false", () => {
    const state = baseState({ retreatEffectsReversed: false });
    expect(getMovementDirectionForState(state, "p1")).toBe("backward");
  });

  it("Expected outcome: Returns forward for directional pending when retreat Effects Reversed is true", () => {
    const state = baseState({ retreatEffectsReversed: true });
    expect(getMovementDirectionForState(state, "p1")).toBe("forward");
  });

  it("Expected outcome: Keeps the backward direction of a move paused at a fork", () => {
    const state = stateAtWalrusFork101({
      kind: "completeRollMovement",
      playerId: "p1",
      remainingSteps: 1,
      direction: "backward",
    });
    expect(getMovementDirectionForState(state, "p1")).toBe("backward");
  });

  it("Expected outcome: Ignores a paused move that belongs to another player", () => {
    const state = stateAtWalrusFork101({
      kind: "completeRollMovement",
      playerId: "p2",
      remainingSteps: 1,
      direction: "backward",
    });
    expect(getMovementDirectionForState(state, "p1")).toBe("forward");
  });
});

describe("Product scenario: Get Enforceable Fork Context (no enforceable fork while encounter pending)", () => {
  it("Expected outcome: Returns null when riddle is pending for current player on a fork square (invariant no DECISION+riddle collision)", () => {
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

  it("Expected outcome: Still returns fork context when pending is complete Roll Movement at the fork", () => {
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

  it("Expected outcome: Asks about the backward branches when the paused move is a retreat", () => {
    const state = stateAtWalrusFork101({
      kind: "completeRollMovement",
      playerId: "p1",
      remainingSteps: 1,
      direction: "backward",
    });
    const ctx = getEnforceableForkContext(state);
    expect(ctx?.decisionPoint.direction).toBe("backward");
    expect(ctx?.decisionPoint.prompt).toContain("98");
    expect(ctx?.decisionPoint.prompt).toContain("100");
    expect(ctx?.decisionPoint.prompt).not.toContain("105");
  });

  it("Expected outcome: Finds the fork on a square that only forks backward (no forward fork to fall back on)", () => {
    const state = stateAtBackwardForkAt106({
      kind: "completeRollMovement",
      playerId: "p1",
      remainingSteps: 4,
      direction: "backward",
    });
    const ctx = getEnforceableForkContext(state);
    expect(ctx).not.toBeNull();
    expect(ctx?.position).toBe(106);
    expect(ctx?.decisionPoint.prompt).toContain("104");
    expect(ctx?.decisionPoint.prompt).toContain("105");
    expect(getPendingForkPromptIfAny(state)).toBe(ctx?.decisionPoint.prompt ?? null);
  });
});
