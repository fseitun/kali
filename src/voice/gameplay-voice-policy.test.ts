import { describe, it, expect, vi, beforeEach } from "vitest";
import { applySilentSuccessFallback } from "./gameplay-voice-policy";
import { setLocale } from "@/i18n/translations";
import { GamePhase, type GameState, type VoiceOutcomeHints } from "@/orchestrator/types";

describe("Product scenario: Apply Silent Success Fallback", () => {
  beforeEach(() => {
    setLocale("en-US");
  });

  it("Expected outcome: Speaks fork fallback when hint is set", async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const setLastNarration = vi.fn();
    const state: GameState = {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
      },
      players: {
        p1: { id: "p1", name: "Ada", position: 0 },
      },
    };

    const spoke = await applySilentSuccessFallback({
      hints: { forkChoiceResolvedWithoutNarrate: true },
      state,
      speak,
      setLastNarration,
    });

    expect(spoke).toBe(true);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toContain("Ada");
    expect(setLastNarration).toHaveBeenCalledWith(speak.mock.calls[0][0]);
  });

  it("Expected outcome: Returns false when hints are empty", async () => {
    const speak = vi.fn();
    const state = {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
      },
      players: { p1: { id: "p1", name: "Ada", position: 0 } },
    } as GameState;

    const spoke = await applySilentSuccessFallback({
      hints: undefined,
      turnFrame: undefined,
      state,
      speak,
      setLastNarration: vi.fn(),
    });

    expect(spoke).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });

  it("Expected outcome: Derives fork fallback from turn frame when hints are missing", async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const setLastNarration = vi.fn();
    const state = {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
      },
      players: { p1: { id: "p1", name: "Ada", position: 0 } },
    } as GameState;

    const spoke = await applySilentSuccessFallback({
      hints: undefined,
      turnFrame: {
        inputActions: [],
        normalizedActions: [],
        events: [
          { eventId: 1, kind: "forkChoiceStored", playerId: "p1", position: 96, target: 99 },
        ],
        narrationPlans: [],
      },
      state,
      speak,
      setLastNarration,
    });

    expect(spoke).toBe(true);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(setLastNarration).toHaveBeenCalledWith(speak.mock.calls[0][0]);
  });

  it("Expected outcome: Returns false when hints object has no recognized flags", async () => {
    const speak = vi.fn();
    const state = {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
      },
      players: { p1: { id: "p1", name: "Ada", position: 0 } },
    } as GameState;

    const spoke = await applySilentSuccessFallback({
      hints: {} as VoiceOutcomeHints,
      state,
      speak,
      setLastNarration: vi.fn(),
    });

    expect(spoke).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });

  it("Expected outcome: Uses turn id when player name is empty", async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const setLastNarration = vi.fn();
    const state = {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
      },
      players: { p1: { id: "p1", name: "", position: 0 } },
    } as GameState;

    await applySilentSuccessFallback({
      hints: { forkChoiceResolvedWithoutNarrate: true },
      state,
      speak,
      setLastNarration,
    });

    expect(speak).toHaveBeenCalledWith("p1, you're set. Roll the dice.");
  });

  it("Expected outcome: Uses empty name when game turn is missing", async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const state = {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        playerOrder: ["p1"],
        winner: null,
      },
      players: { p1: { id: "p1", name: "Ada", position: 0 } },
    } as unknown as GameState;

    await applySilentSuccessFallback({
      hints: { forkChoiceResolvedWithoutNarrate: true },
      state,
      speak,
      setLastNarration: vi.fn(),
    });

    expect(speak).toHaveBeenCalledWith(", you're set. Roll the dice.");
  });
});
