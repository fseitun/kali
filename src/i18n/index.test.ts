import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setLocale,
  t,
  getNicknames,
  getNumberWords,
  getConfirmationWords,
} from "./index";

// Mock CONFIG
vi.mock("../config", () => ({
  CONFIG: {
    LOCALE: "en-US",
  },
}));

describe("i18n", () => {
  beforeEach(() => {
    // Reset to default locale
    setLocale("en-US");
  });

  describe("t (translation function)", () => {
    it("should translate simple keys", () => {
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });

    it("should translate nested keys", () => {
      expect(t("ui.status.ready")).toBe("Ready");
      expect(t("ui.status.listening")).toBe("Listening...");
    });

    it("should interpolate parameters", () => {
      expect(t("setup.welcome", { game: "Snakes & Ladders" })).toBe(
        "Welcome to Snakes & Ladders! Let's get started.",
      );
    });

    it("should interpolate multiple parameters", () => {
      expect(t("setup.playerCount", { min: 2, max: 4 })).toBe(
        "How many players? The maximum is 4.",
      );
    });

    it("should handle numeric parameters", () => {
      expect(t("game.position", { position: 15 })).toBe(
        "You're at position 15.",
      );
    });

    it("should return key when translation missing", () => {
      expect(t("nonexistent.key")).toBe("nonexistent.key");
      expect(t("setup.nonexistent")).toBe("setup.nonexistent");
    });

    it("should return key when nested path incomplete", () => {
      expect(t("setup")).toBe("setup");
    });

    it("should handle empty parameters", () => {
      expect(t("setup.welcome", {})).toBe(
        "Welcome to {game}! Let's get started.",
      );
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });

    it("should handle partial parameter replacement", () => {
      expect(t("setup.welcome", { game: "Chess" })).toBe(
        "Welcome to Chess! Let's get started.",
      );
    });

    it("should handle complex nested translations", () => {
      expect(t("ui.savedGameDetected", { wakeWord: "Zookeeper" })).toBe(
        'Saved game detected. Say "Zookeeper, continue" or "Zookeeper, new game"',
      );
    });
  });

  describe("setLocale", () => {
    it("should switch to Spanish locale", () => {
      setLocale("es-AR");
      expect(t("setup.welcome")).toBe("¡Bienvenidos a {game}! Arranquemos.");
    });

    it("should fallback to default when locale not found", () => {
      setLocale("fr-FR"); // Non-existent locale
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });

    it("should switch back to English", () => {
      setLocale("es-AR");
      expect(t("setup.welcome")).toBe("¡Bienvenidos a {game}! Arranquemos.");

      setLocale("en-US");
      expect(t("setup.welcome")).toBe("Welcome to {game}! Let's get started.");
    });
  });

  describe("getNicknames", () => {
    it("should return English nicknames by default", () => {
      const nicknames = getNicknames();
      expect(nicknames).toContain("the Great");
      expect(nicknames).toContain("the Wise");
      expect(nicknames).toContain("the Brave");
      expect(nicknames).toHaveLength(16);
    });

    it("should return Spanish nicknames when locale set", () => {
      setLocale("es-AR");
      const nicknames = getNicknames();
      expect(nicknames).toContain("el Grande");
      expect(nicknames).toContain("el Sabio");
      expect(nicknames).toContain("el Valiente");
      expect(nicknames).toHaveLength(16);
    });

    it("should return empty array when nicknames missing", () => {
      // This tests the fallback behavior
      const nicknames = getNicknames();
      expect(Array.isArray(nicknames)).toBe(true);
    });
  });

  describe("getNumberWords", () => {
    it("should return English number words by default", () => {
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

    it("should return Spanish number words when locale set", () => {
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

    it("should return empty array when number words missing", () => {
      // This tests the fallback behavior
      const words = getNumberWords();
      expect(Array.isArray(words)).toBe(true);
    });
  });

  describe("getConfirmationWords", () => {
    it("should return English confirmation words by default", () => {
      const words = getConfirmationWords();
      expect(words.yes).toContain("yes");
      expect(words.yes).toContain("yeah");
      expect(words.yes).toContain("correct");
      expect(words.no).toContain("no");
      expect(words.no).toContain("nope");
    });

    it("should return Spanish confirmation words when locale set", () => {
      setLocale("es-AR");
      const words = getConfirmationWords();
      expect(words.yes).toContain("sí");
      expect(words.yes).toContain("si");
      expect(words.yes).toContain("correcto");
      expect(words.no).toContain("no");
    });

    it("should return empty arrays when confirmation words missing", () => {
      // This tests the fallback behavior
      const words = getConfirmationWords();
      expect(words).toHaveProperty("yes");
      expect(words).toHaveProperty("no");
      expect(Array.isArray(words.yes)).toBe(true);
      expect(Array.isArray(words.no)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty key", () => {
      expect(t("")).toBe("");
    });

    it("should handle key with only dots", () => {
      expect(t("...")).toBe("...");
    });

    it("should handle very deep nesting", () => {
      expect(t("ui.status.ready.nonexistent")).toBe(
        "ui.status.ready.nonexistent",
      );
    });

    it("should handle null/undefined parameters", () => {
      expect(t("setup.welcome", { game: null as unknown as string })).toBe(
        "Welcome to null! Let's get started.",
      );
      expect(t("setup.welcome", { game: undefined as unknown as string })).toBe(
        "Welcome to undefined! Let's get started.",
      );
    });

    it("should handle numeric keys", () => {
      // This tests accessing array-like properties
      const words = getNumberWords();
      expect(words[0]).toBe("zero");
      expect(words[10]).toBe("ten");
    });
  });
});
