/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WakeWordDetector } from "./wake-word";

const recognizerStore = vi.hoisted(() => ({ instance: null as any }));
const modelTerminateMock = vi.hoisted(() => vi.fn());
const getModelMock = vi.hoisted(() => vi.fn().mockResolvedValue("blob:model-url"));
const isMobileDeviceMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("vosk-browser", () => ({
  createModel: vi.fn(async () => ({
    KaldiRecognizer: class MockKaldiRecognizer {
      handlers: Record<string, (msg: unknown) => void> = {};
      setWords = vi.fn();
      acceptWaveformFloat = vi.fn();
      remove = vi.fn();

      constructor() {
        recognizerStore.instance = this;
      }

      on(event: string, cb: (msg: unknown) => void): void {
        this.handlers[event] = cb;
      }
    },
    terminate: modelTerminateMock,
  })),
}));

vi.mock("../config", () => ({
  CONFIG: {
    WAKE_WORD: {
      TEXT: ["kali", "cali", "calli", "kaly", "caly", "callie", "callee", "kari"],
      TRANSCRIPTION_TIMEOUT_MS: 5000,
      FUZZY_MAX_EDIT_DISTANCE: 1,
    },
    AUDIO: {
      SAMPLE_RATE: 16000,
      CHANNEL_COUNT: 1,
      ECHO_CANCELLATION: true,
      NOISE_SUPPRESSION: true,
      WORKLET_PROCESSOR_NAME: "vosk-audio-processor",
    },
  },
}));

vi.mock("../utils/browser-support", () => ({
  isMobileDevice: isMobileDeviceMock,
}));

vi.mock("../utils/logger", () => ({
  Logger: {
    mic: vi.fn(),
    download: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    headphones: vi.fn(),
    listening: vi.fn(),
    wakeWord: vi.fn(),
    timeout: vi.fn(),
    transcription: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock("./model-manager", () => ({
  ModelManager: {
    getInstance: () => ({
      getModel: getModelMock,
    }),
  },
}));

describe("Product scenario: Wake Word Detector", () => {
  let addModuleMock: ReturnType<typeof vi.fn>;
  let createMediaStreamSourceMock: ReturnType<typeof vi.fn>;
  let audioNodeDisconnectMock: ReturnType<typeof vi.fn>;
  let audioNodePostMessageMock: ReturnType<typeof vi.fn>;
  let closeAudioContextMock: ReturnType<typeof vi.fn>;
  let mediaTrackStopMock: ReturnType<typeof vi.fn>;
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  function emitRecognizerResult(text: string, isPartial = false): void {
    const event = isPartial ? "partialresult" : "result";
    const payload = isPartial ? { result: { partial: text } } : { result: { text } };
    recognizerStore.instance.handlers[event]?.(payload);
  }

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    recognizerStore.instance = null;

    addModuleMock = vi.fn().mockResolvedValue(undefined);
    createMediaStreamSourceMock = vi.fn(() => ({ connect: vi.fn() }));
    closeAudioContextMock = vi.fn().mockResolvedValue(undefined);
    audioNodeDisconnectMock = vi.fn();
    audioNodePostMessageMock = vi.fn();
    mediaTrackStopMock = vi.fn();
    getUserMediaMock = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: mediaTrackStopMock }],
    });

    class MockAudioContext {
      audioWorklet = { addModule: addModuleMock };
      createMediaStreamSource = createMediaStreamSourceMock;
      close = closeAudioContextMock;
    }

    class MockAudioWorkletNode {
      port = {
        onmessage: null as ((event: unknown) => void) | null,
        postMessage: audioNodePostMessageMock,
      };
      disconnect = audioNodeDisconnectMock;
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        AudioContext: MockAudioContext,
        setTimeout,
        clearTimeout,
      },
    });
    Object.defineProperty(globalThis, "AudioWorkletNode", {
      configurable: true,
      value: MockAudioWorkletNode,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: getUserMediaMock,
        },
      },
    });
  });

  it("Expected outcome: Moves listening to transcribing and only emits final transcription", async () => {
    const onWakeWord = vi.fn();
    const onTranscription = vi.fn();
    const detector = new WakeWordDetector(onWakeWord, onTranscription);

    await detector.initialize();
    await detector.startListening();

    emitRecognizerResult("hey kali");
    expect(onWakeWord).toHaveBeenCalledTimes(1);

    emitRecognizerResult("kali roll 4", true);
    expect(onTranscription).not.toHaveBeenCalled();

    emitRecognizerResult("kali roll 4");
    expect(onTranscription).toHaveBeenCalledWith("roll 4");
  });

  it("Expected outcome: Returns to listening mode when transcription timeout elapses", async () => {
    vi.useFakeTimers();
    (
      globalThis.window as { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
    ).setTimeout = setTimeout;
    (
      globalThis.window as { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
    ).clearTimeout = clearTimeout;
    const detector = new WakeWordDetector(vi.fn(), vi.fn());

    await detector.initialize();
    await detector.startListening();
    emitRecognizerResult("kali");

    expect((detector as any).state).toBe("TRANSCRIBING");
    await vi.advanceTimersByTimeAsync(5001);
    expect((detector as any).state).toBe("LISTENING_FOR_WAKE_WORD");
  });

  it("Expected outcome: Supports direct transcription mode toggles", async () => {
    const onTranscription = vi.fn();
    const detector = new WakeWordDetector(vi.fn(), onTranscription);

    await detector.initialize();
    await detector.startListening();

    detector.enableDirectTranscription();
    emitRecognizerResult("kali answer is b");
    expect(onTranscription).toHaveBeenCalledWith("answer is b");

    detector.disableDirectTranscription();
    expect((detector as any).state).toBe("LISTENING_FOR_WAKE_WORD");
  });

  it("Expected outcome: Starts and stops microphone/worklet lifecycle cleanly", async () => {
    const detector = new WakeWordDetector(vi.fn(), vi.fn());

    await detector.initialize();
    await detector.startListening();
    expect(detector.isActive()).toBe(true);
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(audioNodePostMessageMock).toHaveBeenCalledWith({ type: "start" });

    await detector.stopListening();
    expect(audioNodePostMessageMock).toHaveBeenCalledWith({ type: "stop" });
    expect(audioNodeDisconnectMock).toHaveBeenCalledTimes(1);
    expect(mediaTrackStopMock).toHaveBeenCalledTimes(1);
    expect(detector.isActive()).toBe(false);
  });

  it("Expected outcome: Destroy releases recognizer model and audio context", async () => {
    const detector = new WakeWordDetector(vi.fn(), vi.fn());

    await detector.initialize();
    await detector.startListening();
    await detector.destroy();

    expect(closeAudioContextMock).toHaveBeenCalledTimes(1);
    expect(modelTerminateMock).toHaveBeenCalledTimes(1);
  });

  it("Expected outcome: Propagates model loading failure during initialize", async () => {
    getModelMock.mockRejectedValueOnce(new Error("model fetch failed"));
    const detector = new WakeWordDetector(vi.fn(), vi.fn());

    await expect(detector.initialize()).rejects.toThrow("model fetch failed");
  });

  it("Expected outcome: Recovers from microphone failure after retry", async () => {
    const deniedError = new Error("permission denied");
    getUserMediaMock.mockRejectedValueOnce(deniedError);
    const detector = new WakeWordDetector(vi.fn(), vi.fn());
    await detector.initialize();

    await expect(detector.startListening()).rejects.toThrow("permission denied");
    expect(detector.isActive()).toBe(false);

    getUserMediaMock.mockResolvedValueOnce({
      getTracks: () => [{ stop: mediaTrackStopMock }],
    });
    await detector.startListening();

    expect(detector.isActive()).toBe(true);
    expect(audioNodePostMessageMock).toHaveBeenCalledWith({ type: "start" });
  });
});
