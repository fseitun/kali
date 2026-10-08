import { describe, it, expect } from "vitest";
import { parseRollInRange, parseRollLikeInput } from "./roll-parser";

describe("Product scenario: Roll parser", () => {
  it("Expected outcome: Parses a single spoken integer", () => {
    expect(parseRollLikeInput("4")).toBe(4);
    expect(parseRollLikeInput("saqué 4")).toBe(4);
    expect(parseRollLikeInput(" tiré un 12 ")).toBe(12);
    expect(parseRollLikeInput("casillero 15.")).toBe(15);
  });

  it("Expected outcome: Rejects several digit groups instead of concatenating them", () => {
    expect(parseRollLikeInput("1 y 6")).toBeNull();
    expect(parseRollLikeInput("2 y 5")).toBeNull();
    expect(parseRollLikeInput("3.5")).toBeNull();
    expect(parseRollLikeInput("tiré un 1 y un 6")).toBeNull();
  });

  it("Expected outcome: Returns null when there is no number", () => {
    expect(parseRollLikeInput("cuatro")).toBeNull();
    expect(parseRollLikeInput("")).toBeNull();
    expect(parseRollLikeInput("Bosque")).toBeNull();
  });

  it("Expected outcome: Range check never accepts a concatenated pair as a valid 3d6 sum", () => {
    expect(parseRollInRange("1 y 6", 3, 18)).toBeNull();
    expect(parseRollInRange("7", 3, 18)).toBe(7);
    expect(parseRollInRange("20", 3, 18)).toBeNull();
  });
});
