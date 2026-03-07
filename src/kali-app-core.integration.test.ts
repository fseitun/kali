/**
 * Runtime integration tests for KaliAppCore.
 * Exercises initialize, handleSavedGameOrSetup, handleTranscription flows with mocks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusIndicator } from "./components/status-indicator";
import type { GameModule } from "./game-loader";
import { KaliAppCore } from "./kali-app-core";
import { GamePhase } from "./orchestrator/types";
import type { ISpeechService } from "./services/speech-service";
import type { IUIService } from "./services/ui-service";

vi.mock("./utils/browser-support", () => ({
  checkBrowserSupport: vi.fn(),
}));

const phaseOverride = vi.hoisted(() => ({ value: undefined as GamePhase | undefined }));

vi.mock("./game-loader", async () => {
  const pathMod = await import("node:path");
  const fsMod = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
  const root = pathMod.resolve(__dirname, "..");
  return {
    GameLoader: class MockGameLoader {
      constructor(private _gamesPath: string) {
        void this._gamesPath;
      }

      async loadGame(gameId: string): Promise<GameModule> {
        const configPath = pathMod.join(root, "public", "games", gameId, "config.json");
        const raw = fsMod.readFileSync(configPath, "utf-8");
        const module = JSON.parse(raw) as GameModule;
        if (phaseOverride.value !== undefined) {
          (module.initialState.game as Record<string, unknown>).phase = phaseOverride.value;
        }
        return module;
      }

      async loadSoundEffects(): Promise<void> {}
    },
  };
});

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

describe("KaliAppCore Integration - Runtime Flows", () => {
  let mockUIService: IUIService;
  let mockSpeechService: ISpeechService;
  let mockIndicator: StatusIndicator;

  beforeEach(() => {
    vi.clearAllMocks();
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
      loadSound: vi.fn().mockResolvedValue(undefined),
      prime: vi.fn(),
    } as unknown as ISpeechService;
  });

  describe("initialize - saved game path (phase PLAYING)", () => {
    it("skips name collection when phase is PLAYING", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      expect(core.isInitialized()).toBe(true);
      expect(mockUIService.hideButton).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("listening");
    });
  });

  describe("initialize - setup path (phase SETUP)", () => {
    it("enters name collection when phase is SETUP and accepts transcript input", async () => {
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

  describe("handleTranscription → handleTranscript → checkAndAdvanceTurn", () => {
    it("submits transcript and advances turn when actions succeed", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      await core.submitTranscript("I rolled a 3");

      expect(mockSpeechService.speak).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("listening");
    });
  });

  describe("testExecuteActions", () => {
    it("executes actions and advances turn when shouldAdvanceTurn", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();

      const result = await core.testExecuteActions([
        { action: "PLAYER_ROLLED", value: 2 },
        { action: "NARRATE", text: "Moving 2 spaces" },
      ]);

      expect(result.success).toBe(true);
      expect(result.shouldAdvanceTurn).toBe(true);
      expect(mockSpeechService.speak).toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("resets state and shows button", async () => {
      phaseOverride.value = GamePhase.PLAYING;

      const core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
      await core.initialize();
      expect(core.isInitialized()).toBe(true);

      await core.dispose();

      expect(core.isInitialized()).toBe(false);
      expect(mockUIService.showButton).toHaveBeenCalled();
      expect(mockUIService.updateStatus).toHaveBeenCalled();
      expect(mockIndicator.setState).toHaveBeenCalledWith("idle");
    });
  });
});
