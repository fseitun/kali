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
    } as unknown as ISpeechService;
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

  it("Expected outcome: Wake to transcription window mutes and restores ambient audio", async () => {
    const nameHandler = vi.fn();
    const internalCore = core as unknown as {
      currentNameHandler: (text: string) => void;
      handleWakeWord(): void;
      handleTranscription(text: string): Promise<void>;
    };
    internalCore.currentNameHandler = nameHandler;

    internalCore.handleWakeWord();
    await internalCore.handleTranscription("hola");

    expect(mockSpeechService.setAmbientCaptureMuted).toHaveBeenNthCalledWith(1, true);
    expect(mockSpeechService.setAmbientCaptureMuted).toHaveBeenNthCalledWith(2, false);
    expect(nameHandler).toHaveBeenCalledWith("hola");
  });
});
