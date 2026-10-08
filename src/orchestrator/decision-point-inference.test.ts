import { afterEach, describe, expect, it } from "vitest";
import { getDecisionPoints, inferDecisionPoints } from "./decision-point-inference";
import type { BoardConfig, GameState } from "./types";
import { GamePhase } from "./types";
import { setLocale } from "@/i18n/translations";

describe("Product scenario: Infer Decision Points", () => {
  it("Expected outcome: Returns empty array when board has no squares", () => {
    expect(inferDecisionPoints(undefined)).toEqual([]);
    expect(inferDecisionPoints({})).toEqual([]);
    expect(inferDecisionPoints({ squares: {} })).toEqual([]);
  });

  it("Expected outcome: Returns empty when no forks (next length <= 1)", () => {
    const board: BoardConfig = {
      squares: {
        "0": { next: [1] },
        "1": { next: [2] },
      },
    };
    expect(inferDecisionPoints(board)).toEqual([]);
  });

  it("Expected outcome: Infers fork at position 0 with izquierda/derecha prompt", () => {
    const board: BoardConfig = {
      squares: {
        "0": { next: [1, 15] },
      },
    };
    const result = inferDecisionPoints(board);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      position: 0,
      prompt: "¿Querés ir por la izquierda o por la derecha?",
      positionOptions: { "1": 1, "15": 15 },
    });
  });

  it("Expected outcome: Infers numeric fork prompt for non zero positions", () => {
    const board: BoardConfig = {
      squares: {
        "96": { next: [97, 99] },
      },
    };
    const result = inferDecisionPoints(board);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      position: 96,
      prompt: "¿Querés ir al 97 o al 99?",
      positionOptions: { "97": 97, "99": 99 },
    });
  });

  it("Expected outcome: Sorts next options so prompt and position Options order are deterministic", () => {
    const board: BoardConfig = {
      squares: {
        "96": { next: [99, 97] },
      },
    };
    const result = inferDecisionPoints(board);
    expect(result).toHaveLength(1);
    expect(result[0].prompt).toBe("¿Querés ir al 97 o al 99?");
    expect(result[0].positionOptions).toEqual({ "97": 97, "99": 99 });
  });

  it("Expected outcome: Infers multiple forks sorted by position", () => {
    const board: BoardConfig = {
      squares: {
        "101": { name: "Morsa", next: [102, 105] },
        "0": { next: [1, 15] },
        "96": { next: [97, 99] },
      },
    };
    const result = inferDecisionPoints(board);
    expect(result).toHaveLength(3);
    expect(result[0].position).toBe(0);
    expect(result[1].position).toBe(96);
    expect(result[2].position).toBe(101);
  });

  it("Expected outcome: Infers choice Keywords from object next with implicit target numbers", () => {
    const board: BoardConfig = {
      squares: {
        "0": {
          next: { "1": ["izquierda", "corto"], "15": ["derecha", "largo"] },
        },
      },
    };
    const result = inferDecisionPoints(board);
    expect(result).toHaveLength(1);
    expect(result[0].positionOptions).toEqual({ "1": 1, "15": 15 });
    expect(result[0].choiceKeywords).toEqual({
      "1": ["izquierda", "corto", "1"],
      "15": ["derecha", "largo", "15"],
    });
  });
  describe("Product scenario: Localized fork prompts", () => {
    afterEach(() => {
      setLocale("es-AR");
    });

    function boardState(squares: BoardConfig["squares"]): GameState {
      return {
        game: {
          name: "Kalimba",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1"],
          winner: null,
        },
        players: { p1: { id: "p1", name: "Ana", position: 0 } },
        board: { squares },
      };
    }

    it("Expected outcome: Speaks English fork prompts in en-US", () => {
      setLocale("en-US");
      const forward = inferDecisionPoints({ squares: { "96": { next: [97, 99] } } });
      const start = inferDecisionPoints({ squares: { "0": { next: [1, 15] } } });

      expect(start[0].prompt).toBe("Do you want to go left or right?");
      expect(forward[0].prompt).toBe("Do you want to go to 97 or 99?");
    });

    it("Expected outcome: Speaks English backward fork prompts in en-US", () => {
      setLocale("en-US");
      const state = boardState({
        "104": { next: [106] },
        "105": { next: [106] },
        "106": { prev: [104, 105] },
      });

      const backward = getDecisionPoints(state).find((dp) => dp.direction === "backward");

      expect(backward?.prompt).toBe("Going back, to 104 or 105?");
    });
  });
});
