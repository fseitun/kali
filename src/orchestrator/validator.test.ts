/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { GamePhase } from "./types";
import type { GameState } from "./types";
import { validateActions } from "./validator";
import type { StateManager } from "@/state-manager";

type MockStateManager = Pick<StateManager, "pathExists" | "getByPath">;

describe("Product scenario: Rule validation New Primitives", () => {
  let mockState: GameState;
  let mockStateManager: MockStateManager;
  let mockValidatorContext: {
    isProcessingEffect: boolean;
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
        let current: Record<string, unknown> = state as Record<string, unknown>;
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

    mockValidatorContext = { isProcessingEffect: false };
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

  describe("Product scenario: Game asks a riddle", () => {
    it("Expected outcome: Accepts valid ASK RIDDLE with four options and correct Option", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: {
            position: 5,
            power: 3,
            playerId: "p1",
            kind: "riddle",
          },
        },
      };
      const actions = [
        {
          action: "ASK_RIDDLE",
          text: "Where does the penguin live?",
          options: ["Desert", "Ocean", "Arctic", "Forest"],
          correctOption: "Arctic",
        },
      ];
      const result = validateActions(
        actions,
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Accepts ASK RIDDLE with optional correct Option Synonyms", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: { position: 5, power: 3, playerId: "p1", kind: "riddle" },
        },
      };
      const actions = [
        {
          action: "ASK_RIDDLE",
          text: "Q?",
          options: ["Ballena", "Cangrejo", "Paloma", "Murciélago"],
          correctOption: "Cangrejo",
          correctOptionSynonyms: ["crustáceo", "cangrejos"],
        },
      ];
      const result = validateActions(
        actions,
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects ASK RIDDLE with wrong options length", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: { position: 5, power: 3, playerId: "p1", kind: "riddle" },
        },
      };
      const actions = [
        {
          action: "ASK_RIDDLE",
          text: "Q?",
          options: ["A", "B", "C"],
          correctOption: "A",
        },
      ];
      const result = validateActions(
        actions,
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("options");
    });

    it("Expected outcome: Rejects ASK RIDDLE with missing or empty correct Option", () => {
      const stateWithRiddle = {
        ...mockState,
        game: {
          ...mockState.game,
          pending: { position: 5, power: 3, playerId: "p1", kind: "riddle" },
        },
      };
      const actions = [
        {
          action: "ASK_RIDDLE",
          text: "Q?",
          options: ["A", "B", "C", "D"],
          correctOption: "",
        },
      ];
      const result = validateActions(
        actions,
        stateWithRiddle,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("correctOption");
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
            phase: "powerCheck",
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

  describe("Product scenario: Context Aware Validation Square Effect Processing", () => {
    it("Expected outcome: Blocks PLAYER ROLLED when orchestrator is processing square effect", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        { isProcessingEffect: true },
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("resolveSquareEffectFirst");
      expect(result.error).toContain("during square effect processing");
      expect(result.error).toContain("must be resolved first");
    });

    it("Expected outcome: Allows PLAYER ROLLED when orchestrator is not processing square effect", () => {
      const actions = [{ action: "PLAYER_ROLLED", value: 4 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        { isProcessingEffect: false },
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

    it("Expected outcome: Allows NARRATE during square effect processing", () => {
      const actions = [{ action: "NARRATE", text: "You encounter an animal!" }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        { isProcessingEffect: true },
      );

      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Allows SET STATE for active Choices during square effect processing", () => {
      (mockState.players as Record<string, Record<string, unknown>>).p1.activeChoices = {};

      const actions = [{ action: "SET_STATE", path: "players.p1.activeChoices", value: { 0: 1 } }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        { isProcessingEffect: true },
      );

      expect(result.valid).toBe(true);
    });

    it("Expected outcome: Rejects SET STATE for points during square effect (points removed from game)", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.points", value: 3 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        { isProcessingEffect: true },
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("resolveSquareEffectFirst");
    });

    it("Expected outcome: Rejects SET STATE for skip Turns during square effect processing", () => {
      const actions = [{ action: "SET_STATE", path: "players.p1.skipTurns", value: 1 }];
      const result = validateActions(
        actions,
        mockState,
        mockStateManager as unknown as StateManager,
        { isProcessingEffect: true },
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("resolveSquareEffectFirst");
      expect(result.error).toContain("during square effect processing");
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

    it("Expected outcome: Rejects non array input", () => {
      const actions = { action: "NARRATE", text: "Not an array" };
      const result = validateActions(
        actions as unknown as unknown[],
        mockState,
        mockStateManager as unknown as StateManager,
        mockValidatorContext,
      );
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("invalidActionFormat");
      expect(result.error).toContain("must be an array");
    });
  });
});
