import { describe, it, expect } from "vitest";
import { normalizeForWakeWord, levenshtein, isWakeWordMatch } from "./wake-word-utils";

const VARIANTS = ["kali", "cali", "calli", "kaly", "caly", "callie", "callee", "kari"];

describe("normalizeForWakeWord", () => {
  it("lowercases and collapses repeated letters", () => {
    expect(normalizeForWakeWord("  KALLII  ")).toBe("kali");
    expect(normalizeForWakeWord("callee")).toBe("cale");
  });
});

describe("levenshtein", () => {
  it("returns 0 for equal strings", () => {
    expect(levenshtein("kali", "kali")).toBe(0);
  });
  it("returns 1 for one substitution", () => {
    expect(levenshtein("kali", "cali")).toBe(1);
  });
  it("returns correct distance for longer word", () => {
    expect(levenshtein("kali", "callie")).toBe(3);
  });
});

describe("isWakeWordMatch", () => {
  it("matches exact substring", () => {
    expect(isWakeWordMatch("kali", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("hey kali roll", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("cali", VARIANTS)).toBe(true);
  });

  it("matches normalized stutter", () => {
    expect(isWakeWordMatch("kallli", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("caalli", VARIANTS)).toBe(true);
  });

  it("matches common ASR misrecognitions as words", () => {
    expect(isWakeWordMatch("callie", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("the callie said", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("kari", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("callee", VARIANTS)).toBe(true);
  });

  it("matches within edit distance 1", () => {
    expect(isWakeWordMatch("kaly", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("kali roll", VARIANTS)).toBe(true);
    expect(isWakeWordMatch("said kali", VARIANTS)).toBe(true);
  });

  it("rejects unrelated words", () => {
    expect(isWakeWordMatch("hello", VARIANTS)).toBe(false);
    expect(isWakeWordMatch("california", VARIANTS)).toBe(true); // "cali" substring
  });

  it("respects maxEditDistance", () => {
    // "xalei" does not contain any variant; edit distance 2 from "kali"; matches with 2, not with 1
    expect(isWakeWordMatch("xalei", VARIANTS, 2)).toBe(true);
    expect(isWakeWordMatch("xalei", VARIANTS, 1)).toBe(false);
  });

  it("returns false for empty or whitespace", () => {
    expect(isWakeWordMatch("", VARIANTS)).toBe(false);
    expect(isWakeWordMatch("   ", VARIANTS)).toBe(false);
  });
});
