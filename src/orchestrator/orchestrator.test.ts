/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Adversarial tests intentionally use malformed data
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StatusIndicator } from "../components/status-indicator";
import type { LLMClient } from "../llm/LLMClient";
import type { SpeechService } from "../services/speech-service";
import type { StateManager } from "../state-manager";
import { Orchestrator } from "./orchestrator";
import type { GameState, PrimitiveAction } from "./types";

describe("Orchestrator - New Action Handlers", () => {
  let orchestrator: Orchestrator;
  let mockLLM: LLMClient;
  let mockStateManager: StateManager;
  let mockSpeech: SpeechService;
  let mockIndicator: StatusIndicator;
  let testState: GameState;

  beforeEach(() => {
    testState = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        lastRoll: 0,
      },
      players: {
        p1: {
          id: "p1",
          name: "Player 1",
          position: 5,
          hearts: 0,
        },
      },
      board: {
        winPosition: 100,
        moves: {},
        squares: {},
      },
    };

    mockStateManager = {
      getState: vi.fn(() => testState),
      get: vi.fn((path: string) => {
        if (path === "players.p1.position") return 5;
        if (path === "game.lastRoll") return 0;
        return undefined;
      }),
      set: vi.fn((_path: string, _value: unknown) => {
        // Mock implementation
      }),
    } as unknown as StateManager;

    mockSpeech = {
      speak: vi.fn(async () => {}),
      playSound: vi.fn(),
    } as unknown as SpeechService;

    mockIndicator = {
      setState: vi.fn(),
    } as unknown as StatusIndicator;

    mockLLM = {
      getActions: vi.fn(async () => []),
      setGameRules: vi.fn(),
      validateRiddleAnswer: vi.fn(async () => ({ correct: false })),
    } as unknown as LLMClient;

    orchestrator = new Orchestrator(
      mockLLM,
      mockStateManager,
      mockSpeech,
      mockIndicator,
      testState,
    );
  });

  describe("PLAYER_ROLLED", () => {
    it("infers playerId from game.turn", async () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 3 }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.position", 8);
      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastRoll", 3);
    });

    it("calculates new position correctly", async () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 5 }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.position", 10);
    });
  });

  describe("PLAYER_ANSWERED", () => {
    it("stores answer in game.lastAnswer", async () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "A" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "A");
    });

    it("handles multi-word answers", async () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ANSWERED", answer: "fight the dragon" },
      ];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "fight the dragon");
    });

    it("auto-applies answer to pending fork decision point", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      testState.decisionPoints = [{ position: 0, prompt: "Choose A or B?" }];
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return 0;
        if (path === "players.p1.activeChoices.0") return undefined;
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "a" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "a");
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.activeChoices.0", 1);
    });

    it("PLAYER_ANSWERED path choice at position 0 does not set shouldAdvanceTurn", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      testState.decisionPoints = [{ position: 0, prompt: "Choose A or B?" }];
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return 0;
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "A" }];

      const result = await orchestrator.testExecuteActions(actions);

      expect(result.success).toBe(true);
      expect(result.shouldAdvanceTurn).toBe(false);
    });

    it("PLAYER_ANSWERED + SET_STATE activeChoices at position 0 does not advance turn", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      testState.decisionPoints = [{ position: 0, prompt: "Choose A or B?" }];
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return 0;
        return undefined;
      });
      (mockStateManager as any).pathExists = vi.fn(() => true);

      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ANSWERED", answer: "B" },
        { action: "SET_STATE", path: "players.p1.activeChoices.0", value: 15 },
        { action: "NARRATE", text: "Elegiste el Camino B. Tirá el dado." },
      ];

      const result = await orchestrator.testExecuteActions(actions);

      expect(result.success).toBe(true);
      expect(result.shouldAdvanceTurn).toBe(false);
    });
  });

  describe("ASK_RIDDLE", () => {
    it("stores riddle text, options, correctOption and optional synonyms in pendingAnimalEncounter", async () => {
      (testState.game as any).pendingAnimalEncounter = {
        position: 5,
        power: 3,
        playerId: "p1",
        phase: "riddle",
      };
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pendingAnimalEncounter")
          return (testState.game as any).pendingAnimalEncounter;
        if (path === "game.turn") return "p1";
        if (path === "players.p1.position") return 5;
        return undefined;
      });

      const actions: PrimitiveAction[] = [
        {
          action: "ASK_RIDDLE",
          text: "Where does the penguin live?",
          options: ["Desert", "Ocean", "Arctic", "Forest"],
          correctOption: "Arctic",
          correctOptionSynonyms: ["polo", "frío"],
        },
      ];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pendingAnimalEncounter",
        expect.objectContaining({
          phase: "riddle",
          riddlePrompt: "Where does the penguin live?",
          riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
          correctOption: "Arctic",
          correctOptionSynonyms: ["polo", "frío"],
        }),
      );
    });
  });

  describe("PLAYER_ANSWERED riddle phase", () => {
    it("resolves correct riddle choice (strict match) and transitions to powerCheck", async () => {
      (testState.game as any).pendingAnimalEncounter = {
        position: 5,
        power: 3,
        playerId: "p1",
        phase: "riddle",
        correctOption: "Ocean",
        riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pendingAnimalEncounter")
          return (testState.game as any).pendingAnimalEncounter;
        if (path === "game.turn") return "p1";
        if (path === "players.p1.position") return 5;
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "Ocean" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pendingAnimalEncounter",
        expect.objectContaining({
          phase: "powerCheck",
          riddleCorrect: true,
        }),
      );
    });

    it("resolves wrong riddle choice: strict false then LLM says false", async () => {
      (testState.game as any).pendingAnimalEncounter = {
        position: 5,
        power: 3,
        playerId: "p1",
        phase: "riddle",
        correctOption: "Arctic",
        riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pendingAnimalEncounter")
          return (testState.game as any).pendingAnimalEncounter;
        if (path === "game.turn") return "p1";
        if (path === "players.p1.position") return 5;
        return undefined;
      });
      (mockLLM as any).validateRiddleAnswer = vi.fn(async () => ({ correct: false }));

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "Desert" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pendingAnimalEncounter",
        expect.objectContaining({
          phase: "powerCheck",
          riddleCorrect: false,
        }),
      );
    });

    it("resolves option text (miércoles) and marks riddleCorrect true via strict match", async () => {
      (testState.game as any).pendingAnimalEncounter = {
        position: 5,
        power: 3,
        playerId: "p1",
        phase: "riddle",
        correctOption: "A) Miércoles",
        riddleOptions: ["A) Miércoles", "B) Jueves", "C) Lunes", "D) Sábado"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pendingAnimalEncounter")
          return (testState.game as any).pendingAnimalEncounter;
        if (path === "game.turn") return "p1";
        if (path === "players.p1.position") return 5;
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "miércoles" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pendingAnimalEncounter",
        expect.objectContaining({
          phase: "powerCheck",
          riddleCorrect: true,
        }),
      );
    });

    it("prefers transcript over LLM answer: user said 'la hormiga', LLM returned wrong option → riddleCorrect true", async () => {
      (testState.game as any).pendingAnimalEncounter = {
        position: 5,
        power: 3,
        playerId: "p1",
        phase: "riddle",
        correctOption: "A) Hormiga",
        riddleOptions: ["A) Hormiga", "B) Elefante", "C) Puma", "D) Delfín"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pendingAnimalEncounter")
          return (testState.game as any).pendingAnimalEncounter;
        if (path === "game.turn") return "p1";
        if (path === "players.p1.position") return 5;
        return undefined;
      });
      mockLLM.getActions = vi.fn(async () => [
        { action: "PLAYER_ANSWERED", answer: "D) Delfín" },
      ]) as any;

      const result = await orchestrator.handleTranscript("la hormiga");

      expect(result.success).toBe(true);
      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pendingAnimalEncounter",
        expect.objectContaining({
          phase: "powerCheck",
          riddleCorrect: true,
        }),
      );
    });
  });

  describe("Board Mechanics - Orchestrator Control", () => {
    it("auto-applies ladder after position change", async () => {
      testState.board = {
        winPosition: 100,
        moves: { "10": 25 },
        squares: {},
      };
      testState.players.p1.position = 5;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return testState.players.p1.position;
        return undefined;
      });
      mockStateManager.set = vi.fn((path: string, value: unknown) => {
        if (path === "players.p1.position") {
          testState.players.p1.position = value as number;
        }
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 5 }];

      await orchestrator.testExecuteActions(actions);

      expect(testState.players.p1.position).toBe(25);
    });

    it("auto-applies snake after position change", async () => {
      testState.board = {
        winPosition: 100,
        moves: { "15": 5 },
        squares: {},
      };
      testState.players.p1.position = 10;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return testState.players.p1.position;
        return undefined;
      });
      mockStateManager.set = vi.fn((path: string, value: unknown) => {
        if (path === "players.p1.position") {
          testState.players.p1.position = value as number;
        }
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 5 }];

      await orchestrator.testExecuteActions(actions);

      expect(testState.players.p1.position).toBe(5);
    });

    it("applies board moves after PLAYER_ROLLED", async () => {
      testState.board = {
        winPosition: 100,
        moves: { "10": 25 },
        squares: {},
      };
      (testState.players as any).p1.position = 8;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return testState.players.p1.position;
        return undefined;
      });
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === "players.p1.position") {
          (testState.players as any).p1.position = value as number;
        }
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 2 }];

      await orchestrator.testExecuteActions(actions);

      expect((testState.players as any).p1.position).toBe(25);
    });

    it("LLM cannot bypass board moves (orchestrator always applies)", async () => {
      testState.board = {
        winPosition: 100,
        moves: { "10": 25 },
        squares: {},
      };
      testState.players.p1.position = 5;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return testState.players.p1.position;
        return undefined;
      });
      mockStateManager.set = vi.fn((path: string, value: unknown) => {
        if (path === "players.p1.position") {
          testState.players.p1.position = value as number;
        }
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 5 }];

      await orchestrator.testExecuteActions(actions);

      expect(testState.players.p1.position).toBe(25);
    });
  });

  describe("Square Effects - Orchestrator Triggers", () => {
    it("triggers LLM call when landing on special square", async () => {
      testState.board = {
        winPosition: 100,
        moves: {},
        squares: {
          "20": {
            type: "challenge",
            name: "Dragon Square",
            description: "Fight or flee",
          },
        },
      };
      testState.players.p1.position = 15;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return testState.players.p1.position;
        return undefined;
      });
      mockStateManager.set = vi.fn((path: string, value: unknown) => {
        if (path === "players.p1.position") {
          testState.players.p1.position = value as number;
        }
      });

      let llmCallCount = 0;
      mockLLM.getActions = vi.fn(async () => {
        llmCallCount++;
        return [{ action: "NARRATE", text: "Square effect!" }];
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 5 }];

      await orchestrator.testExecuteActions(actions);

      expect(llmCallCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("handleTranscript - Return Value and Separation of Concerns", () => {
    it("returns success true when transcript processed successfully", async () => {
      mockLLM.getActions = vi.fn(async () => [{ action: "NARRATE", text: "Hello" }]);

      const { success } = await orchestrator.handleTranscript("test command");

      expect(success).toBe(true);
    });

    it("returns success false when transcript processing fails", async () => {
      mockLLM.getActions = vi.fn(async () => {
        throw new Error("LLM error");
      });

      const { success } = await orchestrator.handleTranscript("test command");

      expect(success).toBe(false);
    });

    it("returns success false when validation fails", async () => {
      mockLLM.getActions = vi.fn(async () => [
        { action: "SET_STATE", path: "players.p2.position", value: 99 },
      ]);

      const { success } = await orchestrator.handleTranscript("cheat command");

      expect(success).toBe(false);
    });

    it("does not advance turn (no longer its responsibility)", async () => {
      (testState.game as any).turn = "p1";
      (testState.game as any).playerOrder = ["p1", "p2"];

      mockLLM.getActions = vi.fn(async () => [{ action: "PLAYER_ROLLED", value: 5 }]) as any;

      await orchestrator.handleTranscript("I rolled 5");

      expect(mockStateManager.set).not.toHaveBeenCalledWith("game.turn", "p2");
    });

    it("testExecuteActions does not advance turn", async () => {
      (testState.game as any).turn = "p1";
      (testState.game as any).playerOrder = ["p1", "p2"];

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 3 }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).not.toHaveBeenCalledWith("game.turn", "p2");
    });

    it("NARRATE-only returns shouldAdvanceTurn false (State Query fix)", async () => {
      mockLLM.getActions = vi.fn(async () => [
        { action: "NARRATE", text: "Fico is ahead at position 45" },
      ]);

      const result = await orchestrator.handleTranscript("Who is winning?");

      expect(result.success).toBe(true);
      expect(result.shouldAdvanceTurn).toBe(false);
    });

    it("PLAYER_ROLLED plus NARRATE returns shouldAdvanceTurn true", async () => {
      mockLLM.getActions = vi.fn(async () => [
        { action: "PLAYER_ROLLED", value: 4 },
        { action: "NARRATE", text: "Moving 4 spaces!" },
      ]);

      const result = await orchestrator.handleTranscript("I rolled a 4");

      expect(result.success).toBe(true);
      expect(result.shouldAdvanceTurn).toBe(true);
    });

    it("passes last NARRATE as lastBotUtterance when user confirms (roll clarification)", async () => {
      const confirmationQuestion = "¿Tiraste un 3, Federico?";
      mockLLM.getActions = vi.fn(
        async (transcript: string, _state: GameState, lastBot?: string) => {
          if (transcript === "tiene un tres") {
            return [{ action: "NARRATE", text: confirmationQuestion }];
          }
          if (transcript === "sí" && lastBot === confirmationQuestion) {
            return [{ action: "PLAYER_ROLLED", value: 3 }];
          }
          return [];
        },
      ) as any;

      await orchestrator.handleTranscript("tiene un tres");
      expect(mockLLM.getActions).toHaveBeenCalledTimes(1);
      expect(mockLLM.getActions).toHaveBeenLastCalledWith(
        "tiene un tres",
        expect.any(Object),
        undefined,
      );

      await orchestrator.handleTranscript("sí");
      expect(mockLLM.getActions).toHaveBeenCalledTimes(2);
      expect(mockLLM.getActions).toHaveBeenLastCalledWith(
        "sí",
        expect.any(Object),
        confirmationQuestion,
      );
    });
  });

  describe("Processing Lock - Concurrency Protection", () => {
    it("isLocked returns false when idle", () => {
      expect(orchestrator.isLocked()).toBe(false);
    });

    it("isLocked returns true while processing", async () => {
      mockLLM.getActions = vi.fn(async () => {
        expect(orchestrator.isLocked()).toBe(true);
        return [];
      });

      await orchestrator.handleTranscript("test");
    });

    it("rejects concurrent handleTranscript calls", async () => {
      let firstCallResolved = false;
      mockLLM.getActions = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        firstCallResolved = true;
        return [];
      });

      const promise1 = orchestrator.handleTranscript("first");
      const promise2 = orchestrator.handleTranscript("second");

      await Promise.all([promise1, promise2]);

      expect(firstCallResolved).toBe(true);
      expect(mockLLM.getActions).toHaveBeenCalledTimes(1);
    });

    it("rejects concurrent testExecuteActions calls", async () => {
      let callCount = 0;

      mockSpeech.speak = vi.fn(async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const actions: PrimitiveAction[] = [{ action: "NARRATE", text: "test" }];

      const promise1 = orchestrator.testExecuteActions(actions);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const promise2 = orchestrator.testExecuteActions(actions);

      const results = await Promise.all([promise1, promise2]);

      expect(callCount).toBe(1);
      expect(results[0]).toEqual({ success: true, shouldAdvanceTurn: false });
      expect(results[1]).toEqual({ success: false, shouldAdvanceTurn: false });
    });

    it("releases lock after successful execution", async () => {
      mockLLM.getActions = vi.fn(async () => []);

      await orchestrator.handleTranscript("test");

      expect(orchestrator.isLocked()).toBe(false);
    });

    it("releases lock after failed execution", async () => {
      mockLLM.getActions = vi.fn(async () => {
        throw new Error("LLM error");
      });

      await orchestrator.handleTranscript("test");

      expect(orchestrator.isLocked()).toBe(false);
    });

    it("releases lock after exception", async () => {
      mockStateManager.set = vi.fn(async () => {
        throw new Error("State error");
      });

      const actions: PrimitiveAction[] = [
        { action: "SET_STATE", path: "players.p1.position", value: 10 },
      ];

      await orchestrator.testExecuteActions(actions);

      expect(orchestrator.isLocked()).toBe(false);
    });
  });

  describe("Decision-point ask undupe", () => {
    const decisionPrompt = "¿Querés ir por el A o por el B?";
    const longNarrate =
      "Federico, estás en el inicio. ¿Querés ir por el camino A, que es más corto, o por el B, que es más largo?";

    beforeEach(() => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      testState.decisionPoints = [{ position: 0, prompt: decisionPrompt }];
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") return 0;
        return undefined;
      });
    });

    it("does not call enforceDecisionPoints after NARRATE that covers decision (only one LLM call)", async () => {
      mockLLM.getActions = vi.fn().mockResolvedValue([{ action: "NARRATE", text: longNarrate }]);

      await orchestrator.handleTranscript("que tengo que hacer");

      expect(mockLLM.getActions).toHaveBeenCalledTimes(1);
      expect(mockSpeech.speak).toHaveBeenCalledTimes(1);
      expect(mockSpeech.speak).toHaveBeenCalledWith(longNarrate);
    });

    it("speaks only once when batch has covering NARRATE then exact prompt NARRATE", async () => {
      const actions: PrimitiveAction[] = [
        { action: "NARRATE", text: longNarrate },
        { action: "NARRATE", text: decisionPrompt },
      ];

      await orchestrator.testExecuteActions(actions);

      expect(mockSpeech.speak).toHaveBeenCalledTimes(1);
      expect(mockSpeech.speak).toHaveBeenCalledWith(longNarrate);
    });
  });

  describe("RESET_GAME", () => {
    beforeEach(() => {
      testState.players = {
        p1: { id: "p1", name: "Alice", position: 50, hearts: 3 },
        p2: { id: "p2", name: "Bob", position: 30, hearts: 1 },
      };
      (testState.game as any).playerOrder = ["p1", "p2"];

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.resetState = vi.fn((initialState: GameState) => {
        testState = { ...initialState };
        testState.players = {
          p1: { id: "p1", name: "Player 1", position: 0, hearts: 0 },
          p2: { id: "p2", name: "Player 2", position: 0, hearts: 0 },
        };
      });
    });

    it("resets with keepPlayerNames true", async () => {
      const actions: PrimitiveAction[] = [{ action: "RESET_GAME", keepPlayerNames: true }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.resetState).toHaveBeenCalled();
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.name", "Alice");
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p2.name", "Bob");
    });

    it("resets with keepPlayerNames false", async () => {
      const actions: PrimitiveAction[] = [{ action: "RESET_GAME", keepPlayerNames: false }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.resetState).toHaveBeenCalled();
      expect(mockStateManager.set).not.toHaveBeenCalledWith("players.p1.name", "Alice");
      expect(mockStateManager.set).not.toHaveBeenCalledWith("players.p2.name", "Bob");
    });
  });
});
