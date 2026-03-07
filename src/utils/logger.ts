import type { IUIService } from "../services/ui-service";
import { isLogCategoryEnabled } from "./debug-options";

export class Logger {
  private static uiService: IUIService | null = null;

  static setUIService(service: IUIService | null): void {
    Logger.uiService = service;
  }

  private static serializeArg(arg: unknown): string {
    if (arg instanceof Error) {
      return arg.stack ?? `${arg.name}: ${arg.message}`;
    }
    return JSON.stringify(arg);
  }

  private static log(message: string, ...args: unknown[]): void {
    if (Logger.uiService) {
      const formatted =
        args.length > 0
          ? `${message} ${args.map((a) => Logger.serializeArg(a)).join(" ")}`
          : message;
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
    if (isLogCategoryEnabled("transcription")) Logger.log(`👂 ${message}`);
  }

  static transcription(message: string): void {
    if (isLogCategoryEnabled("transcription")) Logger.log(`📝 ${message}`);
  }

  static narration(message: string): void {
    if (isLogCategoryEnabled("narration")) Logger.log(`🔊 ${message}`);
  }

  static wakeWord(message: string): void {
    if (isLogCategoryEnabled("voice")) Logger.log(`🔥 ${message}`);
  }

  static brain(message: string): void {
    if (isLogCategoryEnabled("brain")) Logger.log(`🧠 ${message}`);
  }

  static download(message: string): void {
    if (isLogCategoryEnabled("voice")) Logger.log(`📥 ${message}`);
  }

  static mic(message: string): void {
    if (isLogCategoryEnabled("voice")) Logger.log(`🎤 ${message}`);
  }

  static headphones(message: string): void {
    if (isLogCategoryEnabled("voice")) Logger.log(`🎧 ${message}`);
  }

  static stop(message: string): void {
    if (isLogCategoryEnabled("voice")) Logger.log(`🛑 ${message}`);
  }

  static timeout(message: string): void {
    if (isLogCategoryEnabled("voice")) Logger.log(`⏱️ ${message}`);
  }

  static state(message: string, ...args: unknown[]): void {
    if (isLogCategoryEnabled("state")) Logger.log(`📊 ${message}`, ...args);
  }

  static write(message: string): void {
    if (isLogCategoryEnabled("actions")) Logger.log(`✏️ ${message}`);
  }

  static user(message: string, ...args: unknown[]): void {
    if (isLogCategoryEnabled("user")) Logger.log(`👤 ${message}`, ...args);
  }

  static init(message: string, ...args: unknown[]): void {
    if (isLogCategoryEnabled("init")) Logger.log(`🚀 ${message}`, ...args);
  }

  static read(message: string): void {
    Logger.log(`👁️ ${message}`);
  }

  static robot(message: string, ...args: unknown[]): void {
    if (isLogCategoryEnabled("llm")) Logger.log(`🤖 ${message}`, ...args);
  }
}
