import { describe, expect, it } from "vitest";
import { GamePhase, type GameState } from "./orchestrator/types";
import { StateManager } from "./state-manager";

function createState(): GameState {
  return {
    game: {
      name: "Test Game",
      phase: GamePhase.PLAYING,
      turn: "p1",
      winner: null,
      playerOrder: ["p1"],
    },
    players: {
      p1: { id: "p1", name: "Alice", position: 5, hearts: 0 },
    },
  };
}

describe("Product scenario: State Manager path access", () => {
  it("Expected outcome: Resolves own nested paths", () => {
    const sm = new StateManager();
    sm.init(createState());

    expect(sm.get("players.p1.position")).toBe(5);
    expect(sm.pathExists(sm.getState(), "players.p1.position")).toBe(true);

    sm.set("players.p1.position", 12);
    expect(sm.get("players.p1.position")).toBe(12);
  });

  it("Expected outcome: Does not walk the prototype chain", () => {
    const sm = new StateManager();
    sm.init(createState());
    const state = sm.getState();

    expect(sm.pathExists(state, "game.__proto__")).toBe(false);
    expect(sm.pathExists(state, "game.constructor")).toBe(false);
    expect(sm.pathExists(state, "players.p1.toString")).toBe(false);
    expect(sm.get("game.__proto__")).toBeUndefined();
  });

  it("Expected outcome: Reports missing paths as non existent", () => {
    const sm = new StateManager();
    sm.init(createState());

    expect(sm.pathExists(sm.getState(), "players.p1.nope")).toBe(false);
    expect(sm.pathExists(sm.getState(), "nope.at.all")).toBe(false);
  });
});
