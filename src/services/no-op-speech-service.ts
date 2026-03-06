import { Logger } from "../utils/logger";
import type { ISpeechService } from "./speech-service";

/**
 * SpeechService implementation that logs narration to console and skips all audio.
 * Used in /debug for faster, text-only testing (no TTS, no sound effects).
 */
export class NoOpSpeechService implements ISpeechService {
  prime(): void {}

  speak(text: string): Promise<void> {
    Logger.narration(`Kali: "${text}"`);
    return Promise.resolve();
  }

  loadSound(_name: string, _url: string): Promise<void> {
    return Promise.resolve();
  }

  playSound(_name: string): void {}
}
