import { CONFIG } from "@/config";
import { Logger } from "@/utils/logger";

interface DeepgramStreamMessage {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{ transcript?: string }>;
  };
  error?: string;
}

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
/** How long a socket must stay up before "it opened" counts as "it works". */
const CONNECTION_PROVEN_MS = 5_000;
/** A sustained outage is announced at most this often, however many sockets die inside it. */
const OUTAGE_ANNOUNCE_COOLDOWN_MS = 60_000;

/**
 * Live Deepgram websocket stream that emits finalized transcripts.
 * Acoustic-only: it accumulates `is_final` segments and flushes them as one utterance on
 * whichever end-of-speech signal arrives first — `speech_final` (VAD silence) or
 * `UtteranceEnd` (word-gap), since a noisy room can suppress the former entirely.
 */
export class DeepgramStream {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private ws: WebSocket | null = null;
  private isListening = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** is_final segments awaiting a speech_final / UtteranceEnd flush. */
  private finalSegments: string[] = [];
  private socketOpenedAtMs = 0;
  private sawTranscriptSinceOpen = false;
  private lastOutageAnnouncedAtMs = Number.NEGATIVE_INFINITY;

  /**
   * @param onFinalTranscript - Receives each finalized utterance
   * @param onRawTranscript - Receives every transcript fragment for UI display
   * @param onConnectionLost - Called once per outage when the socket drops unexpectedly, so the
   *   app can say it out loud; reconnection then continues in the background.
   * @param isSelfAudible - True while Kali's own TTS is in the room. The recogniser is fed
   *   silence for that window so her narration never comes back as a command she can obey.
   */
  constructor(
    private onFinalTranscript: (text: string) => void,
    private onRawTranscript?: (raw: string, processed: string, wakeWordDetected: boolean) => void,
    private onConnectionLost?: () => void,
    private isSelfAudible?: () => boolean,
  ) {}

  async initialize(): Promise<void> {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // Ask for the STT rate directly so the browser resamples with its own anti-alias filter.
    this.audioContext = new AudioContextClass({ sampleRate: CONFIG.AUDIO.SAMPLE_RATE });
    await this.audioContext.audioWorklet.addModule(
      new URL("../audio-worklet/pcm-processor.js", import.meta.url),
    );
    Logger.info("Deepgram stream detector ready");
  }

  private buildWebSocketUrl(): string {
    const url = new URL(CONFIG.DEEPGRAM.WS_URL);
    url.searchParams.set("model", CONFIG.DEEPGRAM.MODEL);
    url.searchParams.set("language", CONFIG.DEEPGRAM.LANGUAGE);
    url.searchParams.set("encoding", "linear16");
    // The browser may hand back a different rate than we asked for; report the real one or
    // Deepgram decodes our audio at the wrong speed.
    url.searchParams.set(
      "sample_rate",
      String(this.audioContext?.sampleRate ?? CONFIG.AUDIO.SAMPLE_RATE),
    );
    url.searchParams.set("channels", String(CONFIG.AUDIO.CHANNEL_COUNT));
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("endpointing", String(CONFIG.STT.ENDPOINTING_MS));
    // A room with kids and looping habitat audio keeps the VAD "hot", so speech_final can
    // simply never fire. UtteranceEnd watches word-timing gaps instead and is our fallback.
    url.searchParams.set("utterance_end_ms", String(CONFIG.STT.UTTERANCE_END_MS));
    // Bias the recogniser toward the wake word instead of fuzzy-matching misspellings after.
    url.searchParams.set("keyterm", CONFIG.WAKE_WORD.TEXT[0]);
    return url.toString();
  }

  async startListening(): Promise<void> {
    const audioContext = this.audioContext;
    if (!audioContext) {
      throw new Error("Deepgram stream not initialized");
    }
    if (!CONFIG.DEEPGRAM.API_KEY) {
      throw new Error("VITE_DEEPGRAM_API_KEY is required for Deepgram stream");
    }
    // iOS Safari starts the context suspended: without this the worklet never runs, no PCM is
    // sent, and Deepgram idle-closes while the app believes it is listening.
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: CONFIG.AUDIO.CHANNEL_COUNT,
        echoCancellation: CONFIG.AUDIO.ECHO_CANCELLATION,
        noiseSuppression: CONFIG.AUDIO.NOISE_SUPPRESSION,
      },
    });
    this.workletNode = new AudioWorkletNode(audioContext, CONFIG.AUDIO.WORKLET_PROCESSOR_NAME);
    const source = audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(this.workletNode);

    this.isListening = true;
    try {
      await this.openSocket();
    } catch (error) {
      await this.stopListening();
      throw error;
    }
  }

  /** Resolves once the socket is open; rejects when it closes before opening (bad key, no net). */
  private openSocket(): Promise<void> {
    const ws = new WebSocket(this.buildWebSocketUrl(), ["token", CONFIG.DEEPGRAM.API_KEY]);
    this.ws = ws;
    return new Promise<void>((resolve, reject) => {
      let opened = false;
      ws.onopen = () => {
        opened = true;
        // The backoff is NOT reset here: a socket that opens and dies at once (quota exhausted,
        // captive portal) would reset it every cycle and retry — and re-announce — forever.
        this.socketOpenedAtMs = Date.now();
        this.sawTranscriptSinceOpen = false;
        Logger.info("Deepgram streaming websocket opened");
        this.startAudioPump(ws);
        resolve();
      };
      ws.onmessage = (event) => this.handleSocketMessage(event.data);
      ws.onerror = () => Logger.error("Deepgram streaming websocket error");
      ws.onclose = (event) => {
        Logger.info(`Deepgram streaming websocket closed (${event.code})`);
        if (!opened) {
          reject(new Error(`Deepgram websocket closed before opening (${event.code})`));
          return;
        }
        this.handleUnexpectedClose();
      };
    });
  }

  private startAudioPump(ws: WebSocket): void {
    const workletNode = this.workletNode;
    if (!workletNode) {
      return;
    }
    workletNode.port.postMessage({ type: "start" });
    workletNode.port.onmessage = (event: MessageEvent<{ type: string; data: Int16Array }>) => {
      if (event.data.type !== "audioData" || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const pcm16 = event.data.data;
      if (!pcm16 || pcm16.length === 0) {
        return;
      }
      // Kali's own voice is replaced by silence, never dropped. Dropping the frames would splice
      // the words before her narration straight onto the words after it with no gap, so Deepgram
      // would read them as one utterance; it would also stall Deepgram's audio clock, which is
      // what endpointing is measured against, and starve the socket into its idle close.
      // Silence keeps time running, ends the pending utterance properly, and holds the socket up.
      const payload = this.isSelfAudible?.() === true ? new Int16Array(pcm16.length) : pcm16;
      ws.send(new Int16Array(payload).buffer);
    };
  }

  /** A socket that carried speech, or stayed up a while, has proven the connection works. */
  private connectionWasProven(): boolean {
    const upForMs = Date.now() - this.socketOpenedAtMs;
    return this.sawTranscriptSinceOpen || upForMs >= CONNECTION_PROVEN_MS;
  }

  /** One outage, one announcement: retries inside it must not repeat it on a loop. */
  private announceOutageOnce(): void {
    const now = Date.now();
    const sinceLast = now - this.lastOutageAnnouncedAtMs;
    if (this.reconnectAttempts > 0 || sinceLast < OUTAGE_ANNOUNCE_COOLDOWN_MS) {
      return;
    }
    this.lastOutageAnnouncedAtMs = now;
    this.onConnectionLost?.();
  }

  /** An expired key, a network blip or Deepgram's idle close would otherwise leave Kali deaf. */
  private handleUnexpectedClose(): void {
    if (!this.isListening) {
      return;
    }
    if (this.connectionWasProven()) {
      this.reconnectAttempts = 0;
    }
    this.announceOutageOnce();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || !this.isListening) {
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (!this.isListening) {
      return;
    }
    Logger.info(`Reconnecting Deepgram websocket (attempt ${this.reconnectAttempts})`);
    try {
      await this.openSocket();
    } catch (error) {
      Logger.error(`Deepgram reconnect failed: ${String(error)}`);
      this.scheduleReconnect();
    }
  }

  private parseMessage(raw: unknown): DeepgramStreamMessage | null {
    try {
      return JSON.parse(String(raw)) as DeepgramStreamMessage;
    } catch {
      return null;
    }
  }

  private getMessageTranscript(payload: DeepgramStreamMessage): string {
    return payload.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
  }

  private isErrorMessage(payload: DeepgramStreamMessage): boolean {
    return payload.type === "Error" || Boolean(payload.error);
  }

  private handleErrorMessage(payload: DeepgramStreamMessage): void {
    Logger.error("Deepgram stream payload error:", payload.error ?? payload.type);
  }

  /** Emits everything finalized so far as one utterance, if there is anything to emit. */
  private flushUtterance(): void {
    const text = this.finalSegments.join(" ").trim();
    this.finalSegments = [];
    if (text !== "") {
      this.onFinalTranscript(text);
    }
  }

  private handleSocketMessagePayload(payload: DeepgramStreamMessage): void {
    if (this.isErrorMessage(payload)) {
      this.handleErrorMessage(payload);
      return;
    }
    // UtteranceEnd carries no transcript; it means "the speaker stopped" when the VAD
    // never went quiet enough for speech_final. Flush whatever we already finalized.
    if (payload.type === "UtteranceEnd") {
      this.flushUtterance();
      return;
    }

    const transcript = this.getMessageTranscript(payload);
    if (transcript !== "") {
      this.sawTranscriptSinceOpen = true;
      this.onRawTranscript?.(transcript, transcript, false);

      // Long sentences arrive as several is_final segments; only the last carries
      // speech_final. Accumulate, or the earlier words are dropped from the command.
      // speech_final normally implies is_final; take either so a lone speech_final
      // can never lose its own text.
      if (payload.is_final === true || payload.speech_final === true) {
        this.finalSegments.push(transcript);
      }
    }
    // Deepgram routinely terminates an utterance with an empty speech_final frame. Flushing on
    // it (before any empty-transcript early return) is what keeps commands off the ~1s
    // UtteranceEnd fallback.
    if (payload.speech_final === true) {
      this.flushUtterance();
    }
  }

  private handleSocketMessage(raw: unknown): void {
    const payload = this.parseMessage(raw);
    if (!payload) {
      return;
    }
    this.handleSocketMessagePayload(payload);
  }

  async stopListening(): Promise<void> {
    // Cleared first: the close below must not look like an outage worth reconnecting.
    this.isListening = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.lastOutageAnnouncedAtMs = Number.NEGATIVE_INFINITY;
    this.sawTranscriptSinceOpen = false;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "stop" });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.ws) {
      // close() is legal while CONNECTING too; skipping it leaks a socket that opens later
      // with our handlers still attached.
      this.ws.close();
      this.ws = null;
    }
    this.finalSegments = [];
  }

  isActive(): boolean {
    return this.isListening;
  }

  async destroy(): Promise<void> {
    await this.stopListening();
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}
