import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applySilentSuccessFallback, buildTurnAnnouncement } from "./gameplay-voice-policy";
import { setLocale, t } from "@/i18n/translations";
import { GamePhase, type GameState } from "@/orchestrator/types";

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
      hints: {},
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

describe("Product scenario: Build Turn Announcement", () => {
  beforeEach(() => {
    setLocale("en-US");
  });

  function stateAt(position: number, hearts: number): GameState {
    return {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1"],
        winner: null,
      },
      players: { p1: { id: "p1", name: "Ada", position, hearts } },
      board: { squares: { 186: { name: "Magic Door", effect: "magicDoorCheck", target: 6 } } },
    };
  }

  it("Expected outcome: Tells the player at the magic door what the die has to beat", () => {
    const line = buildTurnAnnouncement(
      { playerId: "p1", name: "Ada", position: 186 },
      null,
      stateAt(186, 2),
    );

    // Two hearts, target six: a four opens it. Kali has to say that number out loud.
    expect(line).toContain("2 hearts");
    expect(line).toContain("at least a 4");
  });

  it("Expected outcome: Prefers the pending decision prompt away from the door", () => {
    const line = buildTurnAnnouncement(
      { playerId: "p1", name: "Ada", position: 0 },
      "Left or right?",
      stateAt(0, 0),
    );

    expect(line).toContain("Left or right?");
  });

  it("Expected outcome: Falls back to the plain move prompt", () => {
    const line = buildTurnAnnouncement(
      { playerId: "p1", name: "Ada", position: 4 },
      null,
      stateAt(4, 0),
    );

    expect(line).toBe(t("game.turnAnnouncement", { name: "Ada", position: 4 }));
  });
});

describe("Product scenario: Build Turn Announcement (revenge roll)", () => {
  afterEach(() => {
    setLocale("es-AR");
  });

  /** Bruno lost the power check on the polar bear (105) and owes a revenge roll. */
  function stateOwingRevenge(): GameState {
    return {
      game: {
        name: "G",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1", "p2"],
        winner: null,
        pending: { kind: "revenge", playerId: "p1", position: 105, power: 4 },
      },
      players: { p1: { id: "p1", name: "Bruno", position: 105 } },
      board: { squares: { 105: { name: "Polar bear", power: 4 } } },
    };
  }

  it("Expected outcome: Names the revenge and the number it takes to beat the animal", () => {
    setLocale("es-AR");

    const line = buildTurnAnnouncement(
      { playerId: "p1", name: "Bruno", position: 105 },
      null,
      stateOwingRevenge(),
    );

    expect(line).not.toBe(t("game.turnAnnouncement", { name: "Bruno", position: 105 }));
    expect(line).toContain("revancha");
    expect(line).toContain("4"); // revenge wins on roll >= power
    expect(line).toContain("del oso polar");
  });

  it("Expected outcome: Has the line in en US too", () => {
    setLocale("en-US");

    const line = buildTurnAnnouncement(
      { playerId: "p1", name: "Bruno", position: 105 },
      null,
      stateOwingRevenge(),
    );

    expect(line).not.toBe("game.turnAnnouncementRevenge");
    expect(line).toContain("revenge");
    expect(line).toContain("4");
  });

  it("Expected outcome: Leaves another player's revenge out of this turn's line", () => {
    setLocale("es-AR");
    const state = stateOwingRevenge();
    (state.game.pending as { playerId: string }).playerId = "p2";

    const line = buildTurnAnnouncement(
      { playerId: "p1", name: "Bruno", position: 105 },
      null,
      state,
    );

    expect(line).toBe(t("game.turnAnnouncement", { name: "Bruno", position: 105 }));
  });
});
