import { describe, it, expect, beforeEach, vi } from "vitest";
import { StateManager } from "../state-manager";
import { BoardEffectsHandler } from "./board-effects-handler";
import { GamePhase } from "./types";
import type { ExecutionContext } from "./types";

describe("BoardEffectsHandler", () => {
  let boardEffectsHandler: BoardEffectsHandler;
  let stateManager: StateManager;
  let mockProcessTranscript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stateManager = new StateManager();
    stateManager.init({
      game: {
        name: "Test Game",
        phase: GamePhase.PLAYING,
        turn: "p1",
        playerOrder: ["p1", "p2"],
        winner: null,
        lastRoll: null,
      },
      players: {
        p1: { id: "p1", name: "Alice", position: 0 },
        p2: { id: "p2", name: "Bob", position: 0 },
      },
      board: {
        moves: {},
        squares: {},
      },
      decisionPoints: [],
    });

    mockProcessTranscript = vi.fn().mockResolvedValue(true);
    boardEffectsHandler = new BoardEffectsHandler(
      stateManager,
      mockProcessTranscript,
    );
  });

  describe("checkAndApplyBoardMoves()", () => {
    it("should do nothing for non-position paths", async () => {
      stateManager.set("board.moves", { "5": 12 });
      stateManager.set("players.p1.hearts", 3);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.hearts");

      // Hearts should not have changed
      expect(stateManager.get("players.p1.hearts")).toBe(3);
    });

    it("should do nothing for non-player paths", async () => {
      stateManager.set("board.moves", { "5": 12 });
      stateManager.set("game.lastRoll", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("game.lastRoll");

      expect(stateManager.get("game.lastRoll")).toBe(5);
    });

    it("should do nothing when no board.moves config exists", async () => {
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Position should not have changed
      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should apply ladder move (destination > current position)", async () => {
      stateManager.set("board.moves", { "5": 15 }); // Ladder from 5 to 15
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Position should have moved to ladder destination
      expect(stateManager.get("players.p1.position")).toBe(15);
    });

    it("should apply snake move (destination < current position)", async () => {
      stateManager.set("board.moves", { "15": 5 }); // Snake from 15 to 5
      stateManager.set("players.p1.position", 15);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Position should have moved to snake destination
      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should do nothing when no move exists for position", async () => {
      stateManager.set("board.moves", { "10": 20 });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Position should not have changed
      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should do nothing when destination equals current position", async () => {
      stateManager.set("board.moves", { "5": 5 }); // Same position
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Position should not have changed (no move applied)
      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should handle position value that is not a number", async () => {
      stateManager.set("board.moves", { "5": 15 });
      stateManager.set("players.p1.position", "invalid" as unknown as number);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Should not crash, position stays as-is
      expect(stateManager.get("players.p1.position")).toBe("invalid");
    });
  });

  describe("checkAndApplySquareEffects()", () => {
    const baseContext: ExecutionContext = { depth: 0, maxDepth: 5 };

    it("should do nothing for non-position paths", async () => {
      stateManager.set("board.squares", {
        "5": { type: "encounter", name: "Bear" },
      });

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.hearts",
        baseContext,
      );

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing for non-player paths", async () => {
      stateManager.set("board.squares", {
        "5": { type: "encounter", name: "Bear" },
      });

      await boardEffectsHandler.checkAndApplySquareEffects(
        "game.lastRoll",
        baseContext,
      );

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when no board.squares config exists", async () => {
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when square has no effect data", async () => {
      stateManager.set("board.squares", {});
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when square has empty effect data", async () => {
      stateManager.set("board.squares", { "5": {} });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should trigger processTranscript callback for square with effects", async () => {
      const squareData = {
        type: "encounter",
        name: "Bear",
        difficulty: "hard",
      };
      stateManager.set("board.squares", { "10": squareData });
      stateManager.set("players.p1.position", 10);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(mockProcessTranscript).toHaveBeenCalledTimes(1);
    });

    it("should set isProcessingSquareEffect flag during processing", async () => {
      const squareData = { type: "encounter", name: "Bear" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      let flagDuringProcessing = false;
      mockProcessTranscript.mockImplementation(async () => {
        flagDuringProcessing = boardEffectsHandler.isProcessingEffect();
        return true;
      });

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(flagDuringProcessing).toBe(true);
    });

    it("should clear flag after processing completes", async () => {
      const squareData = { type: "encounter", name: "Bear" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("should clear flag even if processTranscript throws error", async () => {
      const squareData = { type: "encounter", name: "Bear" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      mockProcessTranscript.mockRejectedValue(new Error("Test error"));

      await expect(
        boardEffectsHandler.checkAndApplySquareEffects(
          "players.p1.position",
          baseContext,
        ),
      ).rejects.toThrow("Test error");

      // Flag should still be cleared
      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("should pass correct context depth (depth + 1)", async () => {
      const squareData = { type: "encounter", name: "Bear" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        { depth: 2, maxDepth: 5 },
      );

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining(
          "[SYSTEM: Current player just landed on square 5",
        ),
        { depth: 3, maxDepth: 5 },
      );
    });

    it("should skip processing when approaching max depth", async () => {
      const squareData = { type: "encounter", name: "Bear" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        { depth: 4, maxDepth: 5 },
      );

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should include square data in synthetic transcript", async () => {
      const squareData = {
        type: "encounter",
        name: "Bear",
        difficulty: "hard",
      };
      stateManager.set("board.squares", { "8": squareData });
      stateManager.set("players.p1.position", 8);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("square 8"),
        expect.anything(),
      );
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(squareData)),
        expect.anything(),
      );
    });

    it("should handle position value that is not a number", async () => {
      stateManager.set("board.squares", { "5": { type: "encounter" } });
      stateManager.set("players.p1.position", "invalid" as unknown as number);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        baseContext,
      );

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });
  });

  describe("isProcessingEffect()", () => {
    it("should return false initially", () => {
      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("should return true during effect processing", async () => {
      const squareData = { type: "encounter", name: "Bear" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      let statusDuringProcessing = false;
      mockProcessTranscript.mockImplementation(async () => {
        statusDuringProcessing = boardEffectsHandler.isProcessingEffect();
        return true;
      });

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        { depth: 0, maxDepth: 5 },
      );

      expect(statusDuringProcessing).toBe(true);
    });

    it("should return false after processing completes", async () => {
      const squareData = { type: "encounter", name: "Bear" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects(
        "players.p1.position",
        { depth: 0, maxDepth: 5 },
      );

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });
  });
});
