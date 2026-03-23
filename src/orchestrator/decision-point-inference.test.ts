import { describe, expect, it } from "vitest";
import { inferDecisionPoints } from "./decision-point-inference";
import type { BoardConfig } from "./types";

describe("inferDecisionPoints", () => {
  it("returns empty array when board has no squares", () => {
    expect(inferDecisionPoints(undefined)).toEqual([]);
    expect(inferDecisionPoints({})).toEqual([]);
    expect(inferDecisionPoints({ squares: {} })).toEqual([]);
  });

  it("returns empty when no forks (next.length <= 1)", () => {
    const board: BoardConfig = {
      squares: {
        "0": { next: [1] },
        "1": { next: [2] },
      },
    };
    expect(inferDecisionPoints(board)).toEqual([]);
  });

  it("infers fork at position 0 with izquierda/derecha prompt", () => {
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

  it("infers numeric fork prompt for non-zero positions", () => {
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

  it("sorts next options so prompt and positionOptions order are deterministic", () => {
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

  it("infers multiple forks sorted by position", () => {
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

  it("infers choiceKeywords from object next with implicit target numbers", () => {
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
});
