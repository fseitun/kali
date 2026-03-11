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
        "0": { type: "empty", next: [1] },
        "1": { type: "empty", next: [2] },
      },
    };
    expect(inferDecisionPoints(board)).toEqual([]);
  });

  it("infers fork at position 0 with A/B prompt", () => {
    const board: BoardConfig = {
      squares: {
        "0": { type: "empty", next: [1, 15] },
      },
    };
    const result = inferDecisionPoints(board);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      position: 0,
      prompt: "¿Querés ir por el A o por el B?",
      positionOptions: { "1": 1, "15": 15 },
    });
  });

  it("infers numeric fork prompt for non-zero positions", () => {
    const board: BoardConfig = {
      squares: {
        "96": { type: "empty", next: [97, 99] },
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

  it("infers multiple forks sorted by position", () => {
    const board: BoardConfig = {
      squares: {
        "101": { type: "animal", name: "Morsa", next: [102, 105] },
        "0": { type: "empty", next: [1, 15] },
        "96": { type: "empty", next: [97, 99] },
      },
    };
    const result = inferDecisionPoints(board);
    expect(result).toHaveLength(3);
    expect(result[0].position).toBe(0);
    expect(result[1].position).toBe(96);
    expect(result[2].position).toBe(101);
  });
});
