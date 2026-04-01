import { describe, it, expect } from "vitest";
import {
  findSquareByEffect,
  getMagicDoorConfig,
  getWinPosition,
  minDieToOpenMagicDoor,
} from "./board-helpers";

describe("findSquareByEffect", () => {
  it("returns null when squares is undefined", () => {
    expect(findSquareByEffect(undefined, "win")).toBeNull();
  });

  it("returns null when squares is empty", () => {
    expect(findSquareByEffect({}, "win")).toBeNull();
  });

  it("returns null when no square matches the effect", () => {
    expect(findSquareByEffect({ "5": { effect: "portal" } }, "win")).toBeNull();
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
    const sq = { effect: "magicDoorCheck", target: 6 };
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

describe("getMagicDoorConfig", () => {
  it("returns null when no magic door square", () => {
    expect(getMagicDoorConfig(undefined)).toBeNull();
    expect(getMagicDoorConfig({ "5": { effect: "skipTurn" } })).toBeNull();
  });

  it("returns position and target from magicDoorCheck", () => {
    expect(getMagicDoorConfig({ "186": { effect: "magicDoorCheck", target: 6 } })).toEqual({
      position: 186,
      target: 6,
    });
  });

  it("defaults target to 6 when missing", () => {
    expect(getMagicDoorConfig({ "99": { effect: "magicDoorCheck" } })).toEqual({
      position: 99,
      target: 6,
    });
  });
});

describe("minDieToOpenMagicDoor", () => {
  it("matches Kalimba rule die + hearts >= target", () => {
    expect(minDieToOpenMagicDoor(6, 0)).toBe(6);
    expect(minDieToOpenMagicDoor(6, 1)).toBe(5);
    expect(minDieToOpenMagicDoor(6, 2)).toBe(4);
    expect(minDieToOpenMagicDoor(6, 3)).toBe(3);
    expect(minDieToOpenMagicDoor(6, 5)).toBe(1);
    expect(minDieToOpenMagicDoor(6, 6)).toBe(1);
  });
});
