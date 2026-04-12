import { describe, it, expect, beforeEach } from "vitest";
import { tryFastPathTranscript } from "./transcript-fast-path";
import { GamePhase, type ExecutionContext, type GameState } from "./types";
import { setLocale } from "@/i18n/translations";
import { StateManager } from "@/state-manager";

describe("Product scenario: Try Fast Path Transcript", () => {
  let state: GameState;
  const topContext: ExecutionContext = {};
  const nestedContext: ExecutionContext = { isNestedCall: true };

  beforeEach(() => {
    setLocale("en-US");
    const sm = new StateManager();
    sm.init({
      game: {
        name: "T",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1", "p2"],
        winner: null,
        lastRoll: null,
      },
      players: {
        p1: { id: "p1", name: "Alice", position: 3 },
        p2: { id: "p2", name: "Bob", position: 0 },
      },
      board: {
        squares: {
          "3": { next: [4], prev: [2] },
        },
      },
    });
    state = sm.getState() as GameState;
  });

  it("Expected outcome: Returns null for nested calls", () => {
    expect(
      tryFastPathTranscript(state, "5", nestedContext, { isProcessingEffect: false }),
    ).toBeNull();
  });

  it("Expected outcome: Returns NARRATE for help phrase", () => {
    const actions = tryFastPathTranscript(state, "help", topContext, {
      isProcessingEffect: false,
    });
    expect(actions).toEqual([{ action: "NARRATE", text: expect.any(String) }]);
  });

  it("Expected outcome: Returns PLAYER ROLLED for plain digit when valid", () => {
    const actions = tryFastPathTranscript(state, "4", topContext, { isProcessingEffect: false });
    expect(actions).toEqual([{ action: "PLAYER_ROLLED", value: 4 }]);
  });

  it("Expected outcome: Returns null during square effect processing for movement roll", () => {
    const actions = tryFastPathTranscript(state, "4", topContext, { isProcessingEffect: true });
    expect(actions).toBeNull();
  });

  it("Expected outcome: Returns PLAYER ANSWERED for revenge roll in range", () => {
    (state.game as Record<string, unknown>).pending = {
      kind: "revenge",
      playerId: "p1",
      position: 3,
      power: 3,
    };
    const actions = tryFastPathTranscript(state, "4", topContext, { isProcessingEffect: false });
    expect(actions).toEqual([{ action: "PLAYER_ANSWERED", answer: "4" }]);
  });

  it("Expected outcome: Maps riddle transcript to option when structured riddle pending", () => {
    (state.game as Record<string, unknown>).pending = {
      kind: "riddle",
      playerId: "p1",
      position: 5,
      power: 2,
      riddleOptions: ["A", "B", "C", "D"],
      correctOption: "A",
      riddlePrompt: "Q?",
    };
    const actions = tryFastPathTranscript(state, "1", topContext, { isProcessingEffect: false });
    expect(actions).toEqual([{ action: "PLAYER_ANSWERED", answer: "A" }]);
  });

  it("Expected outcome: Maps letter answer to option when structured riddle pending", () => {
    (state.game as Record<string, unknown>).pending = {
      kind: "riddle",
      playerId: "p1",
      position: 5,
      power: 2,
      riddleOptions: ["A", "B", "C", "D"],
      correctOption: "A",
      riddlePrompt: "Q?",
    };
    const actions = tryFastPathTranscript(state, "a", topContext, { isProcessingEffect: false });
    expect(actions).toEqual([{ action: "PLAYER_ANSWERED", answer: "A" }]);
  });
});
