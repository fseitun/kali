import { describe, it, expect } from "vitest";
import { resolveRiddleAnswerToOption, isStrictRiddleCorrect } from "./riddle-answer";

describe("resolveRiddleAnswerToOption", () => {
  const animalOptions = ["A) Hormiga", "B) Elefante", "C) Puma", "D) Delfín"];

  it("resolves 'la hormiga' to the first option text", () => {
    expect(resolveRiddleAnswerToOption("la hormiga", animalOptions)).toBe("A) Hormiga");
  });

  it("resolves 'hormiga' to the first option", () => {
    expect(resolveRiddleAnswerToOption("hormiga", animalOptions)).toBe("A) Hormiga");
  });

  it("resolves 'cangrejo' to the option containing Cangrejo (index 1)", () => {
    const options = ["A. Ballena", "B. Cangrejo", "C. Paloma", "D. Murciélago"];
    expect(resolveRiddleAnswerToOption("cangrejo", options)).toBe("B. Cangrejo");
  });

  it("returns null when options are missing or wrong length", () => {
    expect(resolveRiddleAnswerToOption("la hormiga", undefined)).toBe(null);
    expect(resolveRiddleAnswerToOption("la hormiga", [])).toBe(null);
    expect(resolveRiddleAnswerToOption("la hormiga", ["A) Hormiga"])).toBe(null);
  });

  it("resolves 1–4 to option index (1-based)", () => {
    expect(resolveRiddleAnswerToOption("1", animalOptions)).toBe("A) Hormiga");
    expect(resolveRiddleAnswerToOption("4", animalOptions)).toBe("D) Delfín");
  });

  it("resolves opción N (Spanish) to option index", () => {
    expect(resolveRiddleAnswerToOption("opción 2", animalOptions)).toBe("B) Elefante");
    expect(resolveRiddleAnswerToOption("Opción 3", animalOptions)).toBe("C) Puma");
  });
});

describe("isStrictRiddleCorrect", () => {
  const options = ["A. Ballena", "B. Cangrejo", "C. Paloma", "D. Murciélago"];
  const correctOption = "B. Cangrejo";

  it("returns true when answer matches correct option text", () => {
    expect(isStrictRiddleCorrect("cangrejo", options, correctOption)).toBe(true);
    expect(isStrictRiddleCorrect("B. Cangrejo", options, correctOption)).toBe(true);
  });

  it("returns false when answer matches wrong option", () => {
    expect(isStrictRiddleCorrect("ballena", options, correctOption)).toBe(false);
    expect(isStrictRiddleCorrect("Paloma", options, correctOption)).toBe(false);
  });

  it("returns true when answer matches a synonym of correct option", () => {
    const synonyms = ["crustáceo", "cangrejos"];
    expect(isStrictRiddleCorrect("crustáceo", options, correctOption, synonyms)).toBe(true);
    expect(isStrictRiddleCorrect("cangrejos", options, correctOption, synonyms)).toBe(true);
  });

  it("returns false when no match and no synonyms", () => {
    expect(isStrictRiddleCorrect("nada", options, correctOption)).toBe(false);
  });
});
