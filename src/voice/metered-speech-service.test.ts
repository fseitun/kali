import { afterEach, describe, it, expect, vi } from "vitest";
import { MeteredSpeechService } from "./metered-speech-service";
import type { ISpeechService } from "@/services/speech-service";

function makeInner(speak: ISpeechService["speak"]): ISpeechService {
  return {
    prime: vi.fn(),
    speak,
    loadSound: vi.fn().mockResolvedValue(undefined),
    playSound: vi.fn(),
    startLoopingSound: vi.fn(),
    stopLoopingSound: vi.fn(),
    setAmbientCaptureMuted: vi.fn(),
  };
}

describe("Product scenario: Metered Speech Service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Expected outcome: Reports its own voice while talking and through the mic-gate tail", async () => {
    vi.useFakeTimers();
    let finishSpeaking = (): void => {};
    const metered = new MeteredSpeechService(
      makeInner(
        vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finishSpeaking = resolve;
            }),
        ),
      ),
    );

    expect(metered.isSelfAudible()).toBe(false);

    const speaking = metered.speak("Ana, te toca, tirá el dado");
    expect(metered.isSelfAudible()).toBe(true);

    finishSpeaking();
    await speaking;
    // The last of her sound is still travelling to the mic when onend fires.
    expect(metered.isSelfAudible()).toBe(true);

    vi.advanceTimersByTime(5_000);
    expect(metered.isSelfAudible()).toBe(false);
  });

  it("Expected outcome: The mic reopens fast enough for a child who answers immediately", async () => {
    vi.useFakeTimers();
    const metered = new MeteredSpeechService(makeInner(vi.fn().mockResolvedValue(undefined)));

    await metered.speak("Sofía, ¿querés ir al 97 o al 99?");
    // The gate must be back open well before Deepgram would finalize an answer (one endpointing
    // window, 700ms). Holding it longer is what silences the answer Kali just asked for.
    vi.advanceTimersByTime(250);

    expect(metered.isSelfAudible()).toBe(false);
  });

  it("Expected outcome: Back-to-back lines hold the gate open with no gap between them", async () => {
    vi.useFakeTimers();
    let finishFirst = (): void => {};
    const inner = makeInner(
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishFirst = resolve;
            }),
        )
        .mockResolvedValue(undefined),
    );
    const metered = new MeteredSpeechService(inner);

    // Narration then the turn line, the commonest pattern in the game. If the gate flickered
    // open between them the recogniser would hear the second line and could obey it.
    const narration = metered.speak("Ana avanza tres casilleros y cae en la selva.");
    const turnLine = metered.speak("Sofi, te toca. Estás en el casillero 5. Tirá el dado.");
    expect(metered.isSelfAudible()).toBe(true);

    finishFirst();
    await narration;
    expect(metered.isSelfAudible()).toBe(true);

    await turnLine;
    vi.advanceTimersByTime(5_000);
    expect(metered.isSelfAudible()).toBe(false);
  });

  it("Expected outcome: Increments count only on speak, not play Sound", async () => {
    const inner: ISpeechService = {
      prime: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined),
      loadSound: vi.fn().mockResolvedValue(undefined),
      playSound: vi.fn(),
      startLoopingSound: vi.fn(),
      stopLoopingSound: vi.fn(),
      setAmbientCaptureMuted: vi.fn(),
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
      startLoopingSound: vi.fn(),
      stopLoopingSound: vi.fn(),
      setAmbientCaptureMuted: vi.fn(),
    };
    const metered = new MeteredSpeechService(inner);
    metered.beginGameplayTurn();
    await metered.speak("a");
    expect(metered.didSpeakThisTurn()).toBe(true);
    metered.beginGameplayTurn();
    expect(metered.didSpeakThisTurn()).toBe(false);
  });
});
