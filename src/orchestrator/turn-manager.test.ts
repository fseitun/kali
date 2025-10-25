import { describe, it, expect, beforeEach } from "vitest";
import { StateManager } from "../state-manager";
import { TurnManager } from "./turn-manager";
import { GamePhase } from "./types";
import type { GameState } from "./types";

describe("TurnManager", () => {
  let turnManager: TurnManager;
  let stateManager: StateManager;

  beforeEach(() => {
    // Use real StateManager (fast, in-memory, no IndexedDB)
    stateManager = new StateManager();
    stateManager.init({
      game: {
        name: "Test Game",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1", "p2", "p3"],
        winner: null,
        lastRoll: null,
      },
      players: {
        p1: { id: "p1", name: "Alice", position: 0 },
        p2: { id: "p2", name: "Bob", position: 5 },
        p3: { id: "p3", name: "Carol", position: 10 },
      },
      board: {
        moves: {},
        squares: {},
      },
      decisionPoints: [],
    });

    turnManager = new TurnManager(stateManager);
  });

  describe("hasPendingDecisions()", () => {
    it("should return false when no decision points exist", () => {
      const result = turnManager.hasPendingDecisions();
      expect(result).toBe(false);
    });

    it("should return false when player not at decision point position", () => {
      stateManager.set("decisionPoints", [
        { position: 10, requiredField: "pathChoice", prompt: "Choose path" },
      ]);
      stateManager.set("players.p1.position", 5);

      const result = turnManager.hasPendingDecisions();
      expect(result).toBe(false);
    });

    it("should return true when player at decision point with null field", () => {
      stateManager.set("decisionPoints", [
        { position: 5, requiredField: "pathChoice", prompt: "Choose path" },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      const result = turnManager.hasPendingDecisions();
      expect(result).toBe(true);
    });

    it("should return true when player at decision point with undefined field", () => {
      stateManager.set("decisionPoints", [
        { position: 5, requiredField: "pathChoice", prompt: "Choose path" },
      ]);
      stateManager.set("players.p1.position", 5);
      // Field is undefined (not set)

      const result = turnManager.hasPendingDecisions();
      expect(result).toBe(true);
    });

    it("should return false when decision point field is filled", () => {
      stateManager.set("decisionPoints", [
        { position: 5, requiredField: "pathChoice", prompt: "Choose path" },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", "A");

      const result = turnManager.hasPendingDecisions();
      expect(result).toBe(false);
    });

    it("should return false when no current turn set", () => {
      stateManager.set("game.turn", null);
      stateManager.set("decisionPoints", [
        { position: 5, requiredField: "pathChoice", prompt: "Choose path" },
      ]);

      const result = turnManager.hasPendingDecisions();
      expect(result).toBe(false);
    });

    it("should handle malformed state gracefully", () => {
      // No players object
      stateManager.setState({
        game: { phase: GamePhase.PLAYING, turn: "p1" },
      } as unknown as GameState);

      const result = turnManager.hasPendingDecisions();
      expect(result).toBe(false);
    });
  });

  describe("advanceTurn()", () => {
    it("should advance to next player successfully", async () => {
      const result = await turnManager.advanceTurn(false);

      expect(result).toEqual({
        playerId: "p2",
        name: "Bob",
        position: 5,
      });

      // Verify state was updated
      const state = stateManager.getState();
      expect((state.game as Record<string, unknown>).turn).toBe("p2");
    });

    it("should wrap around from last to first player", async () => {
      stateManager.set("game.turn", "p3");

      const result = await turnManager.advanceTurn(false);

      expect(result).toEqual({
        playerId: "p1",
        name: "Alice",
        position: 0,
      });
      expect(
        (stateManager.getState().game as Record<string, unknown>).turn,
      ).toBe("p1");
    });

    it("should return null when game has winner", async () => {
      stateManager.set("game.winner", "p1");

      const result = await turnManager.advanceTurn(false);

      expect(result).toBeNull();
      // Turn should not have changed
      expect(
        (stateManager.getState().game as Record<string, unknown>).turn,
      ).toBe("p1");
    });

    it("should return null when not in PLAYING phase", async () => {
      stateManager.set("game.phase", GamePhase.SETUP);

      const result = await turnManager.advanceTurn(false);

      expect(result).toBeNull();
    });

    it("should return null when phase is FINISHED", async () => {
      stateManager.set("game.phase", GamePhase.FINISHED);

      const result = await turnManager.advanceTurn(false);

      expect(result).toBeNull();
    });

    it("should return null when no current turn set", async () => {
      stateManager.set("game.turn", null);

      const result = await turnManager.advanceTurn(false);

      expect(result).toBeNull();
    });

    it("should return null when no player order exists", async () => {
      stateManager.set("game.playerOrder", []);

      const result = await turnManager.advanceTurn(false);

      expect(result).toBeNull();
    });

    it("should block when square effect is processing", async () => {
      const result = await turnManager.advanceTurn(true); // isProcessingSquareEffect = true

      expect(result).toBeNull();
      // Turn should not have changed
      expect(
        (stateManager.getState().game as Record<string, unknown>).turn,
      ).toBe("p1");
    });

    it("should block when current player has pending decisions", async () => {
      stateManager.set("decisionPoints", [
        { position: 0, requiredField: "pathChoice", prompt: "Choose path" },
      ]);
      stateManager.set("players.p1.position", 0);
      stateManager.set("players.p1.pathChoice", null);

      const result = await turnManager.advanceTurn(false);

      expect(result).toBeNull();
      // Turn should not have changed
      expect(
        (stateManager.getState().game as Record<string, unknown>).turn,
      ).toBe("p1");
    });

    it("should allow advancement when decision is resolved", async () => {
      stateManager.set("decisionPoints", [
        { position: 0, requiredField: "pathChoice", prompt: "Choose path" },
      ]);
      stateManager.set("players.p1.position", 0);
      stateManager.set("players.p1.pathChoice", "A"); // Decision filled

      const result = await turnManager.advanceTurn(false);

      expect(result).not.toBeNull();
      expect(result?.playerId).toBe("p2");
    });

    it("should return correct player data (id, name, position)", async () => {
      const result = await turnManager.advanceTurn(false);

      expect(result).toHaveProperty("playerId");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("position");
      expect(result?.playerId).toBe("p2");
      expect(result?.name).toBe("Bob");
      expect(result?.position).toBe(5);
    });

    it("should handle missing player gracefully", async () => {
      // Set turn to non-existent player
      stateManager.set("game.playerOrder", ["p1", "p99"]);
      stateManager.set("game.turn", "p1");

      const result = await turnManager.advanceTurn(false);

      // Should still advance, but might have undefined values
      expect(result?.playerId).toBe("p99");
    });
  });

  describe("assertPlayerTurnOwnership()", () => {
    it("should allow mutation when path matches current player", async () => {
      await expect(
        turnManager.assertPlayerTurnOwnership("players.p1.position"),
      ).resolves.not.toThrow();
    });

    it("should throw error when path targets different player", async () => {
      await expect(
        turnManager.assertPlayerTurnOwnership("players.p2.position"),
      ).rejects.toThrow(/Turn ownership violation/);
    });

    it("should allow non-player paths", async () => {
      await expect(
        turnManager.assertPlayerTurnOwnership("game.lastRoll"),
      ).resolves.not.toThrow();

      await expect(
        turnManager.assertPlayerTurnOwnership("board.moves"),
      ).resolves.not.toThrow();
    });

    it("should handle malformed paths gracefully", async () => {
      // Path too short
      await expect(
        turnManager.assertPlayerTurnOwnership("players"),
      ).resolves.not.toThrow();

      // Empty path
      await expect(
        turnManager.assertPlayerTurnOwnership(""),
      ).resolves.not.toThrow();
    });

    it("should allow when no current turn set", async () => {
      stateManager.set("game.turn", null);

      await expect(
        turnManager.assertPlayerTurnOwnership("players.p2.position"),
      ).resolves.not.toThrow();
    });

    it("should include player IDs in error message", async () => {
      await expect(async () => {
        await turnManager.assertPlayerTurnOwnership("players.p3.position");
      }).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining("p3"),
        }),
      );

      await expect(async () => {
        await turnManager.assertPlayerTurnOwnership("players.p3.position");
      }).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining("p1"),
        }),
      );

      await expect(async () => {
        await turnManager.assertPlayerTurnOwnership("players.p3.position");
      }).rejects.toThrow(/Turn ownership violation/);
    });
  });
});
