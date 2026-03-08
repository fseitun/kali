import { describe, it, expect } from "vitest";
import { formatStateContext } from "./system-prompt";

describe("formatStateContext", () => {
  it("only shows DECISION for current turn player", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, pathChoice: "A" },
        p2: { id: "p2", name: "Bob", position: 0, pathChoice: null },
      },
      decisionPoints: [{ position: 0, requiredField: "pathChoice", prompt: "Choose A or B?" }],
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    // p1 has pathChoice set, so no DECISION for anyone. p2 has pathChoice=null but it's p1's turn - we should NOT show p2's decision
    expect(result).not.toContain("DECISION (Bob)");
    expect(result).not.toContain("pathChoice=null");
  });

  it("shows DECISION for current turn player when they have pending path choice", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, pathChoice: null },
        p2: { id: "p2", name: "Bob", position: 0, pathChoice: null },
      },
      decisionPoints: [{ position: 0, requiredField: "pathChoice", prompt: "Choose A or B?" }],
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("DECISION (Alice)");
    expect(result).toContain("pathChoice=null");
    expect(result).toContain("[current]");
    expect(result).not.toContain("DECISION (Bob)");
  });

  it("shows DECISION for p2 when it is p2's turn and they have pending path choice", () => {
    const state = {
      game: { turn: "p2", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 3, pathChoice: "A" },
        p2: { id: "p2", name: "Bob", position: 0, pathChoice: null },
      },
      decisionPoints: [{ position: 0, requiredField: "pathChoice", prompt: "Choose A or B?" }],
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
        p1: { id: "p1", name: "fico", position: 21, pathChoice: "B" },
        p2: { id: "p2", name: "pedro", position: 6, pathChoice: "A" },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("POWER CHECK (fico)");
    expect(result).toContain("powerCheck");
    expect(result).toContain("PLAYER_ANSWERED");
    expect(result).toContain("Orchestrator evaluates win/lose");
  });
});
