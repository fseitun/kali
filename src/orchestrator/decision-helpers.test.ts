import { describe, it, expect } from "vitest";
import { getDecisionPointApplyState } from "./decision-helpers";
import { createPlayingStateFixture } from "./test-fixtures";
import type { GameState } from "./types";

function stateAtFork(
  position: number,
  squares: Record<string, Record<string, unknown>>,
): GameState {
  return createPlayingStateFixture({
    players: {
      p1: { id: "p1", name: "Alice", position, activeChoices: {} },
      p2: { id: "p2", name: "Bob", position: 0 },
    },
    squares,
  });
}

describe("Product scenario: Resolve a fork answer", () => {
  const kalimbaStart = { "0": { next: { "1": ["left", "short"], "15": ["right", "long"] } } };

  it("Expected outcome: Resolves a fork answer by the target number the board declares", () => {
    const state = stateAtFork(0, kalimbaStart);

    expect(getDecisionPointApplyState(state, "15")).toEqual({
      path: "players.p1.activeChoices.0",
      value: 15,
    });
  });

  it("Expected outcome: Resolves a fork answer by a phrase the board's fork map lists", () => {
    const state = stateAtFork(0, kalimbaStart);

    expect(getDecisionPointApplyState(state, "I'll go right")).toEqual({
      path: "players.p1.activeChoices.0",
      value: 15,
    });
  });

  it("Expected outcome: Does not resolve a fork from a bare first letter", () => {
    // "Ahora no sé" is a player stalling, not a choice: matching on its first character used to
    // send them down the branch the engine had hardcoded for Kalimba's square 0.
    const state = stateAtFork(0, kalimbaStart);

    expect(getDecisionPointApplyState(state, "Ahora no sé")).toBeNull();
    expect(getDecisionPointApplyState(state, "Bueno, dejame pensar")).toBeNull();
  });

  it("Expected outcome: Uses another board's square-0 targets rather than Kalimba's", () => {
    const state = stateAtFork(0, { "0": { next: { "3": ["three"], "7": ["seven"] } } });

    expect(getDecisionPointApplyState(state, "7")).toEqual({
      path: "players.p1.activeChoices.0",
      value: 7,
    });
    // 1 and 15 are Kalimba's branches and mean nothing on this board.
    expect(getDecisionPointApplyState(state, "15")).toBeNull();
  });

  it("Expected outcome: Returns null when the current player is not at a fork", () => {
    const state = stateAtFork(4, kalimbaStart);

    expect(getDecisionPointApplyState(state, "15")).toBeNull();
  });
});
