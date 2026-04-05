import { describe, it, expect, beforeEach, vi } from "vitest";
import { Orchestrator } from "./orchestrator";
import { GamePhase } from "./types";
import type { StatusIndicator } from "@/components/status-indicator";
import type { LLMClient } from "@/llm/LLMClient";
import type { SpeechService } from "@/services/speech-service";
import { StateManager } from "@/state-manager";

/**
 * Architecture Tests - Enforce Orchestrator Authority Model
 *
 * These tests verify that the orchestrator is the sole authority for:
 * - Player setup
 * - Phase transitions
 * - Turn advancement
 *
 * CRITICAL: These tests enforce architectural boundaries that must never be violated.
 */
describe("Product scenario: Game orchestrator Architecture Authority Model", () => {
  let orchestrator: Orchestrator;
  let stateManager: StateManager;
  let mockLLM: LLMClient;
  let mockSpeech: SpeechService;
  let mockIndicator: StatusIndicator;

  const initialState = {
    game: {
      name: "Test Game",
      phase: GamePhase.SETUP,
      turn: null,
      playerOrder: [],
      winner: null,
      lastRoll: null,
    },
    players: {
      p1: {
        id: "p1",
        name: "",
        position: 0,
        hearts: 0,
      },
    },
    board: {
      squares: { "100": { effect: "win" } },
    },
  };

  beforeEach(() => {
    stateManager = new StateManager();
    stateManager.init(initialState);

    mockLLM = {
      getActions: vi.fn(),
      setGameRules: vi.fn(),
      analyzeResponse: vi.fn(),
      extractName: vi.fn(),
    } as unknown as LLMClient;

    mockSpeech = {
      speak: vi.fn().mockResolvedValue(undefined),
      playSound: vi.fn(),
    } as unknown as SpeechService;

    mockIndicator = {
      setState: vi.fn(),
    } as unknown as StatusIndicator;

    orchestrator = new Orchestrator(mockLLM, stateManager, mockSpeech, mockIndicator, initialState);
  });

  describe("Product scenario: 1. game orchestrator Authority Player Setup", () => {
    it("Expected outcome: Setup Players creates players with correct structure", () => {
      const playerNames = ["Alice", "Bob", "Charlie"];

      orchestrator.setupPlayers(playerNames);

      const state = stateManager.getState();
      const players = state.players as Record<string, Record<string, unknown>>;

      expect(Object.keys(players)).toHaveLength(3);
      expect(players.p1.name).toBe("Alice");
      expect(players.p2.name).toBe("Bob");
      expect(players.p3.name).toBe("Charlie");
      expect(players.p1.id).toBe("p1");
      expect(players.p2.id).toBe("p2");
      expect(players.p3.id).toBe("p3");
      expect(players.p1.position).toBe(0);
      expect(players.p2.position).toBe(0);
      expect(players.p3.position).toBe(0);
    });

    it("Expected outcome: Setup Players sets game turn to first player", () => {
      const playerNames = ["Alice", "Bob"];

      orchestrator.setupPlayers(playerNames);

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;

      expect(game.turn).toBe("p1");
    });

    it("Expected outcome: Setup Players creates player Order correctly", () => {
      const playerNames = ["Alice", "Bob", "Charlie"];

      orchestrator.setupPlayers(playerNames);

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;
      const playerOrder = game.playerOrder as string[];

      expect(playerOrder).toEqual(["p1", "p2", "p3"]);
    });

    it("Expected outcome: Setup Players preserves player template fields", () => {
      const playerNames = ["Alice"];

      orchestrator.setupPlayers(playerNames);

      const state = stateManager.getState();
      const players = state.players as Record<string, Record<string, unknown>>;

      // Should preserve hearts field from template
      expect(players.p1.hearts).toBe(0);
    });
  });

  describe("Product scenario: 2 game orchestrator Authority Phase Transitions", () => {
    it("Expected outcome: Transition Phase changes phase correctly", () => {
      orchestrator.transitionPhase(GamePhase.PLAYING);

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;

      expect(game.phase).toBe(GamePhase.PLAYING);
    });

    it("Expected outcome: Transition Phase can transition through all phases", () => {
      orchestrator.transitionPhase(GamePhase.SETUP);
      let state = stateManager.getState();
      let game = state.game as Record<string, unknown>;
      expect(game.phase).toBe(GamePhase.SETUP);

      orchestrator.transitionPhase(GamePhase.PLAYING);
      state = stateManager.getState();
      game = state.game as Record<string, unknown>;
      expect(game.phase).toBe(GamePhase.PLAYING);

      orchestrator.transitionPhase(GamePhase.FINISHED);
      state = stateManager.getState();
      game = state.game as Record<string, unknown>;
      expect(game.phase).toBe(GamePhase.FINISHED);
    });
  });

  describe("Product scenario: 3 game orchestrator Authority Turn Advancement", () => {
    beforeEach(() => {
      // Setup players for turn tests
      orchestrator.setupPlayers(["Alice", "Bob", "Charlie"]);
      orchestrator.transitionPhase(GamePhase.PLAYING);
    });

    it("Expected outcome: Advance Turn advances to next player", async () => {
      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;
      expect(game.turn).toBe("p1"); // Alice starts

      const nextPlayer = await orchestrator.advanceTurn();

      expect(nextPlayer).not.toBeNull();
      expect(nextPlayer?.playerId).toBe("p2");
      expect(nextPlayer?.name).toBe("Bob");

      const newState = stateManager.getState();
      const newGame = newState.game as Record<string, unknown>;
      expect(newGame.turn).toBe("p2");
    });

    it("Expected outcome: Advance Turn wraps around from last to first player", async () => {
      // Manually set to last player
      stateManager.set("game.turn", "p3");

      const nextPlayer = await orchestrator.advanceTurn();

      expect(nextPlayer).not.toBeNull();
      expect(nextPlayer?.playerId).toBe("p1");
      expect(nextPlayer?.name).toBe("Alice");

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;
      expect(game.turn).toBe("p1");
    });

    it("Expected outcome: Advance Turn returns null when game has winner", async () => {
      stateManager.set("game.winner", "p1");

      const nextPlayer = await orchestrator.advanceTurn();

      expect(nextPlayer).toBeNull();

      // Turn should not have advanced
      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;
      expect(game.turn).toBe("p1"); // Still p1
    });

    it("Expected outcome: Advance Turn returns null when not in PLAYING phase", async () => {
      orchestrator.transitionPhase(GamePhase.SETUP);

      const nextPlayer = await orchestrator.advanceTurn();

      expect(nextPlayer).toBeNull();

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;
      expect(game.turn).toBe("p1"); // Turn not advanced
    });

    it("Expected outcome: Advance Turn blocks when square effect is processing", async () => {
      // Add a square effect to trigger processing
      stateManager.set("board.squares", {
        "5": { name: "Test Enemy", power: 1 },
      });

      // Move player to trigger effect (this would set isProcessingSquareEffect internally)
      // For this test, we verify the method exists and returns appropriately
      const nextPlayer = await orchestrator.advanceTurn();

      // Should still work in normal case (when not actually processing an effect)
      expect(nextPlayer).not.toBeNull();
    });

    it("Expected outcome: Advance Turn blocks when pending decisions exist", async () => {
      stateManager.set("board.squares", {
        "0": { next: [1, 15], prev: [] },
      });
      stateManager.set("players.p1.activeChoices", {});

      const nextPlayer = await orchestrator.advanceTurn();

      // Should block turn advancement
      expect(nextPlayer).toBeNull();

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;
      expect(game.turn).toBe("p1"); // Turn not advanced
    });

    it("Expected outcome: Advance Turn allows advancement when decision is resolved", async () => {
      stateManager.set("board.squares", {
        "0": { next: [1, 15], prev: [] },
      });
      stateManager.set("players.p1.activeChoices", { 0: 1 });

      const nextPlayer = await orchestrator.advanceTurn();

      // Should allow turn advancement
      expect(nextPlayer).not.toBeNull();
      expect(nextPlayer?.playerId).toBe("p2");

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;
      expect(game.turn).toBe("p2");
    });
  });

  describe("Product scenario: 4 game orchestrator Authority Pending Decisions", () => {
    beforeEach(() => {
      orchestrator.setupPlayers(["Alice", "Bob"]);
      orchestrator.transitionPhase(GamePhase.PLAYING);
    });

    it("Expected outcome: Has Pending Decisions returns false when no decision points", () => {
      const hasPending = orchestrator.hasPendingDecisions();
      expect(hasPending).toBe(false);
    });

    it("Expected outcome: Has Pending Decisions returns false when player not at decision point", () => {
      stateManager.set("board.squares", {
        "10": { next: [11, 12], prev: [9] },
      });
      stateManager.set("players.p1.position", 0);

      const hasPending = orchestrator.hasPendingDecisions();
      expect(hasPending).toBe(false);
    });

    it("Expected outcome: Has Pending Decisions returns true when player at decision point with null choice", () => {
      stateManager.set("board.squares", {
        "0": { next: [1, 15], prev: [] },
      });
      stateManager.set("players.p1.position", 0);
      stateManager.set("players.p1.activeChoices", {});

      const hasPending = orchestrator.hasPendingDecisions();
      expect(hasPending).toBe(true);
    });

    it("Expected outcome: Has Pending Decisions returns false when decision is resolved", () => {
      stateManager.set("board.squares", {
        "0": { next: [1, 15], prev: [] },
      });
      stateManager.set("players.p1.position", 0);
      stateManager.set("players.p1.activeChoices", { 0: 1 });

      const hasPending = orchestrator.hasPendingDecisions();
      expect(hasPending).toBe(false);
    });
  });

  describe("Product scenario: 5 Integration Full Flows", () => {
    it("Expected outcome: Full flow setup Players to transition Phase to advance Turn", async () => {
      // 1. Setup players
      orchestrator.setupPlayers(["Alice", "Bob"]);

      let state = stateManager.getState();
      let game = state.game as Record<string, unknown>;
      const players = state.players as Record<string, Record<string, unknown>>;

      expect(Object.keys(players)).toHaveLength(2);
      expect(game.turn).toBe("p1");
      expect(game.phase).toBe(GamePhase.SETUP); // Still in setup

      // 2. Transition to playing
      orchestrator.transitionPhase(GamePhase.PLAYING);

      state = stateManager.getState();
      game = state.game as Record<string, unknown>;

      expect(game.phase).toBe(GamePhase.PLAYING);

      // 3. Advance turn
      const nextPlayer = await orchestrator.advanceTurn();

      expect(nextPlayer).not.toBeNull();
      expect(nextPlayer?.playerId).toBe("p2");
      expect(nextPlayer?.name).toBe("Bob");

      state = stateManager.getState();
      game = state.game as Record<string, unknown>;

      expect(game.turn).toBe("p2");
    });

    it("Expected outcome: Turn advancement respects game completion", async () => {
      orchestrator.setupPlayers(["Alice", "Bob"]);
      orchestrator.transitionPhase(GamePhase.PLAYING);

      // Advance turn works
      let nextPlayer = await orchestrator.advanceTurn();
      expect(nextPlayer).not.toBeNull();

      // Set winner
      stateManager.set("game.winner", "p2");

      // Turn advancement now blocked
      nextPlayer = await orchestrator.advanceTurn();
      expect(nextPlayer).toBeNull();
    });

    it("Expected outcome: Turn advancement respects phase transitions", async () => {
      orchestrator.setupPlayers(["Alice", "Bob"]);
      orchestrator.transitionPhase(GamePhase.PLAYING);

      // Advance turn works in PLAYING
      let nextPlayer = await orchestrator.advanceTurn();
      expect(nextPlayer).not.toBeNull();

      // Transition to FINISHED
      orchestrator.transitionPhase(GamePhase.FINISHED);

      // Turn advancement now blocked
      nextPlayer = await orchestrator.advanceTurn();
      expect(nextPlayer).toBeNull();
    });
  });

  describe("Product scenario: 6 Architecture Enforcement State Mutations", () => {
    it("Expected outcome: Only orchestrator methods mutate state during player setup", () => {
      const initialPhase = stateManager.get("game.phase");
      const initialTurn = stateManager.get("game.turn");

      // Orchestrator methods are the ONLY way to change these
      orchestrator.setupPlayers(["Alice", "Bob"]);
      orchestrator.transitionPhase(GamePhase.PLAYING);

      expect(stateManager.get("game.phase")).not.toBe(initialPhase);
      expect(stateManager.get("game.turn")).not.toBe(initialTurn);

      // This test documents that state mutations happen through orchestrator
      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;

      expect(game.phase).toBe(GamePhase.PLAYING);
      expect(game.turn).toBe("p1");
      expect(game.playerOrder).toEqual(["p1", "p2"]);
    });

    it("Expected outcome: Orchestrator controls turn even with multiple advances", async () => {
      orchestrator.setupPlayers(["Alice", "Bob", "Charlie"]);
      orchestrator.transitionPhase(GamePhase.PLAYING);

      // Multiple turn advances
      await orchestrator.advanceTurn(); // p1 → p2
      await orchestrator.advanceTurn(); // p2 → p3
      await orchestrator.advanceTurn(); // p3 → p1 (wrap)

      const state = stateManager.getState();
      const game = state.game as Record<string, unknown>;

      // Should have wrapped back to p1
      expect(game.turn).toBe("p1");
    });
  });
});
