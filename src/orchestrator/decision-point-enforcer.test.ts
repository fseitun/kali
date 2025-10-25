import { describe, it, expect, beforeEach, vi } from "vitest";
import { StateManager } from "../state-manager";
import { DecisionPointEnforcer } from "./decision-point-enforcer";
import { GamePhase } from "./types";
import type { ExecutionContext } from "./types";

describe("DecisionPointEnforcer", () => {
  let decisionPointEnforcer: DecisionPointEnforcer;
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
    decisionPointEnforcer = new DecisionPointEnforcer(
      stateManager,
      mockProcessTranscript,
    );
  });

  describe("enforceDecisionPoints()", () => {
    const baseContext: ExecutionContext = { depth: 0, maxDepth: 5 };

    it("should do nothing when no decision points exist", async () => {
      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when decision points array is empty", async () => {
      stateManager.set("decisionPoints", []);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when no current turn set", async () => {
      stateManager.set("game.turn", null);
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when current player not at decision point", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 10,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5); // Not at position 10

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when decision already filled", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", "A"); // Decision filled

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should trigger processTranscript when decision pending (null value)", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null); // Decision pending

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledTimes(1);
    });

    it("should trigger processTranscript when decision pending (undefined value)", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      // pathChoice is undefined (not set)

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledTimes(1);
    });

    it("should include correct prompt in synthetic transcript", async () => {
      const prompt = "Choose your path: Desert or Forest?";
      stateManager.set("decisionPoints", [
        { position: 5, requiredField: "pathChoice", prompt },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining(prompt),
        expect.anything(),
      );
    });

    it("should include player name in synthetic transcript", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.name", "Alice");
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("Alice"),
        expect.anything(),
      );
    });

    it("should include player ID in synthetic transcript", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("p1"),
        expect.anything(),
      );
    });

    it("should include position in synthetic transcript", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("position 5"),
        expect.anything(),
      );
    });

    it("should include required field name in synthetic transcript", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("pathChoice"),
        expect.anything(),
      );
    });

    it("should pass correct context depth (depth + 1)", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints({
        depth: 2,
        maxDepth: 5,
      });

      expect(mockProcessTranscript).toHaveBeenCalledWith(expect.any(String), {
        depth: 3,
        maxDepth: 5,
      });
    });

    it("should skip enforcement when approaching max depth", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints({
        depth: 4,
        maxDepth: 5,
      });

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should skip enforcement when at max depth", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints({
        depth: 5,
        maxDepth: 5,
      });

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should handle multiple decision points (only enforce current position)", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 3,
          requiredField: "pathChoice",
          prompt: "Choose path A or B",
        },
        {
          position: 5,
          requiredField: "toolChoice",
          prompt: "Choose tool X or Y",
        },
        {
          position: 10,
          requiredField: "directionChoice",
          prompt: "Go left or right",
        },
      ]);
      stateManager.set("players.p1.position", 5); // At position 5
      stateManager.set("players.p1.toolChoice", null);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledTimes(1);
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("toolChoice"),
        expect.anything(),
      );
    });

    it("should handle missing player gracefully", async () => {
      stateManager.set("game.turn", "p99"); // Non-existent player
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should handle player without position field", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      // Remove position field
      const player = stateManager.get("players.p1") as Record<string, unknown>;
      delete player.position;
      stateManager.set("players.p1", player);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      stateManager.set("decisionPoints", [
        {
          position: 5,
          requiredField: "pathChoice",
          prompt: "Choose your path",
        },
      ]);
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.pathChoice", null);

      mockProcessTranscript.mockRejectedValue(new Error("Test error"));

      // Should not throw, errors are caught internally
      await expect(
        decisionPointEnforcer.enforceDecisionPoints(baseContext),
      ).resolves.not.toThrow();
    });
  });
});
