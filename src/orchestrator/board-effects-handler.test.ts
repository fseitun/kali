import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoardEffectsHandler } from "./board-effects-handler";
import { GamePhase } from "./types";
import type { ExecutionContext } from "./types";
import { StateManager } from "@/state-manager";

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
        squares: {},
      },
    });

    mockProcessTranscript = vi.fn().mockResolvedValue(true);
    boardEffectsHandler = new BoardEffectsHandler(
      stateManager,
      mockProcessTranscript as unknown as (
        transcript: string,
        context: ExecutionContext,
      ) => Promise<boolean>,
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

    it("should skip backward teleport when player has inverseMode", async () => {
      stateManager.set("board.squares", {
        "82": { destination: 45 },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.inverseMode", true);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Player stays at 82 (backward teleport skipped)
      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("should apply forward teleport even when inverseMode", async () => {
      stateManager.set("board.squares", {
        "45": { destination: 82 },
      });
      stateManager.set("players.p1.position", 45);
      stateManager.set("players.p1.inverseMode", true);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(82);
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

    it("should trigger processTranscript callback for square with effects", async () => {
      const squareData = {
        name: "Bear",
        power: 1,
        difficulty: "hard",
      };
      stateManager.set("board.squares", { "10": squareData });
      stateManager.set("players.p1.position", 10);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledTimes(1);
    });

    it("should set isProcessingSquareEffect flag during processing", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      let flagDuringProcessing = false;
      mockProcessTranscript.mockImplementation(async () => {
        flagDuringProcessing = boardEffectsHandler.isProcessingEffect();
        return true;
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

    it("should clear flag even if processTranscript throws error", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      mockProcessTranscript.mockRejectedValue(new Error("Test error"));

      await expect(
        boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext),
      ).rejects.toThrow("Test error");

      // Flag should still be cleared
      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("should pass isNestedCall: true when invoking processTranscript", async () => {
      const squareData = { name: "Quicksand", effect: "skipTurn" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("[SYSTEM: Current player just landed on square 5"),
        { isNestedCall: true },
      );
    });

    it("should include square data in synthetic transcript", async () => {
      const squareData = {
        name: "Bear",
        power: 1,
        difficulty: "hard",
      };
      stateManager.set("board.squares", { "8": squareData });
      stateManager.set("players.p1.position", 8);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("square 8"),
        expect.anything(),
      );
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(squareData)),
        expect.anything(),
      );
    });

    it("animal squares get narration only, no rewards on landing (orchestrator applies after power check)", async () => {
      stateManager.set("board.squares", {
        "5": { name: "Halcón", power: 3 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("ASK_RIDDLE"),
        expect.anything(),
      );
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringMatching(/four options|FOUR options/i),
        expect.anything(),
      );
      expect(stateManager.get("game.pending")).toMatchObject({
        kind: "riddle",
        position: 5,
        power: 3,
        playerId: "p1",
      });
      const transcript = mockProcessTranscript.mock.calls[0]?.[0] ?? "";
      expect(transcript).not.toContain("Orchestrator applied");
    });

    it("trap squares apply skipTurn and request narration", async () => {
      stateManager.set("board.squares", {
        "10": { name: "Quicksand", effect: "skipTurn" },
      });
      stateManager.set("players.p2.position", 10);
      stateManager.set("players.p2.skipTurns", 0);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p2.position", baseContext);

      expect(stateManager.get("players.p2.skipTurns")).toBe(1);
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("Orchestrator applied: skip next turn"),
        expect.anything(),
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
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("Animal encounter"),
        expect.anything(),
      );
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
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringMatching(/DIRECTIONAL ROLL|roll.*d6|Jivaro Indians/i),
        expect.anything(),
      );
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("Jivaro Indians"),
        expect.anything(),
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
          inverseMode: "deactivate",
        },
      });
      stateManager.set("players.p1.position", 82);
      const context: ExecutionContext = { arrivedViaTeleportFrom: 45 };

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", context);

      expect(mockProcessTranscript).toHaveBeenCalledTimes(1);
      const transcript = mockProcessTranscript.mock.calls[0]?.[0] ?? "";
      expect(transcript).toContain("arrived via the portal from square 45");
      expect(transcript).toContain("Do NOT offer any choice");
      expect(transcript).toContain("Do NOT ask questions");
      expect(transcript).toContain("Narrate briefly only");
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
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("skip next turn (no torch)"),
        expect.anything(),
      );
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
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("torch used (no skip)"),
        expect.anything(),
      );
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
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("skip next turn (no anti-wasp)"),
        expect.anything(),
      );
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
      expect(mockProcessTranscript).toHaveBeenCalledWith(
        expect.stringContaining("anti-wasp used (no skip)"),
        expect.anything(),
      );
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
      mockProcessTranscript.mockImplementation(async () => {
        statusDuringProcessing = boardEffectsHandler.isProcessingEffect();
        return true;
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
