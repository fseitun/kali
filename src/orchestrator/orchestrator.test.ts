/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Adversarial tests intentionally use malformed data
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Orchestrator } from "./orchestrator";
import type { GameState, PrimitiveAction } from "./types";
import type { StatusIndicator } from "@/components/status-indicator";
import { possessiveScorePhraseEs } from "@/i18n/kalimba-encounter-phrases";
import { setLocale, t } from "@/i18n/translations";
import type { LLMClient } from "@/llm/LLMClient";
import type { SpeechService } from "@/services/speech-service";
import { StateManager } from "@/state-manager";

describe("Product scenario: Game orchestrator New Action Handlers", () => {
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
        squares: { "100": { effect: "win" } },
      },
    };

    mockStateManager = {
      getState: vi.fn(() => testState),
      get: vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return 5;
        }
        if (path === "game.lastRoll") {
          return 0;
        }
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
    } as unknown as LLMClient;

    orchestrator = new Orchestrator(
      mockLLM,
      mockStateManager,
      mockSpeech,
      mockIndicator,
      testState,
    );
  });

  describe("Product scenario: Player rolls", () => {
    it("Expected outcome: Infers player Id from game turn", async () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 3 }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.position", 8);
      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastRoll", 3);
    });

    it("Expected outcome: Calculates new position correctly", async () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 5 }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.position", 10);
    });
  });

  describe("Product scenario: Player answers", () => {
    it("Expected outcome: Stores answer in game last Answer", async () => {
      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "A" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "A");
    });

    it("Expected outcome: Handles multi word answers", async () => {
      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ANSWERED", answer: "fight the dragon" },
      ];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "fight the dragon");
    });

    it("Expected outcome: Auto applies answer to pending fork decision point", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      (testState.board as any).squares = {
        "0": { next: [1, 15], prev: [] },
        "100": { effect: "win" },
      };
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return 0;
        }
        if (path === "players.p1.activeChoices.0") {
          return undefined;
        }
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "1" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "1");
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.activeChoices.0", 1);
    });

    it("Expected outcome: Auto applies position 15 to fork at 0 via position Options", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      (testState.board as any).squares = {
        "0": { next: [1, 15], prev: [] },
        "100": { effect: "win" },
      };

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "15" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "15");
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.activeChoices.0", 15);
    });

    it("Expected outcome: Auto applies choice Keywords phrase (e.g. derecha) to fork at 0", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      (testState.board as any).squares = {
        "0": {
          next: { "1": ["izquierda", "corto"], "15": ["derecha", "largo"] },
          prev: [],
        },
        "100": { effect: "win" },
      };

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "derecha" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith("game.lastAnswer", "derecha");
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.activeChoices.0", 15);
    });

    it("Expected outcome: PLAYER ANSWERED path choice at position 0 does not advance turn", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      (testState.board as any).squares = {
        "0": { next: [1, 15], prev: [] },
        "100": { effect: "win" },
      };
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return 0;
        }
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "1" }];

      const result = await orchestrator.testExecuteActions(actions);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("none");
    });

    it("Expected outcome: PLAYER ANSWERED + NARRATE at fork 0 does not advance turn", async () => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      (testState.board as any).squares = {
        "0": { next: [1, 15], prev: [] },
        "100": { effect: "win" },
      };
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return 0;
        }
        return undefined;
      });

      const actions: PrimitiveAction[] = [
        { action: "PLAYER_ANSWERED", answer: "15" },
        { action: "NARRATE", text: "Elegiste la derecha. Tirá el dado." },
      ];

      const result = await orchestrator.testExecuteActions(actions);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("none");
    });
  });

  describe("Product scenario: Game asks a riddle", () => {
    it("Expected outcome: Stores riddle text, options, correct Option and optional synonyms in pending Animal Encounter", async () => {
      (testState.game as any).pending = {
        position: 5,
        power: 3,
        playerId: "p1",
        kind: "riddle",
      };
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pending") {
          return (testState.game as any).pending;
        }
        if (path === "game.turn") {
          return "p1";
        }
        if (path === "players.p1.position") {
          return 5;
        }
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
        "game.pending",
        expect.objectContaining({
          kind: "riddle",
          riddlePrompt: "Where does the penguin live?",
          riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
          correctOption: "Arctic",
          correctOptionSynonyms: ["polo", "frío"],
        }),
      );
    });
  });

  describe("Product scenario: Player answers riddle phase", () => {
    it("Expected outcome: Resolves correct riddle choice (strict match) and transitions to power Check", async () => {
      (testState.game as any).pending = {
        position: 5,
        power: 3,
        playerId: "p1",
        kind: "riddle",
        correctOption: "Ocean",
        riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pending") {
          return (testState.game as any).pending;
        }
        if (path === "game.turn") {
          return "p1";
        }
        if (path === "players.p1.position") {
          return 5;
        }
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "Ocean" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pending",
        expect.objectContaining({
          kind: "powerCheck",
          riddleCorrect: true,
        }),
      );
    });

    it("Expected outcome: After correct riddle on heart square, speech includes magic heart door hint", async () => {
      setLocale("en-US");
      testState.board = {
        squares: {
          "5": { name: "Peacock", heart: true },
          "100": { effect: "win" },
        },
      };
      (testState.game as any).pending = {
        position: 5,
        power: 3,
        playerId: "p1",
        kind: "riddle",
        correctOption: "Ocean",
        riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pending") {
          return (testState.game as any).pending;
        }
        if (path === "game.turn") {
          return "p1";
        }
        if (path === "players.p1.position") {
          return 5;
        }
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "Ocean" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockSpeech.speak).toHaveBeenCalledWith(
        expect.stringMatching(/magic heart for the final door/i),
      );
    });

    it("Expected outcome: Resolves wrong riddle choice strict false then interpreter says false", async () => {
      (testState.game as any).pending = {
        position: 5,
        power: 3,
        playerId: "p1",
        kind: "riddle",
        correctOption: "Arctic",
        riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pending") {
          return (testState.game as any).pending;
        }
        if (path === "game.turn") {
          return "p1";
        }
        if (path === "players.p1.position") {
          return 5;
        }
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "Desert" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pending",
        expect.objectContaining({
          kind: "powerCheck",
          riddleCorrect: false,
        }),
      );
    });

    it("Expected outcome: Resolves option text (miércoles) and marks riddle Correct true via strict match", async () => {
      (testState.game as any).pending = {
        position: 5,
        power: 3,
        playerId: "p1",
        kind: "riddle",
        correctOption: "A) Miércoles",
        riddleOptions: ["A) Miércoles", "B) Jueves", "C) Lunes", "D) Sábado"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pending") {
          return (testState.game as any).pending;
        }
        if (path === "game.turn") {
          return "p1";
        }
        if (path === "players.p1.position") {
          return 5;
        }
        return undefined;
      });

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ANSWERED", answer: "miércoles" }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pending",
        expect.objectContaining({
          kind: "powerCheck",
          riddleCorrect: true,
        }),
      );
    });

    it("Expected outcome: Prefers transcript over interpreter answer user said 'la hormiga', interpreter returned wrong option to riddle Correct true", async () => {
      (testState.game as any).pending = {
        position: 5,
        power: 3,
        playerId: "p1",
        kind: "riddle",
        correctOption: "A) Hormiga",
        riddleOptions: ["A) Hormiga", "B) Elefante", "C) Puma", "D) Delfín"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pending") {
          return (testState.game as any).pending;
        }
        if (path === "game.turn") {
          return "p1";
        }
        if (path === "players.p1.position") {
          return 5;
        }
        return undefined;
      });
      mockLLM.getActions = vi.fn(async () => [
        { action: "PLAYER_ANSWERED", answer: "D) Delfín" },
      ]) as any;

      const result = await orchestrator.handleTranscript("la hormiga");

      expect(result.success).toBe(true);
      expect(mockStateManager.set).toHaveBeenCalledWith(
        "game.pending",
        expect.objectContaining({
          kind: "powerCheck",
          riddleCorrect: true,
        }),
      );
    });
  });

  describe("Product scenario: Board Mechanics game orchestrator Control", () => {
    it("Expected outcome: Auto applies ladder after position change", async () => {
      testState.board = {
        squares: {
          "10": { destination: 25 },
          "100": { effect: "win" },
        },
      };
      testState.players.p1.position = 5;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return testState.players.p1.position;
        }
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

    it("Expected outcome: Auto applies snake after position change", async () => {
      testState.board = {
        squares: {
          "15": { destination: 5 },
          "100": { effect: "win" },
        },
      };
      testState.players.p1.position = 10;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return testState.players.p1.position;
        }
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

    it("Expected outcome: Applies board moves after player rolls", async () => {
      testState.board = {
        squares: {
          "10": { destination: 25 },
          "100": { effect: "win" },
        },
      };
      (testState.players as any).p1.position = 8;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return testState.players.p1.position;
        }
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

    it("Expected outcome: Interpreter cannot bypass board moves (orchestrator always applies)", async () => {
      testState.board = {
        squares: {
          "10": { destination: 25 },
          "100": { effect: "win" },
        },
      };
      testState.players.p1.position = 5;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return testState.players.p1.position;
        }
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

  describe("Product scenario: Square Effects game orchestrator Triggers", () => {
    it("Expected outcome: Applies skip Turn square with deterministic TTS (no interpreter for non animal special squares)", async () => {
      testState.board = {
        squares: {
          "20": {
            name: "Dragon Square",
            description: "Fight or flee",
            effect: "skipTurn",
          },
          "100": { effect: "win" },
        },
      };
      testState.players.p1.position = 15;

      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return testState.players.p1.position;
        }
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

      expect(llmCallCount).toBe(0);
      expect(mockSpeech.speak).toHaveBeenCalled();
    });
  });

  describe("Product scenario: Power check chaining", () => {
    it("Expected outcome: Power win from 16 with roll 5 lands on 21 (Camel), sets pending encounter, turn does not advance", async () => {
      const stateManager = new StateManager();
      stateManager.init({
        game: {
          turn: "p1",
          phase: "PLAYING",
          lastRoll: 2,
          playerOrder: ["p1", "p2"],
          pending: {
            position: 16,
            power: 1,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
        players: {
          p1: {
            id: "p1",
            name: "Fico",
            position: 16,
            hearts: 0,
            activeChoices: { 0: 15 },
          },
          p2: { id: "p2", name: "Fede", position: 0, hearts: 0, activeChoices: {} },
        },
        board: {
          squares: {
            "16": { name: "Beetle", power: 1, habitat: "desert" },
            "21": { name: "Camel", power: 2, habitat: "desert" },
          },
        },
      } as GameState);

      const mockLLMChain = {
        getActions: vi.fn(async () => []),
        setGameRules: vi.fn(),
      } as unknown as LLMClient;

      const chainOrchestrator = new Orchestrator(
        mockLLMChain,
        stateManager,
        { speak: vi.fn(async () => {}), playSound: vi.fn() } as unknown as SpeechService,
        { setState: vi.fn() } as unknown as StatusIndicator,
        stateManager.getState() as GameState,
      );

      await chainOrchestrator.testExecuteActions([{ action: "PLAYER_ANSWERED", answer: "5" }]);

      expect(stateManager.get("players.p1.position")).toBe(21);
      const pending = stateManager.get("game.pending") as Record<string, unknown>;
      expect(pending).toBeDefined();
      expect(pending?.position).toBe(21);
      expect(pending?.kind).toBe("riddle");
      expect((stateManager.getState().game as Record<string, unknown>).turn).toBe("p1");
    });
  });

  describe("Product scenario: Handle Transcript Return Value and Separation of Concerns", () => {
    it("Expected outcome: Returns success true when transcript processed successfully", async () => {
      mockLLM.getActions = vi.fn(async () => [{ action: "NARRATE", text: "Hello" }]);

      const { success } = await orchestrator.handleTranscript("test command");

      expect(success).toBe(true);
    });

    it("Expected outcome: Returns success false when transcript processing fails", async () => {
      mockLLM.getActions = vi.fn(async () => {
        throw new Error("LLM error");
      });

      const { success } = await orchestrator.handleTranscript("test command");

      expect(success).toBe(false);
    });

    it("Expected outcome: Returns success false when validation fails", async () => {
      mockLLM.getActions = vi.fn(async () => [
        { action: "SET_STATE", path: "players.p2.position", value: 99 },
      ]);

      const { success } = await orchestrator.handleTranscript("cheat command");

      expect(success).toBe(false);
    });

    it("Expected outcome: Does not advance turn (no longer its responsibility)", async () => {
      (testState.game as any).turn = "p1";
      (testState.game as any).playerOrder = ["p1", "p2"];

      mockLLM.getActions = vi.fn(async () => [{ action: "PLAYER_ROLLED", value: 5 }]) as any;

      await orchestrator.handleTranscript("I rolled 5");

      expect(mockStateManager.set).not.toHaveBeenCalledWith("game.turn", "p2");
    });

    it("Expected outcome: Test Execute Actions does not advance turn", async () => {
      (testState.game as any).turn = "p1";
      (testState.game as any).playerOrder = ["p1", "p2"];

      const actions: PrimitiveAction[] = [{ action: "PLAYER_ROLLED", value: 3 }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.set).not.toHaveBeenCalledWith("game.turn", "p2");
    });

    it("Expected outcome: NARRATE only returns turn Advance none (State Query fix)", async () => {
      mockLLM.getActions = vi.fn(async () => [
        { action: "NARRATE", text: "Fico is ahead at position 45" },
      ]);

      const result = await orchestrator.handleTranscript("Who is winning?");

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("none");
    });

    it("Expected outcome: PLAYER ROLLED plus NARRATE returns turn Advance call Advance Turn", async () => {
      mockLLM.getActions = vi.fn(async () => [
        { action: "PLAYER_ROLLED", value: 4 },
        { action: "NARRATE", text: "Moving 4 spaces!" },
      ]);

      const result = await orchestrator.handleTranscript("I rolled a 4");

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("callAdvanceTurn");
    });

    it("Expected outcome: Passes last NARRATE as last Bot Utterance when user confirms (roll clarification)", async () => {
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

    it("Expected outcome: Passes riddle Incorrect as last Bot Utterance after wrong riddle answer", async () => {
      setLocale("es-AR");
      (testState.board as any).squares = {
        "5": { name: "Cobra", power: 4 },
        "100": { effect: "win" },
      };
      (testState.game as any).pending = {
        position: 5,
        power: 3,
        playerId: "p1",
        kind: "riddle",
        correctOption: "Arctic",
        riddleOptions: ["Desert", "Ocean", "Arctic", "Forest"],
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "game.pending") {
          return (testState.game as any).pending;
        }
        if (path === "game.turn") {
          return "p1";
        }
        if (path === "players.p1.position") {
          return 5;
        }
        return undefined;
      });
      mockLLM.getActions = vi.fn(async () => []) as any;

      await orchestrator.testExecuteActions([{ action: "PLAYER_ANSWERED", answer: "Desert" }]);

      await orchestrator.handleTranscript("tres");

      const expectedWrongRiddleMsg = t("game.riddleIncorrectPowerRoll", {
        diceRollPhrase: t("game.riddlePowerRollOneDie"),
        animalScorePhrase: possessiveScorePhraseEs("Cobra"),
      });
      expect(mockLLM.getActions).toHaveBeenLastCalledWith(
        "tres",
        expect.any(Object),
        expectedWrongRiddleMsg,
      );
      setLocale("en-US");
    });
  });

  describe("Product scenario: Processing Lock Concurrency Protection", () => {
    it("Expected outcome: Is Locked returns false when idle", () => {
      expect(orchestrator.isLocked()).toBe(false);
    });

    it("Expected outcome: Is Locked returns true while processing", async () => {
      mockLLM.getActions = vi.fn(async () => {
        expect(orchestrator.isLocked()).toBe(true);
        return [];
      });

      await orchestrator.handleTranscript("test");
    });

    it("Expected outcome: Rejects concurrent handle Transcript calls", async () => {
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

    it("Expected outcome: Rejects concurrent test Execute Actions calls", async () => {
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
      expect(results[0]).toEqual({ success: true, turnAdvance: { kind: "none" } });
      expect(results[1]).toEqual({ success: false, turnAdvance: { kind: "none" } });
    });

    it("Expected outcome: Releases lock after successful execution", async () => {
      mockLLM.getActions = vi.fn(async () => []);

      await orchestrator.handleTranscript("test");

      expect(orchestrator.isLocked()).toBe(false);
    });

    it("Expected outcome: Releases lock after failed execution", async () => {
      mockLLM.getActions = vi.fn(async () => {
        throw new Error("LLM error");
      });

      await orchestrator.handleTranscript("test");

      expect(orchestrator.isLocked()).toBe(false);
    });

    it("Expected outcome: Releases lock after exception", async () => {
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

  describe("Product scenario: Decision point ask undupe", () => {
    // Inferred prompt for fork at 0 with next [1, 15] from decision-point-inference
    const decisionPrompt = "¿Querés ir por la izquierda o por la derecha?";
    const longNarrate =
      "Federico, estás en el inicio. ¿Querés ir por el camino A, que es más corto, o por el B, que es más largo?";

    beforeEach(() => {
      (testState.players as any).p1.position = 0;
      (testState.players as any).p1.activeChoices = {};
      (testState.board as any).squares = {
        "0": { next: [1, 15], prev: [] },
        "100": { effect: "win" },
      };
      mockStateManager.getState = vi.fn(() => testState);
      mockStateManager.get = vi.fn((path: string) => {
        if (path === "players.p1.position") {
          return 0;
        }
        return undefined;
      });
    });

    it("Expected outcome: Does not call enforce Decision Points after NARRATE that covers decision (only one interpreter call)", async () => {
      mockLLM.getActions = vi.fn().mockResolvedValue([{ action: "NARRATE", text: longNarrate }]);

      await orchestrator.handleTranscript("que tengo que hacer");

      expect(mockLLM.getActions).toHaveBeenCalledTimes(1);
      expect(mockSpeech.speak).toHaveBeenCalledTimes(1);
      expect(mockSpeech.speak).toHaveBeenCalledWith(longNarrate);
    });

    it("Expected outcome: Speaks only once when batch has covering NARRATE then exact prompt NARRATE", async () => {
      const actions: PrimitiveAction[] = [
        { action: "NARRATE", text: longNarrate },
        { action: "NARRATE", text: decisionPrompt },
      ];

      await orchestrator.testExecuteActions(actions);

      expect(mockSpeech.speak).toHaveBeenCalledTimes(1);
      expect(mockSpeech.speak).toHaveBeenCalledWith(longNarrate);
    });
  });

  describe("Product scenario: Game reset", () => {
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

    it("Expected outcome: Resets with keep Player Names true", async () => {
      const actions: PrimitiveAction[] = [{ action: "RESET_GAME", keepPlayerNames: true }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.resetState).toHaveBeenCalled();
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p1.name", "Alice");
      expect(mockStateManager.set).toHaveBeenCalledWith("players.p2.name", "Bob");
    });

    it("Expected outcome: Resets with keep Player Names false", async () => {
      const actions: PrimitiveAction[] = [{ action: "RESET_GAME", keepPlayerNames: false }];

      await orchestrator.testExecuteActions(actions);

      expect(mockStateManager.resetState).toHaveBeenCalled();
      expect(mockStateManager.set).not.toHaveBeenCalledWith("players.p1.name", "Alice");
      expect(mockStateManager.set).not.toHaveBeenCalledWith("players.p2.name", "Bob");
    });
  });
});
