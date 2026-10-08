import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveRiddleAnswerToOption, isStrictRiddleCorrect } from "./riddle-answer";

const _dir = dirname(fileURLToPath(import.meta.url));
const kalimbaConfigPath = join(_dir, "../../public/games/kalimba/config.json");

/** What STT hands us when it drops the accents an es-AR option was authored with. */
function withoutAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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

  it("Expected outcome: A short answer sitting inside two options is credited when one of them is the correct one", () => {
    const fishOptions = ["A. Un pez globo", "B. Un pez espada", "C. Una tortuga", "D. Un pulpo"];

    expect(isStrictRiddleCorrect("pez", fishOptions, "B. Un pez espada")).toBe(true);
    expect(isStrictRiddleCorrect("pez", fishOptions, "C. Una tortuga")).toBe(false);
  });

  it("Expected outcome: Naming an option by its letter still grades that option, not a lucky substring", () => {
    // "a" is a substring of nearly every option; the letter must keep meaning option A.
    expect(isStrictRiddleCorrect("a", options, correctOption)).toBe(false);
    expect(isStrictRiddleCorrect("b", options, correctOption)).toBe(true);
  });
});

describe("Product scenario: Riddle grading survives dropped accents (Deepgram)", () => {
  // Real es-AR options from the shipped Kalimba bank.
  const phoneOptions = [
    "Sus adaptaciones naturales",
    "Un teléfono celular",
    "La ropa humana",
    "Los semáforos",
  ];
  const safetyOptions = [
    "Respetar señales y mantener distancia",
    "Acercarse para sacarse selfies",
    "Correr alrededor del animal",
    "Intentar tocarlo entre todos",
  ];

  it("Expected outcome: Grades an accentless answer to an accented option correct", () => {
    expect(
      isStrictRiddleCorrect(
        "respetar senales y mantener distancia",
        safetyOptions,
        "Respetar señales y mantener distancia",
      ),
    ).toBe(true);
    expect(isStrictRiddleCorrect("un telefono celular", phoneOptions, "Un teléfono celular")).toBe(
      true,
    );
    expect(resolveRiddleAnswerToOption("los semaforos", phoneOptions)).toBe("Los semáforos");
  });

  it("Expected outcome: Still grades the wrong option wrong without accents", () => {
    expect(
      isStrictRiddleCorrect("un telefono celular", phoneOptions, "Sus adaptaciones naturales"),
    ).toBe(false);
  });

  it("Expected outcome: Matches accentless synonyms too", () => {
    expect(
      isStrictRiddleCorrect("el crustaceo", ["A. X", "B. Y", "C. Z", "D. W"], "B. Y", [
        "crustáceo",
      ]),
    ).toBe(true);
  });

  it("Expected outcome: Every accented correct option in the shipped bank grades correct without accents", () => {
    const config = JSON.parse(readFileSync(kalimbaConfigPath, "utf-8")) as {
      encounterQuestions?: Record<
        string,
        Record<string, Array<{ options: string[]; correctOption: string }>>
      >;
    };
    const accented = Object.values(config.encounterQuestions ?? {})
      .flatMap((byLocale) => byLocale["es-AR"] ?? [])
      .filter((q) => withoutAccents(q.correctOption) !== q.correctOption);

    expect(accented.length).toBeGreaterThan(0);
    for (const q of accented) {
      const said = withoutAccents(q.correctOption);
      expect([said, isStrictRiddleCorrect(said, q.options, q.correctOption)]).toEqual([said, true]);
    }
  });
});
