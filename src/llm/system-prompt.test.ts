import { describe, it, expect } from "vitest";
import { formatStateContext } from "./system-prompt";

describe("formatStateContext", () => {
  it("only shows DECISION for current turn player", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, activeChoices: { 0: 1 } },
        p2: { id: "p2", name: "Bob", position: 0, activeChoices: {} },
      },
      decisionPoints: [{ position: 0, prompt: "Choose A or B?" }],
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    // p1 has activeChoices set, so no DECISION for anyone. p2 has no choice but it's p1's turn
    expect(result).not.toContain("DECISION (Bob)");
  });

  it("shows DECISION for current turn player when they have pending path choice", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
        p2: { id: "p2", name: "Bob", position: 0, activeChoices: {} },
      },
      decisionPoints: [{ position: 0, prompt: "Choose A or B?" }],
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("DECISION (Alice)");
    expect(result).toContain("activeChoices");
    expect(result).toContain("[current]");
    expect(result).not.toContain("DECISION (Bob)");
  });

  it("shows DECISION for p2 when it is p2's turn and they have pending path choice", () => {
    const state = {
      game: { turn: "p2", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 3, activeChoices: { 0: 1 } },
        p2: { id: "p2", name: "Bob", position: 0, activeChoices: {} },
      },
      decisionPoints: [{ position: 0, prompt: "Choose A or B?" }],
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("DECISION (Bob)");
    expect(result).toContain("[current]");
    expect(result).not.toContain("DECISION (Alice)");
  });

  it("shows POWER CHECK hint when pendingAnimalEncounter powerCheck for current player", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pendingAnimalEncounter: {
          position: 21,
          power: 2,
          playerId: "p1",
          phase: "powerCheck",
        },
      },
      players: {
        p1: { id: "p1", name: "fico", position: 21, activeChoices: { 0: 15 } },
        p2: { id: "p2", name: "pedro", position: 6, activeChoices: { 0: 1 } },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("POWER CHECK (fico)");
    expect(result).toContain("powerCheck");
    expect(result).toContain("PLAYER_ANSWERED");
    expect(result).toContain("Do NOT NARRATE the roll");
    expect(result).toContain("Orchestrator announces pass/fail");
    expect(result).not.toContain("Sumás");
    expect(result).not.toContain("confirm the roll");
  });

  it("shows REVENGE hint with anti-pattern when pendingAnimalEncounter phase=revenge", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pendingAnimalEncounter: {
          position: 21,
          power: 4,
          playerId: "p1",
          phase: "revenge",
        },
      },
      players: {
        p1: { id: "p1", name: "Alice", position: 21 },
        p2: { id: "p2", name: "Bob", position: 5 },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("REVENGE (Alice)");
    expect(result).toContain("phase=revenge");
    expect(result).toContain("roll >= 4");
    expect(result).toContain("Do NOT NARRATE the roll");
    expect(result).toContain("Orchestrator announces pass/fail");
  });
});
