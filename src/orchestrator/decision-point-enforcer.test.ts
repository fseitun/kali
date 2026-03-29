import { describe, it, expect, beforeEach, vi } from "vitest";
import { DecisionPointEnforcer } from "./decision-point-enforcer";
import { GamePhase } from "./types";
import type { ExecutionContext } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { setLocale } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import { StateManager } from "@/state-manager";

describe("DecisionPointEnforcer", () => {
  let decisionPointEnforcer: DecisionPointEnforcer;
  let stateManager: StateManager;
  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockSetState: ReturnType<typeof vi.fn>;
  let mockSetLastNarration: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setLocale("en-US");
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
        squares: {},
      },
    });

    mockSpeak = vi.fn().mockResolvedValue(undefined);
    mockSetState = vi.fn();
    mockSetLastNarration = vi.fn();
    decisionPointEnforcer = new DecisionPointEnforcer(
      stateManager,
      { speak: mockSpeak } as unknown as ISpeechService,
      { setState: mockSetState } as unknown as IStatusIndicator,
      mockSetLastNarration as unknown as (text: string) => void,
    );
  });

  describe("enforceDecisionPoints()", () => {
    const baseContext: ExecutionContext = {};

    it("should do nothing when no decision points exist", async () => {
      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("should do nothing when no current turn set", async () => {
      stateManager.set("game.turn", null);
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("should do nothing when current player not at decision point", async () => {
      stateManager.set("board.squares", {
        "10": { next: [11, 12], prev: [9] },
      });
      stateManager.set("players.p1.position", 5);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("should do nothing when decision already filled", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.activeChoices", { 5: 6 });

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("should speak fork prompt when decision pending", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.activeChoices", {});

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const spoken = mockSpeak.mock.calls[0][0] as string;
      expect(spoken).toContain("Alice");
      expect(spoken).toMatch(/6|7/);
      expect(mockSetLastNarration).toHaveBeenCalledWith(spoken);
      expect(mockSetState).toHaveBeenCalledWith("speaking");
    });

    it("does not enforce fork when powerCheck is pending for current player (roll first)", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.activeChoices", {});
      stateManager.set("game.pending", {
        kind: "powerCheck",
        playerId: "p1",
        position: 5,
        power: 3,
        riddleCorrect: false,
        phase: "powerCheck",
      });

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("does not enforce fork when revenge is pending for current player", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.activeChoices", {});
      stateManager.set("game.pending", {
        kind: "revenge",
        playerId: "p1",
        position: 5,
        power: 3,
        phase: "revenge",
      });

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("should handle multiple decision points (only enforce current position)", async () => {
      stateManager.set("board.squares", {
        "3": { next: [4, 5], prev: [2] },
        "5": { next: [6, 7], prev: [4] },
        "10": { next: [11, 12], prev: [9] },
      });
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.activeChoices", {});

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).toHaveBeenCalledTimes(1);
      expect(mockSpeak.mock.calls[0][0] as string).toMatch(/6|7/);
    });

    it("should handle missing player gracefully", async () => {
      stateManager.set("game.turn", "p99");
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("should handle player without position field", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });
      const player = stateManager.get("players.p1") as Record<string, unknown>;
      delete player.position;
      stateManager.set("players.p1", player);

      await decisionPointEnforcer.enforceDecisionPoints(baseContext);

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6, 7], prev: [4] },
      });
      stateManager.set("players.p1.position", 5);
      stateManager.set("players.p1.activeChoices", {});

      mockSpeak.mockRejectedValue(new Error("Test error"));

      await expect(decisionPointEnforcer.enforceDecisionPoints(baseContext)).resolves.not.toThrow();
    });
  });
});
