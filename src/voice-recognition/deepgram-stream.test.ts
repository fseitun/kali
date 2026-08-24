import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeepgramStream } from "./deepgram-stream";
import type * as ConfigModule from "@/config";

vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof ConfigModule>();
  return {
    CONFIG: {
      ...actual.CONFIG,
      DEEPGRAM: { ...actual.CONFIG.DEEPGRAM, API_KEY: "test-key" },
    },
  };
});

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

  it("Expected outcome: An empty speech_final terminator flushes without waiting for UtteranceEnd", () => {
    const { onFinal, feed } = makeStream();

    feed(segment("Kali, saqué tres", { is_final: true }));
    // Deepgram routinely closes the utterance with an empty speech_final frame.
    feed(segment("", { is_final: true, speech_final: true }));

    expect(onFinal).toHaveBeenCalledWith("Kali, saqué tres");
  });
});

/** Minimal WebSocket double: the socket only opens/closes when the test says so. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  closeCalls = 0;
  sent: unknown[] = [];

  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  serverOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  serverClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }
}

interface StartedStream {
  stream: DeepgramStream;
  onLost: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  start: Promise<void>;
}

/** Builds a stream with its audio side stubbed, then calls startListening (still pending). */
function startStream(
  contextState: AudioContextState = "running",
  isSelfAudible?: () => boolean,
): StartedStream {
  const onLost = vi.fn();
  const stream = new DeepgramStream(vi.fn(), undefined, onLost, isSelfAudible);
  const audioContext = {
    state: contextState,
    sampleRate: 16000,
    resume: vi.fn(async () => {
      audioContext.state = "running";
    }),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  };
  (stream as unknown as { audioContext: unknown }).audioContext = audioContext;
  return { stream, onLost, resume: audioContext.resume, start: stream.startListening() };
}

describe("Product scenario: Deepgram socket lifecycle", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "AudioWorkletNode",
      class {
        port = { postMessage: vi.fn(), onmessage: null };
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("Expected outcome: start Listening only resolves once the socket is actually open", async () => {
    const { stream, start } = startStream();
    let resolved = false;
    void start.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    // Socket still CONNECTING: claiming readiness here is what leaves Kali silently deaf.
    expect(resolved).toBe(false);
    expect(stream.isActive()).toBe(true);

    FakeWebSocket.instances[0].serverOpen();
    await start;

    expect(resolved).toBe(true);
  });

  it("Expected outcome: A socket rejected before opening fails start Listening", async () => {
    const { stream, start } = startStream();
    const failure = expect(start).rejects.toThrow("closed before opening");

    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].serverClose(4001); // expired API key

    await failure;
    expect(stream.isActive()).toBe(false);
  });

  it("Expected outcome: An unexpected close is announced once and reconnects with backoff", async () => {
    const { stream, onLost, start } = startStream();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].serverOpen();
    await start;

    FakeWebSocket.instances[0].serverClose(1011); // Deepgram idle close
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // Second attempt fails too: backoff doubles and the user is not told twice.
    FakeWebSocket.instances[1].serverClose(1011);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(onLost).toHaveBeenCalledTimes(1);

    FakeWebSocket.instances[2].serverOpen();
    expect(stream.isActive()).toBe(true);
    await stream.stopListening();
  });

  it("Expected outcome: A socket that opens and dies at once keeps backing off instead of announcing forever", async () => {
    const { stream, onLost, start } = startStream();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].serverOpen();
    await start;

    // Quota exhausted / captive portal: every socket completes the upgrade and dies immediately.
    FakeWebSocket.instances[0].serverClose(1008);
    expect(onLost).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].serverOpen();
    FakeWebSocket.instances[1].serverClose(1008);

    // An open that never carried a transcript is not proof the connection works: the backoff
    // must keep growing and the child must not hear the same failure on a one-second loop.
    expect(onLost).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(3);

    await stream.stopListening();
  });

  it("Expected outcome: stop Listening closes a socket that is still connecting", async () => {
    const { stream, start } = startStream();
    const failure = expect(start).rejects.toThrow("closed before opening");
    await vi.advanceTimersByTimeAsync(0);

    await stream.stopListening();
    await failure;

    expect(FakeWebSocket.instances[0].closeCalls).toBe(1);
  });

  it("Expected outcome: stop Listening cancels a pending reconnect", async () => {
    const { stream, start } = startStream();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].serverOpen();
    await start;

    FakeWebSocket.instances[0].serverClose(1011);
    await stream.stopListening();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("Expected outcome: A suspended Audio Context is resumed before capture starts", async () => {
    const { resume, start } = startStream("suspended");
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].serverOpen();
    await start;

    expect(resume).toHaveBeenCalled();
  });
});

/** Hands the audio pump one chunk of mic PCM, the way the worklet does. */
function pumpMicFrame(stream: DeepgramStream, samples: number[]): void {
  const port = (stream as unknown as { workletNode: { port: { onmessage: unknown } } }).workletNode
    .port;
  (port.onmessage as (event: { data: { type: string; data: Int16Array } }) => void)({
    data: { type: "audioData", data: new Int16Array(samples) },
  });
}

function lastSentSamples(socket: FakeWebSocket): number[] {
  return Array.from(new Int16Array(socket.sent.at(-1) as ArrayBuffer));
}

describe("Product scenario: Microphone gated while Kali speaks", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "AudioWorkletNode",
      class {
        port = { postMessage: vi.fn(), onmessage: null };
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function startGated(selfAudible: { value: boolean }): Promise<DeepgramStream> {
    const { stream, start } = startStream("running", () => selfAudible.value);
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].serverOpen();
    await start;
    return stream;
  }

  it("Expected outcome: Kali's own voice never reaches the recogniser", async () => {
    const selfAudible = { value: true };
    const stream = await startGated(selfAudible);

    // This chunk is Kali's TTS coming back through the mic. Transcribing it is what let her
    // answer her own fork question; no heuristic downstream can tell it from a child reading
    // back the options she just offered, because she offered them.
    pumpMicFrame(stream, [1200, -900, 4000, -32000]);

    const socket = FakeWebSocket.instances[0];
    expect(lastSentSamples(socket)).toEqual([0, 0, 0, 0]);

    await stream.stopListening();
  });

  it("Expected outcome: A child's answer right after she stops reaches the recogniser intact", async () => {
    const selfAudible = { value: true };
    const stream = await startGated(selfAudible);
    pumpMicFrame(stream, [1200, -900, 4000, -32000]);

    // The tail expires and the gate lifts: "quiero ir al 97" is drawn from the very words Kali
    // just spoke, so it must reach Deepgram untouched rather than be judged on its content.
    selfAudible.value = false;
    pumpMicFrame(stream, [7, -7, 21, -21]);

    expect(lastSentSamples(FakeWebSocket.instances[0])).toEqual([7, -7, 21, -21]);

    await stream.stopListening();
  });

  it("Expected outcome: Silence keeps flowing while she speaks, so the socket and the clock stay alive", async () => {
    const selfAudible = { value: true };
    const stream = await startGated(selfAudible);

    // Dropping the frames instead would stall Deepgram's audio clock — endpointing is measured
    // against received audio — splice the words either side of her line into one utterance, and
    // starve the socket toward its idle close.
    pumpMicFrame(stream, [1, 2, 3, 4]);
    pumpMicFrame(stream, [5, 6, 7, 8]);

    const socket = FakeWebSocket.instances[0];
    expect(socket.sent).toHaveLength(2);
    expect((socket.sent[0] as ArrayBuffer).byteLength).toBe(8);

    await stream.stopListening();
  });

  it("Expected outcome: A stream with no gate forwards every frame", async () => {
    const { stream, start } = startStream();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].serverOpen();
    await start;

    pumpMicFrame(stream, [3, -3, 9]);

    expect(lastSentSamples(FakeWebSocket.instances[0])).toEqual([3, -3, 9]);

    await stream.stopListening();
  });
});
