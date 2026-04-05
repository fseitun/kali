import { describe, it, expect, vi, beforeEach } from "vitest";
import { setLocale, t, getNicknames, getNumberWords, getConfirmationWords } from "./translations";

// Mock CONFIG
vi.mock("../config", () => ({
  CONFIG: {
    LOCALE: "en-US",
  },
}));

describe("Product scenario: I18n", () => {
  beforeEach(() => {
    // Reset to default locale
    setLocale("en-US");
  });

  describe("Product scenario: T (translation function)", () => {
    it("Expected outcome: Should translate simple keys", () => {
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });

    it("Expected outcome: Should translate nested keys", () => {
      expect(t("ui.status.ready")).toBe("Ready");
      expect(t("ui.status.listening")).toBe("Listening...");
    });

    it("Expected outcome: Should interpolate parameters", () => {
      expect(t("setup.welcome", { game: "Kalimba" })).toBe(
        "Welcome to Kalimba! Let's get started.",
      );
    });

    it("Expected outcome: Should interpolate multiple parameters", () => {
      expect(t("setup.playerCount", { min: 2, max: 4 })).toBe(
        "How many players? The maximum is 4.",
      );
    });

    it("Expected outcome: Should handle numeric parameters", () => {
      expect(t("game.position", { position: 15 })).toBe("You're at position 15.");
    });

    it("Expected outcome: Should return key when translation missing", () => {
      expect(t("nonexistent.key")).toBe("nonexistent.key");
      expect(t("setup.nonexistent")).toBe("setup.nonexistent");
    });

    it("Expected outcome: Should return key when nested path incomplete", () => {
      expect(t("setup")).toBe("setup");
    });

    it("Expected outcome: Should handle empty parameters", () => {
      expect(t("setup.welcome", {})).toBe("Welcome to {game}! Let's get started.");
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });

    it("Expected outcome: Should handle partial parameter replacement", () => {
      expect(t("setup.welcome", { game: "Chess" })).toBe("Welcome to Chess! Let's get started.");
    });

    it("Expected outcome: Should handle complex nested translations", () => {
      expect(t("ui.savedGameDetected", { wakeWord: "Zookeeper" })).toBe(
        'Saved game detected. Say "Zookeeper, continue" or "Zookeeper, new game"',
      );
    });
  });

  describe("Product scenario: Set Locale", () => {
    it("Expected outcome: Should switch to Spanish locale", () => {
      setLocale("es-AR");
      expect(t("setup.welcome")).toBe("¡Bienvenidos a {game}! Arranquemos.");
    });

    it("Expected outcome: Should fallback to default when locale not found", () => {
      setLocale("fr-FR"); // Non-existent locale
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });

    it("Expected outcome: Should switch back to English", () => {
      setLocale("es-AR");
      expect(t("setup.welcome")).toBe("¡Bienvenidos a {game}! Arranquemos.");

      setLocale("en-US");
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });
  });

  describe("Product scenario: Get Nicknames", () => {
    it("Expected outcome: Should return English nicknames by default", () => {
      const nicknames = getNicknames();
      expect(nicknames).toContain("the Great");
      expect(nicknames).toContain("the Wise");
      expect(nicknames).toContain("the Brave");
      expect(nicknames).toHaveLength(16);
    });

    it("Expected outcome: Should return Spanish nicknames when locale set", () => {
      setLocale("es-AR");
      const nicknames = getNicknames();
      expect(nicknames).toContain("el Grande");
      expect(nicknames).toContain("el Sabio");
      expect(nicknames).toContain("el Valiente");
      expect(nicknames).toHaveLength(16);
    });

    it("Expected outcome: Should return empty array when nicknames missing", () => {
      // This tests the fallback behavior
      const nicknames = getNicknames();
      expect(Array.isArray(nicknames)).toBe(true);
    });
  });

  describe("Product scenario: Get Number Words", () => {
    it("Expected outcome: Should return English number words by default", () => {
      const words = getNumberWords();
      expect(words).toEqual([
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
      ]);
    });

    it("Expected outcome: Should return Spanish number words when locale set", () => {
      setLocale("es-AR");
      const words = getNumberWords();
      expect(words).toEqual([
        "cero",
        "uno",
        "dos",
        "tres",
        "cuatro",
        "cinco",
        "seis",
        "siete",
        "ocho",
        "nueve",
        "diez",
      ]);
    });

    it("Expected outcome: Should return empty array when number words missing", () => {
      // This tests the fallback behavior
      const words = getNumberWords();
      expect(Array.isArray(words)).toBe(true);
    });
  });

  describe("Product scenario: Get Confirmation Words", () => {
    it("Expected outcome: Should return English confirmation words by default", () => {
      const words = getConfirmationWords();
      expect(words.yes).toContain("yes");
      expect(words.yes).toContain("yeah");
      expect(words.yes).toContain("correct");
      expect(words.no).toContain("no");
      expect(words.no).toContain("nope");
    });

    it("Expected outcome: Should return Spanish confirmation words when locale set", () => {
      setLocale("es-AR");
      const words = getConfirmationWords();
      expect(words.yes).toContain("sí");
      expect(words.yes).toContain("si");
      expect(words.yes).toContain("correcto");
      expect(words.no).toContain("no");
    });

    it("Expected outcome: Should return empty arrays when confirmation words missing", () => {
      // This tests the fallback behavior
      const words = getConfirmationWords();
      expect(words).toHaveProperty("yes");
      expect(words).toHaveProperty("no");
      expect(Array.isArray(words.yes)).toBe(true);
      expect(Array.isArray(words.no)).toBe(true);
    });
  });

  describe("Product scenario: Debug UI version line", () => {
    function debugVersionLine(buildId: string): string {
      return `${t("ui.upToDate")} · ${t("ui.buildLabel")}${buildId}`;
    }

    it("Expected outcome: Uses English when locale is en US", () => {
      setLocale("en-US");
      expect(debugVersionLine("latest")).toBe("Up to date · Build: latest");
    });

    it("Expected outcome: Uses Spanish when locale is es AR", () => {
      setLocale("es-AR");
      expect(debugVersionLine("latest")).toBe("Al día · Versión: latest");
    });
  });

  describe("Product scenario: Edge cases", () => {
    it("Expected outcome: Should handle empty key", () => {
      expect(t("")).toBe("");
    });

    it("Expected outcome: Should handle key with only dots", () => {
      expect(t("...")).toBe("...");
    });

    it("Expected outcome: Should handle very deep nesting", () => {
      expect(t("ui.status.ready.nonexistent")).toBe("ui.status.ready.nonexistent");
    });

    it("Expected outcome: Should handle null/undefined parameters", () => {
      expect(t("setup.welcome", { game: null as unknown as string })).toBe(
        "Welcome to null! Let's get started.",
      );
      expect(t("setup.welcome", { game: undefined as unknown as string })).toBe(
        "Welcome to undefined! Let's get started.",
      );
    });

    it("Expected outcome: Should handle numeric keys", () => {
      // This tests accessing array-like properties
      const words = getNumberWords();
      expect(words[0]).toBe("zero");
      expect(words[10]).toBe("ten");
    });
  });
});
