import { describe, it, expect } from "vitest";
import { isPowerCheckNumericAnswer, reorderPowerCheckBeforeRoll } from "./reorder-power-check";
import type { GameState, PrimitiveAction } from "./types";
import { GamePhase } from "./types";

describe("reorder-power-check", () => {
  describe("isPowerCheckNumericAnswer", () => {
    it("returns true for numeric strings 1-12", () => {
      expect(isPowerCheckNumericAnswer("1")).toBe(true);
      expect(isPowerCheckNumericAnswer("7")).toBe(true);
      expect(isPowerCheckNumericAnswer("12")).toBe(true);
      expect(isPowerCheckNumericAnswer(" 8 ")).toBe(true);
      expect(isPowerCheckNumericAnswer("tire 7")).toBe(true);
      expect(isPowerCheckNumericAnswer("siete")).toBe(false);
    });

    it("returns false for out-of-range or non-numeric", () => {
      expect(isPowerCheckNumericAnswer("0")).toBe(false);
      expect(isPowerCheckNumericAnswer("13")).toBe(false);
      expect(isPowerCheckNumericAnswer("")).toBe(false);
      expect(isPowerCheckNumericAnswer("A")).toBe(false);
    });
  });

  describe("reorderPowerCheckBeforeRoll", () => {
    const stateWithPowerCheck: GameState = {
      game: {
        name: "Kalimba",
        phase: GamePhase.PLAYING,
        turn: "p1",
        winner: null,
        playerOrder: ["p1", "p2"],
        lastRoll: 0,
        pendingAnimalEncounter: {
          position: 10,
          power: 5,
          playerId: "p1",
          phase: "powerCheck",
        },
      },
      players: {
        p1: { id: "p1", name: "Alice", position: 10 },
        p2: { id: "p2", name: "Bob", position: 5 },
      },
      board: { winPosition: 100, moves: {}, squares: {} },
      decisionPoints: [],
    };

    it("moves PLAYER_ANSWERED (numeric) before PLAYER_ROLLED when state has powerCheck", () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "7" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toHaveLength(2);
      expect(reordered[0]).toEqual({ action: "PLAYER_ANSWERED", answer: "7" });
      expect(reordered[1]).toEqual({ action: "PLAYER_ROLLED", value: 2 });
    });

    it("does not reorder when state has no pendingAnimalEncounter", () => {
      const stateNoPending = {
        ...stateWithPowerCheck,
        game: { ...stateWithPowerCheck.game, pendingAnimalEncounter: null },
      } as GameState;
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "7" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateNoPending);
      expect(reordered).toEqual(actions);
    });

    it("does not reorder when pending phase is riddle", () => {
      const pending = (stateWithPowerCheck.game as Record<string, unknown>)
        .pendingAnimalEncounter as Record<string, unknown>;
      const stateRiddle: GameState = {
        ...stateWithPowerCheck,
        game: {
          ...stateWithPowerCheck.game,
          pendingAnimalEncounter: { ...pending, phase: "riddle" },
        },
      };
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "7" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateRiddle);
      expect(reordered).toEqual(actions);
    });

    it("does not reorder when batch has only PLAYER_ROLLED", () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 2 }];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("does not reorder when batch has only PLAYER_ANSWERED", () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "7" }];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("does not reorder when PLAYER_ANSWERED is non-numeric (e.g. fork choice)", () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "A" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("preserves order when PLAYER_ANSWERED already comes before PLAYER_ROLLED", () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ANSWERED", answer: "7" },
        { action: "PLAYER_ROLLED", value: 2 },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("works with revenge phase", () => {
      const pending = (stateWithPowerCheck.game as Record<string, unknown>)
        .pendingAnimalEncounter as Record<string, unknown>;
      const stateRevenge: GameState = {
        ...stateWithPowerCheck,
        game: {
          ...stateWithPowerCheck.game,
          pendingAnimalEncounter: { ...pending, phase: "revenge" },
        },
      };
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "8" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateRevenge);
      expect(reordered[0]).toEqual({ action: "PLAYER_ANSWERED", answer: "8" });
      expect(reordered[1]).toEqual({ action: "PLAYER_ROLLED", value: 2 });
    });
  });
});
