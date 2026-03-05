import type { IUIService } from "../services/ui-service";

export class Logger {
  private static uiService: IUIService | null = null;

  static setUIService(service: IUIService | null): void {
    Logger.uiService = service;
  }

  private static log(message: string, ...args: unknown[]): void {
    if (Logger.uiService) {
      const formatted =
        args.length > 0 ? `${message} ${args.map((a) => JSON.stringify(a)).join(" ")}` : message;
      Logger.uiService.log(formatted);
    }
  }

  static info(message: string, ...args: unknown[]): void {
    Logger.log(`✅ ${message}`, ...args);
  }

  static warn(message: string, ...args: unknown[]): void {
    Logger.log(`⚠️ ${message}`, ...args);
  }

  static error(message: string, ...args: unknown[]): void {
    Logger.log(`❌ ${message}`, ...args);
  }

  static debug(message: string, ...args: unknown[]): void {
    Logger.log(`🔍 ${message}`, ...args);
  }

  static listening(message: string): void {
    Logger.log(`👂 ${message}`);
  }

  static transcription(message: string): void {
    Logger.log(`📝 ${message}`);
  }

  static narration(message: string): void {
    Logger.log(`🔊 ${message}`);
  }

  static wakeWord(message: string): void {
    Logger.log(`🔥 ${message}`);
  }

  static brain(message: string): void {
    Logger.log(`🧠 ${message}`);
  }

  static download(message: string): void {
    Logger.log(`📥 ${message}`);
  }

  static mic(message: string): void {
    Logger.log(`🎤 ${message}`);
  }

  static headphones(message: string): void {
    Logger.log(`🎧 ${message}`);
  }

  static stop(message: string): void {
    Logger.log(`🛑 ${message}`);
  }

  static timeout(message: string): void {
    Logger.log(`⏱️ ${message}`);
  }

  static state(message: string, ...args: unknown[]): void {
    Logger.log(`📊 ${message}`, ...args);
  }

  static write(message: string): void {
    Logger.log(`✏️ ${message}`);
  }

  static read(message: string): void {
    Logger.log(`👁️ ${message}`);
  }

  static robot(message: string, ...args: unknown[]): void {
    Logger.log(`🤖 ${message}`, ...args);
  }
}
