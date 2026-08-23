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
  /** is_final segments awaiting a speech_final / UtteranceEnd flush. */
  private finalSegments: string[] = [];

  constructor(
    private onFinalTranscript: (text: string) => void,
    private onRawTranscript?: (raw: string, processed: string, wakeWordDetected: boolean) => void,
  ) {}

  async initialize(): Promise<void> {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    await this.audioContext.audioWorklet.addModule(
      new URL("../audio-worklet/vosk-processor.js", import.meta.url),
    );
    Logger.info("Deepgram stream detector ready");
  }

  private buildWebSocketUrl(): string {
    const url = new URL(CONFIG.DEEPGRAM.WS_URL);
    url.searchParams.set("model", CONFIG.DEEPGRAM.MODEL);
    url.searchParams.set("language", CONFIG.DEEPGRAM.LANGUAGE);
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("sample_rate", String(CONFIG.AUDIO.SAMPLE_RATE));
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
    if (!this.audioContext) {
      throw new Error("Deepgram stream not initialized");
    }
    if (!CONFIG.DEEPGRAM.API_KEY) {
      throw new Error("VITE_DEEPGRAM_API_KEY is required for Deepgram stream");
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: CONFIG.AUDIO.CHANNEL_COUNT,
        echoCancellation: CONFIG.AUDIO.ECHO_CANCELLATION,
        noiseSuppression: CONFIG.AUDIO.NOISE_SUPPRESSION,
      },
    });
    this.workletNode = new AudioWorkletNode(this.audioContext, CONFIG.AUDIO.WORKLET_PROCESSOR_NAME);
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(this.workletNode);

    this.ws = new WebSocket(this.buildWebSocketUrl(), ["token", CONFIG.DEEPGRAM.API_KEY]);
    this.ws.onopen = () => {
      Logger.info("Deepgram streaming websocket opened");
      this.workletNode?.port.postMessage({ type: "start" });
      if (!this.workletNode) {
        return;
      }
      this.workletNode.port.onmessage = (
        event: MessageEvent<{ type: string; data: Int16Array }>,
      ) => {
        if (event.data.type !== "audioData" || this.ws?.readyState !== WebSocket.OPEN) {
          return;
        }
        const pcm16 = event.data.data;
        if (!pcm16 || pcm16.length === 0) {
          return;
        }
        const bytes = new Int16Array(pcm16);
        this.ws.send(bytes.buffer);
      };
    };
    this.ws.onmessage = (event) => this.handleSocketMessage(event.data);
    this.ws.onerror = () => Logger.error("Deepgram streaming websocket error");
    this.ws.onclose = (event) => Logger.info(`Deepgram streaming websocket closed (${event.code})`);
    this.isListening = true;
  }

  enableDirectTranscription(): void {
    Logger.info("Direct transcription mode enabled");
  }

  disableDirectTranscription(): void {
    Logger.info("Direct transcription mode disabled");
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
    if (!transcript) {
      return;
    }
    this.onRawTranscript?.(transcript, transcript, false);

    // Long sentences arrive as several is_final segments; only the last carries
    // speech_final. Accumulate, or the earlier words are dropped from the command.
    // speech_final normally implies is_final; take either so a lone speech_final
    // can never lose its own text.
    if (payload.is_final === true || payload.speech_final === true) {
      this.finalSegments.push(transcript);
    }
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
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "stop" });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.isListening = false;
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
