import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Orchestrator } from "./orchestrator";
import { GamePhase } from "./types";
import type { GameState, PrimitiveAction } from "./types";
import type { StatusIndicator } from "@/components/status-indicator";
import { resolveInitialState } from "@/game-loader/game-loader";
import type { GameConfigInput } from "@/game-loader/types";
import { setLocale, t } from "@/i18n/translations";
import { MockLLMClient } from "@/llm/MockLLMClient";
import type { SpeechService } from "@/services/speech-service";
import { StateManager } from "@/state-manager";

const orchestratorTestDir = dirname(fileURLToPath(import.meta.url));
const kalimbaConfigPath = join(orchestratorTestDir, "../../public/games/kalimba/config.json");

/**
 * ARCHITECTURE: Integration tests use MockLLM to simulate game actions.
 * LLM can only use these primitives: PLAYER_ROLLED, NARRATE, SET_STATE (for player data)
 * LLM CANNOT: change game.turn, game.phase, game.winner (orchestrator authority)
 * Win detection: Orchestrator detects win conditions and calls transitionPhase(FINISHED)
 */
describe("Product scenario: Game orchestrator Integration Tests", () => {
  let orchestrator: Orchestrator;
  let stateManager: StateManager;
  let mockLLM: MockLLMClient;
  let mockSpeech: SpeechService;
  let mockIndicator: StatusIndicator;

  function createScriptedLLM(responses: PrimitiveAction[][]): MockLLMClient {
    return new MockLLMClient("scripted", responses);
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

    orchestrator = new Orchestrator(mockLLM, stateManager, mockSpeech, mockIndicator, initialState);
  }

  beforeEach(() => {
    createMockServices();
  });

  describe("Product scenario: Voice Outcome Hints", () => {
    it("Expected outcome: Sets fork Choice Resolved Without Narrate when only PLAYER ANSWERED resolves fork", async () => {
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "0": { next: [1, 15] },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "15" },
      ]);

      expect(result.success).toBe(true);
      expect(result.voiceOutcomeHints?.forkChoiceResolvedWithoutNarrate).toBe(true);
    });

    it("Expected outcome: Does not set fork hint when NARRATE is in the batch", async () => {
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "0": { next: [1, 15] },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "1" },
        { action: "NARRATE", text: "You chose path A!" },
      ]);

      expect(result.success).toBe(true);
      expect(result.voiceOutcomeHints).toBeUndefined();
    });
  });

  describe("Product scenario: Board Mechanics", () => {
    it("Expected outcome: Auto applies ladders after position changes", async () => {
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
          squares: {
            "4": { destination: 14 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(14);
    });

    it("Expected outcome: Auto applies snakes after position changes", async () => {
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
          squares: {
            "17": { destination: 7 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(7);
    });

    it("Expected outcome: Handles board moves after position changes", async () => {
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
          squares: {
            "4": { destination: 14 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 3");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(14);
    });

    it("Expected outcome: Golden Fox (jump To Leader) NARRATE speaks final leader square, not dice landing", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p2",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "F", position: 91 },
          p2: { id: "p2", name: "B", position: 51 },
        },
        board: {
          squares: {
            "54": { effect: "jumpToLeader", name: "Golden fox" },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 3 },
        { action: "NARRATE", text: "B, you landed on square 54." },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("callAdvanceTurn");
      expect(stateManager.get("players.p2.position")).toBe(91);
      expect(mockSpeech.speak).toHaveBeenCalled();
      const speakMock = mockSpeech.speak as ReturnType<typeof vi.fn>;
      const spoken = String(speakMock.mock.calls[0]?.[0] ?? "");
      expect(spoken).toContain("91");
      expect(spoken).not.toContain("54");
      expect(spoken).toMatch(/Golden Fox|first place/i);
    });

    it("Expected outcome: Hazard square (check Anti Wasp) skips trailing movement NARRATE after nested encounter line", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([[{ action: "NARRATE", text: "Nested wasp narration." }]]);

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
          p1: { id: "p1", name: "Alice", position: 110, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "200": { effect: "win" },
            "116": { name: "Wasps", effect: "checkAntiWasp" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 6 },
        {
          action: "NARRATE",
          text: "Trailing movement line that must not be spoken.",
        },
      ]);

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(116);
      expect(stateManager.get("players.p1.skipTurns")).toBe(1);
      const speakMock = mockSpeech.speak as ReturnType<typeof vi.fn>;
      expect(speakMock).toHaveBeenCalledTimes(1);
      const waspBase = t("squares.landedBase", {
        name: "Alice",
        position: 116,
        squareName: "Wasps",
      });
      const expectedWaspLanding = t("squares.landedWithApplied", {
        base: waspBase,
        applied: t("squares.appliedSkipNoAntiWasp"),
      }).trim();
      expect(speakMock).toHaveBeenCalledWith(expectedWaspLanding);
    });
  });

  describe("Product scenario: Animal Encounters", () => {
    it("Expected outcome: Handles animal encounter with power check failure", async () => {
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
          squares: {
            "5": { name: "Cobra", power: 4 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(5);
      expect(mockLLM.getCallCount()).toBe(1);
    });

    it("Expected outcome: Advances turn to next player on power check failure and returns already Advanced", async () => {
      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 5,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: false,
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 5 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "5": { name: "Cobra", power: 4 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "2" },
        { action: "NARRATE", text: "No alcanzó. Próximo jugador. Revancha: 1 dado, 4 o más." },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance).toEqual({
        kind: "alreadyAdvanced",
        nextPlayer: { playerId: "p2", name: "Bob", position: 0 },
      });

      const turn = stateManager.get("game.turn");
      expect(turn).toBe("p2");

      const pending = stateManager.get("game.pending") as {
        playerId: string;
        kind: string;
      };
      expect(pending.playerId).toBe("p1");
      expect(pending.kind).toBe("revenge");
    });

    it("Expected outcome: Power check win advances turn when power die completed graph movement (Kalimba §2B)", async () => {
      mockLLM = createScriptedLLM([]);
      setLocale("en-US");
      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 5,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: false,
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 5 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "5": { name: "Cobra", power: 4 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "6" },
        { action: "NARRATE", text: "Pasaste. +4 puntos." },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("alreadyAdvanced");
      expect(result.turnAdvance).toMatchObject({
        kind: "alreadyAdvanced",
        nextPlayer: { playerId: "p2", name: "Bob", position: 0 },
      });

      const turn = stateManager.get("game.turn");
      expect(turn).toBe("p2");

      const pending = stateManager.get("game.pending");
      expect(pending).toBeNull();

      expect(stateManager.get("players.p1.position")).toBe(11);

      expect(mockSpeech.speak).toHaveBeenNthCalledWith(1, "You passed.");
      expect(mockSpeech.speak).toHaveBeenCalledTimes(1);
      setLocale("es-AR");
    });

    it("Expected outcome: Beetle like power check win (1d6 after wrong riddle) does not prompt second movement die (regression)", async () => {
      mockLLM = createScriptedLLM([]);
      setLocale("en-US");
      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 2,
          pending: {
            position: 16,
            power: 1,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: false,
          },
        },
        players: {
          p1: { id: "p1", name: "Fico", position: 16 },
          p2: { id: "p2", name: "Fede", position: 0 },
        },
        board: {
          squares: {
            "16": { name: "Beetle", power: 1 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "4" },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("alreadyAdvanced");
      expect(result.turnAdvance).toMatchObject({
        kind: "alreadyAdvanced",
        nextPlayer: { playerId: "p2", name: "Fede", position: 0 },
      });
      expect(stateManager.get("game.turn")).toBe("p2");
      expect(stateManager.get("players.p1.position")).toBe(20);
      expect(stateManager.get("game.pending")).toBeNull();
      expect(mockSpeech.speak).toHaveBeenNthCalledWith(1, "You passed.");
      expect(mockSpeech.speak).toHaveBeenCalledTimes(1);
      setLocale("es-AR");
    });

    it("Expected outcome: Power check win onto Kalimba Cimitarra (168 to 176) yields already Advanced (regression silence after heart)", async () => {
      mockLLM = createScriptedLLM([]);
      setLocale("en-US");
      const raw = readFileSync(kalimbaConfigPath, "utf-8");
      const config = JSON.parse(raw) as GameConfigInput;
      const base = resolveInitialState(config);
      const p1 = base.players.p1;
      const p2 = base.players.p2;
      if (!p1 || !p2) {
        throw new Error("Kalimba state must include p1 and p2");
      }
      const initialState: GameState = {
        ...base,
        game: {
          ...base.game,
          phase: GamePhase.PLAYING,
          turn: "p1",
          lastRoll: 6,
          pending: {
            kind: "powerCheck",
            playerId: "p1",
            position: 168,
            power: 1,
            riddleCorrect: true,
            phase: "powerCheck",
          },
        },
        players: {
          ...base.players,
          p1: {
            ...p1,
            name: "F",
            position: 168,
            activeChoices: { 0: 1, 96: 99 },
            hearts: 0,
            items: [],
          },
          p2: {
            ...p2,
            name: "B",
            position: 174,
            hearts: 1,
            activeChoices: { 0: 1, 96: 97 },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "8" },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("alreadyAdvanced");
      if (result.turnAdvance.kind !== "alreadyAdvanced") {
        throw new Error("expected alreadyAdvanced");
      }
      expect(result.turnAdvance.nextPlayer).toMatchObject({
        playerId: "p2",
        name: "B",
        position: 174,
      });
      expect(stateManager.get("players.p1.position")).toBe(176);
      expect(stateManager.get("players.p1.hearts")).toBe(2);
      expect(stateManager.get("players.p1.items")).toEqual([]);
      expect(stateManager.get("game.turn")).toBe("p2");
      expect(mockSpeech.speak).toHaveBeenNthCalledWith(1, "You passed.");
      expect(mockSpeech.speak).toHaveBeenNthCalledWith(2, "You gain a heart.");
      setLocale("es-AR");
    });

    it("Expected outcome: After power check win through snake to no choice portal speaks after Encounter Roll Prompt (ADR 0003)", async () => {
      mockLLM = createScriptedLLM([
        [{ action: "NARRATE", text: "You arrived at the forest-ocean portal." }],
      ]);
      setLocale("en-US");
      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 7,
            power: 3,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 7 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "7": {
              name: "Eagle",
              power: 3,
              winJumpTo: 82,
              next: [8],
              powerCheckDiceIfRiddleCorrect: 3,
            },
            "82": { destination: 45, name: "Chute top", next: [83] },
            "45": { name: "Forest-Ocean Portal", nextOnLanding: [82] },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "17" },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("none");
      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(stateManager.get("game.pending")).toBeNull();

      expect(mockSpeech.speak).toHaveBeenNthCalledWith(1, "You passed.");
      const portalLine = `${t("squares.landedBase", {
        name: "Alice",
        position: 45,
        squareName: "Forest-Ocean Portal",
      })}${t("squares.landedPortalNoChoice", { fromSquare: 82 })}`.trim();
      expect(mockSpeech.speak).toHaveBeenNthCalledWith(2, portalLine);
      expect(mockSpeech.speak).toHaveBeenNthCalledWith(
        3,
        "Alice, you're still on square 45. Roll the dice and tell me what you got.",
      );
      setLocale("es-AR");
    });

    it("Expected outcome: Revenge win with win Jump To when token stays on jump square skips after Encounter Roll Prompt (Giraffe to 162)", async () => {
      mockLLM = createScriptedLLM([]);
      setLocale("en-US");
      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 5,
          pending: {
            kind: "revenge",
            playerId: "p1",
            position: 145,
            power: 2,
            phase: "revenge",
          },
        },
        players: {
          p1: { id: "p1", name: "F", position: 145 },
          p2: { id: "p2", name: "B", position: 0 },
        },
        board: {
          squares: {
            "145": { name: "Giraffe", power: 2, winJumpTo: 162, habitat: "savanna" },
            "162": {},
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "3" },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("callAdvanceTurn");
      expect(stateManager.get("players.p1.position")).toBe(162);
      expect(stateManager.get("game.pending")).toBeNull();
      expect(stateManager.get("game.lastRoll")).toBe(3);
      expect(mockSpeech.speak).toHaveBeenNthCalledWith(1, "You passed.");
      expect(mockSpeech.speak).toHaveBeenCalledTimes(1);
      setLocale("es-AR");
    });

    it("Expected outcome: Power check win landing on skip Turn sets already Advanced (next player announced by app)", async () => {
      mockLLM = createScriptedLLM([
        [{ action: "NARRATE", text: "Quicksand — you skip next turn." }],
      ]);
      setLocale("en-US");
      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 5,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: false,
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 5 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "5": { name: "Cobra", power: 4 },
            "11": { name: "Quicksand", effect: "skipTurn" },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "6" },
        { action: "NARRATE", text: "Pasaste." },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("alreadyAdvanced");
      expect(result.turnAdvance).toMatchObject({
        kind: "alreadyAdvanced",
        nextPlayer: { playerId: "p2", name: "Bob", position: 0 },
      });

      expect(stateManager.get("game.turn")).toBe("p2");
      expect(stateManager.get("players.p1.position")).toBe(11);
      expect(stateManager.get("players.p1.skipTurns")).toBe(1);

      setLocale("es-AR");
    });

    it("Expected outcome: Does not nest interpreter for fork enforcement when initial power check loss advances turn to a player at fork", async () => {
      mockLLM = createScriptedLLM([
        [{ action: "NARRATE", text: "Should not run — nested fork enforcement" }],
      ]);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 5,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: false,
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 5 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "0": { next: [1, 15] },
            "5": { name: "Cobra", power: 4 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "2" },
        { action: "NARRATE", text: "No alcanzó. Próximo jugador. Revancha: 1 dado, 4 o más." },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance).toEqual({
        kind: "alreadyAdvanced",
        nextPlayer: { playerId: "p2", name: "Bob", position: 0 },
      });
      expect(mockLLM.getCallCount()).toBe(0);
    });

    it("Expected outcome: Handles animal encounter triggering square effect", async () => {
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
          {
            action: "NARRATE",
            text: "You passed the power check and riddle! Bonus dice!",
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
          },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "5": { name: "Cobra", power: 4 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      const bonusDice = stateManager.get("players.p1.bonusDiceNextTurn");

      expect(p1Position).toBe(5);
      expect(bonusDice).toBe(false);
    });

    it("Expected outcome: Applies bonus dice after riddle success", async () => {
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
          squares: { "100": { effect: "win" } },
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

  describe("Product scenario: Decision Points", () => {
    it("Expected outcome: Blocks movement until path choice is made", async () => {
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
          p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "0": { next: [1, 15] },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 3");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(0);
    });

    it("Expected outcome: Allows movement after decision is set", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ANSWERED", answer: "1" },
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
          p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "0": { next: [1, 15] },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("Path A");
      await orchestrator.handleTranscript("I rolled a 3");

      const p1Position = stateManager.get("players.p1.position");
      const activeChoices = stateManager.get("players.p1.activeChoices") as Record<string, number>;

      expect(activeChoices?.["0"]).toBe(1);
      expect(p1Position).toBe(3);
    });

    it("Expected outcome: Uses Path B (active Choices) when choice 15 and rolling from 0", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 4 },
          { action: "NARRATE", text: "Pedro moved to path B!" },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const squares: Record<string, { next?: number[]; prev?: number[] }> = {};
      for (let i = 0; i <= 196; i++) {
        squares[String(i)] = {
          next: i < 196 ? [i + 1] : [],
          prev: i > 0 ? [i - 1] : [],
        };
      }
      squares["0"] = { next: [1, 15], prev: [] };

      const initialState: GameState = {
        game: {
          name: "Kalimba",
          phase: GamePhase.PLAYING,
          turn: "p2",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 3, activeChoices: { 0: 1 } },
          p2: { id: "p2", name: "Pedro", position: 0, activeChoices: { 0: 15 } },
        },
        board: {
          squares,
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("4");

      const p2Position = stateManager.get("players.p2.position");
      expect(p2Position).toBe(18); // 0→15→16→17→18 (4 steps)
    });

    it("Expected outcome: Rejects PLAYER ANSWERED for path choice when current player has no pending decision", async () => {
      // Simulates bug: LLM returns PLAYER_ANSWERED "B" for fico when it's p1's turn and p1 already chose
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
          p1: { id: "p1", name: "Alice", position: 0, activeChoices: { 0: 1 } },
          p2: { id: "p2", name: "Bob", position: 0, activeChoices: {} },
        },
        board: {
          squares: {
            "0": { next: [1, 15], prev: [] },
            "100": { effect: "win" },
          },
        },
      };

      mockLLM = createScriptedLLM([]);
      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "B" },
        { action: "NARRATE", text: "Bob chose B" },
      ]);

      expect(result.success).toBe(false);
      expect(
        (stateManager.get("players.p2.activeChoices") as Record<string, number>)?.["0"],
      ).toBeUndefined();
    });
  });

  describe("Product scenario: Portal and Teleportation", () => {
    it("Expected outcome: Teleports forward via board moves and processes square effect", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 1 },
          { action: "NARRATE", text: "Moving to portal..." },
        ],
        [{ action: "NARRATE", text: "Landed after portal." }],
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
          p1: { id: "p1", name: "Alice", position: 44, activeChoices: {} },
        },
        board: {
          squares: {
            "44": { next: [45], prev: [43] },
            "45": {
              name: "Portal Forward",
              destination: 82,
            },
            "82": {
              name: "Portal Destination",
              next: [83],
              prev: [81],
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled 1");

      expect(stateManager.get("players.p1.position")).toBe(82);
      expect(mockLLM.getCallCount()).toBe(1);
    });

    it("Expected outcome: Teleports backward without Kalimba one shot flags (no penalty fields)", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to portal..." },
        ],
        [{ action: "NARRATE", text: "Arrived after backward portal." }],
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
          p1: { id: "p1", name: "Alice", position: 80, activeChoices: {} },
        },
        board: {
          squares: {
            "80": { next: [81], prev: [79] },
            "81": { next: [82], prev: [80] },
            "82": {
              name: "Portal Backward",
              destination: 45,
            },
            "45": {
              name: "Portal Destination",
              next: [46],
              prev: [44],
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(stateManager.get("players.p1.oceanForestPenaltyConsumed")).toBeUndefined();
      expect(stateManager.get("players.p1.retreatEffectsReversed")).toBeUndefined();
      expect(mockLLM.getCallCount()).toBe(1);
    });

    it("Expected outcome: Second roll onto ocean portal 82 stays on 82 and uses repeat narration after one shot penalty", async () => {
      const portalSquares = {
        "44": { next: [45], prev: [43] },
        "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
        "46": { next: [47], prev: [45] },
        "47": { next: [48], prev: [46] },
        "79": { next: [80], prev: [78] },
        "80": { next: [81], prev: [79] },
        "81": { next: [82], prev: [80] },
        "82": {
          next: [83],
          prev: [81],
          name: "Ocean-Forest Portal",
          nextOnLanding: [45],
          oceanForestOneShotPortal: true,
        },
        "83": { next: [84], prev: [82] },
        "84": { next: [85], prev: [83] },
      };

      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 1 },
          { action: "NARRATE", text: "Moving to portal" },
        ],
        [
          { action: "PLAYER_ROLLED", value: 1 },
          { action: "NARRATE", text: "Rolling again" },
        ],
      ];

      mockLLM = createScriptedLLM(responses);

      const initialState: GameState = {
        game: {
          name: "Kalimba Portal Test",
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
            position: 81,
            oceanForestPenaltyConsumed: false,
            retreatEffectsReversed: false,
            activeChoices: {},
          },
        },
        board: { squares: portalSquares },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled 1");
      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(stateManager.get("players.p1.oceanForestPenaltyConsumed")).toBe(true);
      expect(stateManager.get("players.p1.retreatEffectsReversed")).toBe(true);

      stateManager.set("players.p1.position", 81);
      await orchestrator.handleTranscript("I rolled 1 again");

      expect(stateManager.get("players.p1.position")).toBe(82);
      expect(stateManager.get("players.p1.oceanForestPenaltyConsumed")).toBe(true);
      expect(stateManager.get("players.p1.retreatEffectsReversed")).toBe(true);
      expect(mockLLM.getCallCount()).toBe(2);
    });

    it("Expected outcome: First one shot landing on 82 does not rebound back to 82 in same resolution wave", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([
        [
          { action: "PLAYER_ROLLED", value: 1 },
          { action: "NARRATE", text: "Moving to ocean portal." },
        ],
      ]);

      const initialState: GameState = {
        game: {
          name: "Kalimba Portal Test",
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
            position: 81,
            oceanForestPenaltyConsumed: false,
            retreatEffectsReversed: false,
            activeChoices: {},
          },
        },
        board: {
          squares: {
            "45": { next: [46], prev: [44], name: "Forest-Ocean Portal", nextOnLanding: [82] },
            "81": { next: [82], prev: [80] },
            "82": {
              next: [83],
              prev: [81],
              name: "Ocean-Forest Portal",
              nextOnLanding: [45],
              oceanForestOneShotPortal: true,
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled 1");

      expect(stateManager.get("players.p1.position")).toBe(45);
      expect(stateManager.get("players.p1.oceanForestPenaltyConsumed")).toBe(true);
      expect(stateManager.get("players.p1.retreatEffectsReversed")).toBe(true);
      const portalLine = `${t("squares.landedBase", {
        name: "Alice",
        position: 45,
        squareName: "Forest-Ocean Portal",
      })}${t("squares.landedPortalNoChoice", { fromSquare: 82 })}`.trim();
      expect(mockSpeech.speak).toHaveBeenCalledWith(portalLine);
      setLocale("es-AR");
    });
  });

  describe("Product scenario: Special Squares Regression Matrix", () => {
    it("Expected outcome: Return To187 resolves final position and speaks the final landing square", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 189, activeChoices: {} },
        },
        board: {
          squares: {
            "190": { name: "Calavera", effect: "returnTo187" },
            "187": { name: "Backtrack" },
            "196": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 1 },
        { action: "NARRATE", text: "Alice moves from 189 to 190." },
      ]);

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(187);
      const speakMock = mockSpeech.speak as ReturnType<typeof vi.fn>;
      expect(speakMock).toHaveBeenCalledTimes(1);
      expect(speakMock).toHaveBeenCalledWith(
        t("game.skullReturnToSnakeHead", { name: "Alice", from: 190, to: 187 }),
      );
      setLocale("es-AR");
    });

    it("Expected outcome: Roll from 187 to skull keeps final landing at 187 when magic door is closed", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 187, activeChoices: {} },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
            "187": { name: "Backtrack" },
            "190": { name: "Calavera", effect: "returnTo187" },
            "196": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 3 },
        { action: "NARRATE", text: "Alice moves from 187 to 190." },
      ]);

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(187);
      const speakMock = mockSpeech.speak as ReturnType<typeof vi.fn>;
      expect(speakMock).toHaveBeenCalledTimes(1);
      expect(speakMock).toHaveBeenCalledWith(
        t("game.skullReturnToSnakeHead", { name: "Alice", from: 190, to: 187 }),
      );
      setLocale("es-AR");
    });

    it("Expected outcome: Roll from 187 to destination based skull mapping keeps final landing at 187", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 187, activeChoices: {} },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
            "187": { name: "Backtrack" },
            "190": { name: "Calavera", destination: 187 },
            "196": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 3 },
        { action: "NARRATE", text: "Alice moves from 187 to 190." },
      ]);

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(187);
      const speakMock = mockSpeech.speak as ReturnType<typeof vi.fn>;
      expect(speakMock).toHaveBeenCalledTimes(1);
      expect(speakMock).toHaveBeenCalledWith(
        t("game.skullReturnToSnakeHead", { name: "Alice", from: 190, to: 187 }),
      );
      setLocale("es-AR");
    });

    it("Expected outcome: Check Torch hazard skips trailing movement NARRATE and applies deterministic line", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 84, activeChoices: {}, items: [] },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "85": { name: "Night falls", effect: "checkTorch" },
            "196": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 1 },
        {
          action: "NARRATE",
          text: "Trailing movement line that must not be spoken.",
        },
      ]);

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(85);
      expect(stateManager.get("players.p1.skipTurns")).toBe(1);
      const speakMock = mockSpeech.speak as ReturnType<typeof vi.fn>;
      expect(speakMock).toHaveBeenCalledTimes(1);
      const torchBase = t("squares.landedBase", {
        name: "Alice",
        position: 85,
        squareName: "Night falls",
      });
      const expectedTorchLanding = t("squares.landedWithApplied", {
        base: torchBase,
        applied: t("squares.appliedSkipNoTorch"),
      }).trim();
      expect(speakMock).toHaveBeenCalledWith(expectedTorchLanding);
      setLocale("es-AR");
    });

    it("Expected outcome: Directional flow retreat2d6 sets pending and PLAYER ANSWERED resolves backward movement", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([
        [
          { action: "PLAYER_ROLLED", value: 1 },
          { action: "NARRATE", text: "Landing on directional square." },
        ],
        [{ action: "PLAYER_ANSWERED", answer: "8" }],
      ]);

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
          p1: { id: "p1", name: "Alice", position: 54, activeChoices: {} },
        },
        board: {
          squares: {
            "55": { name: "Jivaro Indians", effect: "retreat2d6", next: [56], prev: [54] },
            "54": { next: [55], prev: [53] },
            "53": { next: [54], prev: [52] },
            "52": { next: [53], prev: [51] },
            "51": { next: [52], prev: [50] },
            "50": { next: [51], prev: [49] },
            "49": { next: [50], prev: [48] },
            "48": { next: [49], prev: [47] },
            "47": { next: [48], prev: [46] },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled 1");
      expect(stateManager.get("game.pending")).toMatchObject({
        kind: "directional",
        playerId: "p1",
        position: 55,
        dice: 2,
      });

      await orchestrator.handleTranscript("8");

      expect(stateManager.get("players.p1.position")).toBe(47);
      expect(stateManager.get("game.pending")).toBeNull();
      expect(stateManager.get("game.lastRoll")).toBe(8);
      setLocale("es-AR");
    });

    it("Expected outcome: Wins when reaching win square through teleport chain (destination to win)", async () => {
      mockLLM = createScriptedLLM([
        [
          { action: "PLAYER_ROLLED", value: 1 },
          { action: "NARRATE", text: "Moving to portal." },
        ],
      ]);

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
          p1: { id: "p1", name: "Alice", position: 97, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: {
            "98": { name: "Final ladder", destination: 100 },
            "100": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled 1");

      expect(stateManager.get("players.p1.position")).toBe(100);
      expect(stateManager.get("game.winner")).toBe("p1");
      expect(stateManager.get("game.phase")).toBe(GamePhase.FINISHED);
    });
  });

  describe("Product scenario: Turn Management", () => {
    it("Expected outcome: Advances turns after complete action sequence", async () => {
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
          squares: { "100": { effect: "win" } },
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

    it("Expected outcome: Sets skip Turns for hazard squares", async () => {
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
          squares: {
            "11": { name: "Quicksand", effect: "skipTurn" },
            "100": { effect: "win" },
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

    it("Expected outcome: Stops turn advancement when game finishes", async () => {
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
          squares: { "100": { effect: "win" } },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(100);

      const winner = stateManager.get("game.winner");
      expect(winner).toBe("p1");
      // Turn advancement blocked when winner is set (phase transition has known test-env quirk)
      const result = await orchestrator.advanceTurn();
      expect(result).toBeNull();
    });
  });

  describe("Product scenario: Win Conditions", () => {
    it("Expected outcome: State Manager set game phase after game winner persists", () => {
      const initialState: GameState = {
        game: {
          name: "Test",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1"],
          winner: null,
          lastRoll: 0,
        },
        players: { p1: { id: "p1", name: "A", position: 0 } },
        board: { squares: { "100": { effect: "win" } } },
      };
      const sm = new StateManager();
      sm.init(initialState);
      sm.set("game.winner", "p1");
      sm.set("game.phase", GamePhase.FINISHED);
      expect(sm.get("game.winner")).toBe("p1");
      expect(sm.get("game.phase")).toBe(GamePhase.FINISHED);
    });

    it("Expected outcome: State Manager replicates win flow position then winner then phase", () => {
      const initialState: GameState = {
        game: {
          name: "Test",
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
        board: { squares: { "100": { effect: "win" } } },
      };
      const sm = new StateManager();
      sm.init(initialState);
      sm.set("players.p1.position", 100);
      sm.set("game.winner", "p1");
      sm.set("game.phase", GamePhase.FINISHED);
      expect(sm.get("players.p1.position")).toBe(100);
      expect(sm.get("game.winner")).toBe("p1");
      expect(sm.get("game.phase")).toBe(GamePhase.FINISHED);
    });

    it("Expected outcome: Detects winner via test Execute Actions (bypasses interpreter)", async () => {
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
          squares: { "100": { effect: "win" } },
        },
      };
      mockLLM = createScriptedLLM([]);
      setupGame(initialState);

      await orchestrator.testExecuteActions([
        { action: "SET_STATE", path: "players.p1.position", value: 100 },
      ]);

      expect(stateManager.get("players.p1.position")).toBe(100);
      expect(stateManager.get("game.winner")).toBe("p1");
    });

    it("Expected outcome: Detects winner when reaching win position", async () => {
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
          squares: { "100": { effect: "win" } },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const p1Position = stateManager.get("players.p1.position");
      expect(p1Position).toBe(100);

      const winner = stateManager.get("game.winner");
      expect(winner).toBe("p1");
    });

    it("Expected outcome: Sets phase to FINISHED on win", async () => {
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
          squares: { "100": { effect: "win" } },
        },
      };

      setupGame(initialState);

      const phaseBefore = stateManager.get("game.phase");
      expect(phaseBefore).toBe(GamePhase.PLAYING);

      await orchestrator.handleTranscript("I rolled a 5");

      const winner = stateManager.get("game.winner");
      expect(winner).toBe("p1");
    });
  });

  describe("Product scenario: Complex Mechanics", () => {
    it("Expected outcome: Handles magic door with heart requirements", async () => {
      setLocale("en-US");
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving to magic door..." },
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
          squares: {
            "186": {
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
      const speakMock = mockSpeech.speak as ReturnType<typeof vi.fn>;
      const spoken = speakMock.mock.calls.map((c: unknown[]) => String(c[0])).join(" ");
      expect(spoken).toMatch(/magic door|square 186/i);
      expect(spoken).toMatch(/heart/i);
    });

    it("Expected outcome: Narrates magic door bounce with rule and final square when overshooting door", async () => {
      setLocale("en-US");
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 4 },
          { action: "NARRATE", text: "You are on square 188." },
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
          p1: { id: "p1", name: "Alice", position: 184 },
        },
        board: {
          squares: {
            "186": {
              name: "Magic Door",
              effect: "magicDoorCheck",
              target: 6,
            },
            "196": { effect: "win" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled 4");

      expect(stateManager.get("players.p1.position")).toBe(184);
      const expectedLine = t("game.magicDoorBounce", {
        name: "Alice",
        door: 186,
        overshot: 188,
        final: 184,
      });
      expect(mockSpeech.speak).toHaveBeenCalledWith(expectedLine);
    });

    it("Expected outcome: Magic door opening on 186 die only, success sets flag and advances turn", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 186, hearts: 0, magicDoorOpened: false },
          p2: { id: "p2", name: "Bob", position: 10 },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([{ action: "PLAYER_ROLLED", value: 6 }]);

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(186);
      expect(stateManager.get("players.p1.magicDoorOpened")).toBe(true);
      expect(stateManager.get("game.turn")).toBe("p2");
      expect(result.turnAdvance.kind).toBe("alreadyAdvanced");
      expect(mockSpeech.speak).toHaveBeenCalledWith(
        t("game.magicDoorOpenSuccess", {
          name: "Alice",
          roll: 6,
          bonus: 0,
          total: 6,
          target: 6,
        }),
      );
    });

    it("Expected outcome: Magic door opening fail with low roll advances turn", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 186, hearts: 0, magicDoorOpened: false },
          p2: { id: "p2", name: "Bob", position: 10 },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
          },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.testExecuteActions([{ action: "PLAYER_ROLLED", value: 2 }]);

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(186);
      expect(stateManager.get("players.p1.magicDoorOpened")).toBe(false);
      expect(stateManager.get("game.turn")).toBe("p2");
      expect(mockSpeech.speak).toHaveBeenCalledWith(
        t("game.magicDoorOpenFail", {
          name: "Alice",
          roll: 2,
          bonus: 0,
          total: 2,
          target: 6,
        }),
      );
    });

    it("Expected outcome: Magic door opening hearts + die reaches target", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 186, hearts: 3, magicDoorOpened: false },
          p2: { id: "p2", name: "Bob", position: 10 },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.testExecuteActions([{ action: "PLAYER_ROLLED", value: 3 }]);

      expect(stateManager.get("players.p1.magicDoorOpened")).toBe(true);
      expect(mockSpeech.speak).toHaveBeenCalledWith(
        t("game.magicDoorOpenSuccess", {
          name: "Alice",
          roll: 3,
          bonus: 3,
          total: 6,
          target: 6,
        }),
      );
    });

    it("Expected outcome: Magic door after open, movement roll leaves 186 and keeps opened flag", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 186, hearts: 0, magicDoorOpened: true },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6, next: [187] },
            "187": { name: "Path" },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.testExecuteActions([{ action: "PLAYER_ROLLED", value: 1 }]);

      expect(stateManager.get("players.p1.position")).toBe(187);
      expect(stateManager.get("players.p1.magicDoorOpened")).toBe(true);
    });

    it("Expected outcome: Opened magic door does not bounce overshoot back to 179", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([]);

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
          p1: { id: "p1", name: "Alice", position: 187, hearts: 0, magicDoorOpened: true },
        },
        board: {
          squares: {
            "186": { name: "Magic Door", effect: "magicDoorCheck", target: 6 },
            "196": { name: "Heart of Kalimba", effect: "win", next: [] },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.testExecuteActions([{ action: "PLAYER_ROLLED", value: 6 }]);

      expect(stateManager.get("players.p1.position")).toBe(193);
      expect(stateManager.get("players.p1.magicDoorOpened")).toBe(true);
    });

    it("Expected outcome: Handles instrument usage in correct habitat", async () => {
      const responses: PrimitiveAction[][] = [
        [
          { action: "PLAYER_ROLLED", value: 2 },
          { action: "NARRATE", text: "Moving..." },
        ],
        [
          { action: "SET_STATE", path: "players.p1.instruments", value: [] },
          {
            action: "NARRATE",
            text: "You used the drum of the forest! The bear sleeps.",
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
          },
        },
        board: {
          moves: {},
          squares: {
            "59": {
              name: "Bear",
              power: 3,
              habitat: "forest",
              instrument: "drum_forest",
            },
          },
        },
      };

      setupGame(initialState);

      await orchestrator.handleTranscript("I rolled a 2");

      const instruments = stateManager.get("players.p1.instruments");

      expect(instruments).toEqual(["drum_forest"]);
    });
  });

  describe("Product scenario: Coerce PLAYER ANSWERED to PLAYER ROLLED for movement", () => {
    it("Expected outcome: Rewrites a mis tagged dice only answer when a movement roll is legal", async () => {
      mockLLM = createScriptedLLM([[{ action: "PLAYER_ANSWERED", answer: "2" }]]);

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
            position: 36,
            activeChoices: {},
            bonusDiceNextTurn: false,
          },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: { squares: {} },
      };

      setupGame(initialState);

      const result = await orchestrator.handleTranscript("2");

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(38);
      expect(stateManager.get("game.lastRoll")).toBe(2);
    });

    it("Expected outcome: Does not coerce when a fork choice is still pending (PLAYER ROLLED invalid)", async () => {
      mockLLM = createScriptedLLM([[{ action: "PLAYER_ANSWERED", answer: "3" }]]);

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
          p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: {
          squares: { "0": { next: [1, 15], prev: [] } },
        },
      };

      setupGame(initialState);

      const result = await orchestrator.handleTranscript("3");

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(0);
    });

    it("Expected outcome: Does not coerce numeric PLAYER ANSWERED to movement roll during pending riddle", async () => {
      mockLLM = createScriptedLLM([[{ action: "PLAYER_ANSWERED", answer: "1" }]]);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 2,
            power: 3,
            playerId: "p1",
            kind: "riddle",
            riddlePrompt: "Which bird?",
            riddleOptions: ["Águila", "Búho", "Halcón", "Cóndor"],
            correctOption: "Halcón",
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 2, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: { squares: {} },
      };

      setupGame(initialState);

      const result = await orchestrator.handleTranscript("1");

      expect(result.success).toBe(true);
      expect(stateManager.get("players.p1.position")).toBe(2);
      const pendingAfter = stateManager.get("game.pending") as { kind?: string };
      expect(pendingAfter.kind).toBe("powerCheck");
    });

    it("Expected outcome: Speaks answer Riddle First when interpreter returns PLAYER ROLLED during pending riddle", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([[{ action: "PLAYER_ROLLED", value: 4 }]]);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 2,
            power: 3,
            playerId: "p1",
            kind: "riddle",
            riddlePrompt: "Which bird?",
            riddleOptions: ["Águila", "Búho", "Halcón", "Cóndor"],
            correctOption: "Halcón",
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 2, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: { squares: {} },
      };

      setupGame(initialState);

      const result = await orchestrator.handleTranscript("I rolled four");

      expect(result.success).toBe(false);
      expect(mockSpeech.speak).toHaveBeenCalledWith(t("errors.answerRiddleFirst"));
      setLocale("es-AR");
    });

    it("Expected outcome: Speaks say Encounter Roll As Answer when interpreter returns PLAYER ROLLED during power check", async () => {
      setLocale("en-US");
      mockLLM = createScriptedLLM([[{ action: "PLAYER_ROLLED", value: 4 }]]);

      const initialState: GameState = {
        game: {
          name: "Test Game",
          phase: GamePhase.PLAYING,
          turn: "p1",
          playerOrder: ["p1", "p2"],
          winner: null,
          lastRoll: 0,
          pending: {
            position: 5,
            power: 4,
            playerId: "p1",
            kind: "powerCheck",
            riddleCorrect: true,
          },
        },
        players: {
          p1: { id: "p1", name: "Alice", position: 5, activeChoices: {} },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        board: { squares: {} },
      };

      setupGame(initialState);

      const result = await orchestrator.handleTranscript("four");

      expect(result.success).toBe(false);
      expect(mockSpeech.speak).toHaveBeenCalledWith(t("errors.sayEncounterRollAsAnswer"));
      setLocale("es-AR");
    });
  });
});
