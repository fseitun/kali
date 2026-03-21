import { describe, it, expect, vi } from "vitest";
import { applySilentSuccessFallback } from "./gameplay-voice-policy";
import { GamePhase, type GameState } from "@/orchestrator/types";

describe("applySilentSuccessFallback", () => {
  it("speaks fork fallback when hint is set", async () => {
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

  it("returns false when hints are empty", async () => {
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
      state,
      speak,
      setLastNarration: vi.fn(),
    });

    expect(spoke).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });
});
