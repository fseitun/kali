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
      expect(result.errorCode).toBe("invalidActionFormat");
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

    it("rejects value 77 (impossible roll, 1d6)", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 77 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toContain("1-6");
    });

    it("rejects value > 6 when 1d6", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 7 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
    });

    it("rejects value > 12 when 2d6", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn = true;
      const actions = [{ action: "PLAYER_ROLLED", value: 13 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toContain("2-12");
      delete (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn;
    });

    it("rejects value 1 when 2d6 (min is 2)", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn = true;
      const actions = [{ action: "PLAYER_ROLLED", value: 1 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      delete (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn;
    });

    it("accepts value 6 with 1d6", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 6 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("accepts value 12 with 2d6 (bonusDiceNextTurn)", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn = true;
      const actions = [{ action: "PLAYER_ROLLED", value: 12 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
      delete (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn;
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
      expect(result.errorCode).toBe("invalidAnswer");
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

    it("rejects path choice A/B when current player has no pending path choice", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 0;
      ((mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices as Record<
        string,
        number
      >) = { 0: 1 };
      (mockState.players as Record<string, Record<string, unknown>>).p2.position = 0;
      ((mockState.players as Record<string, Record<string, unknown>>).p2.activeChoices as Record<
        string,
        number
      >) = {};
      mockState.decisionPoints = [{ position: 0, prompt: "Choose A or B?" }];
      (mockState.game as Record<string, unknown>).turn = "p1";

      const actions = [{ action: "PLAYER_ANSWERED", answer: "B" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidAnswer");
      expect(result.error).toContain("Path choice");
      expect(result.error).toContain("no pending path choice");
    });

    it("allows path choice when current player has pending path choice at position 0", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 0;
      ((mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices as Record<
        string,
        number
      >) = {};
      mockState.decisionPoints = [{ position: 0, prompt: "Choose A or B?" }];

      const actions = [{ action: "PLAYER_ANSWERED", answer: "A" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("ASK_RIDDLE", () => {
    it("accepts valid ASK_RIDDLE with four options and correctLetter", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pendingAnimalEncounter: {
            position: 5,
            power: 3,
            playerId: "p1",
            phase: "riddle",
          },
        },
      };
      const actions = [
        {
          action: "ASK_RIDDLE",
          text: "Where does the penguin live?",
          options: ["Desert", "Ocean", "Arctic", "Forest"],
          correctLetter: "C",
        },
      ];
      const result = validateActions(
        actions,
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects ASK_RIDDLE with wrong options length", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pendingAnimalEncounter: { position: 5, power: 3, playerId: "p1", phase: "riddle" },
        },
      };
      const actions = [
        {
          action: "ASK_RIDDLE",
          text: "Q?",
          options: ["A", "B", "C"],
          correctLetter: "A",
        },
      ];
      const result = validateActions(
        actions,
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("options");
    });

    it("rejects ASK_RIDDLE with invalid correctLetter", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pendingAnimalEncounter: { position: 5, power: 3, playerId: "p1", phase: "riddle" },
        },
      };
      const actions = [
        {
          action: "ASK_RIDDLE",
          text: "Q?",
          options: ["A", "B", "C", "D"],
          correctLetter: "X",
        },
      ];
      const result = validateActions(
        actions,
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("correctLetter");
    });
  });

  describe("PLAYER_ANSWERED during riddle phase", () => {
    it("allows A/B/C/D when pending riddle has correctLetter (not at position 0)", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pendingAnimalEncounter: {
            position: 5,
            power: 3,
            playerId: "p1",
            phase: "riddle",
            correctLetter: "B",
            riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
          },
        },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;
      for (const letter of ["A", "B", "C", "D"]) {
        const result = validateActions(
          [{ action: "PLAYER_ANSWERED", answer: letter }],
          stateWithRiddle,
          mockStateManager as unknown as StateManager,
        );
        expect(result.valid).toBe(true);
      }
    });

    it("rejects non-A/B/C/D during riddle phase with correctLetter", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pendingAnimalEncounter: {
            position: 5,
            power: 3,
            playerId: "p1",
            phase: "riddle",
            correctLetter: "B",
          },
        },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "E" }],
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidAnswer");
      expect(result.error).toContain("A, B, C, or D");
    });
  });

  describe("Old Primitives Rejection", () => {
    it("rejects ADD_STATE", () => {
      const actions = [{ action: "ADD_STATE", path: "players.p1.position", value: 5 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
      expect(result.error).toContain("invalid action type");
    });

    it("rejects SUBTRACT_STATE", () => {
      const actions = [{ action: "SUBTRACT_STATE", path: "players.p1.hearts", value: 1 }];
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
      const actions = [{ action: "SET_STATE", path: "players.p1.hearts", value: 5 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects wrong player turn", () => {
      const actions = [{ action: "SET_STATE", path: "players.p2.position", value: 1 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("wrongTurn");
      expect(result.error).toContain("Cannot modify players.p2 when it's p1's turn");
    });

    it("validates game-level paths (except phase, winner, turn)", () => {
      const actions = [{ action: "SET_STATE", path: "game.lastRoll", value: 5 }];
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
      const actions = [{ action: "SET_STATE", path: "players.p2.hearts", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot modify players.p2 when it's p1's turn");
    });

    it("allows current player to modify their own data", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.hearts", value: 3 }];
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
      expect(result.errorCode).toBe("setStateForbidden");
      expect(result.error).toContain("Cannot manually change game.turn");
      expect(result.error).toContain("orchestrator automatically advances turns");
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
      const actions = [{ action: "SET_STATE", path: "game.phase", value: "FINISHED" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("setStateForbidden");
      expect(result.error).toContain("Cannot manually change game.phase");
      expect(result.error).toContain("orchestrator manages phase transitions");
    });

    it("blocks game.winner changes", () => {
      const actions = [{ action: "SET_STATE", path: "game.winner", value: "p1" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("setStateForbidden");
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
      expect(result.errorCode).toBe("wrongTurn");
      expect(result.error).toContain("Cannot modify players.p2 when it's p1's turn");
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
          prompt: "Choose your path: A or B?",
        },
      ];
      (mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices = {};
    });

    it("blocks position changes when decision pending", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("chooseForkFirst");
      expect(result.error).toContain("Cannot move from position 5");
      expect(result.error).toContain("direction at fork");
    });

    it("allows position changes after decision is made", () => {
      ((mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices as Record<
        string,
        number
      >) = { 5: 6 };
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("allows sequential decision then move (stateful validation)", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.activeChoices", value: { 5: 6 } },
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
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 3;
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 7 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("allows moves when no decision points exist", () => {
      mockState.decisionPoints = [];
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
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
      const actions = [{ action: "SET_STATE", path: "players.p1.nonExistent", value: 123 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("pathNotAllowed");
      expect(result.error).toContain("non-existent path");
    });

    it("validates deeply nested existing paths", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.inventory = {
        items: { sword: { damage: 10 } },
      };
      const actions = [{ action: "SET_STATE", path: "players.p1.inventory", value: {} }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
      );
      expect(result.valid).toBe(true);
    });

    it("uses StateManager.pathExists correctly", () => {
      mockStateManager.pathExists = () => false;
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
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
      expect(result.errorCode).toBe("resolveSquareEffectFirst");
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

    it("blocks PLAYER_ROLLED when pendingAnimalEncounter powerCheck for current player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pendingAnimalEncounter: {
            position: 21,
            power: 2,
            playerId: "p1",
            phase: "powerCheck",
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("wrongPhaseForRoll");
      expect(result.error).toContain("Awaiting");
      expect(result.error).toContain("PLAYER_ANSWERED");
    });

    it("allows PLAYER_ROLLED when pendingAnimalEncounter is for different player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pendingAnimalEncounter: {
            position: 21,
            power: 2,
            playerId: "p2",
            phase: "powerCheck",
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
      );

      expect(result.valid).toBe(true);
    });

    it("blocks PLAYER_ROLLED when pendingAnimalEncounter phase revenge for current player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pendingAnimalEncounter: {
            position: 21,
            power: 2,
            playerId: "p1",
            phase: "revenge",
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("wrongPhaseForRoll");
      expect(result.error).toContain("revenge");
    });

    it("allows PLAYER_ROLLED when pendingAnimalEncounter is riddle phase (not powerCheck/revenge)", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pendingAnimalEncounter: {
            position: 21,
            power: 2,
            playerId: "p1",
            phase: "riddle",
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
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

    it("allows SET_STATE for activeChoices during square effect processing", () => {
      const mockOrchestrator = {
        isProcessingEffect: () => true,
      } as any;
      (mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices = {};

      const actions = [{ action: "SET_STATE", path: "players.p1.activeChoices", value: { 0: 1 } }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockOrchestrator,
      );

      expect(result.valid).toBe(true);
    });

    it("allows SET_STATE for points during square effect (LLM applies after riddle)", () => {
      const mockOrchestrator = {
        isProcessingEffect: () => true,
      } as any;
      (mockState.players as Record<string, Record<string, unknown>>).p1.points = 0;

      const actions = [{ action: "SET_STATE", path: "players.p1.points", value: 3 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockOrchestrator,
      );

      expect(result.valid).toBe(true);
    });

    it("rejects SET_STATE for skipTurns during square effect processing", () => {
      const mockOrchestrator = {
        isProcessingEffect: () => true,
      } as any;

      const actions = [{ action: "SET_STATE", path: "players.p1.skipTurns", value: 1 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockOrchestrator,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("resolveSquareEffectFirst");
      expect(result.error).toContain("during square effect processing");
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
      expect(result.errorCode).toBe("invalidActionFormat");
      expect(result.error).toContain("must be an array");
    });
  });
});
