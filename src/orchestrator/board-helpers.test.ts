import { describe, it, expect } from "vitest";
import {
  findSquareByEffect,
  getMagicDoorConfig,
  getMagicDoorOpeningBonus,
  getWinPosition,
  isMagicDoorOpeningRollState,
  minDieToOpenMagicDoor,
  scimitarDoorBonusFromItems,
} from "./board-helpers";

describe("Product scenario: Find Square By Effect", () => {
  it("Expected outcome: Returns null when squares is undefined", () => {
    expect(findSquareByEffect(undefined, "win")).toBeNull();
  });

  it("Expected outcome: Returns null when squares is empty", () => {
    expect(findSquareByEffect({}, "win")).toBeNull();
  });

  it("Expected outcome: Returns null when no square matches the effect", () => {
    expect(findSquareByEffect({ "5": { effect: "portal" } }, "win")).toBeNull();
  });

  it("Expected outcome: Returns null when position key is not a number", () => {
    expect(findSquareByEffect({ abc: { effect: "win" } }, "win")).toBeNull();
  });

  it("Expected outcome: Returns first matching square by object iteration order", () => {
    const squares = {
      "10": { effect: "win" },
      "196": { effect: "win" },
    };
    const found = findSquareByEffect(squares, "win");
    expect(found).toEqual({ position: 10, square: { effect: "win" } });
  });

  it("Expected outcome: Finds magic Door Check and includes square data", () => {
    const sq = { effect: "magicDoorCheck", target: 6 };
    const found = findSquareByEffect({ "186": sq }, "magicDoorCheck");
    expect(found).toEqual({ position: 186, square: sq });
  });
});

describe("Product scenario: Get Win Position", () => {
  it("Expected outcome: Returns 196 when there is no win square", () => {
    expect(getWinPosition(undefined)).toBe(196);
    expect(getWinPosition({ "0": { next: [1] } })).toBe(196);
  });

  it("Expected outcome: Returns configured win position from squares", () => {
    expect(getWinPosition({ "42": { effect: "win" } })).toBe(42);
  });
});

describe("Product scenario: Get Magic Door Config", () => {
  it("Expected outcome: Returns null when no magic door square", () => {
    expect(getMagicDoorConfig(undefined)).toBeNull();
    expect(getMagicDoorConfig({ "5": { effect: "skipTurn" } })).toBeNull();
  });

  it("Expected outcome: Returns position and target from magic Door Check", () => {
    expect(getMagicDoorConfig({ "186": { effect: "magicDoorCheck", target: 6 } })).toEqual({
      position: 186,
      target: 6,
    });
  });

  it("Expected outcome: Defaults target to 6 when missing", () => {
    expect(getMagicDoorConfig({ "99": { effect: "magicDoorCheck" } })).toEqual({
      position: 99,
      target: 6,
    });
  });
});

describe("Product scenario: Min Die To Open Magic Door", () => {
  it("Expected outcome: Matches Kalimba rule die + bonus >= target", () => {
    expect(minDieToOpenMagicDoor(6, 0)).toBe(6);
    expect(minDieToOpenMagicDoor(6, 1)).toBe(5);
    expect(minDieToOpenMagicDoor(6, 2)).toBe(4);
    expect(minDieToOpenMagicDoor(6, 3)).toBe(3);
    expect(minDieToOpenMagicDoor(6, 5)).toBe(1);
    expect(minDieToOpenMagicDoor(6, 6)).toBe(1);
  });

  it("Expected outcome: Treats scimitar bonus like an extra heart for the door threshold", () => {
    expect(minDieToOpenMagicDoor(6, 0, 1)).toBe(5);
    expect(minDieToOpenMagicDoor(6, 1, 1)).toBe(4);
    expect(minDieToOpenMagicDoor(6, 5, 1)).toBe(1);
  });
});

describe("Product scenario: Scimitar Door Bonus From Items", () => {
  it("Expected outcome: Returns 1 only when scimitar is in items", () => {
    expect(scimitarDoorBonusFromItems(undefined)).toBe(0);
    expect(scimitarDoorBonusFromItems([])).toBe(0);
    expect(scimitarDoorBonusFromItems(["torch"])).toBe(0);
    expect(scimitarDoorBonusFromItems(["scimitar"])).toBe(1);
    expect(scimitarDoorBonusFromItems(["torch", "scimitar"])).toBe(1);
  });
});

describe("Product scenario: Get Magic Door Opening Bonus", () => {
  it("Expected outcome: Sums hearts and scimitar", () => {
    expect(getMagicDoorOpeningBonus(undefined)).toBe(0);
    expect(getMagicDoorOpeningBonus({ hearts: 2 })).toBe(2);
    expect(getMagicDoorOpeningBonus({ hearts: 1, items: ["scimitar"] })).toBe(2);
    expect(getMagicDoorOpeningBonus({ hearts: 0, items: ["scimitar"] })).toBe(1);
  });
});

describe("Product scenario: Is Magic Door Opening Roll State", () => {
  const squares = { "186": { effect: "magicDoorCheck" as const, target: 6 } };
  const base = {
    game: { turn: "p1" },
    players: {
      p1: { position: 186, magicDoorOpened: false },
    },
    board: { squares },
  };
  it("Expected outcome: Is true on door square when not yet opened", () => {
    expect(isMagicDoorOpeningRollState(base)).toBe(true);
  });
  it("Expected outcome: Is false when door already opened", () => {
    expect(
      isMagicDoorOpeningRollState({
        ...base,
        players: { p1: { position: 186, magicDoorOpened: true } },
      }),
    ).toBe(false);
  });
  it("Expected outcome: Is false when not on door", () => {
    expect(
      isMagicDoorOpeningRollState({
        ...base,
        players: { p1: { position: 185, magicDoorOpened: false } },
      }),
    ).toBe(false);
  });
});
