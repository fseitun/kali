import { describe, it, expect, vi, afterEach } from "vitest";
import { checkBrowserSupport } from "./browser-support";

// Mock CONFIG
vi.mock("../config", () => ({
  CONFIG: {},
}));

describe("Product scenario: Browser support", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Product scenario: Check Browser Support", () => {
    it("Expected outcome: Should pass when all APIs are available", () => {
      vi.stubGlobal("window", {
        AudioContext: vi.fn(),
        webkitAudioContext: vi.fn(),
        AudioWorklet: vi.fn(),
        WebSocket: vi.fn(),
      });

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      });

      expect(() => checkBrowserSupport()).not.toThrow();
    });

    it("Expected outcome: Should throw error when Audio Context is missing", () => {
      vi.stubGlobal("window", {
        AudioWorklet: vi.fn(),
        WebSocket: vi.fn(),
      });

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      });

      expect(() => checkBrowserSupport()).toThrow("AudioContext API not supported");
    });

    it("Expected outcome: Should pass when webkit Audio Context is available", () => {
      vi.stubGlobal("window", {
        webkitAudioContext: vi.fn(),
        AudioWorklet: vi.fn(),
        WebSocket: vi.fn(),
      });

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      });

      expect(() => checkBrowserSupport()).not.toThrow();
    });

    it("Expected outcome: Should throw error when Media Devices is missing", () => {
      vi.stubGlobal("window", {
        AudioContext: vi.fn(),
        AudioWorklet: vi.fn(),
        WebSocket: vi.fn(),
      });

      vi.stubGlobal("navigator", {});

      expect(() => checkBrowserSupport()).toThrow("MediaDevices API not supported");
    });

    it("Expected outcome: Should throw error when Audio Worklet is missing", () => {
      vi.stubGlobal("window", {
        AudioContext: vi.fn(),
        WebSocket: vi.fn(),
      });

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      });

      expect(() => checkBrowserSupport()).toThrow("AudioWorklet API not supported");
    });

    it("Expected outcome: Should throw error when Web Socket is missing", () => {
      vi.stubGlobal("window", {
        AudioContext: vi.fn(),
        AudioWorklet: vi.fn(),
      });

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      });

      expect(() => checkBrowserSupport()).toThrow("WebSocket API not supported");
    });

    it("Expected outcome: Should throw error for first missing API", () => {
      vi.stubGlobal("window", {});
      vi.stubGlobal("navigator", {});

      expect(() => checkBrowserSupport()).toThrow("AudioContext API not supported");
    });
  });
});
