import { describe, it, expect } from "vitest";
import { resolveRiddleAnswerToLetter } from "./riddle-answer";

describe("resolveRiddleAnswerToLetter", () => {
  const animalOptions = ["A) Hormiga", "B) Elefante", "C) Puma", "D) Delfín"];

  it("resolves 'la hormiga' to A (user says option text)", () => {
    expect(resolveRiddleAnswerToLetter("la hormiga", animalOptions)).toBe("A");
  });

  it("resolves 'hormiga' to A", () => {
    expect(resolveRiddleAnswerToLetter("hormiga", animalOptions)).toBe("A");
  });

  it("resolves single letter A to A", () => {
    expect(resolveRiddleAnswerToLetter("A", animalOptions)).toBe("A");
  });

  it("returns null when options are missing or wrong length", () => {
    expect(resolveRiddleAnswerToLetter("la hormiga", undefined)).toBe(null);
    expect(resolveRiddleAnswerToLetter("la hormiga", [])).toBe(null);
    expect(resolveRiddleAnswerToLetter("la hormiga", ["A) Hormiga"])).toBe(null);
  });
});
