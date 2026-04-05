import { describe, it, expect, vi, afterEach } from "vitest";
import { checkBrowserSupport, isMobileDevice } from "./browser-support";

// Mock CONFIG
vi.mock("../config", () => ({
  CONFIG: {
    MOBILE_DEVICE_PATTERN: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i,
  },
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
        WebAssembly: {},
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      } as unknown as Navigator);

      expect(() => checkBrowserSupport()).not.toThrow();
    });

    it("Expected outcome: Should throw error when Audio Context is missing", () => {
      vi.stubGlobal("window", {
        WebAssembly: {},
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      } as unknown as Navigator);

      expect(() => checkBrowserSupport()).toThrow("AudioContext API not supported");
    });

    it("Expected outcome: Should pass when webkit Audio Context is available", () => {
      vi.stubGlobal("window", {
        webkitAudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      } as unknown as Navigator);

      expect(() => checkBrowserSupport()).not.toThrow();
    });

    it("Expected outcome: Should throw error when Media Devices is missing", () => {
      vi.stubGlobal("window", {
        AudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      vi.stubGlobal("navigator", {} as unknown as Navigator);

      expect(() => checkBrowserSupport()).toThrow("MediaDevices API not supported");
    });

    it("Expected outcome: Should throw error when Web Assembly is missing", () => {
      vi.stubGlobal("window", {
        AudioContext: vi.fn(),
        indexedDB: {},
      } as unknown as Window & typeof globalThis);

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      } as unknown as Navigator);

      expect(() => checkBrowserSupport()).toThrow("WebAssembly API not supported");
    });

    it("Expected outcome: Should throw error when Indexed DB is missing", () => {
      vi.stubGlobal("window", {
        AudioContext: vi.fn(),
        WebAssembly: {},
      } as unknown as Window & typeof globalThis);

      vi.stubGlobal("navigator", {
        mediaDevices: {},
      } as unknown as Navigator);

      expect(() => checkBrowserSupport()).toThrow("IndexedDB API not supported");
    });

    it("Expected outcome: Should throw error for first missing API", () => {
      vi.stubGlobal("window", {} as unknown as Window & typeof globalThis);
      vi.stubGlobal("navigator", {} as unknown as Navigator);

      expect(() => checkBrowserSupport()).toThrow("AudioContext API not supported");
    });
  });

  describe("Product scenario: Is Mobile Device", () => {
    it("Expected outcome: Should detect Android devices", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(true);
    });

    it("Expected outcome: Should detect i Phone", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(true);
    });

    it("Expected outcome: Should detect i Pad", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(true);
    });

    it("Expected outcome: Should detect Black Berry", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (BlackBerry; U; BlackBerry 9800; en) AppleWebKit/534.1+",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(true);
    });

    it("Expected outcome: Should detect Opera Mini", () => {
      vi.stubGlobal("navigator", {
        userAgent:
          "Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(true);
    });

    it("Expected outcome: Should not detect desktop browsers", () => {
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(false);
    });

    it("Expected outcome: Should not detect mac OS browsers", () => {
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(false);
    });

    it("Expected outcome: Should not detect Linux browsers", () => {
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(false);
    });

    it("Expected outcome: Should handle empty user agent", () => {
      vi.stubGlobal("navigator", {
        userAgent: "",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(false);
    });

    it("Expected outcome: Should be case insensitive", () => {
      vi.stubGlobal("navigator", {
        userAgent: "mozilla/5.0 (android 10; sm-g975f) applewebkit/537.36",
      } as unknown as Navigator);

      expect(isMobileDevice()).toBe(true);
    });
  });
});
