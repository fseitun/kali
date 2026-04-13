/**
 * Runtime integration tests for KaliAppCore.
 * Exercises initialize, handleSavedGameOrSetup, handleTranscription flows with mocks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusIndicator } from "./components/status-indicator";
import type { GameConfigInput, GameModule } from "./game-loader/types";
import { setLocale, t } from "./i18n/translations";
import { KaliAppCore } from "./kali-app-core";
import type { GameState } from "./orchestrator/types";
import { GamePhase } from "./orchestrator/types";
import type { ISpeechService } from "./services/speech-service";
import type { IUIService } from "./services/ui-service";

vi.mock("./utils/browser-support", () => ({
  checkBrowserSupport: vi.fn(),
}));

const phaseOverride = vi.hoisted(() => ({ value: undefined as GamePhase | undefined }));
const initialStateOverride = vi.hoisted(() => ({
  apply: undefined as ((state: GameState) => void) | undefined,
}));
const wakeWordBehavior = vi.hoisted(() => ({
  initializeError: null as Error | null,
  startListeningError: null as Error | null,
  initializeCalls: 0,
  startListeningCalls: 0,
  destroyCalls: 0,
}));

vi.mock("./game-loader/game-loader", async () => {
  const pathMod = await import("node:path");
  const fsMod = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
  const root = pathMod.resolve(__dirname, "..");
  const gameLoaderActual = await vi.importActual<{
    resolveInitialState: (config: GameConfigInput) => GameState;
  }>("./game-loader/game-loader");
  return {
    GameLoader: class MockGameLoader {
      constructor(private _gamesPath: string) {
        void this._gamesPath;
      }

      async loadGame(gameId: string): Promise<GameModule> {
        const configPath = pathMod.join(root, "public", "games", gameId, "config.json");
        const raw = fsMod.readFileSync(configPath, "utf-8");
        const config = JSON.parse(raw) as GameConfigInput;
        const initialState = gameLoaderActual.resolveInitialState(config);
        const habitatAudio = config.habitats
          ? Object.fromEntries(
              Object.entries(config.habitats).map(([habitat, entry]) => {
                return [
                  habitat,
                  {
                    trackUrl: entry.track,
                    animalSoundUrls: [...entry.animalSounds],
                    trackSoundKey: `habitat_track:${habitat}`,
                    animalSoundKeys: entry.animalSounds.map(
                      (_value, index) => `habitat_animal:${habitat}:${String(index)}`,
                    ),
                  },
                ];
              }),
            )
          : undefined;
        const module: GameModule = {
          metadata: config.metadata,
          initialState,
          soundEffects: config.soundEffects,
          habitatAudio,
          customActions: config.customActions,
          stateDisplay: config.stateDisplay,
        };
        if (phaseOverride.value !== undefined) {
          (module.initialState.game as Record<string, unknown>).phase = phaseOverride.value;
        }
        if (initialStateOverride.apply) {
          initialStateOverride.apply(module.initialState);
        }
        return module;
      }

      async loadSoundEffects(): Promise<void> {}
    },
  };
});

vi.mock("@/voice-recognition/wake-word", () => ({
  WakeWordDetector: class MockWakeWordDetector {
    async initialize(): Promise<void> {
      wakeWordBehavior.initializeCalls += 1;
      if (wakeWordBehavior.initializeError) {
        throw wakeWordBehavior.initializeError;
      }
    }
    async startListening(): Promise<void> {
      wakeWordBehavior.startListeningCalls += 1;
      if (wakeWordBehavior.startListeningError) {
        throw wakeWordBehavior.startListeningError;
      }
    }
    async destroy(): Promise<void> {
      wakeWordBehavior.destroyCalls += 1;
    }
    enableDirectTranscription(): void {}
    disableDirectTranscription(): void {}
  },
}));

vi.mock("./config", async (importOriginal) => {
  // Assertion needed: importOriginal returns unknown, tsc requires typing for actual.CONFIG
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- importOriginal resolves to unknown at runtime
  const actual = (await importOriginal()) as { CONFIG: Record<string, unknown> };
  return {
    CONFIG: {
      ...actual.CONFIG,
      LLM_PROVIDER: "mock" as const,
    },
  };
});

describe("Product scenario: Kali App Core Integration Runtime Flows", () => {
  let mockUIService: IUIService;
  let mockSpeechService: ISpeechService;
  let mockIndicator: StatusIndicator;

  beforeEach(() => {
    vi.clearAllMocks();
    phaseOverride.value = undefined;
    initialStateOverride.apply = undefined;
    wakeWordBehavior.initializeError = null;
    wakeWordBehavior.startListeningError = null;
    wakeWordBehavior.initializeCalls = 0;
    wakeWordBehavior.startListeningCalls = 0;
    wakeWordBehavior.destroyCalls = 0;
    (
      globalThis as typeof globalThis & {
        window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
      }
    ).window = (
      globalThis as typeof globalThis & {
        window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
      }
    ).window ?? {
      setTimeout,
      clearTimeout,
    };
    mockIndicator = {
      setState: vi.fn(),
    } as unknown as StatusIndicator;
    mockUIService = {
      getStatusIndicator: vi.fn(() => mockIndicator),
      setButtonState: vi.fn(),
      hideButton: vi.fn(),
      showButton: vi.fn(),
      updateStatus: vi.fn(),
      clearConsole: vi.fn(),
      log: vi.fn(),
      addTranscription: vi.fn(),
      setTranscriptInputEnabled: vi.fn(),
    };
    mockSpeechService = {
      speak: vi.fn().mockResolvedValue(undefined),
      playSound: vi.fn(),
      startLoopingSound: vi.fn(),
      stopLoopingSound: vi.fn(),
      loadSound: vi.fn().mockResolvedValue(undefined),
      prime: vi.fn(),
    } as unknown as ISpeechService;
  });

  describe("Product scenario: Initialize saved game path (phase PLAYING)", () => {
    it("Expected outcome: Skips name collection when phase is PLAYING", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      expect(core.isInitialized()).toBe(true);
      expect(mockUIService.hideButton).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("listening");
      expect(mockSpeechService.startLoopingSound).toHaveBeenCalled();
    });
  });

  describe("Product scenario: Initialize setup path (phase SETUP)", () => {
    it("Expected outcome: Enters name collection when phase is SETUP and accepts transcript input", async () => {
      phaseOverride.value = GamePhase.SETUP;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });

      const initPromise = core.initialize();
      await new Promise((r) => setTimeout(r, 400));
      expect(core.canAcceptTranscript()).toBe(true);
      await core.submitTranscript("2");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("Alice");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("yes");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("Bob");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("yes");
      await new Promise((r) => setTimeout(r, 300));

      await initPromise;

      expect(core.isInitialized()).toBe(true);
      expect(mockUIService.setTranscriptInputEnabled).toHaveBeenCalledWith(true);
      expect(mockUIService.setTranscriptInputEnabled).toHaveBeenCalledWith(false);
    });
  });

  describe("Product scenario: Handle Transcription to handle Transcript to check And Advance Turn", () => {
    it("Expected outcome: Submits transcript and advances turn when actions succeed", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      await core.submitTranscript("I rolled a 3");

      expect(mockSpeechService.speak).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("listening");
    });

    it("Expected outcome: Speaks turn follow up after call Advance Turn result", async () => {
      setLocale("en-US");
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.players.p1 = { ...state.players.p1, activeChoices: { 0: 1 } };
        state.players.p2 = { ...state.players.p2, activeChoices: { 0: 1 } };
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      const result = await core.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "NARRATE", text: "Moving two spaces." },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("callAdvanceTurn");
      expect(mockSpeechService.speak).toHaveBeenCalled();
    });

    it("Expected outcome: Speaks Spanish turn follow up after call Advance Turn result", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.players.p1 = { ...state.players.p1, activeChoices: { 0: 1 } };
        state.players.p2 = { ...state.players.p2, activeChoices: { 0: 1 } };
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      const result = await core.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "NARRATE", text: "Avanzo dos casillas." },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("callAdvanceTurn");
      expect(mockSpeechService.speak).toHaveBeenCalled();
      setLocale("en-US");
    });

    it("Expected outcome: Speaks turn follow up after already Advanced result", async () => {
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.game.turn = "p1";
        state.game.playerOrder = ["p1", "p2"];
        state.game.pending = {
          kind: "powerCheck",
          playerId: "p1",
          position: 5,
          power: 4,
          riddleCorrect: false,
        };
        state.players.p1 = { id: "p1", name: "Alice", position: 5 };
        state.players.p2 = { id: "p2", name: "Bob", position: 0 };
        const board = state.board ?? { squares: {} };
        board.squares = {
          "5": { name: "Cobra", power: 4 },
          "100": { effect: "win" },
        };
        state.board = board;
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      const result = await core.testExecuteActions([{ action: "PLAYER_ANSWERED", answer: "2" }]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("alreadyAdvanced");
      expect(mockSpeechService.speak).toHaveBeenCalled();
      const spokenMessages = vi
        .mocked(mockSpeechService.speak)
        .mock.calls.map((call) => String(call[0]));
      expect(spokenMessages.some((line) => line.includes("Bob"))).toBe(true);
    });

    it("Expected outcome: Speaks fallback line when successful none result is silent", async () => {
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.game.turn = "p1";
        state.game.playerOrder = ["p1", "p2"];
        state.players.p1 = { id: "p1", name: "Alice", position: 0, activeChoices: {} };
        state.players.p2 = { id: "p2", name: "Bob", position: 0 };
        const board = state.board ?? { squares: {} };
        board.squares = {
          "0": { next: [1, 15] },
          "100": { effect: "win" },
        };
        state.board = board;
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      const result = await core.testExecuteActions([{ action: "PLAYER_ANSWERED", answer: "15" }]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("none");
      expect(mockSpeechService.speak).toHaveBeenCalledTimes(1);
    });
  });

  describe("Product scenario: Test Execute Actions", () => {
    it("Expected outcome: Executes actions and advances turn when turn Advance is call Advance Turn", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      const result = await core.testExecuteActions([
        { action: "PLAYER_ANSWERED", answer: "A" },
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "NARRATE", text: "Moving 2 spaces" },
      ]);

      expect(result.success).toBe(true);
      expect(result.turnAdvance.kind).toBe("callAdvanceTurn");
      expect(mockSpeechService.speak).toHaveBeenCalled();
    });
  });

  describe("Product scenario: Dispose", () => {
    it("Expected outcome: Resets state and shows button", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      expect(core.isInitialized()).toBe(true);

      await core.dispose();

      expect(core.isInitialized()).toBe(false);
      expect(mockSpeechService.stopLoopingSound).toHaveBeenCalled();
      expect(mockUIService.showButton).toHaveBeenCalled();
      expect(mockUIService.updateStatus).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("idle");
    });
  });

  describe("Product scenario: Startup failure and recovery", () => {
    it("Expected outcome: Announces initialization failure on model initialization error", async () => {
      setLocale("en-US");
      phaseOverride.value = GamePhase.PLAYING;
      wakeWordBehavior.initializeError = new Error("model download failed");
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });

      await core.initialize();

      expect(core.isInitialized()).toBe(false);
      expect(wakeWordBehavior.initializeCalls).toBe(1);
      expect(mockIndicator.setState).toHaveBeenCalledWith("idle");
      expect(mockSpeechService.speak).toHaveBeenCalledWith(t("ui.initializationFailed"));
    });

    it("Expected outcome: Announces initialization failure on microphone start error", async () => {
      setLocale("en-US");
      phaseOverride.value = GamePhase.PLAYING;
      wakeWordBehavior.startListeningError = new Error("microphone permission denied");
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });

      await core.initialize();

      expect(core.isInitialized()).toBe(false);
      expect(wakeWordBehavior.initializeCalls).toBe(1);
      expect(wakeWordBehavior.startListeningCalls).toBe(1);
      expect(mockSpeechService.speak).toHaveBeenCalledWith(t("ui.initializationFailed"));
    });

    it("Expected outcome: Recovers after retry when wake word startup stops failing", async () => {
      phaseOverride.value = GamePhase.PLAYING;
      wakeWordBehavior.startListeningError = new Error("mic blocked");
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });

      await core.initialize();
      expect(core.isInitialized()).toBe(false);

      wakeWordBehavior.startListeningError = null;
      await core.initialize();

      expect(core.isInitialized()).toBe(true);
      expect(wakeWordBehavior.initializeCalls).toBe(2);
      expect(wakeWordBehavior.startListeningCalls).toBe(2);
      expect(mockUIService.hideButton).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("listening");
    });
  });
});
