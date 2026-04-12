import { describe, it, expect } from "vitest";
import { resolveRiddleAnswerToOption, isStrictRiddleCorrect } from "./riddle-answer";

describe("Product scenario: Resolve Riddle Answer To Option", () => {
  const animalOptions = ["A) Hormiga", "B) Elefante", "C) Puma", "D) Delfín"];

  it("Expected outcome: Resolves 'la hormiga' to the first option text", () => {
    expect(resolveRiddleAnswerToOption("la hormiga", animalOptions)).toBe("A) Hormiga");
  });

  it("Expected outcome: Resolves 'hormiga' to the first option", () => {
    expect(resolveRiddleAnswerToOption("hormiga", animalOptions)).toBe("A) Hormiga");
  });

  it("Expected outcome: Resolves 'cangrejo' to the option containing Cangrejo (index 1)", () => {
    const options = ["A. Ballena", "B. Cangrejo", "C. Paloma", "D. Murciélago"];
    expect(resolveRiddleAnswerToOption("cangrejo", options)).toBe("B. Cangrejo");
  });

  it("Expected outcome: Returns null when options are missing or wrong length", () => {
    expect(resolveRiddleAnswerToOption("la hormiga", undefined)).toBe(null);
    expect(resolveRiddleAnswerToOption("la hormiga", [])).toBe(null);
    expect(resolveRiddleAnswerToOption("la hormiga", ["A) Hormiga"])).toBe(null);
  });

  it("Expected outcome: Resolves 1 4 to option index (1 based)", () => {
    expect(resolveRiddleAnswerToOption("1", animalOptions)).toBe("A) Hormiga");
    expect(resolveRiddleAnswerToOption("4", animalOptions)).toBe("D) Delfín");
  });

  it("Expected outcome: Resolves opción N (Spanish) to option index", () => {
    expect(resolveRiddleAnswerToOption("opción 2", animalOptions)).toBe("B) Elefante");
    expect(resolveRiddleAnswerToOption("Opción 3", animalOptions)).toBe("C) Puma");
    expect(resolveRiddleAnswerToOption("opcion 4", animalOptions)).toBe("D) Delfín");
    expect(resolveRiddleAnswerToOption("option 1", animalOptions)).toBe("A) Hormiga");
  });

  it("Expected outcome: Resolves letter options (A-D) to option index", () => {
    expect(resolveRiddleAnswerToOption("a", animalOptions)).toBe("A) Hormiga");
    expect(resolveRiddleAnswerToOption("D", animalOptions)).toBe("D) Delfín");
  });

  it("Expected outcome: Resolves opción with letter to option index", () => {
    expect(resolveRiddleAnswerToOption("opción b", animalOptions)).toBe("B) Elefante");
    expect(resolveRiddleAnswerToOption("opcion c", animalOptions)).toBe("C) Puma");
    expect(resolveRiddleAnswerToOption("option d", animalOptions)).toBe("D) Delfín");
  });

  it("Expected outcome: Returns null for ambiguous free text", () => {
    const ambiguousOptions = ["A) Oso pardo", "B) Oso polar", "C) Delfín", "D) Puma"];
    expect(resolveRiddleAnswerToOption("oso", ambiguousOptions)).toBe(null);
  });
});

describe("Product scenario: Is Strict Riddle Correct", () => {
  const options = ["A. Ballena", "B. Cangrejo", "C. Paloma", "D. Murciélago"];
  const correctOption = "B. Cangrejo";

  it("Expected outcome: Returns true when answer matches correct option text", () => {
    expect(isStrictRiddleCorrect("cangrejo", options, correctOption)).toBe(true);
    expect(isStrictRiddleCorrect("B. Cangrejo", options, correctOption)).toBe(true);
  });

  it("Expected outcome: Returns false when answer matches wrong option", () => {
    expect(isStrictRiddleCorrect("ballena", options, correctOption)).toBe(false);
    expect(isStrictRiddleCorrect("Paloma", options, correctOption)).toBe(false);
  });

  it("Expected outcome: Returns true when answer matches a synonym of correct option", () => {
    const synonyms = ["crustáceo", "cangrejos"];
    expect(isStrictRiddleCorrect("crustáceo", options, correctOption, synonyms)).toBe(true);
    expect(isStrictRiddleCorrect("cangrejos", options, correctOption, synonyms)).toBe(true);
  });

  it("Expected outcome: Returns false when no match and no synonyms", () => {
    expect(isStrictRiddleCorrect("nada", options, correctOption)).toBe(false);
  });
});
