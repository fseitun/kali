import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoardEffectsHandler } from "./board-effects-handler";
import { GamePhase } from "./types";
import type { ExecutionContext } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { setLocale } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import { StateManager } from "@/state-manager";

describe("BoardEffectsHandler", () => {
  let boardEffectsHandler: BoardEffectsHandler;
  let stateManager: StateManager;
  let mockProcessTranscript: ReturnType<typeof vi.fn>;
  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockIndicator: { setState: ReturnType<typeof vi.fn> };
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

    mockProcessTranscript = vi.fn().mockResolvedValue(true);
    mockSpeak = vi.fn().mockResolvedValue(undefined);
    mockIndicator = { setState: vi.fn() };
    mockSetLastNarration = vi.fn();
    boardEffectsHandler = new BoardEffectsHandler(
      stateManager,
      mockProcessTranscript as unknown as (
        transcript: string,
        context: ExecutionContext,
      ) => Promise<boolean>,
      { speak: mockSpeak } as unknown as ISpeechService,
      mockIndicator as unknown as IStatusIndicator,
      mockSetLastNarration as unknown as (text: string) => void,
    );
  });

  describe("checkAndApplyBoardMoves()", () => {
    it("should do nothing for non-position paths", async () => {
      stateManager.set("board.squares", { "5": { destination: 12 } });
      stateManager.set("players.p1.hearts", 3);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.hearts");

      // Hearts should not have changed
      expect(stateManager.get("players.p1.hearts")).toBe(3);
    });

    it("should do nothing for non-player paths", async () => {
      stateManager.set("board.squares", { "5": { destination: 12 } });
      stateManager.set("game.lastRoll", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("game.lastRoll");

      expect(stateManager.get("game.lastRoll")).toBe(5);
    });

    it("should do nothing when no board.squares config exists", async () => {
      stateManager.set("board", {});
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Position should not have changed
      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should apply ladder (portal forward)", async () => {
      stateManager.set("board.squares", {
        "5": { destination: 15 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(15);
    });

    it("should apply snake (portal backward)", async () => {
      stateManager.set("board.squares", {
        "15": { destination: 5 },
      });
      stateManager.set("players.p1.position", 15);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should apply returnTo187", async () => {
      stateManager.set("board.squares", {
        "190": { effect: "returnTo187", name: "Calavera" },
      });
      stateManager.set("players.p1.position", 190);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(187);
    });

    it("should not apply magic door bounce after returnTo187 teleport in the same resolution", async () => {
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
        "190": { effect: "returnTo187", name: "Calavera" },
        "196": { effect: "win" },
      });
      stateManager.set("players.p1.position", 190);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(stateManager.get("players.p1.position")).toBe(187);
      expect(context.magicDoorBounce).toBeUndefined();
    });

    it("should skip backward teleport when player has retreatEffectsReversed", async () => {
      stateManager.set("board.squares", {
        "82": { destination: 45 },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.retreatEffectsReversed", true);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Player stays at 82 (backward teleport skipped)
      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("should apply forward teleport even when retreatEffectsReversed", async () => {
      stateManager.set("board.squares", {
        "45": { destination: 82 },
      });
      stateManager.set("players.p1.position", 45);
      stateManager.set("players.p1.retreatEffectsReversed", true);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("should not skip backward teleport when retreatEffectsReversed is false", async () => {
      stateManager.set("board.squares", {
        "82": { destination: 45 },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.retreatEffectsReversed", false);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(45);
    });

    it("should apply portal teleport when square has nextOnLanding (e.g. Forest-Ocean portal 45→82)", async () => {
      stateManager.set("board.squares", {
        "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "82": { next: [83], prev: [81], name: "Ocean-Forest Portal", nextOnLanding: [45] },
      });
      stateManager.set("players.p1.position", 45);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("Kalimba ocean-forest portal (82): first landing slides to 45, sets flags, suppresses 45→82 chain", async () => {
      stateManager.set("board.squares", {
        "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "82": {
          next: [83],
          prev: [81],
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.oceanForestPenaltyConsumed", false);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(stateManager.get("players.p1.oceanForestPenaltyConsumed")).toBe(true);
      expect(stateManager.get("players.p1.retreatEffectsReversed")).toBe(true);
      expect(context.suppressNextOnLandingAtPosition).toBe(45);
    });

    it("Kalimba ocean-forest portal suppression blocks immediate 45→82 bounce in same resolution context", async () => {
      stateManager.set("board.squares", {
        "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "82": {
          next: [83],
          prev: [81],
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.oceanForestPenaltyConsumed", false);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);
      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(context.suppressNextOnLandingAtPosition).toBe(45);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);
      expect(stateManager.get("players.p1.position")).toBe(45);
    });

    it("Kalimba ocean-forest portal (82): after penalty consumed, further landings on 82 stay", async () => {
      stateManager.set("board.squares", {
        "82": {
          next: [83],
          prev: [81],
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.oceanForestPenaltyConsumed", true);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("Kalimba ocean-forest portal (82): retreatEffectsReversed skips slide but still consumes penalty + retreat flip", async () => {
      stateManager.set("board.squares", {
        "82": {
          next: [83],
          prev: [81],
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.retreatEffectsReversed", true);
      stateManager.set("players.p1.oceanForestPenaltyConsumed", false);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(82);
      expect(stateManager.get("players.p1.oceanForestPenaltyConsumed")).toBe(true);
      expect(stateManager.get("players.p1.retreatEffectsReversed")).toBe(true);
    });

    it("should set arrivedViaTeleportFrom when applying ladder and context is passed", async () => {
      stateManager.set("board.squares", {
        "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "82": { next: [83], prev: [81], name: "Ocean-Forest Portal", nextOnLanding: [45] },
      });
      stateManager.set("players.p1.position", 45);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(stateManager.get("players.p1.position")).toBe(82);
      expect(context.arrivedViaTeleportFrom).toBe(45);
    });

    it("should do nothing when square has no teleport", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6], prev: [4] },
        "10": { destination: 20 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should do nothing when destination equals current position", async () => {
      stateManager.set("board.squares", {
        "5": { destination: 5 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("should handle position value that is not a number", async () => {
      stateManager.set("board.squares", { "5": { destination: 15 } });
      stateManager.set("players.p1.position", "invalid" as unknown as number);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe("invalid");
    });

    it("should apply jumpToLeader (goldenFox) - move to leader position", async () => {
      stateManager.set("board.squares", {
        "54": { effect: "jumpToLeader", name: "Zorro dorado" },
      });
      stateManager.set("game.playerOrder", ["p1", "p2"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 80);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(80);
    });

    it("should prefer jumpToLeader over nextOnLanding on the same square (misauthored config)", async () => {
      stateManager.set("board.squares", {
        "54": {
          effect: "jumpToLeader",
          name: "Zorro dorado",
          nextOnLanding: [99],
        },
      });
      stateManager.set("game.playerOrder", ["p1", "p2"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 80);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(80);
    });

    it("should set jumpToLeaderRelocated on context when fox moves the player", async () => {
      stateManager.set("board.squares", {
        "54": { effect: "jumpToLeader", name: "Zorro dorado" },
      });
      stateManager.set("game.playerOrder", ["p1", "p2"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 80);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(context.jumpToLeaderRelocated).toEqual({ toPosition: 80 });
    });

    it("should set magicDoorBounce on context when overshooting magic door", async () => {
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
        "196": { effect: "win" },
      });
      stateManager.set("players.p1.position", 188);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(stateManager.get("players.p1.position")).toBe(184);
      expect(context.magicDoorBounce).toEqual({
        playerId: "p1",
        doorPosition: 186,
        overshotPosition: 188,
        finalPosition: 184,
      });
    });

    it("should not set magicDoorBounce on nested calls", async () => {
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
        "196": { effect: "win" },
      });
      stateManager.set("players.p1.position", 188);
      const context: ExecutionContext = { isNestedCall: true };

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(stateManager.get("players.p1.position")).toBe(184);
      expect(context.magicDoorBounce).toBeUndefined();
    });

    it("should keep position when jumpToLeader but current player is already leader", async () => {
      stateManager.set("board.squares", {
        "54": { effect: "jumpToLeader", name: "Zorro dorado" },
      });
      stateManager.set("game.playerOrder", ["p1", "p2"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 30);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(54);
    });

    it("should move jumper through square 82 portal (82→45) and leave other players on 82", async () => {
      stateManager.set("board.squares", {
        "45": { name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "54": { effect: "jumpToLeader", name: "Zorro dorado" },
        "82": {
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("game.playerOrder", ["p1", "p2"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 82);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(stateManager.get("players.p2.position")).toBe(82);
      expect(stateManager.get("players.p1.oceanForestPenaltyConsumed")).toBe(true);
      expect(stateManager.get("players.p1.retreatEffectsReversed")).toBe(true);
    });

    it("should leave every occupant on 82 when jumpToLeader resolves ocean portal (multi-player)", async () => {
      stateManager.set("board.squares", {
        "45": { name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "54": { effect: "jumpToLeader", name: "Zorro dorado" },
        "82": {
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("game.playerOrder", ["p1", "p2", "p3"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 82);
      stateManager.set("players.p3.position", 82);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(stateManager.get("players.p2.position")).toBe(82);
      expect(stateManager.get("players.p3.position")).toBe(82);
    });
  });

  describe("checkAndApplySquareEffects()", () => {
    const baseContext: ExecutionContext = {};

    it("should do nothing for non-position paths", async () => {
      stateManager.set("board.squares", {
        "5": { name: "Bear", power: 1 },
      });

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.hearts", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing for non-player paths", async () => {
      stateManager.set("board.squares", {
        "5": { name: "Bear", power: 1 },
      });

      await boardEffectsHandler.checkAndApplySquareEffects("game.lastRoll", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when no board.squares config exists", async () => {
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when square has no effect data", async () => {
      stateManager.set("board.squares", {});
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing when square has empty effect data", async () => {
      stateManager.set("board.squares", { "5": {} });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("should do nothing for hydrated topology-only squares", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6], prev: [4] },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("animal encounter speaks deterministic prompt and sets pending riddle", async () => {
      const squareData = {
        name: "Bear",
        power: 1,
        difficulty: "hard",
      };
      stateManager.set("board.squares", { "10": squareData });
      stateManager.set("players.p1.position", 10);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      expect(stateManager.get("game.pending")).toMatchObject({
        kind: "riddle",
        position: 10,
        power: 1,
        playerId: "p1",
      });
    });

    it("should set isProcessingSquareEffect flag during processing", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      let flagDuringProcessing = false;
      mockSpeak.mockImplementation(async () => {
        flagDuringProcessing = boardEffectsHandler.isProcessingEffect();
        return undefined;
      });

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(flagDuringProcessing).toBe(true);
    });

    it("should clear flag after processing completes", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("should clear flag even if deterministic speak throws error", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      mockSpeak.mockRejectedValue(new Error("Test error"));

      await expect(
        boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext),
      ).rejects.toThrow("Test error");

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("should clear flag even if deterministic speak throws error", async () => {
      const squareData = { name: "Quicksand", effect: "skipTurn" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      mockSpeak.mockRejectedValue(new Error("TTS error"));

      await expect(
        boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext),
      ).rejects.toThrow("TTS error");

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("deterministic squares do not call processTranscript (nested LLM)", async () => {
      const squareData = { name: "Quicksand", effect: "skipTurn" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/square 5|Quicksand|skip/i));
    });

    it("magic door landing uses dedicated copy, next player name, hearts, no nested LLM", async () => {
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
      });
      stateManager.set("players.p1.position", 186);
      stateManager.set("players.p1.hearts", 2);
      stateManager.set("game.turn", "p1");

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const text = String(mockSpeak.mock.calls[0]?.[0] ?? "");
      expect(text).toMatch(/186|magic door/i);
      expect(text).toMatch(/Bob/);
      expect(text).toMatch(/heart/i);
      expect(text).toMatch(/4|die/i);
    });

    it("magic door landing with scimitar uses lower min die in copy", async () => {
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
      });
      stateManager.set("players.p1.position", 186);
      stateManager.set("players.p1.hearts", 1);
      stateManager.set("players.p1.items", ["scimitar"]);
      stateManager.set("game.turn", "p1");

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      const text = String(mockSpeak.mock.calls[0]?.[0] ?? "");
      expect(text).toMatch(/scimitar/i);
      expect(text).toMatch(/at least a 4/i);
    });

    it("stores deterministic question data in pending state", async () => {
      const squareData = {
        name: "Bear",
        power: 1,
        difficulty: "hard",
      };
      stateManager.set("board.squares", { "8": squareData });
      stateManager.set("players.p1.position", 8);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(stateManager.get("game.pending")).toMatchObject({
        kind: "riddle",
        position: 8,
        power: 1,
        playerId: "p1",
      });
    });

    it("animal squares get narration only, no rewards on landing (orchestrator applies after power check)", async () => {
      stateManager.set("board.squares", {
        "5": { name: "Halcón", power: 3 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      expect(stateManager.get("game.pending")).toMatchObject({
        kind: "riddle",
        position: 5,
        power: 3,
        playerId: "p1",
      });
      const spoken = String(mockSpeak.mock.calls[0]?.[0] ?? "");
      expect(spoken).toMatch(/Options|Decime|Tell me/i);
    });

    it("trap squares apply skipTurn and request narration", async () => {
      stateManager.set("board.squares", {
        "10": { name: "Quicksand", effect: "skipTurn" },
      });
      stateManager.set("players.p2.position", 10);
      stateManager.set("players.p2.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p2.position", baseContext);

      expect(stateManager.get("players.p2.skipTurns")).toBe(1);
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringMatching(/Quicksand|skip your next turn/i),
      );
    });

    it("clears pendingAnimalEncounter when applying hazard (non-animal) square effect", async () => {
      stateManager.set("board.squares", {
        "18": { name: "Plantas carnívoras", effect: "skipTurn" },
      });
      stateManager.set("players.p1.position", 18);
      stateManager.set("players.p1.skipTurns", 0);
      stateManager.set("game.pending", {
        kind: "riddle",
        position: 16,
        power: 1,
        playerId: "p1",
      });

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("game.pending")).toBeNull();
      expect(stateManager.get("players.p1.skipTurns")).toBe(1);
    });

    it("should apply skipTurn effect from square config", async () => {
      stateManager.set("board.squares", {
        "11": {
          name: "Arenas movedizas",
          effect: "skipTurn",
        },
      });
      stateManager.set("players.p1.position", 11);
      stateManager.set("players.p1.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.skipTurns")).toBe(1);
    });

    it("protectionItem and heart squares add item immediately", async () => {
      stateManager.set("board.squares", {
        "63": { item: "anti-wasp" },
      });
      stateManager.set("players.p1.position", 63);
      stateManager.set("players.p1.items", []);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual(["anti-wasp"]);
    });

    it("heart square (Cimitarra) adds scimitar item immediately", async () => {
      stateManager.set("board.squares", {
        "176": { item: "scimitar" },
      });
      stateManager.set("players.p1.position", 176);
      stateManager.set("players.p1.items", []);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual(["scimitar"]);
    });

    it("scimitar pickup speech includes magic door hint with configured target", async () => {
      stateManager.set("board.squares", {
        "176": { item: "scimitar" },
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
      });
      stateManager.set("players.p1.position", 176);
      stateManager.set("players.p1.items", []);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      const text = String(mockSpeak.mock.calls[0]?.[0] ?? "");
      expect(text).toMatch(/scimitar|extra point|magic door/i);
      expect(text).toMatch(/6/);
    });

    it("Eagle (animal + extra power dice) sets pending encounter; no rewards on landing", async () => {
      stateManager.set("board.squares", {
        "7": {
          name: "Eagle",
          power: 3,
          powerCheckDiceIfRiddleCorrect: 3,
          powerCheckDiceIfRiddleWrong: 2,
        },
      });
      stateManager.set("players.p1.position", 7);
      stateManager.set("players.p1.instruments", []);
      stateManager.set("game.turn", "p1");

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.instruments")).toEqual([]);
      expect(stateManager.get("game.pending")).toMatchObject({
        kind: "riddle",
        position: 7,
        power: 3,
        playerId: "p1",
      });
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });

    it("rollDirectional squares trigger narration only (no deterministic effects)", async () => {
      stateManager.set("board.squares", {
        "55": {
          name: "Jivaro Indians",
          effect: "retreat2d6",
        },
      });
      stateManager.set("players.p1.position", 55);
      stateManager.set("players.p1.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.skipTurns")).toBe(0);
      expect(stateManager.get("game.pending")).toMatchObject({
        kind: "directional",
        playerId: "p1",
        position: 55,
        dice: 2,
      });
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringMatching(/Jivaro Indians|Roll 2|two|dice/i),
      );
    });

    it("repeat visit to ocean-forest one-shot portal uses short transcript when penalty already consumed", async () => {
      stateManager.set("board.squares", {
        "82": {
          next: [83],
          prev: [81],
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.oceanForestPenaltyConsumed", true);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringMatching(/Ocean-Forest Portal|already|crossed|stay/i),
      );
    });

    it("portal at 82 when arrived from 45: no choice, stay, narrate briefly only", async () => {
      stateManager.set("board.squares", {
        "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "82": {
          next: [83],
          prev: [81],
          habitat: "ocean",
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
      });
      stateManager.set("players.p1.position", 82);
      const context: ExecutionContext = { arrivedViaTeleportFrom: 45 };

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", context);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/45|portal|stay|Alice/i));
    });

    it("checkTorch hazard applies skipTurn when player has no torch", async () => {
      stateManager.set("board.squares", {
        "85": { name: "Night falls", effect: "checkTorch" },
      });
      stateManager.set("players.p1.position", 85);
      stateManager.set("players.p1.items", []);
      stateManager.set("players.p1.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.skipTurns")).toBe(1);
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/skip your next turn|torch/i));
    });

    it("checkTorch hazard consumes torch and does not apply skipTurn when player has torch", async () => {
      stateManager.set("board.squares", {
        "85": { name: "Night falls", effect: "checkTorch" },
      });
      stateManager.set("players.p1.position", 85);
      stateManager.set("players.p1.items", ["torch"]);
      stateManager.set("players.p1.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual([]);
      expect(stateManager.get("players.p1.skipTurns")).toBe(0);
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/torch|skip/i));
    });

    it("checkAntiWasp hazard applies skipTurn when player has no anti-wasp", async () => {
      stateManager.set("board.squares", {
        "116": { name: "Wasps", effect: "checkAntiWasp" },
      });
      stateManager.set("players.p1.position", 116);
      stateManager.set("players.p1.items", []);
      stateManager.set("players.p1.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.skipTurns")).toBe(1);
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/anti-wasp|skip/i));
    });

    it("checkAntiWasp hazard consumes anti-wasp and does not apply skipTurn when player has it", async () => {
      stateManager.set("board.squares", {
        "116": { name: "Wasps", effect: "checkAntiWasp" },
      });
      stateManager.set("players.p1.position", 116);
      stateManager.set("players.p1.items", ["anti-wasp"]);
      stateManager.set("players.p1.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual([]);
      expect(stateManager.get("players.p1.skipTurns")).toBe(0);
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/anti-wasp|suit|skip/i));
    });

    it("torch protectionItem square adds torch item immediately", async () => {
      stateManager.set("board.squares", {
        "79": { item: "torch" },
      });
      stateManager.set("players.p1.position", 79);
      stateManager.set("players.p1.items", []);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual(["torch"]);
    });

    it("should handle position value that is not a number", async () => {
      stateManager.set("board.squares", { "5": { name: "Bear", power: 1 } });
      stateManager.set("players.p1.position", "invalid" as unknown as number);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });
  });

  describe("isProcessingEffect()", () => {
    it("should return false initially", () => {
      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("should return true during effect processing", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      let statusDuringProcessing = false;
      mockSpeak.mockImplementation(async () => {
        statusDuringProcessing = boardEffectsHandler.isProcessingEffect();
        return undefined;
      });

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", {});

      expect(statusDuringProcessing).toBe(true);
    });

    it("should return false after processing completes", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", {});

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });
  });
});
