import { Logger } from './logger'

interface Measurement {
  label: string
  startTime: number
  endTime?: number
  duration?: number
}

class PerformanceProfiler {
  private measurements: Map<string, Measurement> = new Map()
  private history: Measurement[] = []
  private maxHistory = 50

  start(label: string): void {
    this.measurements.set(label, {
      label,
      startTime: performance.now()
    })
  }

  end(label: string): number | null {
    const measurement = this.measurements.get(label)
    if (!measurement) {
      Logger.warn(`Profiler: No start time found for "${label}"`)
      return null
    }

    const endTime = performance.now()
    const duration = endTime - measurement.startTime

    measurement.endTime = endTime
    measurement.duration = duration

    this.history.push({ ...measurement })
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }

    this.measurements.delete(label)

    Logger.info(`⏱️ ${label}: ${duration.toFixed(2)}ms`)
    return duration
  }

  getReport(): string {
    const grouped = new Map<string, number[]>()

    for (const measurement of this.history) {
      if (!measurement.duration) continue
      
      const durations = grouped.get(measurement.label) || []
      durations.push(measurement.duration)
      grouped.set(measurement.label, durations)
    }

    let report = '=== Performance Report ===\n\n'

    for (const [label, durations] of grouped.entries()) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length
      const min = Math.min(...durations)
      const max = Math.max(...durations)

      report += `${label}:\n`
      report += `  Count: ${durations.length}\n`
      report += `  Avg:   ${avg.toFixed(2)}ms\n`
      report += `  Min:   ${min.toFixed(2)}ms\n`
      report += `  Max:   ${max.toFixed(2)}ms\n\n`
    }

    return report
  }

  getLastMeasurement(label: string): number | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].label === label && this.history[i].duration) {
        return this.history[i].duration!
      }
    }
    return null
  }

  clear(): void {
    this.measurements.clear()
    this.history = []
  }
}

export const Profiler = new PerformanceProfiler()

