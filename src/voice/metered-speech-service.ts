import type { ISpeechService } from "@/services/speech-service";

/**
 * Wraps a speech service and counts {@link ISpeechService.speak} invocations per gameplay turn.
 * Used with {@link MeteredSpeechService.beginGameplayTurn} so the app can detect silent successful turns.
 */
export class MeteredSpeechService implements ISpeechService {
  private speakCount = 0;

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

  /** @inheritdoc */
  speak(text: string): Promise<void> {
    this.speakCount += 1;
    return this.inner.speak(text);
  }

  /** @inheritdoc */
  loadSound(name: string, url: string): Promise<void> {
    return this.inner.loadSound(name, url);
  }

  /** @inheritdoc */
  playSound(name: string): void {
    this.inner.playSound(name);
  }
}
