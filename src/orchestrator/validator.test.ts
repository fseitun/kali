/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { GamePhase } from "./types";
import type { GameState } from "./types";
import { validateActions, type ValidationResult } from "./validator";
import type { StateManager } from "@/state-manager";

type MockStateManager = Pick<StateManager, "pathExists" | "getByPath">;

describe("Product scenario: Rule validation New Primitives", () => {
  let mockState: GameState;
  let mockStateManager: MockStateManager;
  let mockValidatorContext: {
    allowScenarioOnlyStatePaths?: boolean;
    allowBypassPositionDecisionGate?: boolean;
  };

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
        let current: Record<string, unknown> = state;
        for (const part of parts) {
          if (!(part in current)) {
            return false;
          }
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

    mockValidatorContext = {};
  });

  describe("Product scenario: Player rolls", () => {
    it("Expected outcome: Validates with positive value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 5 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects zero value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 0 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
      expect(result.error).toContain("positive value");
    });

    it("Expected outcome: Rejects negative value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: -3 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("positive value");
    });

    it("Expected outcome: Rejects missing value field", () => {
      const actions = [{ action: "PLAYER_ROLLED" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("missing");
    });

    it("Expected outcome: Rejects non number value", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: "five" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("type");
    });

    it("Expected outcome: Rejects value 77 (impossible roll, 1d6)", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 77 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toContain("1-6");
    });

    it("Expected outcome: Rejects value > 6 when 1d6", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 7 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
    });

    it("Expected outcome: Rejects value > 12 when 2d6", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn = true;
      const actions = [{ action: "PLAYER_ROLLED", value: 13 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toContain("2-12");
      delete (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn;
    });

    it("Expected outcome: Rejects value 1 when 2d6 (min is 2)", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn = true;
      const actions = [{ action: "PLAYER_ROLLED", value: 1 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      delete (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn;
    });

    it("Expected outcome: Accepts value 6 with 1d6", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 6 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Accepts value 12 with 2d6 (bonus Dice Next Turn)", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn = true;
      const actions = [{ action: "PLAYER_ROLLED", value: 12 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
      delete (mockState.players as Record<string, Record<string, unknown>>).p1.bonusDiceNextTurn;
    });

    it("Expected outcome: Magic door opening uses 1d6 limits even when bonus Dice Next Turn is true", () => {
      const stateAtMagicDoor = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 186,
            hearts: 0,
            bonusDiceNextTurn: true,
            magicDoorOpened: false,
          },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
          },
        },
      } as unknown as GameState;
      const actions = [{ action: "PLAYER_ROLLED", value: 11 }];
      const result = validateActions(
        actions,
        stateAtMagicDoor,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toContain("1-6");
    });
  });

  describe("Product scenario: Player answers", () => {
    it("Expected outcome: Validates with non empty answer", () => {
      const actions = [{ action: "PLAYER_ANSWERED", answer: "A" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects empty answer", () => {
      const actions = [{ action: "PLAYER_ANSWERED", answer: "" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidAnswer");
      expect(result.error).toContain("non-empty");
    });

    it("Expected outcome: Rejects missing answer field", () => {
      const actions = [{ action: "PLAYER_ANSWERED" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("missing");
    });

    it("Expected outcome: Rejects path choice A/B when current player has no pending path choice", () => {
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
      (mockState as Record<string, unknown>).board = {
        squares: { "0": { next: [1, 15], prev: [] } },
      };
      (mockState.game as Record<string, unknown>).turn = "p1";

      const actions = [{ action: "PLAYER_ANSWERED", answer: "B" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidAnswer");
      expect(result.error).toContain("Path choice");
      expect(result.error).toContain("no pending path choice");
    });

    it("Expected outcome: Allows path choice when current player has pending path choice at position 0", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 0;
      ((mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices as Record<
        string,
        number
      >) = {};
      (mockState as Record<string, unknown>).board = {
        squares: { "0": { next: [1, 15], prev: [] } },
      };

      const actions = [{ action: "PLAYER_ANSWERED", answer: "A" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: PLAYER ANSWERED during riddle phase", () => {
    it("Expected outcome: Allows any non empty answer when pending riddle has correct Option", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: {
            position: 5,
            power: 3,
            playerId: "p1",
            kind: "riddle",
            correctOption: "Ocean",
            riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
          },
        },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "Ocean" }],
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Allows paraphrase/synonym (orchestrator will validate)", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: {
            position: 5,
            power: 3,
            playerId: "p1",
            kind: "riddle",
            correctOption: "Cangrejo",
            riddleOptions: ["Ballena", "Cangrejo", "Paloma", "Murciélago"],
          },
        },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "crustáceo" }],
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects empty answer during riddle phase", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: {
            position: 5,
            power: 3,
            playerId: "p1",
            kind: "riddle",
            correctOption: "B",
            riddleOptions: ["A", "B", "C", "D"],
          },
        },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "   " }],
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidAnswer");
    });

    it("Expected outcome: Allows option text (e g miércoles) when it matches one of riddle Options", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: {
            position: 5,
            power: 3,
            playerId: "p1",
            kind: "riddle",
            correctOption: "A) Miércoles",
            riddleOptions: ["A) Miércoles", "B) Jueves", "C) Lunes", "D) Sábado"],
          },
        },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "miércoles" }],
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: PLAYER ANSWERED during power Check phase", () => {
    it("Expected outcome: Rejects numeric answer 1 when power Check with 2d6 (riddle Correct true)", () => {
      const stateWithPowerCheck = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 16,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 16,
            activeChoices: { 0: 1 },
          },
        },
        board: {
          squares: { "0": { next: [1, 15], prev: [] } },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "1" }],
        stateWithPowerCheck,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toMatch(/2-12|2d6/);
    });

    it("Expected outcome: Allows numeric answer 1 when power Check with 1d6 (riddle Correct false)", () => {
      const stateWithPowerCheck = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 16,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: false,
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 16,
            activeChoices: { 0: 1 },
          },
        },
        board: {
          squares: { "0": { next: [1, 15], prev: [] } },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "1" }],
        stateWithPowerCheck,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Allows fork destination 105 during 1d6 power Check at Walrus fork (Kalimba 101)", () => {
      const stateWalrusFork = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            kind: "powerCheck",
            position: 101,
            power: 3,
            playerId: "p1",
            riddleCorrect: false,
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 101,
            activeChoices: {},
          },
        },
        board: {
          squares: {
            "101": {
              next: { "102": ["102", "down"], "105": ["105", "polar bear", "up"] },
              prev: { "98": ["98", "down"], "100": ["100", "up"] },
              name: "Walrus",
              power: 3,
            },
            "102": { next: [], prev: [101] },
            "105": { next: [], prev: [101] },
          },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "105" }],
        stateWalrusFork,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects numeric answer 2 when power Check on Águila with 3d6 (riddle Correct true)", () => {
      const stateWithPowerCheck = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 7,
            power: 3,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 7,
          },
        },
        board: {
          squares: {
            "7": {
              name: "Águila",
              power: 3,
              powerCheckDiceIfRiddleCorrect: 3,
              powerCheckDiceIfRiddleWrong: 2,
            },
          },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "2" }],
        stateWithPowerCheck,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toMatch(/3-18|3d6/);
    });

    it("Expected outcome: Allows numeric answer 15 when power Check on Águila with 3d6 (riddle Correct true)", () => {
      const stateWithPowerCheck = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 7,
            power: 3,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 7,
          },
        },
        board: {
          squares: {
            "7": {
              name: "Águila",
              power: 3,
              powerCheckDiceIfRiddleCorrect: 3,
              powerCheckDiceIfRiddleWrong: 2,
            },
          },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "15" }],
        stateWithPowerCheck,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects numeric answer 1 when power Check on Águila with 2d6 after wrong riddle", () => {
      const stateWithPowerCheck = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 7,
            power: 3,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: false,
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 7,
          },
        },
        board: {
          squares: {
            "7": {
              name: "Águila",
              power: 3,
              powerCheckDiceIfRiddleCorrect: 3,
              powerCheckDiceIfRiddleWrong: 2,
            },
          },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "1" }],
        stateWithPowerCheck,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/2-12|2d6/);
    });

    it("Expected outcome: Allows numeric answer 7 when pending is power Check with 2d6 (riddle Correct true)", () => {
      const stateWithPowerCheck = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 16,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 16,
          },
        },
        board: {
          squares: { "0": { next: [1, 15], prev: [] } },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "7" }],
        stateWithPowerCheck,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects numeric answer 7 when revenge (1d6 only)", () => {
      const stateWithRevenge = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 16,
            power: 5,
            playerId: "p1",
            kind: "revenge",
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 16,
          },
        },
        board: {
          squares: { "0": { next: [1, 15], prev: [] } },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "7" }],
        stateWithRevenge,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
      expect(result.error).toMatch(/1-6|1d6/);
    });

    it("Expected outcome: Allows numeric answer during revenge phase for current player", () => {
      const stateWithRevenge = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: {
            position: 16,
            power: 5,
            playerId: "p1",
            kind: "revenge",
          },
        },
        players: {
          ...mockState.players,
          p1: {
            ...(mockState.players as Record<string, Record<string, unknown>>).p1,
            position: 16,
          },
        },
        board: {
          squares: { "0": { next: [1, 15], prev: [] } },
        },
      } as unknown as GameState;
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "3" }],
        stateWithRevenge,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: Old Primitives Rejection", () => {
    it("Expected outcome: Rejects ADD STATE", () => {
      const actions = [{ action: "ADD_STATE", path: "players.p1.position", value: 5 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
      expect(result.error).toContain("invalid action type");
    });

    it("Expected outcome: Rejects SUBTRACT STATE", () => {
      const actions = [{ action: "SUBTRACT_STATE", path: "players.p1.hearts", value: 1 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid action type");
    });

    it("Expected outcome: Rejects READ STATE", () => {
      const actions = [{ action: "READ_STATE", path: "game.turn" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid action type");
    });

    it("Expected outcome: Rejects ROLL DICE", () => {
      const actions = [{ action: "ROLL_DICE", die: "d6" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid action type");
    });
  });

  describe("Product scenario: State update", () => {
    it("Expected outcome: Validates path and value", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.hearts", value: 5 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects wrong player turn", () => {
      const actions = [{ action: "SET_STATE", path: "players.p2.position", value: 1 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("wrongTurn");
      expect(result.error).toContain("Cannot modify players.p2 when it's p1's turn");
    });

    it("Expected outcome: Validates game level paths (except phase, winner, turn)", () => {
      const actions = [{ action: "SET_STATE", path: "game.lastRoll", value: 5 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: Turn Ownership game orchestrator Authority", () => {
    it("Expected outcome: Blocks interpreter from modifying p2 data when p1 turn", () => {
      const actions = [{ action: "SET_STATE", path: "players.p2.hearts", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot modify players.p2 when it's p1's turn");
    });

    it("Expected outcome: Allows current player to modify their own data", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.hearts", value: 3 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Blocks game turn changes outside SETUP phase", () => {
      const actions = [{ action: "SET_STATE", path: "game.turn", value: "p2" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("setStateForbidden");
      expect(result.error).toContain("Cannot manually change game.turn");
      expect(result.error).toContain("orchestrator automatically advances turns");
    });

    it("Expected outcome: Allows game turn changes during SETUP phase", () => {
      (mockState.game as any).phase = "SETUP";
      const actions = [{ action: "SET_STATE", path: "game.turn", value: "p1" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Blocks game phase changes", () => {
      const actions = [{ action: "SET_STATE", path: "game.phase", value: "FINISHED" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("setStateForbidden");
      expect(result.error).toContain("Cannot manually change game.phase");
      expect(result.error).toContain("orchestrator manages phase transitions");
    });

    it("Expected outcome: Blocks game winner changes", () => {
      const actions = [{ action: "SET_STATE", path: "game.winner", value: "p1" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("setStateForbidden");
      expect(result.error).toContain("Cannot manually set game.winner");
      expect(result.error).toContain("orchestrator detects and sets winners");
    });

    it("Expected outcome: Catches turn violations in multi action sequences", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.hearts", value: 1 },
        { action: "SET_STATE", path: "players.p2.hearts", value: 2 },
        { action: "NARRATE", text: "Done" },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("wrongTurn");
      expect(result.error).toContain("Cannot modify players.p2 when it's p1's turn");
    });

    it("Expected outcome: Validates nested player paths for turn ownership", () => {
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
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: Decision Points game orchestrator Enforcement", () => {
    beforeEach(() => {
      (mockState as Record<string, unknown>).board = {
        squares: { "5": { next: [6, 7], prev: [4] } },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;
      (mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices = {};
    });

    it("Expected outcome: Blocks position changes when decision pending", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("chooseForkFirst");
      expect(result.error).toContain("Cannot move from position 5");
      expect(result.error).toContain("direction at fork");
    });

    it("Expected outcome: Allows position SET STATE at fork when allow Bypass Position Decision Gate", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        { ...mockValidatorContext, allowBypassPositionDecisionGate: true },
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Allows position changes after decision is made", () => {
      ((mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices as Record<
        string,
        number
      >) = { 5: 6 };
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Allows sequential decision then move (stateful validation)", () => {
      const actions = [
        { action: "SET_STATE", path: "players.p1.activeChoices", value: { 5: 6 } },
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Allows moves when no decision point at position", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 3;
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 7 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Allows moves when no decision points exist", () => {
      (mockState as Record<string, unknown>).board = { squares: {} };
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: Path Validation", () => {
    it("Expected outcome: Rejects non existent paths", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.nonExistent", value: 123 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("pathNotAllowed");
      expect(result.error).toContain("non-existent path");
    });

    it("Expected outcome: Validates deeply nested existing paths", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.inventory = {
        items: { sword: { damage: 10 } },
      };
      const actions = [{ action: "SET_STATE", path: "players.p1.inventory", value: {} }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Uses State Manager path Exists correctly", () => {
      mockStateManager.pathExists = () => false;
      const actions = [{ action: "SET_STATE", path: "players.p1.position", value: 10 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("Product scenario: Context Aware Validation Pending Encounters", () => {
    it("Expected outcome: Allows PLAYER ROLLED when nothing is pending", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Blocks PLAYER ROLLED when pending power Check for current player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 21,
            power: 2,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("sayRollAsAnswer");
      expect(result.error).toContain("powerCheck");
    });

    it("Expected outcome: Blocks PLAYER ROLLED when pending complete Roll Movement for current player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            kind: "completeRollMovement",
            playerId: "p1",
            remainingSteps: 1,
            direction: "forward" as const,
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 3 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("finishForkMoveFirst");
      expect(result.error).toContain("fork branch");
    });

    it("Expected outcome: Allows PLAYER ROLLED when pending is for different player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 21,
            power: 2,
            playerId: "p2",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Blocks PLAYER ROLLED when pending phase revenge for current player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 21,
            power: 2,
            playerId: "p1",
            kind: "revenge",
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("sayRollAsAnswer");
      expect(result.error).toContain("revenge");
    });

    it("Expected outcome: Blocks PLAYER ROLLED when pending directional roll for current player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 55,
            playerId: "p1",
            kind: "directional",
            dice: 2,
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("sayRollAsAnswer");
      expect(result.error).toContain("directional");
    });

    it("Expected outcome: Blocks PLAYER ROLLED when pending is riddle phase for current player", () => {
      const stateWithPending = {
        ...mockState,
        game: {
          ...mockState.game,
          turn: "p1",
          pending: {
            position: 21,
            power: 2,
            playerId: "p1",
            kind: "riddle",
          },
        },
      };

      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        stateWithPending,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("answerRiddleFirst");
    });

    it("Expected outcome: Allows SET STATE for active Choices", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices = {};

      const actions = [{ action: "SET_STATE", path: "players.p1.activeChoices", value: { 0: 1 } }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: Edge Cases", () => {
    it("Expected outcome: Accepts empty action array", () => {
      const actions: unknown[] = [];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects null action in array", () => {
      const actions = [null];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not an object");
    });

    it("Expected outcome: Rejects undefined action in array", () => {
      const actions = [undefined];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not an object");
    });

    it("Expected outcome: Accepts actions with extra unknown fields (extensibility)", () => {
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
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Fails on first invalid action in mixed sequence", () => {
      const actions = [
        { action: "NARRATE", text: "First" },
        { action: "INVALID_ACTION" },
        { action: "NARRATE", text: "Third" },
      ];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("index 1");
      expect(result.error).toContain("INVALID_ACTION");
    });

    it("Expected outcome: Rejects a batch that would say nothing at all", () => {
      const run = (actions: unknown[]): ValidationResult =>
        validateActions(
          actions,
          mockState,
          mockStateManager as unknown as StateManager,
          mockValidatorContext,
        );

      // Voice-only: a lone empty NARRATE reports success and leaves the table in silence.
      expect(run([{ action: "NARRATE", text: "" }]).valid).toBe(false);
      expect(run([{ action: "NARRATE", text: "   \n" }]).valid).toBe(false);
      expect(run([{ action: "NARRATE", text: "" }]).errorCode).toBe("invalidActionFormat");

      // A blank NARRATE riding along with real work is not silence: the orchestrator speaks the
      // deterministic movement line, so the roll must still be applied.
      expect(
        run([
          { action: "PLAYER_ROLLED", value: 3 },
          { action: "NARRATE", text: "" },
        ]).valid,
      ).toBe(true);
    });

    it("Expected outcome: Rejects non array input", () => {
      const actions = { action: "NARRATE", text: "Not an array" };
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
      expect(result.error).toContain("must be an array");
    });
  });

  describe("Product scenario: SET STATE authority (whole object and nested paths)", () => {
    const run = (actions: unknown[], context = mockValidatorContext): ValidationResult =>
      validateActions(actions, mockState, mockStateManager as unknown as StateManager, context);

    it("Expected outcome: Rejects writing the whole game object", () => {
      const actions = [
        {
          action: "SET_STATE",
          path: "game",
          value: { phase: "FINISHED", winner: "p1", turn: "p1", playerOrder: ["p1"] },
        },
      ];
      const result = run(actions);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("pathNotAllowed");
    });

    it("Expected outcome: Rejects nested paths under game.pending", () => {
      const correct = run([
        { action: "SET_STATE", path: "game.pending.riddleCorrect", value: true },
      ]);
      expect(correct.valid).toBe(false);
      expect(correct.errorCode).toBe("setStateForbidden");

      const option = run([
        { action: "SET_STATE", path: "game.pending.correctOption", value: "Cobra" },
      ]);
      expect(option.valid).toBe(false);
      expect(option.errorCode).toBe("setStateForbidden");
    });

    it("Expected outcome: Scenario null escape hatch covers only game.pending itself", () => {
      const scenarioContext = { ...mockValidatorContext, allowScenarioOnlyStatePaths: true };

      const nested = run(
        [{ action: "SET_STATE", path: "game.pending.riddleCorrect", value: null }],
        scenarioContext,
      );
      expect(nested.valid).toBe(false);
      expect(nested.errorCode).toBe("setStateForbidden");

      const exact = run(
        [{ action: "SET_STATE", path: "game.pending", value: null }],
        scenarioContext,
      );
      expect(exact.valid).toBe(true);
    });

    it("Expected outcome: Rejects writing a whole player object", () => {
      const actions = [
        {
          action: "SET_STATE",
          path: "players.p1",
          value: { id: "p1", name: "Player 1", position: 180 },
        },
      ];
      const result = run(actions);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("pathNotAllowed");
    });

    it("Expected outcome: Rejects game.playerOrder and board topology", () => {
      const order = run([{ action: "SET_STATE", path: "game.playerOrder", value: ["p1"] }]);
      expect(order.valid).toBe(false);
      expect(order.errorCode).toBe("setStateForbidden");

      (mockState as Record<string, unknown>).board = { squares: { "5": { next: [6] } } };
      const board = run([{ action: "SET_STATE", path: "board.squares.5.next", value: [99] }]);
      expect(board.valid).toBe(false);
      expect(board.errorCode).toBe("pathNotAllowed");
    });

    it("Expected outcome: Rejects reserved prototype segments", () => {
      const proto = run([{ action: "SET_STATE", path: "players.p1.__proto__", value: {} }]);
      expect(proto.valid).toBe(false);
      expect(proto.errorCode).toBe("pathNotAllowed");

      const ctor = run([{ action: "SET_STATE", path: "game.constructor", value: {} }]);
      expect(ctor.valid).toBe(false);
      expect(ctor.errorCode).toBe("pathNotAllowed");
    });

    it("Expected outcome: Still allows player field corrections and game.lastRoll", () => {
      expect(run([{ action: "SET_STATE", path: "players.p1.position", value: 10 }]).valid).toBe(
        true,
      );
      expect(run([{ action: "SET_STATE", path: "players.p1.hearts", value: 3 }]).valid).toBe(true);
      expect(run([{ action: "SET_STATE", path: "game.lastRoll", value: 5 }]).valid).toBe(true);
    });
  });

  describe("Product scenario: SET STATE value shape", () => {
    const run = (actions: unknown[]): ValidationResult =>
      validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

    it("Expected outcome: Rejects a spoken number sent as a string position", () => {
      const result = run([{ action: "SET_STATE", path: "players.p1.position", value: "50" }]);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
    });

    it("Expected outcome: Rejects negative, fractional and off board positions", () => {
      expect(run([{ action: "SET_STATE", path: "players.p1.position", value: -5 }]).valid).toBe(
        false,
      );
      expect(run([{ action: "SET_STATE", path: "players.p1.position", value: 3.7 }]).valid).toBe(
        false,
      );
      expect(run([{ action: "SET_STATE", path: "players.p1.position", value: 9999 }]).valid).toBe(
        false,
      );
    });

    it("Expected outcome: Rejects a value whose type differs from the stored one", () => {
      const result = run([{ action: "SET_STATE", path: "players.p1.hearts", value: "3" }]);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
    });
  });

  describe("Product scenario: Phase gate", () => {
    const runWithPhase = (actions: unknown[], phase: GamePhase): ValidationResult => {
      (mockState.game as Record<string, unknown>).phase = phase;
      return validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
    };

    it("Expected outcome: Rejects rolls after the game is finished", () => {
      const result = runWithPhase([{ action: "PLAYER_ROLLED", value: 4 }], GamePhase.FINISHED);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("wrongPhaseForRoll");
    });

    it("Expected outcome: Rejects rolls and answers during setup", () => {
      expect(runWithPhase([{ action: "PLAYER_ROLLED", value: 4 }], GamePhase.SETUP).valid).toBe(
        false,
      );
      expect(
        runWithPhase([{ action: "PLAYER_ANSWERED", answer: "4" }], GamePhase.SETUP).valid,
      ).toBe(false);
    });

    it("Expected outcome: Rejects answers after the game is finished", () => {
      const result = runWithPhase([{ action: "PLAYER_ANSWERED", answer: "4" }], GamePhase.FINISHED);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("wrongPhaseForRoll");
    });

    it("Expected outcome: Keeps SET STATE available in setup but not after the win", () => {
      const setup = runWithPhase(
        [{ action: "SET_STATE", path: "players.p1.name", value: "Sofía" }],
        GamePhase.SETUP,
      );
      expect(setup.valid).toBe(true);

      const finished = runWithPhase(
        [{ action: "SET_STATE", path: "players.p1.name", value: "Sofía" }],
        GamePhase.FINISHED,
      );
      expect(finished.valid).toBe(false);
      expect(finished.errorCode).toBe("setStateForbidden");
    });

    it("Expected outcome: Still narrates after the game is finished", () => {
      expect(
        runWithPhase([{ action: "NARRATE", text: "¡Ganaste!" }], GamePhase.FINISHED).valid,
      ).toBe(true);
    });
  });

  describe("Product scenario: Roll and answer shape", () => {
    it("Expected outcome: Rejects fractional dice rolls", () => {
      const result = validateActions(
        [{ action: "PLAYER_ROLLED", value: 3.5 }],
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
    });

    it("Expected outcome: Accepts a word answer that merely starts with A or B at a fork game", () => {
      (mockState as Record<string, unknown>).board = {
        squares: { "0": { next: [1, 15], prev: [] } },
      };
      (mockState.players as Record<string, Record<string, unknown>>).p1.position = 5;

      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "Bosque" }],
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: Pending roll answers", () => {
    const stateWithPowerCheck = (mock: GameState): GameState => ({
      ...mock,
      game: {
        ...mock.game,
        turn: "p1",
        pending: {
          position: 16,
          power: 4,
          playerId: "p1",
          kind: "powerCheck",
          riddleCorrect: true,
        },
      },
    });

    it("Expected outcome: Rejects an answer with two numbers instead of scoring a false win", () => {
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "1 y 6" }],
        stateWithPowerCheck(mockState),
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidDiceRoll");
    });

    it("Expected outcome: Asks again for the number when the answer is a word no path can read", () => {
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "por el bosque" }],
        stateWithPowerCheck(mockState),
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("sayRollNumber");
    });

    it("Expected outcome: Still accepts a single number in range", () => {
      const result = validateActions(
        [{ action: "PLAYER_ANSWERED", answer: "tiré un 7" }],
        stateWithPowerCheck(mockState),
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Product scenario: Interpreter tries to ask its own riddle", () => {
    const askRiddle = {
      action: "ASK_RIDDLE",
      text: "¿Quién soy?",
      options: ["Cobra", "Jirafa", "Morsa", "Águila"],
      correctOption: "Cobra",
    };
    const run = (actions: unknown[]): ValidationResult =>
      validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );

    it("Expected outcome: Rejects ASK RIDDLE outright, riddles come from the deterministic bank", () => {
      const result = run([askRiddle]);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
    });

    it("Expected outcome: Cannot overwrite the riddle already stored in pending", () => {
      (mockState.game as Record<string, unknown>).pending = {
        kind: "riddle",
        playerId: "p1",
        riddleOptions: ["Cobra", "Jirafa", "Morsa", "Águila"],
        correctOption: "Morsa",
      };
      const result = run([askRiddle]);
      expect(result.valid).toBe(false);
      expect(mockState.game.pending).toMatchObject({ correctOption: "Morsa" });
    });
  });
});
