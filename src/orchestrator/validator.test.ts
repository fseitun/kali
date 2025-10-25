/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import type { StateManager } from "../state-manager";
import { GamePhase } from "./types";
import type { GameState } from "./types";
import { validateActions } from "./validator";

type MockStateManager = Pick<StateManager, "pathExists" | "getByPath">;

describe("Validator - New Primitives", () => {
  let mockState: GameState;
  let mockStateManager: MockStateManager;

  beforeEach(() => {
    mockState = {
      game: {
        name: "Test Game",
        turn: "p1",
        phase: GamePhase.PLAYING,
        playerOrder: ["p1", "p2"],
        winner: null,
        lastRoll: 0,
      },
      players: {
        p1: {
          id: "p1",
          name: "Player 1",
          position: 5,
          hearts: 0,
        },
        p2: {
          id: "p2",
          name: "Player 2",
          position: 10,
          hearts: 2,
        },
      },
    };

    mockStateManager = {
      pathExists: (state: GameState, path: string) => {
        const parts = path.split(".");
        let current: Record<string, unknown> = state as Record<string, unknown>;
        for (const part of parts) {
          if (!(part in current)) return false;
          current = current[part] as Record<string, unknown>;
        }
        return true;
      },
      getByPath: (state: GameState, path: string) => {
        const parts = path.split(".");
        let current: unknown = state;
        for (const part of parts) {
          current = (current as Record<string, unknown>)[part];
        }
        return current;
      },
    };
  });

  describe("PLAYER_ROLLED", () => {
    it("validates with positive value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 5 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects zero value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 0 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("positive value");
    });

    it("rejects negative value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: -3 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("positive value");
    });

    it("rejects missing value field", () => {
      const actions = [{ action: "PLAYER_ROLLED" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("missing");
    });

    it("rejects non-number value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: "five" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("type");
    });
  });

  describe("PLAYER_ANSWERED", () => {
    it("validates with non-empty answer", () => {
      const actions = [{ action: "PLAYER_ANSWERED", answer: "A" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects empty answer", () => {
      const actions = [{ action: "PLAYER_ANSWERED", answer: "" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty");
    });

    it("rejects missing answer field", () => {
      const actions = [{ action: "PLAYER_ANSWERED" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("missing");
    });
  });

  describe("Old Primitives Rejection", () => {
    it("rejects ADD_STATE", () => {
      const actions = [
        { action: "ADD_STATE", path: "players.p1.position", value: 5 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid action type");
    });

    it("rejects SUBTRACT_STATE", () => {
      const actions = [
        { action: "SUBTRACT_STATE", path: "players.p1.hearts", value: 1 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid action type");
    });

    it("rejects READ_STATE", () => {
      const actions = [{ action: "READ_STATE", path: "game.turn" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid action type");
    });

    it("rejects ROLL_DICE", () => {
      const actions = [{ action: "ROLL_DICE", die: "d6" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid action type");
    });
  });

  describe("SET_STATE", () => {
    it("validates path and value", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.hearts", value: 5 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects wrong player turn", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p2.position", value: 1 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "Cannot modify players.p2 when it's p1's turn",
      );
    });

    it("validates game-level paths (except phase, winner, turn)", () => {
      const actions = [
        { action: "SET_STATE", path: "game.lastRoll", value: 5 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Turn Ownership - Orchestrator Authority", () => {
    it("blocks LLM from modifying p2 data when p1 turn", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p2.hearts", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "Cannot modify players.p2 when it's p1's turn",
      );
    });

    it("allows current player to modify their own data", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.hearts", value: 3 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("blocks game.turn changes outside SETUP phase", () => {
      const actions = [{ action: "SET_STATE", path: "game.turn", value: "p2" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot manually change game.turn");
      expect(result.error).toContain(
        "orchestrator automatically advances turns",
      );
    });

    it("allows game.turn changes during SETUP phase", () => {
      (mockState.game as any).phase = "SETUP";
      const actions = [{ action: "SET_STATE", path: "game.turn", value: "p1" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("blocks game.phase changes", () => {
      const actions = [
        { action: "SET_STATE", path: "game.phase", value: "FINISHED" },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot manually change game.phase");
      expect(result.error).toContain("orchestrator manages phase transitions");
    });

    it("blocks game.winner changes", () => {
      const actions = [
        { action: "SET_STATE", path: "game.winner", value: "p1" },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot manually set game.winner");
      expect(result.error).toContain("orchestrator detects and sets winners");
    });

    it("catches turn violations in multi-action sequences", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.hearts", value: 1 },
        { action: "SET_STATE", path: "players.p2.hearts", value: 2 },
        { action: "NARRATE", text: "Done" },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "Cannot modify players.p2 when it's p1's turn",
      );
    });

    it("validates nested player paths for turn ownership", () => {
      (mockState.players as Record<string, unknown>).p1 = {
        ...((mockState.players as Record<string, unknown>).p1 as object),
        inventory: { gold: 10 },
      };
      const actions = [
        {
          action: "SET_STATE",
          path: "players.p1.inventory",
          value: { gold: 20 },
        },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Decision Points - Orchestrator Enforcement", () => {
    beforeEach(() => {
      mockState.decisionPoints = [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path: A or B?",
        },
      ];
      (
        mockState.players as Record<string, Record<string, unknown>>
      ).p1.pathChoice = null;
    });

    it("blocks position changes when decision pending", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot move from position 5");
      expect(result.error).toContain("must choose 'pathChoice' first");
    });

    it("allows position changes after decision is made", () => {
      (
        mockState.players as Record<string, Record<string, unknown>>
      ).p1.pathChoice = "A";
      const actions = [
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("validates correct requiredField (field-specific)", () => {
      (
        mockState.players as Record<string, Record<string, unknown>>
      ).p1.pathChoice = "A";
      (
        mockState.decisionPoints as unknown as Record<string, unknown>[]
      )[0].requiredField = "otherChoice";
      (
        mockState.players as Record<string, Record<string, unknown>>
      ).p1.otherChoice = null;

      const actions = [
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must choose 'otherChoice' first");
    });

    it("allows sequential decision then move (stateful validation)", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.pathChoice", value: "B" },
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("allows moves when no decision point at position", () => {
      (
        mockState.players as Record<string, Record<string, unknown>>
      ).p1.position = 3;
      const actions = [
        { action: "SET_STATE", path: "players.p1.position", value: 7 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("allows moves when no decision points exist", () => {
      mockState.decisionPoints = [];
      const actions = [
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Path Validation", () => {
    it("rejects non-existent paths", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.nonExistent", value: 123 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-existent path");
    });

    it("validates deeply nested existing paths", () => {
      (
        mockState.players as Record<string, Record<string, unknown>>
      ).p1.inventory = { items: { sword: { damage: 10 } } };
      const actions = [
        { action: "SET_STATE", path: "players.p1.inventory", value: {} },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("uses StateManager.pathExists correctly", () => {
      mockStateManager.pathExists = () => false;
      const actions = [
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("Context-Aware Validation - Square Effect Processing", () => {
    it("blocks PLAYER_ROLLED when orchestrator is processing square effect", () => {
      const mockOrchestrator = {
        isProcessingEffect: () => true,
      } as any;

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockOrchestrator,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("during square effect processing");
      expect(result.error).toContain("must be resolved first");
    });

    it("allows PLAYER_ROLLED when orchestrator is not processing square effect", () => {
      const mockOrchestrator = {
        isProcessingEffect: () => false,
      } as any;

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockOrchestrator,
      );

      expect(result.valid).toBe(true);
    });

    it("allows PLAYER_ROLLED when no orchestrator provided (backward compatibility)", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );

      expect(result.valid).toBe(true);
    });

    it("allows NARRATE during square effect processing", () => {
      const mockOrchestrator = {
        isProcessingEffect: () => true,
      } as any;

      const actions = [{ action: "NARRATE", text: "You encounter an animal!" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockOrchestrator,
      );

      expect(result.valid).toBe(true);
    });

    it("allows SET_STATE during square effect processing", () => {
      const mockOrchestrator = {
        isProcessingEffect: () => true,
      } as any;

      const actions = [
        { action: "SET_STATE", path: "players.p1.hearts", value: 5 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockOrchestrator,
      );

      expect(result.valid).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("accepts empty action array", () => {
      const actions: unknown[] = [];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects null action in array", () => {
      const actions = [null];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not an object");
    });

    it("rejects undefined action in array", () => {
      const actions = [undefined];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not an object");
    });

    it("accepts actions with extra unknown fields (extensibility)", () => {
      const actions = [
        {
          action: "NARRATE",
          text: "Hi",
          extraField: "ignored",
          anotherField: 123,
        },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("fails on first invalid action in mixed sequence", () => {
      const actions = [
        { action: "NARRATE", text: "First" },
        { action: "INVALID_ACTION" },
        { action: "NARRATE", text: "Third" },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("index 1");
      expect(result.error).toContain("INVALID_ACTION");
    });

    it("rejects non-array input", () => {
      const actions = { action: "NARRATE", text: "Not an array" };
      const result = validateActions(
        actions as unknown as unknown[],
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be an array");
    });
  });
});
