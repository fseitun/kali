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

describe("board-next", () => {
  describe("getNextTargets", () => {
    it("returns empty for missing next", () => {
      expect(getNextTargets({})).toEqual([]);
      expect(getNextTargets({ next: undefined })).toEqual([]);
    });

    it("copies number array next", () => {
      expect(getNextTargets({ next: [1, 15] })).toEqual([1, 15]);
      expect(getNextTargets({ next: [99, 97] })).toEqual([99, 97]);
    });

    it("parses object next keys as sorted targets", () => {
      expect(
        getNextTargets({
          next: { "15": ["derecha"], "1": ["izquierda"] },
        }),
      ).toEqual([1, 15]);
    });
  });

  describe("getTargets", () => {
    const win = 5;

    it("uses winPosition when next is missing", () => {
      expect(getTargets({}, 2, true, win)).toEqual([3]);
      expect(getTargets({}, 4, true, win)).toEqual([5]);
      expect(getTargets({}, 5, true, win)).toEqual([]);
    });

    it("uses explicit empty next at win index", () => {
      expect(getTargets({ next: [] }, 5, true, win)).toEqual([]);
    });

    it("backward uses missing prev as i-1; explicit empty prev is no move", () => {
      expect(getTargets({}, 3, false, win)).toEqual([2]);
      expect(getTargets({ prev: [] }, 3, false, win)).toEqual([]);
    });
  });

  describe("getPrevTargets explicit empty prev", () => {
    it("returns empty array when prev is []", () => {
      expect(getPrevTargets({ prev: [] }, 5)).toEqual([]);
    });
  });

  describe("getPrevTargets object fork", () => {
    it("parses object prev keys as sorted targets", () => {
      expect(
        getPrevTargets({ prev: { "105": ["105", "up"], "102": ["102", "down"] } }, 101),
      ).toEqual([102, 105]);
    });
  });

  describe("isMultiBranchTargets", () => {
    it("mirrors fork detection for forward and prev edges", () => {
      expect(isMultiBranchTargets(getNextTargets({ next: [1, 15] }))).toBe(true);
      expect(isMultiBranchTargets(getNextTargets({ next: [2] }))).toBe(false);
      expect(isMultiBranchTargets(getPrevTargets({ prev: [3, 4] }, 5))).toBe(true);
      expect(isMultiBranchTargets(getPrevTargets({ prev: [4] }, 5))).toBe(false);
    });
  });

  describe("isNextFork", () => {
    it("is false for single target", () => {
      expect(isNextFork({ next: [2] })).toBe(false);
      expect(isNextFork({ next: { "2": [] } })).toBe(false);
    });

    it("is true for two targets", () => {
      expect(isNextFork({ next: [1, 15] })).toBe(true);
      expect(isNextFork({ next: { "1": [], "15": [] } })).toBe(true);
    });
  });

  describe("isPrevFork", () => {
    it("is true when prev lists multiple targets at this position", () => {
      expect(isPrevFork({ prev: [3, 4] }, 5)).toBe(true);
    });

    it("is true for object prev with two targets", () => {
      expect(isPrevFork({ prev: { "98": ["down"], "100": ["up"] } }, 101)).toBe(true);
    });

    it("is false for implicit single backward edge", () => {
      expect(isPrevFork({}, 3)).toBe(false);
      expect(isPrevFork({ prev: [2] }, 3)).toBe(false);
    });
  });

  describe("isNextRecord", () => {
    it("distinguishes array from object", () => {
      expect(isNextRecord([1, 2])).toBe(false);
      expect(isNextRecord({ "1": ["a"] })).toBe(true);
    });
  });

  describe("getForkKeywordsWithImplicitTargets", () => {
    it("returns undefined for array next", () => {
      expect(getForkKeywordsWithImplicitTargets({ next: [1, 15] })).toBeUndefined();
    });

    it("appends numeric key to each phrase list", () => {
      const kw = getForkKeywordsWithImplicitTargets({
        next: { "1": ["izquierda"], "15": ["derecha"] },
      });
      expect(kw).toEqual({
        "1": ["izquierda", "1"],
        "15": ["derecha", "15"],
      });
    });

    it("does not duplicate numeric key if already present", () => {
      const kw = getForkKeywordsWithImplicitTargets({
        next: { "15": ["15", "derecha"] },
      });
      expect(kw).toEqual({ "15": ["15", "derecha"] });
    });
  });

  describe("getPrevForkKeywordsWithImplicitTargets", () => {
    it("mirrors next fork keyword shape for prev", () => {
      const kw = getPrevForkKeywordsWithImplicitTargets({
        prev: { "102": ["102", "down"], "105": ["polar bear", "up"] },
      });
      expect(kw).toEqual({
        "102": ["102", "down"],
        "105": ["polar bear", "up", "105"],
      });
    });
  });

  describe("matchAnswerToChoiceKeywords", () => {
    const kw = {
      "1": ["izquierda", "corto", "1"],
      "15": ["derecha", "largo", "15"],
    };

    it("matches exact and substring (len >= 3)", () => {
      expect(matchAnswerToChoiceKeywords("derecha", kw)).toBe(15);
      expect(matchAnswerToChoiceKeywords("por la derecha", kw)).toBe(15);
      expect(matchAnswerToChoiceKeywords("izquierda", kw)).toBe(1);
    });

    it("matches extracted number", () => {
      expect(matchAnswerToChoiceKeywords("voy al 15", kw)).toBe(15);
      expect(matchAnswerToChoiceKeywords("1", kw)).toBe(1);
    });

    it("returns null when no match", () => {
      expect(matchAnswerToChoiceKeywords("maybe", kw)).toBeNull();
    });
  });
});
