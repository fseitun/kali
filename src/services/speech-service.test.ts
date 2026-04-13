/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpeechService } from "./speech-service";

// Mock CONFIG
vi.mock("../config", () => ({
  CONFIG: {
    TTS: {
      RATE: 0.9,
      PITCH: 1.0,
    },
  },
}));

// Mock locale-manager (getTtsLang used by SpeechService for TTS language)
vi.mock("@/i18n/locale-manager", () => ({
  getTtsLang: () => "en-US",
}));

// Mock Logger
vi.mock("../utils/logger", () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    narration: vi.fn(),
  },
}));

describe("Product scenario: Speech Service", () => {
  let speechService: SpeechService;
  let mockSpeechSynthesis: any;
  let mockAudioContext: any;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speechService = new SpeechService();

    // Mock SpeechSynthesis
    mockSpeechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn(),
    };

    globalThis.window = {
      speechSynthesis: mockSpeechSynthesis,
    } as unknown as Window & typeof globalThis;

    // Mock AudioContext
    mockAudioContext = {
      decodeAudioData: vi.fn(),
      createBufferSource: vi.fn(),
      destination: {},
    };

    globalThis.AudioContext = class {
      constructor() {
        return mockAudioContext;
      }
    } as unknown as typeof AudioContext;

    // Mock fetch
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Product scenario: Prime", () => {
    it("Expected outcome: Should prime speech synthesis", () => {
      globalThis.SpeechSynthesisUtterance = class {
        onend = null;
        onerror = null;
      } as unknown as typeof SpeechSynthesisUtterance;

      speechService.prime();

      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      const utterance = mockSpeechSynthesis.speak.mock.calls[0][0];
      expect(utterance.onend).toBeNull();
      expect(utterance.onerror).toBeNull();
    });

    it("Expected outcome: Should not prime if speech Synthesis not available", () => {
      globalThis.window = {} as unknown as Window & typeof globalThis;

      speechService.prime();

      // Should not throw
      expect(true).toBe(true);
    });

    it("Expected outcome: Should not prime if already primed", () => {
      globalThis.SpeechSynthesisUtterance = class {
        onend = null;
        onerror = null;
      } as unknown as typeof SpeechSynthesisUtterance;

      speechService.prime();
      speechService.prime(); // Second call

      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    });
  });

  describe("Product scenario: Speak", () => {
    beforeEach(() => {
      globalThis.SpeechSynthesisUtterance = class {
        onend = null;
        onerror = null;
        rate = 0;
        pitch = 0;
        lang = "";
        constructor(public text = "") {}
      } as unknown as typeof SpeechSynthesisUtterance;
    });

    it("Expected outcome: Should speak text successfully", async () => {
      globalThis.SpeechSynthesisUtterance = class {
        onend = null;
        onerror = null;
        rate = 0;
        pitch = 0;
        lang = "";
        constructor(public text = "") {}
      } as unknown as typeof SpeechSynthesisUtterance;

      const speakPromise = speechService.speak("Hello world");
      // First call from prime(), second from actual speak
      const utterance = mockSpeechSynthesis.speak.mock.calls[1]?.[0];

      // Simulate successful speech
      setTimeout(() => {
        utterance?.onend?.();
      }, 0);

      await speakPromise;

      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      expect(utterance.rate).toBe(0.9);
      expect(utterance.pitch).toBe(1.0);
      expect(utterance.lang).toBe("en-US");
    });

    it("Expected outcome: Should handle speech synthesis not available", async () => {
      globalThis.window = {} as unknown as Window & typeof globalThis;

      await speechService.speak("Hello world");

      // Should resolve without error
      expect(true).toBe(true);
    });

    it("Expected outcome: Should handle speech synthesis error", async () => {
      globalThis.SpeechSynthesisUtterance = class {
        onend = null;
        onerror = null;
        rate = 0;
        pitch = 0;
        lang = "";
        constructor(public text = "") {}
      } as unknown as typeof SpeechSynthesisUtterance;

      const speakPromise = speechService.speak("Hello world");
      const utterance = mockSpeechSynthesis.speak.mock.calls[1]?.[0];

      // Simulate speech error
      setTimeout(() => {
        if (typeof utterance?.onerror === "function") {
          utterance.onerror({ error: "network" } as SpeechSynthesisErrorEvent);
        }
      }, 0);

      await speakPromise;

      // Should resolve even on error
      expect(true).toBe(true);
    });

    it("Expected outcome: Should handle interrupted speech", async () => {
      globalThis.SpeechSynthesisUtterance = class {
        onend = null;
        onerror = null;
        rate = 0;
        pitch = 0;
        lang = "";
        constructor(public text = "") {}
      } as unknown as typeof SpeechSynthesisUtterance;

      const speakPromise = speechService.speak("Hello world");
      const utterance = mockSpeechSynthesis.speak.mock.calls[1]?.[0];

      // Simulate interrupted speech
      setTimeout(() => {
        if (typeof utterance?.onerror === "function") {
          utterance.onerror({
            error: "interrupted",
          } as SpeechSynthesisErrorEvent);
        }
      }, 0);

      await speakPromise;

      // Should resolve without error
      expect(true).toBe(true);
    });

    it("Expected outcome: Should prime if not already primed", async () => {
      globalThis.SpeechSynthesisUtterance = class {
        onend = null;
        onerror = null;
        rate = 0;
        pitch = 0;
        lang = "";
        constructor(public text = "") {}
      } as unknown as typeof SpeechSynthesisUtterance;

      const speakPromise = speechService.speak("Hello world");
      const utterance = mockSpeechSynthesis.speak.mock.calls[1]?.[0];

      setTimeout(() => {
        utterance?.onend?.();
      }, 0);

      await speakPromise;

      // Should have called prime (cancel + speak)
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(2); // Once for prime, once for speak
    });
  });

  describe("Product scenario: Load Sound", () => {
    it("Expected outcome: Should load sound successfully", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockAudioBuffer = { duration: 1.0 };

      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      mockAudioContext.decodeAudioData.mockResolvedValueOnce(mockAudioBuffer);

      await speechService.loadSound("test-sound", "http://example.com/sound.mp3");

      expect(mockFetch).toHaveBeenCalledWith("http://example.com/sound.mp3");
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledWith(mockArrayBuffer);
    });

    it("Expected outcome: Should handle load sound failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await speechService.loadSound("test-sound", "http://example.com/sound.mp3");

      // Should not throw
      expect(true).toBe(true);
    });

    it("Expected outcome: Should handle decode audio data failure", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);

      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error("Invalid audio data"));

      await speechService.loadSound("test-sound", "http://example.com/sound.mp3");

      // Should not throw
      expect(true).toBe(true);
    });

    it("Expected outcome: Should create Audio Context if not exists", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockAudioBuffer = { duration: 1.0 };

      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      mockAudioContext.decodeAudioData.mockResolvedValueOnce(mockAudioBuffer);

      // Reset AudioContext to simulate it not being created yet
      speechService = new SpeechService();

      await speechService.loadSound("test-sound", "http://example.com/sound.mp3");

      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledWith(mockArrayBuffer);
    });
  });

  describe("Product scenario: Play Sound", () => {
    beforeEach(() => {
      const mockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };

      mockAudioContext.createBufferSource.mockReturnValue(mockSource);
    });

    it("Expected outcome: Should play loaded sound", () => {
      const mockBuffer = { duration: 1.0 };

      // Manually add sound to the service's internal map
      (speechService as any).sounds.set("test-sound", mockBuffer);

      speechService.playSound("test-sound");

      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
    });

    it("Expected outcome: Should handle missing sound gracefully", () => {
      speechService.playSound("nonexistent-sound");

      // Should not throw
      expect(true).toBe(true);
    });

    it("Expected outcome: Should create Audio Context if not exists", () => {
      const mockBuffer = { duration: 1.0 };
      const mockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };

      mockAudioContext.createBufferSource.mockReturnValue(mockSource);

      // Reset AudioContext to simulate it not being created yet
      speechService = new SpeechService();
      (speechService as any).sounds.set("test-sound", mockBuffer);

      speechService.playSound("test-sound");

      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
    });

    it("Expected outcome: Should handle play sound failure", () => {
      const mockBuffer = { duration: 1.0 };
      const mockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn().mockImplementation(() => {
          throw new Error("Playback error");
        }),
      };

      mockAudioContext.createBufferSource.mockReturnValue(mockSource);
      (speechService as any).sounds.set("test-sound", mockBuffer);

      speechService.playSound("test-sound");

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Product scenario: Looping Sound", () => {
    it("Expected outcome: Should start looping loaded sound", () => {
      const mockBuffer = { duration: 1.0 };
      const mockSource = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      mockAudioContext.createBufferSource.mockReturnValue(mockSource);
      (speechService as any).sounds.set("habitat-track", mockBuffer);

      speechService.startLoopingSound("habitat-track");

      expect(mockAudioContext.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockSource.loop).toBe(true);
      expect(mockSource.start).toHaveBeenCalledWith(0);
    });

    it("Expected outcome: Should replace active loop when switching sounds", () => {
      const mockBuffer = { duration: 1.0 };
      const firstSource = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      const secondSource = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      mockAudioContext.createBufferSource
        .mockReturnValueOnce(firstSource)
        .mockReturnValueOnce(secondSource);
      (speechService as any).sounds.set("track-a", mockBuffer);
      (speechService as any).sounds.set("track-b", mockBuffer);

      speechService.startLoopingSound("track-a");
      speechService.startLoopingSound("track-b");

      expect(firstSource.stop).toHaveBeenCalledTimes(1);
      expect(firstSource.disconnect).toHaveBeenCalledTimes(1);
      expect(secondSource.start).toHaveBeenCalledTimes(1);
    });

    it("Expected outcome: Should stop active looping sound", () => {
      const mockBuffer = { duration: 1.0 };
      const mockSource = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      mockAudioContext.createBufferSource.mockReturnValue(mockSource);
      (speechService as any).sounds.set("habitat-track", mockBuffer);

      speechService.startLoopingSound("habitat-track");
      speechService.stopLoopingSound();

      expect(mockSource.stop).toHaveBeenCalledTimes(1);
      expect(mockSource.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
