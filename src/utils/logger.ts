import { getLogBuffer } from "./log-buffer";
import type { LogLevel } from "./log-buffer";
import type { IUIService } from "@/services/ui-service";

export class Logger {
  private static uiService: IUIService | null = null;

  static setUIService(service: IUIService | null): void {
    Logger.uiService = service;
  }

  private static serializeArg(arg: unknown): unknown {
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      };
    }
    return arg;
  }

  private static pushToBuffer(
    level: LogLevel,
    category: string,
    message: string,
    args: unknown[],
  ): void {
    const buffer = getLogBuffer();
    if (!buffer) return;

    const context: Record<string, unknown> = {};
    if (args.length > 0) {
      context.args = args.map((a) => Logger.serializeArg(a));
    }
    const lastArg = args[args.length - 1];
    const stack = lastArg instanceof Error && lastArg.stack ? lastArg.stack : undefined;

    buffer.push(
      level,
      category,
      message,
      Object.keys(context).length > 0 ? context : undefined,
      stack,
    );
  }

  private static formatMessageForUI(message: string, ...args: unknown[]): string {
    const serialize = (a: unknown): string =>
      a instanceof Error ? (a.stack ?? `${a.name}: ${a.message}`) : JSON.stringify(a);
    return args.length > 0 ? `${message} ${args.map(serialize).join(" ")}` : message;
  }

  private static logWithCategory(
    level: LogLevel,
    category: string,
    message: string,
    ...args: unknown[]
  ): void {
    Logger.pushToBuffer(level, category, message, args);

    if (Logger.uiService) {
      Logger.uiService.log(Logger.formatMessageForUI(message, ...args));
    }
  }

  static info(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("info", "general", message, ...args);
  }

  static warn(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("warn", "general", message, ...args);
  }

  static error(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("error", "general", message, ...args);
  }

  static debug(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("debug", "general", message, ...args);
  }

  static listening(message: string): void {
    Logger.logWithCategory("info", "transcription", message);
  }

  static transcription(message: string): void {
    Logger.logWithCategory("info", "transcription", message);
  }

  static narration(message: string): void {
    Logger.logWithCategory("info", "narration", message);
  }

  static wakeWord(message: string): void {
    Logger.logWithCategory("info", "voice", message);
  }

  static brain(message: string): void {
    Logger.logWithCategory("info", "brain", message);
  }

  static download(message: string): void {
    Logger.logWithCategory("info", "voice", message);
  }

  static mic(message: string): void {
    Logger.logWithCategory("info", "voice", message);
  }

  static headphones(message: string): void {
    Logger.logWithCategory("info", "voice", message);
  }

  static stop(message: string): void {
    Logger.logWithCategory("info", "voice", message);
  }

  static timeout(message: string): void {
    Logger.logWithCategory("info", "voice", message);
  }

  static state(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("info", "state", message, ...args);
  }

  static write(message: string): void {
    Logger.logWithCategory("info", "actions", message);
  }

  static user(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("info", "user", message, ...args);
  }

  static init(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("info", "init", message, ...args);
  }

  static read(message: string): void {
    Logger.logWithCategory("info", "general", message);
  }

  static robot(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("info", "llm", message, ...args);
  }

  static prompt(message: string, ...args: unknown[]): void {
    Logger.logWithCategory("info", "prompt", message, ...args);
  }
}
