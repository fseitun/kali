import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IStatusIndicator } from "./components/status-indicator";
import { KaliAppCore } from "./kali-app-core";
import { FAILED_RESULT } from "./orchestrator/types";
import type { ISpeechService } from "./services/speech-service";
import type { IUIService } from "./services/ui-service";

describe("Product scenario: Kali App Core runtime invariants", () => {
  let mockUIService: IUIService;
  let mockSpeechService: ISpeechService;
  let core: KaliAppCore;

  beforeEach(() => {
    const indicator: IStatusIndicator = { setState: vi.fn(), getState: () => "idle" };
    mockUIService = {
      getStatusIndicator: vi.fn(() => indicator),
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
    core = new KaliAppCore(mockUIService, mockSpeechService, { skipWakeWord: true });
  });

  it("Expected outcome: Starts uninitialized and cannot accept transcripts", () => {
    expect(core.isInitialized()).toBe(false);
    expect(core.canAcceptTranscript()).toBe(false);
  });

  it("Expected outcome: test Execute Actions requires initialized orchestrator", async () => {
    await expect(core.testExecuteActions([{ action: "NARRATE", text: "hi" }])).rejects.toThrow(
      "Orchestrator not initialized",
    );
  });

  it("Expected outcome: Debug teleport is blocked unless feature is explicitly enabled", async () => {
    const result = await core.submitDebugPositionTeleport(5);
    expect(result).toBe(FAILED_RESULT);
  });

  it("Expected outcome: Ambient capture stays muted across every name during setup", async () => {
    const nameHandler = vi.fn();
    const internalCore = core as unknown as {
      currentNameHandler: (text: string) => void;
      acquireAmbientCaptureMute(): void;
      cleanupNameCollection(): void;
      handleTranscription(text: string): Promise<void>;
    };
    internalCore.currentNameHandler = nameHandler;

    // NameCollector takes a single hold for the whole setup phase.
    internalCore.acquireAmbientCaptureMute();
    await internalCore.handleTranscription("hola");
    await internalCore.handleTranscription("Fico");

    // Muted once, and never unmuted mid-setup: Kali's own TTS must not feed
    // back into the open Deepgram stream while more names are still coming.
    expect(mockSpeechService.setAmbientCaptureMuted).toHaveBeenCalledTimes(1);
    expect(mockSpeechService.setAmbientCaptureMuted).toHaveBeenNthCalledWith(1, true);
    expect(nameHandler).toHaveBeenCalledWith("hola");
    expect(nameHandler).toHaveBeenCalledWith("Fico");

    // The hold is owned by cleanup, which ends setup.
    internalCore.cleanupNameCollection();
    expect(mockSpeechService.setAmbientCaptureMuted).toHaveBeenNthCalledWith(2, false);
  });
});
