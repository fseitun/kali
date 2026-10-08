import type { ISpeechService } from "@/services/speech-service";

/**
 * How long Kali's voice still reaches the microphone after `speechSynthesis` reports the
 * utterance ended: the worklet's 128 ms chunk straddling the moment the gate lifts, plus `onend`
 * firing a touch before the speaker actually goes quiet.
 *
 * Deliberately short, and no longer trying to outlast Deepgram's finalization latency — the mic
 * gate keeps her voice out of the recogniser entirely, so there is nothing of hers left to
 * finalize late. All this tail can still cost is the first syllable of a child who answers the
 * instant she stops, and name-collection answers are one word long.
 */
const SELF_AUDIBLE_TAIL_MS = 200;

/**
 * Wraps a speech service and counts {@link ISpeechService.speak} invocations per gameplay turn.
 * Used with {@link MeteredSpeechService.beginGameplayTurn} so the app can detect silent successful turns.
 * Also tracks when Kali is audible, so the recogniser can be fed silence instead of her voice.
 */
export class MeteredSpeechService implements ISpeechService {
  private speakCount = 0;
  private activeSpeakCount = 0;
  private lastSpeakEndedAtMs = Number.NEGATIVE_INFINITY;

  /**
   * @param inner - Delegates all operations; only {@link speak} increments the counter
   */
  constructor(private readonly inner: ISpeechService) {}

  /**
   * Resets the speak counter. Call once at the start of each gameplay user turn (not during name collection).
   */
  beginGameplayTurn(): void {
    this.speakCount = 0;
  }

  /**
   * @returns true if {@link speak} was called at least once since the last {@link beginGameplayTurn}
   */
  didSpeakThisTurn(): boolean {
    return this.speakCount > 0;
  }

  /** @inheritdoc */
  prime(): void {
    this.inner.prime();
  }

  /**
   * True while Kali's own voice is in the room: from the moment `speak` is called until a short
   * tail after the last utterance ends. `DeepgramStream` gates the microphone on exactly this
   * window, so her narration never becomes a transcript she could then obey.
   *
   * Browser echo cancellation does not remove desktop `speechSynthesis` output, which is why the
   * gate exists at all rather than being left to the audio stack.
   *
   * Back-to-back lines hold it continuously: the gap between one `speak` resolving and the next
   * starting is a microtask, far inside the tail, so the gate never flickers open mid-narration.
   */
  isSelfAudible(): boolean {
    return this.activeSpeakCount > 0 || Date.now() - this.lastSpeakEndedAtMs < SELF_AUDIBLE_TAIL_MS;
  }

  /** @inheritdoc */
  speak(text: string): Promise<void> {
    this.speakCount += 1;
    this.activeSpeakCount += 1;
    return this.inner.speak(text).finally(() => {
      this.activeSpeakCount -= 1;
      this.lastSpeakEndedAtMs = Date.now();
    });
  }

  /** @inheritdoc */
  loadSound(name: string, url: string): Promise<void> {
    return this.inner.loadSound(name, url);
  }

  /** @inheritdoc */
  playSound(name: string): void {
    this.inner.playSound(name);
  }

  /** @inheritdoc */
  startLoopingSound(name: string): void {
    this.inner.startLoopingSound(name);
  }

  /** @inheritdoc */
  stopLoopingSound(): void {
    this.inner.stopLoopingSound();
  }

  /** @inheritdoc */
  setAmbientCaptureMuted(muted: boolean): void {
    this.inner.setAmbientCaptureMuted(muted);
  }
}
