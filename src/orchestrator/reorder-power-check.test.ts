import { describe, it, expect } from "vitest";
import { isPowerCheckNumericAnswer, reorderPowerCheckBeforeRoll } from "./reorder-power-check";
import type { GameState, PrimitiveAction } from "./types";
import { GamePhase } from "./types";

describe("Product scenario: Reorder power check", () => {
  describe("Product scenario: Is Power Check Numeric Answer", () => {
    it("Expected outcome: Returns true for numeric strings 1 12", () => {
      expect(isPowerCheckNumericAnswer("1")).toBe(true);
      expect(isPowerCheckNumericAnswer("7")).toBe(true);
      expect(isPowerCheckNumericAnswer("12")).toBe(true);
      expect(isPowerCheckNumericAnswer(" 8 ")).toBe(true);
      expect(isPowerCheckNumericAnswer("tire 7")).toBe(true);
      expect(isPowerCheckNumericAnswer("siete")).toBe(false);
    });

    it("Expected outcome: Returns false for out of range or non numeric", () => {
      expect(isPowerCheckNumericAnswer("0")).toBe(false);
      expect(isPowerCheckNumericAnswer("13")).toBe(false);
      expect(isPowerCheckNumericAnswer("")).toBe(false);
      expect(isPowerCheckNumericAnswer("A")).toBe(false);
    });
  });

  describe("Product scenario: Reorder Power Check Before Roll", () => {
    const stateWithPowerCheck: GameState = {
      game: {
        name: "Kalimba",
        phase: GamePhase.PLAYING,
        turn: "p1",
        winner: null,
        playerOrder: ["p1", "p2"],
        lastRoll: 0,
        pending: {
          kind: "powerCheck",
          position: 10,
          power: 5,
          playerId: "p1",
          riddleCorrect: true,
        },
      },
      players: {
        p1: { id: "p1", name: "Alice", position: 10 },
        p2: { id: "p2", name: "Bob", position: 5 },
      },
      board: { squares: { "100": { effect: "win" } } },
    };

    it("Expected outcome: Moves PLAYER ANSWERED (numeric) before PLAYER ROLLED when state has power Check", () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "7" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toHaveLength(2);
      expect(reordered[0]).toEqual({ action: "PLAYER_ANSWERED", answer: "7" });
      expect(reordered[1]).toEqual({ action: "PLAYER_ROLLED", value: 2 });
    });

    it("Expected outcome: Does not reorder when state has no pending", () => {
      const stateNoPending = {
        ...stateWithPowerCheck,
        game: { ...stateWithPowerCheck.game, pending: null },
      } as GameState;
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "7" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateNoPending);
      expect(reordered).toEqual(actions);
    });

    it("Expected outcome: Does not reorder when pending kind is riddle", () => {
      const pending = (stateWithPowerCheck.game as Record<string, unknown>).pending as Record<
        string,
        unknown
      >;
      const stateRiddle: GameState = {
        ...stateWithPowerCheck,
        game: {
          ...stateWithPowerCheck.game,
          pending: { ...pending, kind: "riddle" },
        },
      };
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "7" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateRiddle);
      expect(reordered).toEqual(actions);
    });

    it("Expected outcome: Does not reorder when batch has only PLAYER ROLLED", () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 2 }];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("Expected outcome: Does not reorder when batch has only PLAYER ANSWERED", () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "7" }];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("Expected outcome: Does not reorder when PLAYER ANSWERED is non numeric (e g fork choice)", () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "PLAYER_ANSWERED", answer: "A" },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("Expected outcome: Preserves order when PLAYER ANSWERED already comes before PLAYER ROLLED", () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ANSWERED", answer: "7" },
        { action: "PLAYER_ROLLED", value: 2 },
      ];
      const reordered = reorderPowerCheckBeforeRoll(actions, stateWithPowerCheck);
      expect(reordered).toEqual(actions);
    });

    it("Expected outcome: Works with revenge phase", () => {
      const pending = (stateWithPowerCheck.game as Record<string, unknown>).pending as Record<
        string,
        unknown
      >;
      const stateRevenge: GameState = {
        ...stateWithPowerCheck,
        game: {
          ...stateWithPowerCheck.game,
          pending: { ...pending, kind: "revenge" },
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
