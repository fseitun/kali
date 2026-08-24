/**
 * Runtime integration tests for KaliAppCore.
 * Exercises initialize, handleSavedGameOrSetup, handleTranscription flows with mocks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusIndicator } from "./components/status-indicator";
import type { GameConfigInput, GameModule } from "./game-loader/types";
import { setLocale, t } from "./i18n/translations";
import { KaliAppCore } from "./kali-app-core";
import { Orchestrator } from "./orchestrator/orchestrator";
import type { GameState } from "./orchestrator/types";
import { GamePhase } from "./orchestrator/types";
import type { ISpeechService } from "./services/speech-service";
import type { IUIService } from "./services/ui-service";
import { StateManager } from "./state-manager";

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
  /** Set by the mock so tests can push transcripts the way the real socket does. */
  emitTranscript: null as ((text: string) => void) | null,
  emitConnectionLost: null as (() => void) | null,
}));
const sttConfigOverride = vi.hoisted(() => ({
  deepgramApiKey: "test-deepgram-key",
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

vi.mock("@/voice-recognition/deepgram-stream", () => ({
  DeepgramStream: class MockDeepgramStream {
    constructor(
      onFinalTranscript: (text: string) => void,
      _onRawTranscript?: unknown,
      onConnectionLost?: () => void,
    ) {
      wakeWordBehavior.emitTranscript = onFinalTranscript;
      wakeWordBehavior.emitConnectionLost = onConnectionLost ?? null;
    }
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
  },
}));

function listeningMode(core: KaliAppCore): string {
  return (core as unknown as { listeningMode: string }).listeningMode;
}

function stateOf(core: KaliAppCore): GameState {
  return (core as unknown as { stateManager: StateManager }).stateManager.getState();
}

/** Counts the transcripts that actually reached the orchestrator, dropped ones excluded. */
function spyOnHandleTranscript(core: KaliAppCore): ReturnType<typeof vi.spyOn> {
  const orchestrator = (core as unknown as { orchestrator: { handleTranscript: () => unknown } })
    .orchestrator;
  return vi.spyOn(orchestrator, "handleTranscript");
}

vi.mock("./config", async (importOriginal) => {
  // Assertion needed: importOriginal returns unknown, tsc requires typing for actual.CONFIG
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- importOriginal resolves to unknown at runtime
  const actual = (await importOriginal()) as { CONFIG: Record<string, unknown> };
  const sttBase = actual.CONFIG.STT as Record<string, unknown>;
  const deepgramBase = actual.CONFIG.DEEPGRAM as Record<string, unknown>;
  return {
    CONFIG: {
      ...actual.CONFIG,
      LLM_PROVIDER: "mock" as const,
      STT: sttBase,
      DEEPGRAM: {
        ...deepgramBase,
        get API_KEY() {
          return sttConfigOverride.deepgramApiKey;
        },
      },
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
    wakeWordBehavior.emitTranscript = null;
    wakeWordBehavior.emitConnectionLost = null;
    sttConfigOverride.deepgramApiKey = "test-deepgram-key";
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
      setAmbientCaptureMuted: vi.fn(),
      loadSound: vi.fn().mockResolvedValue(undefined),
      prime: vi.fn(),
    };
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

    it("Expected outcome: A resumed game says whose turn it is and what they owe, with no LLM", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });
      await core.initialize();

      // "Partida guardada" alone leaves the table not knowing whose turn it is, and hands the
      // "what do they do now" job to the LLM, whose generic NARRATE then suppresses the fork
      // enforcement that would have asked the real question. Kalimba resumes on that fork.
      const state = stateOf(core);
      const turn = state.game.turn as string;
      const spoken = vi.mocked(mockSpeechService.speak).mock.calls.map((call) => String(call[0]));
      expect(spoken).toContain(
        t("game.turnAnnouncementWithDecision", {
          name: state.players[turn].name,
          position: state.players[turn].position,
          prompt: t("game.forkPromptLeftRight"),
        }),
      );
      // The answer must not need the wake word: Kali just asked the question.
      expect(listeningMode(core)).toBe("prompted");
      setLocale("en-US");
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
      expect(mockSpeechService.startLoopingSound).toHaveBeenCalled();
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
      // Kali just said whose turn it is: that player answers without repeating the wake word.
      expect(listeningMode(core)).toBe("prompted");
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
      expect(listeningMode(core)).toBe("prompted");
    });

    it("Expected outcome: Announces every skipped player on a mechanical advance too", async () => {
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.game.turn = "p1";
        state.game.playerOrder = ["p1", "p2", "p3"];
        state.game.pending = {
          kind: "powerCheck",
          playerId: "p1",
          position: 5,
          power: 4,
          riddleCorrect: false,
        };
        state.players.p1 = { id: "p1", name: "Alice", position: 5 };
        state.players.p2 = { id: "p2", name: "Bob", position: 0, skipTurns: 1 };
        state.players.p3 = { id: "p3", name: "Cami", position: 0 };
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

      expect(result.turnAdvance.kind).toBe("alreadyAdvanced");
      const skipped =
        result.turnAdvance.kind === "alreadyAdvanced"
          ? result.turnAdvance.nextPlayer.skippedPlayers
          : [];
      expect(skipped).toHaveLength(1);
      const spokenMessages = vi
        .mocked(mockSpeechService.speak)
        .mock.calls.map((call) => String(call[0]));
      // Bob is passed over: saying nothing about it makes the table lose track of whose turn it is.
      expect(spokenMessages).toContain(t("game.skipTurnAnnouncement", { name: "Bob" }));
      expect(spokenMessages.some((line) => line.includes("Cami"))).toBe(true);
    });

    it("Expected outcome: Lets the answer to an animal riddle skip the wake word", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.game.turn = "p1";
        state.game.playerOrder = ["p1", "p2"];
        state.players.p1 = {
          ...state.players.p1,
          id: "p1",
          name: "Sofi",
          position: 0,
          activeChoices: { 0: 1 },
        };
        state.players.p2 = {
          ...state.players.p2,
          id: "p2",
          name: "Beni",
          position: 0,
          activeChoices: { 0: 1 },
        };
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      // Lands on square 2 (Falcon): Kali reads a four-option riddle and waits for the answer.
      const result = await core.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "NARRATE", text: "Avanzás dos casilleros." },
      ]);

      expect(result.success).toBe(true);
      const spoken = vi.mocked(mockSpeechService.speak).mock.calls.map((call) => String(call[0]));
      expect(spoken.some((line) => line.includes("Falcon"))).toBe(true);
      // The pending riddle blocks advancement, so no turn announcement opens the window for us.
      expect(core.getDebugPlayerBoardSnapshot()?.turn).toBe("p1");
      // The owed answer is a riddle, not a fork: without the wake word it would be dropped.
      expect(listeningMode(core)).toBe("prompted");
      setLocale("en-US");
    });

    it("Expected outcome: Speaks fallback line when silent, and waits for the roll wake-word-free", async () => {
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
      // That line is "listo, tirá el dado": nothing is pending any more, so only this opens the
      // window and the roll it asks for would otherwise need the wake word.
      expect(listeningMode(core)).toBe("prompted");
    });
  });

  describe("Product scenario: Streamed voice transcripts", () => {
    async function initPlayingCoreWithStream(): Promise<KaliAppCore> {
      phaseOverride.value = GamePhase.PLAYING;
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();
      return core;
    }

    it("Expected outcome: Handles a second utterance that arrives while the first is running", async () => {
      const core = await initPlayingCoreWithStream();

      // Two kids talking over each other: the orchestrator lock used to swallow the second.
      wakeWordBehavior.emitTranscript?.("kali saqué 3");
      wakeWordBehavior.emitTranscript?.("kali saqué 4");
      await (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue;

      const spoken = vi.mocked(mockSpeechService.speak).mock.calls.map((call) => String(call[0]));
      expect(spoken.length).toBeGreaterThanOrEqual(2);
    });

    it("Expected outcome: Takes the fork answer built out of the words Kali just spoke", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      // Kalimba opens on a fork and Kali reads the options aloud, so the only correct answer is
      // made of her own words. No content check can tell it from her line coming back, which is
      // why her voice is kept out of the recogniser instead of recognised after the fact.
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });
      await core.initialize();
      const handleTranscript = spyOnHandleTranscript(core);
      vi.mocked(mockSpeechService.speak).mockClear();

      wakeWordBehavior.emitTranscript?.("quiero ir por la izquierda");
      await (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue;
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleTranscript).toHaveBeenCalledWith("quiero ir por la izquierda");
      setLocale("en-US");
    });

    it("Expected outcome: Takes that answer even after several of her lines ran together", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });
      await core.initialize();
      const handleTranscript = spyOnHandleTranscript(core);
      const speechService = (
        core as unknown as { speechService: { speak: (text: string) => Promise<void> } }
      ).speechService;
      // Consecutive lines have no silence between them, so the recogniser would have pooled all
      // three into one utterance. The mic is gated across the whole run and reopens after.
      await speechService.speak("Sofi avanza tres casilleros y cae en la selva.");
      await speechService.speak("Beni, te toca. Estás en el casillero 0.");
      await speechService.speak("¿Querés ir por la izquierda o por la derecha?");
      vi.mocked(mockSpeechService.speak).mockClear();

      wakeWordBehavior.emitTranscript?.("quiero ir por la izquierda");
      await (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue;
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleTranscript).toHaveBeenCalledWith("quiero ir por la izquierda");
      setLocale("en-US");
    });

    it("Expected outcome: Handles a repeated command once, not twice", async () => {
      const core = await initPlayingCoreWithStream();
      const handleTranscript = spyOnHandleTranscript(core);

      // The kid hears nothing while the LLM round trip runs and says it again.
      wakeWordBehavior.emitTranscript?.("kali saqué cuatro");
      wakeWordBehavior.emitTranscript?.("kali saqué cuatro");
      await (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue;

      expect(handleTranscript).toHaveBeenCalledTimes(1);
    });

    it("Expected outcome: Says it missed a command that waited too long in the queue", async () => {
      setLocale("es-AR");
      const core = await initPlayingCoreWithStream();
      const handleTranscript = spyOnHandleTranscript(core);
      let release = (): void => {};
      (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue = new Promise<void>(
        (resolve) => {
          release = resolve;
        },
      );

      wakeWordBehavior.emitTranscript?.("kali saqué cuatro");
      const arrived = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(arrived + 30_000);
      try {
        release();
        await (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue;
      } finally {
        // A pinned clock leaking into the next test freezes every cooldown in the file.
        vi.mocked(Date.now).mockRestore();
      }

      // Half a minute later the table has moved on: replaying it would move the wrong player.
      expect(handleTranscript).not.toHaveBeenCalled();
      const spoken = vi.mocked(mockSpeechService.speak).mock.calls.map((call) => String(call[0]));
      expect(spoken).toContain(t("errors.sttOnlineTimeout"));
      setLocale("en-US");
    });

    it("Expected outcome: Takes a riddle answer after the prompted window has lapsed", async () => {
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.game.pending = {
          kind: "riddle",
          playerId: state.game.turn ?? "p1",
          position: 2,
          power: 3,
          riddlePrompt: "¿Dónde vive el pingüino?",
          riddleOptions: ["el océano", "el desierto"],
          correctOption: "el océano",
        };
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });
      await core.initialize();
      const handleTranscript = spyOnHandleTranscript(core);
      // The child thought about it for more than ten seconds, so the window is back to ambient.
      (core as unknown as { listeningMode: string }).listeningMode = "ambient";

      wakeWordBehavior.emitTranscript?.("kali el océano");
      await (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue;
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleTranscript).toHaveBeenCalledWith("el océano");
    });

    it("Expected outcome: Takes a riddle answer that skipped the wake word entirely", async () => {
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        state.game.pending = {
          kind: "riddle",
          playerId: state.game.turn ?? "p1",
          position: 2,
          power: 3,
          riddlePrompt: "¿Dónde vive el pingüino?",
          riddleOptions: ["el océano", "el desierto"],
          correctOption: "el océano",
        };
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });
      await core.initialize();
      const handleTranscript = spyOnHandleTranscript(core);
      (core as unknown as { listeningMode: string }).listeningMode = "ambient";

      // A riddle is four sentence-length options long: children take longer than the window to
      // answer, and they answer the question, not the wake word.
      wakeWordBehavior.emitTranscript?.("creo que vive en el océano");
      await (core as unknown as { transcriptQueue: Promise<void> }).transcriptQueue;
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handleTranscript).toHaveBeenCalledWith("creo que vive en el océano");
    });

    it("Expected outcome: Announces a lost transcription socket out loud", async () => {
      const core = await initPlayingCoreWithStream();
      void core;

      wakeWordBehavior.emitConnectionLost?.();

      expect(mockSpeechService.speak).toHaveBeenCalledWith(t("errors.sttOnlineFailed"));
    });
  });

  describe("Product scenario: Test Execute Actions", () => {
    it("Expected outcome: Executes actions and advances turn when turn Advance is call Advance Turn", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      const result = await core.testExecuteActions([
        // The opening fork is labelled left/right, not A/B: answer it in its own words.
        { action: "PLAYER_ANSWERED", answer: "left" },
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

    it("Expected outcome: Says the microphone is blocked, not a generic failure", async () => {
      setLocale("en-US");
      phaseOverride.value = GamePhase.PLAYING;
      wakeWordBehavior.startListeningError = new DOMException("denied", "NotAllowedError");
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: false });

      await core.initialize();

      expect(mockSpeechService.speak).toHaveBeenCalledWith(t("errors.microphoneAccess"));
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
      // The failed first detector is disposed, not left holding a mic and a socket.
      expect(wakeWordBehavior.destroyCalls).toBe(1);
      expect(mockUIService.hideButton).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("listening");
    });
  });
  describe("Product scenario: State authority at startup (axiom 1)", () => {
    it("Expected outcome: The app writes nothing into state itself — the loader authors stateDisplay", async () => {
      phaseOverride.value = GamePhase.PLAYING;
      const setSpy = vi.spyOn(StateManager.prototype, "set");

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      expect(setSpy.mock.calls.map((call) => call[0])).not.toContain("stateDisplay");
      // Still in the state tree: state-context.ts reads it there to build <game_state>.
      expect(stateOf(core).stateDisplay).toBeDefined();
      setSpy.mockRestore();
    });

    it("Expected outcome: A startup failure starts fresh through RESET_GAME, not behind the orchestrator", async () => {
      phaseOverride.value = GamePhase.SETUP;
      let alreadyFailed = false;
      mockUIService.updateStatus = vi.fn(() => {
        if (alreadyFailed) {
          return;
        }
        alreadyFailed = true;
        throw new Error("status update failed");
      });
      const primitivesSpy = vi.spyOn(Orchestrator.prototype, "executePrimitiveActions");

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      const initPromise = core.initialize();
      await new Promise((r) => setTimeout(r, 400));
      await core.submitTranscript("2");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("Ana");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("Tomi");
      await new Promise((r) => setTimeout(r, 300));
      await initPromise;

      expect(primitivesSpy).toHaveBeenCalledWith([
        { action: "RESET_GAME", keepPlayerNames: false },
      ]);
      expect(core.isInitialized()).toBe(true);
      expect(core.getDebugPlayerBoardSnapshot()?.rows.map((row) => row.name)).toEqual([
        "Ana",
        "Tomi",
      ]);
      primitivesSpy.mockRestore();
    });
  });

  describe("Product scenario: A child asks to start the game over", () => {
    const twoNamedPlayers = (state: GameState): void => {
      state.game.phase = GamePhase.PLAYING;
      state.game.turn = "p2";
      state.game.playerOrder = ["p1", "p2"];
      state.players.p1 = { ...state.players.p1, id: "p1", name: "Sofi", position: 0 };
      state.players.p2 = { ...state.players.p2, id: "p2", name: "Beni", position: 0 };
    };

    it("Expected outcome: Keeps the roster, resumes play at the first player and says so out loud", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = twoNamedPlayers;
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      const result = await core.testExecuteActions([
        { action: "RESET_GAME", keepPlayerNames: true },
      ]);

      expect(result.success).toBe(true);
      expect(result.gameReset).toBe(true);
      const snapshot = core.getDebugPlayerBoardSnapshot();
      expect(snapshot?.turn).toBe("p1");
      expect(snapshot?.rows.map((row) => row.name)).toEqual(["Sofi", "Beni"]);
      expect(snapshot?.rows.every((row) => row.position === 0)).toBe(true);
      const spoken = vi.mocked(mockSpeechService.speak).mock.calls.map((call) => String(call[0]));
      expect(spoken).toContain(t("game.restarted"));
      expect(spoken.some((line) => line.includes("Sofi"))).toBe(true);
      setLocale("en-US");
    });

    it("Expected outcome: Restarts a finished game instead of leaving it stuck on the winner", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = (state) => {
        twoNamedPlayers(state);
        state.game.turn = "p1";
        state.board = {
          squares: { "0": { next: [1] }, "1": {}, "2": { effect: "win", next: [] } },
        };
      };
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      await core.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "NARRATE", text: "¡Llegaste!" },
      ]);
      // Sanity: the win registered — a finished game does not hand the turn to p2.
      expect(core.getDebugPlayerBoardSnapshot()?.turn).toBe("p1");
      vi.mocked(mockSpeechService.speak).mockClear();

      const result = await core.testExecuteActions([
        { action: "RESET_GAME", keepPlayerNames: true },
      ]);

      expect(result.gameReset).toBe(true);
      expect(core.getDebugPlayerBoardSnapshot()?.turn).toBe("p1");
      // The win must not survive the restart: turn advancement is dead while game.winner is set.
      await core.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 1 },
        { action: "NARRATE", text: "Avanzo." },
      ]);
      expect(core.getDebugPlayerBoardSnapshot()?.turn).toBe("p2");
      setLocale("en-US");
    });

    it("Expected outcome: Collects names again instead of going silent when the roster is dropped", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = twoNamedPlayers;
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      await core.testExecuteActions([{ action: "RESET_GAME", keepPlayerNames: false }]);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockUIService.setTranscriptInputEnabled).toHaveBeenCalledWith(true);
      expect(core.canAcceptTranscript()).toBe(true);
      const spoken = vi.mocked(mockSpeechService.speak).mock.calls.map((call) => String(call[0]));
      expect(spoken).toContain(t("game.restarted"));
      expect(spoken.some((line) => line.includes(t("setup.welcome", { game: "Kalimba" })))).toBe(
        true,
      );
      setLocale("en-US");
    });

    it("Expected outcome: Announces the first turn after the new roster is collected", async () => {
      setLocale("es-AR");
      phaseOverride.value = GamePhase.PLAYING;
      initialStateOverride.apply = twoNamedPlayers;
      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      vi.mocked(mockSpeechService.speak).mockClear();

      await core.testExecuteActions([{ action: "RESET_GAME", keepPlayerNames: false }]);
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("2");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("Ana");
      await new Promise((r) => setTimeout(r, 200));
      await core.submitTranscript("Tomi");
      await new Promise((r) => setTimeout(r, 300));

      const snapshot = core.getDebugPlayerBoardSnapshot();
      expect(snapshot?.rows.map((row) => row.name)).toEqual(["Ana", "Tomi"]);
      const spoken = vi.mocked(mockSpeechService.speak).mock.calls.map((call) => String(call[0]));
      // Without this last line the new game is silently unplayable: the last thing the table
      // heard was "¡Bárbaro, Tomi!" and nobody knows whose turn it is or what to answer.
      expect(spoken.at(-1)).toBe(
        t("game.turnAnnouncementWithDecision", {
          name: "Ana",
          position: 0,
          prompt: t("game.forkPromptLeftRight"),
        }),
      );
      expect(listeningMode(core)).toBe("prompted");
      setLocale("en-US");
    });
  });
});
