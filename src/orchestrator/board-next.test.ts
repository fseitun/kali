import { describe, expect, it } from "vitest";
import {
  getForkKeywordsWithImplicitTargets,
  getNextTargets,
  getPrevForkKeywordsWithImplicitTargets,
  getPrevTargets,
  getTargets,
  isMultiBranchTargets,
  isNextFork,
  isNextRecord,
  isPrevFork,
  matchAnswerToChoiceKeywords,
} from "./board-next";

describe("Product scenario: Board next", () => {
  describe("Product scenario: Get Next Targets", () => {
    it("Expected outcome: Returns empty for missing next", () => {
      expect(getNextTargets({})).toEqual([]);
      expect(getNextTargets({ next: undefined })).toEqual([]);
    });

    it("Expected outcome: Copies number array next", () => {
      expect(getNextTargets({ next: [1, 15] })).toEqual([1, 15]);
      expect(getNextTargets({ next: [99, 97] })).toEqual([99, 97]);
    });

    it("Expected outcome: Parses object next keys as sorted targets", () => {
      expect(
        getNextTargets({
          next: { "15": ["derecha"], "1": ["izquierda"] },
        }),
      ).toEqual([1, 15]);
    });
  });

  describe("Product scenario: Get Targets", () => {
    const win = 5;

    it("Expected outcome: Uses win Position when next is missing", () => {
      expect(getTargets({}, 2, true, win)).toEqual([3]);
      expect(getTargets({}, 4, true, win)).toEqual([5]);
      expect(getTargets({}, 5, true, win)).toEqual([]);
    });

    it("Expected outcome: Uses explicit empty next at win index", () => {
      expect(getTargets({ next: [] }, 5, true, win)).toEqual([]);
    });

    it("Expected outcome: Backward uses missing prev as i 1; explicit empty prev is no move", () => {
      expect(getTargets({}, 3, false, win)).toEqual([2]);
      expect(getTargets({ prev: [] }, 3, false, win)).toEqual([]);
    });
  });

  describe("Product scenario: Get Prev Targets explicit empty prev", () => {
    it("Expected outcome: Returns empty array when prev is []", () => {
      expect(getPrevTargets({ prev: [] }, 5)).toEqual([]);
    });
  });

  describe("Product scenario: Get Prev Targets object fork", () => {
    it("Expected outcome: Parses object prev keys as sorted targets", () => {
      expect(
        getPrevTargets({ prev: { "105": ["105", "up"], "102": ["102", "down"] } }, 101),
      ).toEqual([102, 105]);
    });
  });

  describe("Product scenario: Is Multi Branch Targets", () => {
    it("Expected outcome: Mirrors fork detection for forward and prev edges", () => {
      expect(isMultiBranchTargets(getNextTargets({ next: [1, 15] }))).toBe(true);
      expect(isMultiBranchTargets(getNextTargets({ next: [2] }))).toBe(false);
      expect(isMultiBranchTargets(getPrevTargets({ prev: [3, 4] }, 5))).toBe(true);
      expect(isMultiBranchTargets(getPrevTargets({ prev: [4] }, 5))).toBe(false);
    });
  });

  describe("Product scenario: Is Next Fork", () => {
    it("Expected outcome: Is false for single target", () => {
      expect(isNextFork({ next: [2] })).toBe(false);
      expect(isNextFork({ next: { "2": [] } })).toBe(false);
    });

    it("Expected outcome: Is true for two targets", () => {
      expect(isNextFork({ next: [1, 15] })).toBe(true);
      expect(isNextFork({ next: { "1": [], "15": [] } })).toBe(true);
    });
  });

  describe("Product scenario: Is Prev Fork", () => {
    it("Expected outcome: Is true when prev lists multiple targets at this position", () => {
      expect(isPrevFork({ prev: [3, 4] }, 5)).toBe(true);
    });

    it("Expected outcome: Is true for object prev with two targets", () => {
      expect(isPrevFork({ prev: { "98": ["down"], "100": ["up"] } }, 101)).toBe(true);
    });

    it("Expected outcome: Is false for implicit single backward edge", () => {
      expect(isPrevFork({}, 3)).toBe(false);
      expect(isPrevFork({ prev: [2] }, 3)).toBe(false);
    });
  });

  describe("Product scenario: Is Next Record", () => {
    it("Expected outcome: Distinguishes array from object", () => {
      expect(isNextRecord([1, 2])).toBe(false);
      expect(isNextRecord({ "1": ["a"] })).toBe(true);
    });
  });

  describe("Product scenario: Get Fork Keywords With Implicit Targets", () => {
    it("Expected outcome: Returns undefined for array next", () => {
      expect(getForkKeywordsWithImplicitTargets({ next: [1, 15] })).toBeUndefined();
    });

    it("Expected outcome: Appends numeric key to each phrase list", () => {
      const kw = getForkKeywordsWithImplicitTargets({
        next: { "1": ["izquierda"], "15": ["derecha"] },
      });
      expect(kw).toEqual({
        "1": ["izquierda", "1"],
        "15": ["derecha", "15"],
      });
    });

    it("Expected outcome: Does not duplicate numeric key if already present", () => {
      const kw = getForkKeywordsWithImplicitTargets({
        next: { "15": ["15", "derecha"] },
      });
      expect(kw).toEqual({ "15": ["15", "derecha"] });
    });
  });

  describe("Product scenario: Get Prev Fork Keywords With Implicit Targets", () => {
    it("Expected outcome: Mirrors next fork keyword shape for prev", () => {
      const kw = getPrevForkKeywordsWithImplicitTargets({
        prev: { "102": ["102", "down"], "105": ["polar bear", "up"] },
      });
      expect(kw).toEqual({
        "102": ["102", "down"],
        "105": ["polar bear", "up", "105"],
      });
    });
  });

  describe("Product scenario: Match Answer To Choice Keywords", () => {
    const kw = {
      "1": ["izquierda", "corto", "1"],
      "15": ["derecha", "largo", "15"],
    };

    it("Expected outcome: Matches exact and substring (len >= 3)", () => {
      expect(matchAnswerToChoiceKeywords("derecha", kw)).toBe(15);
      expect(matchAnswerToChoiceKeywords("por la derecha", kw)).toBe(15);
      expect(matchAnswerToChoiceKeywords("izquierda", kw)).toBe(1);
    });

    it("Expected outcome: Matches extracted number", () => {
      expect(matchAnswerToChoiceKeywords("voy al 15", kw)).toBe(15);
      expect(matchAnswerToChoiceKeywords("1", kw)).toBe(1);
    });

    it("Expected outcome: Returns null when no match", () => {
      expect(matchAnswerToChoiceKeywords("maybe", kw)).toBeNull();
    });
  });
});
