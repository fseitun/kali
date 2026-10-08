import { Logger } from "./logger";

/** Logs how long a labelled span took. Timings are written to the log, never read back. */
class PerformanceProfiler {
  private startTimes: Map<string, number> = new Map();

  start(label: string): void {
    this.startTimes.set(label, performance.now());
  }

  end(label: string): number | null {
    const startTime = this.startTimes.get(label);
    if (startTime === undefined) {
      Logger.warn(`Profiler: No start time found for "${label}"`);
      return null;
    }

    this.startTimes.delete(label);
    const duration = performance.now() - startTime;
    Logger.info(`${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }
}

export const Profiler = new PerformanceProfiler();
