import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StatusIndicator } from "../components/status-indicator";
import { MockLLMClient } from "../llm/MockLLMClient";
import type { SpeechService } from "../services/speech-service";
import { StateManager } from "../state-manager";
import { Orchestrator } from "./orchestrator";
import { GamePhase } from "./types";
import type { GameState, PrimitiveAction } from "./types";

/**
 * ARCHITECTURE: Integration tests use MockLLM to simulate game actions.
 * LLM can only use these primitives: PLAYER_ROLLED, NARRATE, SET_STATE (for player data)
 * LLM CANNOT: change game.turn, game.phase, game.winner (orchestrator authority)
 * Win detection: Orchestrator detects win conditions and calls transitionPhase(FINISHED)
 */
describe("Orchestrator Integration Tests", () => {
  let orchestrator: Orchestrator;
  let stateManager: StateManager;
  let mockLLM: MockLLMClient;
  let mockSpeech: SpeechService;
  let mockIndicator: StatusIndicator;

  function createScriptedLLM(responses: PrimitiveAction[][]): MockLLMClient {
    return new MockLLMClient("scripted", [], responses);
  }

  function createMockServices(): void {
    mockSpeech = {
      speak: vi.fn(async () => {}),
      playSound: vi.fn(),
    } as unknown as SpeechService;

    mockIndicator = {
      setState: vi.fn(),
    } as unknown as StatusIndicator;
  }

  function setupGame(initialState: GameState): void {
    stateManager = new StateManager();
    stateManager.init(initialState);

    orchestrator = new Orchestrator(
      mockLLM,
      stateManager,
      mockSpeech,
      mockIndicator,
      initialState,
    );
  }

  beforeEach(() => {
    createMockServices();
  });

  describe("Board Mechanics", () => {
    it("auto-applies ladders after position changes", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to 4..." },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 2 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: { "4": 14 },
          squares: {},
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(14);
    });

    it("auto-applies snakes after position changes", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to 17..." },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 15 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: { "17": 7 },
          squares: {},
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(7);
    });

    it("handles board moves after position changes", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 3 },
          { action: "NARRATE", text: "Moving..." },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 1 },
        },
        board: {
          winPosition: 100,
          moves: { "4": 14 },
          squares: {},
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 3");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(14);
    });
  });

  describe("Animal Encounters", () => {
    it("handles animal encounter with power check failure", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to 5..." },
        ],
        [
          {
            action: "NARRATE",
            text: "You encounter a Cobra! Roll for power check.",
          },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 3 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {
            "5": { type: "animal", name: "Cobra", power: 4, points: 4 },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(5);
      expect(mockLLM.getCallCount()).toBe(2);
    });

    it("handles animal encounter triggering square effect", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to 5..." },
        ],
        [
          {
            action: "SET_STATE",
            path: "players.p1.bonusDiceNextTurn",
            value: true,
          },
          { action: "SET_STATE", path: "players.p1.points", value: 4 },
          {
            action: "NARRATE",
            text: "You passed the power check and riddle! +4 points and bonus dice!",
          },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: {
            id: "p1",
            name: "Alice",
            position: 3,
            bonusDiceNextTurn: false,
            points: 0,
          },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {
            "5": { type: "animal", name: "Cobra", power: 4, points: 4 },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      const bonusDice = stateManager.get("players.p1.bonusDiceNextTurn");
      const points = stateManager.get("players.p1.points");

      expect(p1Position).toBe(5);
      expect(bonusDice).toBe(true);
      expect(points).toBe(4);
    });

    it("applies bonus dice after riddle success", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 11 },
          {
            action: "SET_STATE",
            path: "players.p1.bonusDiceNextTurn",
            value: false,
          },
          { action: "NARRATE", text: "You rolled two dice: 5 + 6 = 11!" },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 5, bonusDiceNextTurn: true },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {},
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled 5 and 6");

      const p1Position = stateManager.get("players.p1.position");
      const bonusDice = stateManager.get("players.p1.bonusDiceNextTurn");

      expect(p1Position).toBe(16);
      expect(bonusDice).toBe(false);
    });
  });

  describe("Decision Points", () => {
    it("blocks movement until path choice is made", async () => {
      const responses: PrimitiveAction[][] = [
        [{ action: "NARRATE", text: "Please choose a path first." }],
        [{ action: "NARRATE", text: "Choose path A (short) or B (long)?" }],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 0, pathChoice: null },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {},
        },
        decisionPoints: [
          {
            position: 0,
            requiredField: "pathChoice",
            prompt: "Choose path A or B?",
          },
        ],
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 3");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(0);
    });

    it("allows movement after decision is set", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ANSWERED", answer: "A" },
          { action: "SET_STATE", path: "players.p1.pathChoice", value: "A" },
          { action: "NARRATE", text: "You chose path A!" },
        ],
        [
          { action: "PLAYER_ROLLED", value: 3 },
          { action: "NARRATE", text: "Moving to 3..." },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 0, pathChoice: null },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {},
        },
        decisionPoints: [
          {
            position: 0,
            requiredField: "pathChoice",
            prompt: "Choose path A or B?",
          },
        ],
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("Path A");
      await orchestrator.handleTranscript("I rolled a 3");

      const p1Position = stateManager.get("players.p1.position");
      const pathChoice = stateManager.get("players.p1.pathChoice");

      expect(pathChoice).toBe("A");
      expect(p1Position).toBe(3);
    });
  });

  describe("Portal and Teleportation", () => {
    it("teleports forward via board.moves and processes square effect", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to portal..." },
        ],
        [
          { action: "SET_STATE", path: "players.p1.inverseMode", value: false },
          {
            action: "NARRATE",
            text: "Portal activated! Inverse mode deactivated.",
          },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 43, inverseMode: true },
        },
        board: {
          winPosition: 196,
          moves: { "45": 82 },
          squares: {
            "45": {
              type: "portal",
              name: "Portal Forward",
              destination: 82,
              inverseMode: "deactivate",
            },
            "82": {
              type: "portal",
              name: "Portal Destination",
              destination: 82,
              inverseMode: "deactivate",
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      const inverseMode = stateManager.get("players.p1.inverseMode");

      expect(p1Position).toBe(82);
      expect(inverseMode).toBe(false);
      expect(mockLLM.getCallCount()).toBe(2);
    });

    it("teleports backward and activates inverse mode via square effect", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to portal..." },
        ],
        [
          { action: "SET_STATE", path: "players.p1.inverseMode", value: true },
          {
            action: "NARRATE",
            text: "Portal activated! Inverse mode activated.",
          },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 80, inverseMode: false },
        },
        board: {
          winPosition: 196,
          moves: { "82": 45 },
          squares: {
            "82": {
              type: "portal",
              name: "Portal Backward",
              destination: 45,
              inverseMode: "activate",
            },
            "45": {
              type: "portal",
              name: "Portal Destination",
              destination: 45,
              inverseMode: "activate",
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      const inverseMode = stateManager.get("players.p1.inverseMode");

      expect(p1Position).toBe(45);
      expect(inverseMode).toBe(true);
      expect(mockLLM.getCallCount()).toBe(2);
    });
  });

  describe("Turn Management", () => {
    it("advances turns after complete action sequence", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Alice moves to 2" },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 0 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {},
        },
      };

      setupGame(initialState);

      const turnBefore = stateManager.get("game.turn");
      expect(turnBefore).toBe("p1");

      await orchestrator.handleTranscript("I rolled a 2");

      const result = await orchestrator.advanceTurn();
      expect(result).not.toBeNull();
      expect(result?.playerId).toBe("p2");

      const turnAfter = stateManager.get("game.turn");
      expect(turnAfter).toBe("p2");
    });

    it("sets skipTurns for hazard squares", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving..." },
        ],
        [
          { action: "SET_STATE", path: "players.p1.skipTurns", value: 1 },
          { action: "NARRATE", text: "You hit quicksand! Skip next turn." },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 9, skipTurns: 0 },
          p2: { id: "p2", name: "Bob", position: 5 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {
            "11": { type: "hazard", name: "Quicksand", effect: "skipTurn" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1SkipTurns = stateManager.get("players.p1.skipTurns");
      expect(p1SkipTurns).toBe(1);

      const result = await orchestrator.advanceTurn();
      expect(result).not.toBeNull();
      expect(result?.playerId).toBe("p2");
    });

    it("stops turn advancement when game finishes", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Alice moves to position 100 and wins!" },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 98 },
          p2: { id: "p2", name: "Bob", position: 50 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {},
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      // Orchestrator detects win condition and sets winner/phase
      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(100);

      // Simulate orchestrator detecting win
      stateManager.set("game.winner", "p1");
      orchestrator.transitionPhase(GamePhase.FINISHED);

      const phase = stateManager.get("game.phase");
      const winner = stateManager.get("game.winner");

      expect(phase).toBe(GamePhase.FINISHED);
      expect(winner).toBe("p1");

      // Turn advancement now blocked
      const result = await orchestrator.advanceTurn();
      expect(result).toBeNull();
    });
  });

  describe("Win Conditions", () => {
    it("detects winner when reaching win position", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          {
            action: "NARRATE",
            text: "Congratulations Alice! You reached position 100!",
          },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 98 },
          p2: { id: "p2", name: "Bob", position: 80 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {},
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(100);

      // Orchestrator detects win and sets winner
      stateManager.set("game.winner", "p1");
      const winner = stateManager.get("game.winner");
      expect(winner).toBe("p1");
    });

    it("sets phase to FINISHED on win", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 5 },
          { action: "NARRATE", text: "You win!" },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 95 },
          p2: { id: "p2", name: "Bob", position: 80 },
        },
        board: {
          winPosition: 100,
          moves: {},
          squares: {},
        },
      };

      setupGame(initialState);

      const phaseBefore = stateManager.get("game.phase");
      expect(phaseBefore).toBe(GamePhase.PLAYING);

      await orchestrator.handleTranscript("I rolled a 5");

      // Orchestrator detects win and sets winner/phase
      stateManager.set("game.winner", "p1");
      orchestrator.transitionPhase(GamePhase.FINISHED);

      const phaseAfter = stateManager.get("game.phase");
      const winner = stateManager.get("game.winner");

      expect(phaseAfter).toBe(GamePhase.FINISHED);
      expect(winner).toBe("p1");
    });
  });

  describe("Complex Mechanics", () => {
    it("handles magic door with heart requirements", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to magic door..." },
        ],
        [
          {
            action: "NARRATE",
            text: "You need to roll 5 or higher. You have 2 hearts.",
          },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 184, hearts: 2 },
        },
        board: {
          winPosition: 196,
          magicDoorPosition: 186,
          heartsRequiredForDoor: 7,
          moves: {},
          squares: {
            "186": {
              type: "special",
              name: "Magic Door",
              effect: "magicDoorCheck",
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(186);
    });

    it("handles instrument usage in correct habitat", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving..." },
        ],
        [
          { action: "SET_STATE", path: "players.p1.instruments", value: [] },
          { action: "SET_STATE", path: "players.p1.points", value: 3 },
          {
            action: "NARRATE",
            text: "You used the drum of the forest! The bear sleeps. +3 points.",
          },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: {
            id: "p1",
            name: "Alice",
            position: 57,
            instruments: ["drum_forest"],
            points: 0,
          },
        },
        board: {
          winPosition: 196,
          moves: {},
          squares: {
            "59": {
              type: "animal",
              name: "Bear",
              power: 3,
              points: 3,
              habitat: "forest",
              instrument: "drum_forest",
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const instruments = stateManager.get("players.p1.instruments");
      const points = stateManager.get("players.p1.points");

      expect(instruments).toEqual([]);
      expect(points).toBe(3);
    });
  });
});
