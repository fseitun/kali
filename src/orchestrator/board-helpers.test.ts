import { describe, it, expect } from "vitest";
import { findSquareByEffect, getWinPosition } from "./board-helpers";

describe("findSquareByEffect", () => {
  it("returns null when squares is undefined", () => {
    expect(findSquareByEffect(undefined, "win")).toBeNull();
  });

  it("returns null when squares is empty", () => {
    expect(findSquareByEffect({}, "win")).toBeNull();
  });

  it("returns null when no square matches the effect", () => {
    expect(findSquareByEffect({ "5": { type: "empty", effect: "portal" } }, "win")).toBeNull();
  });

  it("returns null when position key is not a number", () => {
    expect(findSquareByEffect({ abc: { effect: "win" } }, "win")).toBeNull();
  });

  it("returns first matching square by object iteration order", () => {
    const squares = {
      "10": { effect: "win" },
      "196": { effect: "win" },
    };
    const found = findSquareByEffect(squares, "win");
    expect(found).toEqual({ position: 10, square: { effect: "win" } });
  });

  it("finds magicDoorCheck and includes square data", () => {
    const sq = { type: "special", effect: "magicDoorCheck", target: 6 };
    const found = findSquareByEffect({ "186": sq }, "magicDoorCheck");
    expect(found).toEqual({ position: 186, square: sq });
  });
});

describe("getWinPosition", () => {
  it("returns 196 when there is no win square", () => {
    expect(getWinPosition(undefined)).toBe(196);
    expect(getWinPosition({ "0": { next: [1] } })).toBe(196);
  });

  it("returns configured win position from squares", () => {
    expect(getWinPosition({ "42": { effect: "win" } })).toBe(42);
  });
});
