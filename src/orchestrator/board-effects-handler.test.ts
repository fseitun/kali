import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoardEffectsHandler } from "./board-effects-handler";
import { GamePhase } from "./types";
import type { ExecutionContext } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { setLocale } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import { StateManager } from "@/state-manager";

describe("Product scenario: Board Effects Handler", () => {
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

  describe("Product scenario: Check And Apply Board Moves", () => {
    it("Expected outcome: Should do nothing for non position paths", async () => {
      stateManager.set("board.squares", { "5": { destination: 12 } });
      stateManager.set("players.p1.hearts", 3);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.hearts");

      // Hearts should not have changed
      expect(stateManager.get("players.p1.hearts")).toBe(3);
    });

    it("Expected outcome: Should do nothing for non player paths", async () => {
      stateManager.set("board.squares", { "5": { destination: 12 } });
      stateManager.set("game.lastRoll", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("game.lastRoll");

      expect(stateManager.get("game.lastRoll")).toBe(5);
    });

    it("Expected outcome: Should do nothing when no board squares config exists", async () => {
      stateManager.set("board", {});
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Position should not have changed
      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("Expected outcome: Should apply ladder (portal forward)", async () => {
      stateManager.set("board.squares", {
        "5": { destination: 15 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(15);
    });

    it("Expected outcome: Should apply snake (portal backward)", async () => {
      stateManager.set("board.squares", {
        "15": { destination: 5 },
      });
      stateManager.set("players.p1.position", 15);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("Expected outcome: Should apply return To187", async () => {
      stateManager.set("board.squares", {
        "190": { effect: "returnTo187", name: "Calavera" },
      });
      stateManager.set("players.p1.position", 190);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(187);
    });

    it("Expected outcome: Should not apply magic door bounce after return To187 teleport in the same resolution", async () => {
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

    it("Expected outcome: Should not apply magic door bounce after destination based backward teleport to 187", async () => {
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
        "190": { destination: 187, name: "Calavera" },
        "196": { effect: "win" },
      });
      stateManager.set("players.p1.position", 190);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(stateManager.get("players.p1.position")).toBe(187);
      expect(context.magicDoorBounce).toBeUndefined();
    });

    it("Expected outcome: Should skip backward teleport when player has retreat Effects Reversed", async () => {
      stateManager.set("board.squares", {
        "82": { destination: 45 },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.retreatEffectsReversed", true);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      // Player stays at 82 (backward teleport skipped)
      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("Expected outcome: Should apply forward teleport even when retreat Effects Reversed", async () => {
      stateManager.set("board.squares", {
        "45": { destination: 82 },
      });
      stateManager.set("players.p1.position", 45);
      stateManager.set("players.p1.retreatEffectsReversed", true);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("Expected outcome: Should not skip backward teleport when retreat Effects Reversed is false", async () => {
      stateManager.set("board.squares", {
        "82": { destination: 45 },
      });
      stateManager.set("players.p1.position", 82);
      stateManager.set("players.p1.retreatEffectsReversed", false);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(45);
    });

    it("Expected outcome: Should apply portal teleport when square has next On Landing (e g Forest Ocean portal 45 to 82)", async () => {
      stateManager.set("board.squares", {
        "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "82": { next: [83], prev: [81], name: "Ocean-Forest Portal", nextOnLanding: [45] },
      });
      stateManager.set("players.p1.position", 45);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(82);
    });

    it("Expected outcome: Kalimba ocean forest portal (82) first landing slides to 45, sets flags, suppresses 45 to 82 chain", async () => {
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

    it("Expected outcome: Kalimba ocean forest portal suppression blocks immediate 45 to 82 bounce in same resolution context", async () => {
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

    it("Expected outcome: Kalimba ocean forest portal (82) after penalty consumed, further landings on 82 stay", async () => {
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

    it("Expected outcome: Kalimba ocean forest portal (82) retreat Effects Reversed skips slide but still consumes penalty + retreat flip", async () => {
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

    it("Expected outcome: Should set arrived Via Teleport From when applying ladder and context is passed", async () => {
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

    it("Expected outcome: Should do nothing when square has no teleport", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6], prev: [4] },
        "10": { destination: 20 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("Expected outcome: Should do nothing when destination equals current position", async () => {
      stateManager.set("board.squares", {
        "5": { destination: 5 },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(5);
    });

    it("Expected outcome: Should handle position value that is not a number", async () => {
      stateManager.set("board.squares", { "5": { destination: 15 } });
      stateManager.set("players.p1.position", "invalid" as unknown as number);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe("invalid");
    });

    it("Expected outcome: Should apply jump To Leader (golden Fox) move to leader position", async () => {
      stateManager.set("board.squares", {
        "54": { effect: "jumpToLeader", name: "Zorro dorado" },
      });
      stateManager.set("game.playerOrder", ["p1", "p2"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 80);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(80);
    });

    it("Expected outcome: Should prefer jump To Leader over next On Landing on the same square (misauthored config)", async () => {
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

    it("Expected outcome: Should set jump To Leader Relocated on context when fox moves the player", async () => {
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

    it("Expected outcome: Should set magic Door Bounce on context when overshooting magic door", async () => {
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

    it("Expected outcome: Should not set magic Door Bounce on nested calls", async () => {
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

    it("Expected outcome: Should not apply magic Door Bounce after door was opened", async () => {
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
        "196": { effect: "win" },
      });
      stateManager.set("players.p1.position", 193);
      stateManager.set("players.p1.magicDoorOpened", true);
      const context: ExecutionContext = {};

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position", context);

      expect(stateManager.get("players.p1.position")).toBe(193);
      expect(context.magicDoorBounce).toBeUndefined();
    });

    it("Expected outcome: Should keep position when jump To Leader but current player is already leader", async () => {
      stateManager.set("board.squares", {
        "54": { effect: "jumpToLeader", name: "Zorro dorado" },
      });
      stateManager.set("game.playerOrder", ["p1", "p2"]);
      stateManager.set("players.p1.position", 54);
      stateManager.set("players.p2.position", 30);

      await boardEffectsHandler.checkAndApplyBoardMoves("players.p1.position");

      expect(stateManager.get("players.p1.position")).toBe(54);
    });

    it("Expected outcome: Should move jumper through square 82 portal (82 to 45) and leave other players on 82", async () => {
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

    it("Expected outcome: Should leave every occupant on 82 when jump To Leader resolves ocean portal (multi player)", async () => {
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

  describe("Product scenario: Check And Apply Square Effects", () => {
    const baseContext: ExecutionContext = {};

    it("Expected outcome: Should do nothing for non position paths", async () => {
      stateManager.set("board.squares", {
        "5": { name: "Bear", power: 1 },
      });

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.hearts", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("Expected outcome: Should do nothing for non player paths", async () => {
      stateManager.set("board.squares", {
        "5": { name: "Bear", power: 1 },
      });

      await boardEffectsHandler.checkAndApplySquareEffects("game.lastRoll", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("Expected outcome: Should do nothing when no board squares config exists", async () => {
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("Expected outcome: Should do nothing when square has no effect data", async () => {
      stateManager.set("board.squares", {});
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("Expected outcome: Should do nothing when square has empty effect data", async () => {
      stateManager.set("board.squares", { "5": {} });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("Expected outcome: Should do nothing for hydrated topology only squares", async () => {
      stateManager.set("board.squares", {
        "5": { next: [6], prev: [4] },
      });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });

    it("Expected outcome: Animal encounter speaks deterministic prompt and sets pending riddle", async () => {
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

    it("Expected outcome: Should set is Processing Square Effect flag during processing", async () => {
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

    it("Expected outcome: Should clear flag after processing completes", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("Expected outcome: Should clear flag even if deterministic speak throws error", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      mockSpeak.mockRejectedValue(new Error("Test error"));

      await expect(
        boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext),
      ).rejects.toThrow("Test error");

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("Expected outcome: Should clear flag even if deterministic speak throws error", async () => {
      const squareData = { name: "Quicksand", effect: "skipTurn" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      mockSpeak.mockRejectedValue(new Error("TTS error"));

      await expect(
        boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext),
      ).rejects.toThrow("TTS error");

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("Expected outcome: Deterministic squares do not call process Transcript (nested interpreter)", async () => {
      const squareData = { name: "Quicksand", effect: "skipTurn" };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/square 5|Quicksand|skip/i));
    });

    it("Expected outcome: Magic door landing uses clearer es AR copy with player name and threshold guidance", async () => {
      setLocale("es-AR");
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
      expect(text).toMatch(/Alice, caíste justo en la Puerta Mágica, casillero 186/i);
      expect(text).toMatch(/en tu próximo turno vas a tirar para intentar abrirla/i);
      expect(text).toMatch(/necesitás llegar a 6 entre el dado y tus ayudas/i);
      expect(text).toMatch(
        /si tenés corazones, cada corazón le baja 1 punto a la puerta y cambia el número que necesitás/i,
      );
      expect(text).toMatch(/ahora tenés 2 corazones/i);
      expect(text).toMatch(/al menos un 4 en el dado/i);
    });

    it("Expected outcome: Magic door landing with scimitar mentions hearts plus scimitar bonus", async () => {
      setLocale("es-AR");
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
      });
      stateManager.set("players.p1.position", 186);
      stateManager.set("players.p1.hearts", 1);
      stateManager.set("players.p1.items", ["scimitar"]);
      stateManager.set("game.turn", "p1");

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      const text = String(mockSpeak.mock.calls[0]?.[0] ?? "");
      expect(text).toMatch(/cada corazón le baja 1 punto/i);
      expect(text).toMatch(/la cimitarra suma 1 punto más/i);
      expect(text).toMatch(/ahora tenés un corazón y la cimitarra/i);
      expect(text).toMatch(/al menos un 4 en el dado/i);
    });

    it("Expected outcome: Magic door landing copy reflects cumulative hearts threshold in es AR", async () => {
      setLocale("es-AR");
      stateManager.set("board.squares", {
        "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
      });
      stateManager.set("players.p1.position", 186);
      stateManager.set("game.turn", "p1");
      stateManager.set("players.p1.items", []);

      const cases = [
        { hearts: 0, expectedMinDie: 6 },
        { hearts: 1, expectedMinDie: 5 },
        { hearts: 3, expectedMinDie: 3 },
      ];

      for (const { hearts, expectedMinDie } of cases) {
        mockSpeak.mockClear();
        stateManager.set("players.p1.hearts", hearts);

        await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

        const text = String(mockSpeak.mock.calls[0]?.[0] ?? "");
        expect(text).toMatch(/corazón/i);
        expect(text).toMatch(new RegExp(`al menos un ${expectedMinDie} en el dado`, "i"));
      }
    });

    it("Expected outcome: Stores deterministic question data in pending state", async () => {
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

    it("Expected outcome: Animal squares get narration only, no rewards on landing (orchestrator applies after power check)", async () => {
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

    it("Expected outcome: Peacock heart square (no power) applies heart immediately and skips encounter pending", async () => {
      stateManager.set("board.squares", {
        "185": { name: "Peacock", heart: true },
      });
      stateManager.set("players.p1.position", 185);
      stateManager.set("players.p1.hearts", 0);
      stateManager.set("game.pending", {
        kind: "riddle",
        position: 180,
        power: 5,
        playerId: "p1",
      });

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.hearts")).toBe(1);
      expect(stateManager.get("game.pending")).toBeNull();
      expect(mockProcessTranscript).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith(expect.stringMatching(/Peacock|heart/i));
    });

    it("Expected outcome: Trap squares apply skip Turn and request narration", async () => {
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

    it("Expected outcome: Clears pending Animal Encounter when applying hazard (non animal) square effect", async () => {
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

    it("Expected outcome: Should apply skip Turn effect from square config", async () => {
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

    it("Expected outcome: Protection Item and heart squares add item immediately", async () => {
      stateManager.set("board.squares", {
        "63": { item: "anti-wasp" },
      });
      stateManager.set("players.p1.position", 63);
      stateManager.set("players.p1.items", []);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual(["anti-wasp"]);
    });

    it("Expected outcome: Heart square (Cimitarra) adds scimitar item immediately", async () => {
      stateManager.set("board.squares", {
        "176": { item: "scimitar" },
      });
      stateManager.set("players.p1.position", 176);
      stateManager.set("players.p1.items", []);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual(["scimitar"]);
    });

    it("Expected outcome: Scimitar pickup speech includes magic door hint with configured target", async () => {
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

    it("Expected outcome: Eagle (animal + extra power dice) sets pending encounter; no rewards on landing", async () => {
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

    it("Expected outcome: Roll Directional squares trigger narration only (no deterministic effects)", async () => {
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

    it("Expected outcome: Repeat visit to ocean forest one shot portal uses short transcript when penalty already consumed", async () => {
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

    it("Expected outcome: Portal at 82 when arrived from 45 no choice, stay, narrate briefly only", async () => {
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

    it("Expected outcome: Check Torch hazard applies skip Turn when player has no torch", async () => {
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

    it("Expected outcome: Check Torch hazard consumes torch and does not apply skip Turn when player has torch", async () => {
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

    it("Expected outcome: Check Anti Wasp hazard applies skip Turn when player has no anti wasp", async () => {
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

    it("Expected outcome: Check Anti Wasp hazard consumes anti wasp and does not apply skip Turn when player has it", async () => {
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

    it("Expected outcome: Torch protection Item square adds torch item immediately", async () => {
      stateManager.set("board.squares", {
        "79": { item: "torch" },
      });
      stateManager.set("players.p1.position", 79);
      stateManager.set("players.p1.items", []);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(stateManager.get("players.p1.items")).toEqual(["torch"]);
    });

    it("Expected outcome: Should handle position value that is not a number", async () => {
      stateManager.set("board.squares", { "5": { name: "Bear", power: 1 } });
      stateManager.set("players.p1.position", "invalid" as unknown as number);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", baseContext);

      expect(mockProcessTranscript).not.toHaveBeenCalled();
    });
  });

  describe("Product scenario: Is Processing Effect", () => {
    it("Expected outcome: Should return false initially", () => {
      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });

    it("Expected outcome: Should return true during effect processing", async () => {
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

    it("Expected outcome: Should return false after processing completes", async () => {
      const squareData = { name: "Bear", power: 1 };
      stateManager.set("board.squares", { "5": squareData });
      stateManager.set("players.p1.position", 5);

      await boardEffectsHandler.checkAndApplySquareEffects("players.p1.position", {});

      expect(boardEffectsHandler.isProcessingEffect()).toBe(false);
    });
  });
});
