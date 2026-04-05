/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { validateName, findNameConflicts, generateNickname, areNamesSimilar } from "./name-helper";

// Mock i18n getNicknames function
vi.mock("../i18n/translations", () => ({
  getNicknames: () => ["the Great", "the Wise", "the Brave", "the Kind", "the Swift"],
}));

describe("Product scenario: Name helper", () => {
  describe("Product scenario: Validate Name", () => {
    it("Expected outcome: Should accept valid names", () => {
      expect(validateName("Alice")).toEqual({ valid: true, cleaned: "Alice" });
      expect(validateName("Bob Smith")).toEqual({
        valid: true,
        cleaned: "Bob Smith",
      });
      expect(validateName("O'Connor")).toEqual({
        valid: true,
        cleaned: "O'Connor",
      });
      expect(validateName("Player-1")).toEqual({
        valid: true,
        cleaned: "Player-1",
      });
    });

    it("Expected outcome: Should reject empty or invalid inputs", () => {
      expect(validateName("")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("   ")).toEqual({ valid: false, cleaned: "" });
      expect(validateName(null as any)).toEqual({ valid: false, cleaned: "" });
      expect(validateName(undefined as any)).toEqual({
        valid: false,
        cleaned: "",
      });
      expect(validateName(123 as any)).toEqual({ valid: false, cleaned: "" });
    });

    it("Expected outcome: Should trim whitespace", () => {
      expect(validateName("  Alice  ")).toEqual({
        valid: true,
        cleaned: "Alice",
      });
    });

    it("Expected outcome: Should truncate long names", () => {
      const longName = "A".repeat(25);
      const result = validateName(longName);
      expect(result.valid).toBe(true);
      expect(result.cleaned).toBe("A".repeat(20));
    });

    it("Expected outcome: Should reject inappropriate words", () => {
      expect(validateName("fuck")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("shit")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("damn")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("ass")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("bitch")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("FUCK")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("Shithead")).toEqual({ valid: false, cleaned: "" });
    });

    it("Expected outcome: Should remove special characters", () => {
      expect(validateName("Alice@#$%")).toEqual({
        valid: true,
        cleaned: "Alice",
      });
      expect(validateName("Bob!!!")).toEqual({ valid: true, cleaned: "Bob" });
      expect(validateName("Charlie&*()")).toEqual({
        valid: true,
        cleaned: "Charlie",
      });
    });

    it("Expected outcome: Should preserve allowed special characters", () => {
      expect(validateName("O'Connor")).toEqual({
        valid: true,
        cleaned: "O'Connor",
      });
      expect(validateName("Player-1")).toEqual({
        valid: true,
        cleaned: "Player-1",
      });
      expect(validateName("Mary Jane")).toEqual({
        valid: true,
        cleaned: "Mary Jane",
      });
    });

    it("Expected outcome: Should reject names with only special characters", () => {
      expect(validateName("@#$%")).toEqual({ valid: false, cleaned: "" });
      expect(validateName("!!!")).toEqual({ valid: false, cleaned: "" });
    });
  });

  describe("Product scenario: Are Names Similar", () => {
    it("Expected outcome: Should detect similar names", () => {
      expect(areNamesSimilar("Alice", "Alicia")).toBe(true);
      expect(areNamesSimilar("Bob", "Bobby")).toBe(true);
      expect(areNamesSimilar("Charlie", "Charley")).toBe(true);
      expect(areNamesSimilar("David", "Dave")).toBe(true);
    });

    it("Expected outcome: Should not detect dissimilar names", () => {
      expect(areNamesSimilar("Alice", "Bob")).toBe(false);
      expect(areNamesSimilar("Charlie", "David")).toBe(false);
      expect(areNamesSimilar("Eve", "Frank")).toBe(false);
      expect(areNamesSimilar("fede", "pepe")).toBe(false);
    });

    it("Expected outcome: Should handle identical names", () => {
      expect(areNamesSimilar("Alice", "Alice")).toBe(true);
      expect(areNamesSimilar("Bob", "Bob")).toBe(true);
    });

    it("Expected outcome: Should not treat different single letter names as similar", () => {
      expect(areNamesSimilar("a", "b")).toBe(false);
      expect(areNamesSimilar("x", "y")).toBe(false);
    });

    it("Expected outcome: Should treat identical single letter names as similar", () => {
      expect(areNamesSimilar("a", "a")).toBe(true);
    });

    it("Expected outcome: Should handle empty names", () => {
      expect(areNamesSimilar("", "Alice")).toBe(false);
      expect(areNamesSimilar("Alice", "")).toBe(false);
      expect(areNamesSimilar("", "")).toBe(true); // Empty strings are identical
    });

    it("Expected outcome: Should be case insensitive", () => {
      expect(areNamesSimilar("Alice", "alice")).toBe(true);
      expect(areNamesSimilar("BOB", "bob")).toBe(true);
    });
  });

  describe("Product scenario: Find Name Conflicts", () => {
    it("Expected outcome: Should find no conflicts in unique names", () => {
      const names = ["Alice", "Bob", "Charlie"];
      expect(findNameConflicts(names)).toEqual([]);
    });

    it("Expected outcome: Should find exact duplicates", () => {
      const names = ["Alice", "Bob", "Alice"];
      expect(findNameConflicts(names)).toEqual([0, 2]); // Returns indices with conflicts
    });

    it("Expected outcome: Should find similar names", () => {
      const names = ["Alice", "Alicia", "Bob"];
      expect(findNameConflicts(names)).toEqual([0, 1]); // Returns indices with conflicts
    });

    it("Expected outcome: Should handle multiple conflicts", () => {
      const names = ["Alice", "Alicia", "Bob", "Bobby", "Alice"];
      const conflicts = findNameConflicts(names);
      expect(conflicts).toHaveLength(5); // Alice(0), Alicia(1), Bob(2), Bobby(3), Alice(4)
      expect(conflicts).toContain(0); // Alice conflicts with Alicia and Alice(4)
      expect(conflicts).toContain(1); // Alicia conflicts with Alice
      expect(conflicts).toContain(2); // Bob conflicts with Bobby
      expect(conflicts).toContain(3); // Bobby conflicts with Bob
      expect(conflicts).toContain(4); // Alice(4) conflicts with Alice(0)
    });

    it("Expected outcome: Should handle empty array", () => {
      expect(findNameConflicts([])).toEqual([]);
    });

    it("Expected outcome: Should handle single name", () => {
      expect(findNameConflicts(["Alice"])).toEqual([]);
    });
  });

  describe("Product scenario: Generate Nickname", () => {
    it("Expected outcome: Should generate nickname for valid name", () => {
      const nickname = generateNickname("Alice", []);
      expect(nickname).toMatch(/^Alice the (Great|Wise|Brave|Kind|Swift)$/);
    });

    it("Expected outcome: Should generate different nicknames for different names", () => {
      const nick1 = generateNickname("Alice", []);
      const nick2 = generateNickname("Bob", []);

      // Should be different (though not guaranteed due to random selection)
      expect(nick1).toBeDefined();
      expect(nick2).toBeDefined();
      expect(nick1).toMatch(/^Alice the/);
      expect(nick2).toMatch(/^Bob the/);
    });

    it("Expected outcome: Should generate consistent nickname for same name with same used list", () => {
      // Since it's random, we can't test exact consistency, but we can test structure
      const nickname = generateNickname("Alice", []);
      expect(nickname).toMatch(/^Alice the (Great|Wise|Brave|Kind|Swift)$/);
    });

    it("Expected outcome: Should handle empty nicknames array", () => {
      // When no nicknames available, should fall back to numbering
      const nickname = generateNickname("Alice", [
        "Alice the Great",
        "Alice the Wise",
        "Alice the Brave",
        "Alice the Kind",
        "Alice the Swift",
      ]);
      expect(nickname).toMatch(/^Alice \d+$/); // Should be Alice followed by a number
    });

    it("Expected outcome: Should handle single nickname", () => {
      const nickname = generateNickname("Alice", [
        "Alice the Great",
        "Alice the Wise",
        "Alice the Brave",
        "Alice the Kind",
      ]);
      expect(nickname).toBe("Alice the Swift");
    });

    it("Expected outcome: Should handle empty name", () => {
      const nickname = generateNickname("", []);
      expect(nickname).toMatch(/^ the (Great|Wise|Brave|Kind|Swift)$/);
    });

    it("Expected outcome: Should avoid used nicknames", () => {
      const used = ["Alice the Great", "Alice the Wise"];
      const nickname = generateNickname("Alice", used);
      expect(nickname).toMatch(/^Alice the (Brave|Kind|Swift)$/);
      expect(used).not.toContain(nickname);
    });
  });
});
