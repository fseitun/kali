import { describe, expect, it, vi } from "vitest";
import { DeepgramStream } from "./deepgram-stream";

/** Reaches the socket-message handler without needing a real websocket. */
function makeStream(): { onFinal: ReturnType<typeof vi.fn>; feed: (payload: unknown) => void } {
  const onFinal = vi.fn();
  const stream = new DeepgramStream(onFinal);
  const feed = (payload: unknown): void =>
    (stream as unknown as { handleSocketMessage(raw: unknown): void }).handleSocketMessage(
      JSON.stringify(payload),
    );
  return { onFinal, feed };
}

const segment = (
  transcript: string,
  flags: Record<string, unknown> = {},
): Record<string, unknown> => ({
  channel: { alternatives: [{ transcript }] },
  ...flags,
});

describe("Product scenario: Deepgram end-of-speech handling", () => {
  it("Expected outcome: Joins every is_final segment into one utterance on speech_final", () => {
    const { onFinal, feed } = makeStream();

    feed(segment("Kali, avanzo", { is_final: true }));
    feed(segment("tres casilleros", { is_final: true, speech_final: true }));

    // Not just the last segment: the earlier words are part of the command.
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("Kali, avanzo tres casilleros");
  });

  it("Expected outcome: UtteranceEnd flushes when room noise suppresses speech_final", () => {
    const { onFinal, feed } = makeStream();

    feed(segment("Kali, avanzo tres", { is_final: true }));
    expect(onFinal).not.toHaveBeenCalled();

    feed({ type: "UtteranceEnd", last_word_end: 3.1 });

    expect(onFinal).toHaveBeenCalledWith("Kali, avanzo tres");
  });

  it("Expected outcome: A speech_final without is_final still keeps its own text", () => {
    const { onFinal, feed } = makeStream();

    feed(segment("Kali, avanzo", { is_final: true }));
    feed(segment("tres", { is_final: false, speech_final: true }));

    expect(onFinal).toHaveBeenCalledWith("Kali, avanzo tres");
  });

  it("Expected outcome: Interim results alone never emit a command", () => {
    const { onFinal, feed } = makeStream();

    feed(segment("Kali av", { is_final: false }));
    feed(segment("Kali avan", { is_final: false }));

    expect(onFinal).not.toHaveBeenCalled();
  });

  it("Expected outcome: A bare UtteranceEnd with nothing buffered stays silent", () => {
    const { onFinal, feed } = makeStream();

    feed({ type: "UtteranceEnd", last_word_end: 1.0 });

    expect(onFinal).not.toHaveBeenCalled();
  });

  it("Expected outcome: The buffer does not leak into the next utterance", () => {
    const { onFinal, feed } = makeStream();

    feed(segment("primero", { is_final: true, speech_final: true }));
    feed(segment("segundo", { is_final: true, speech_final: true }));

    expect(onFinal).toHaveBeenNthCalledWith(1, "primero");
    expect(onFinal).toHaveBeenNthCalledWith(2, "segundo");
  });
});
