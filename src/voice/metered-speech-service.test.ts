import { describe, it, expect, vi } from "vitest";
import { MeteredSpeechService } from "./metered-speech-service";
import type { ISpeechService } from "@/services/speech-service";

describe("Product scenario: Metered Speech Service", () => {
  it("Expected outcome: Increments count only on speak, not play Sound", async () => {
    const inner: ISpeechService = {
      prime: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined),
      loadSound: vi.fn().mockResolvedValue(undefined),
      playSound: vi.fn(),
    };
    const metered = new MeteredSpeechService(inner);
    metered.beginGameplayTurn();
    expect(metered.didSpeakThisTurn()).toBe(false);
    metered.playSound("x");
    expect(metered.didSpeakThisTurn()).toBe(false);
    await metered.speak("hi");
    expect(metered.didSpeakThisTurn()).toBe(true);
    expect(inner.speak).toHaveBeenCalledWith("hi");
  });

  it("Expected outcome: Begin Gameplay Turn resets the counter", async () => {
    const inner: ISpeechService = {
      prime: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined),
      loadSound: vi.fn().mockResolvedValue(undefined),
      playSound: vi.fn(),
    };
    const metered = new MeteredSpeechService(inner);
    metered.beginGameplayTurn();
    await metered.speak("a");
    expect(metered.didSpeakThisTurn()).toBe(true);
    metered.beginGameplayTurn();
    expect(metered.didSpeakThisTurn()).toBe(false);
  });
});
