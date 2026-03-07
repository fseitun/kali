/**
 * Structured log buffer for debug UI and future telemetry.
 * Stores logs with timestamps, levels, categories, and optional context.
 * Uses a sink pattern so consumers (debug UI, future remote shipping) can subscribe.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: number;
  iso: string;
  level: LogLevel;
  category: string;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

export interface LogSink {
  onLog(entry: LogEntry): void;
}

let idCounter = 0;

function createEntry(
  level: LogLevel,
  category: string,
  message: string,
  context?: Record<string, unknown>,
  stack?: string,
): LogEntry {
  const now = Date.now();
  return {
    id: `log-${++idCounter}-${now}`,
    timestamp: now,
    iso: new Date(now).toISOString(),
    level,
    category,
    message,
    context: context && Object.keys(context).length > 0 ? context : undefined,
    stack,
  };
}

let bufferInstance: LogBuffer | null = null;

export function initLogBuffer(): LogBuffer {
  bufferInstance ??= new LogBuffer();
  return bufferInstance;
}

export function getLogBuffer(): LogBuffer | null {
  return bufferInstance;
}

export class LogBuffer {
  private entries: LogEntry[] = [];
  private sinks: LogSink[] = [];

  push(
    level: LogLevel,
    category: string,
    message: string,
    context?: Record<string, unknown>,
    stack?: string,
  ): void {
    const entry = createEntry(level, category, message, context, stack);
    this.entries.push(entry);

    for (const sink of this.sinks) {
      sink.onLog(entry);
    }
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  removeSink(sink: LogSink): void {
    const i = this.sinks.indexOf(sink);
    if (i >= 0) this.sinks.splice(i, 1);
  }

  getFiltered(enabledCategories: Set<string>): LogEntry[] {
    return this.entries.filter((e) => {
      if (e.category === "general") return true;
      return enabledCategories.has(e.category);
    });
  }

  getAll(): LogEntry[] {
    return [...this.entries];
  }
}
