import { CONFIG } from '../config'
import { StatusIndicator } from '../components/status-indicator'
import { Profiler } from '../utils/profiler'

export class DebugUIService {
  private statusIndicator: StatusIndicator

  constructor(
    private statusElement: HTMLElement,
    private consoleElement: HTMLElement,
    private transcriptionElement: HTMLElement,
    private startButton: HTMLButtonElement
  ) {
    this.statusIndicator = new StatusIndicator('status-indicator')
    this.setupPerformanceButton()
  }

  private setupPerformanceButton(): void {
    const perfButton = document.createElement('button')
    perfButton.textContent = '📊 Performance Report'
    perfButton.className = 'perf-button'
    perfButton.style.cssText = `
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      padding: 0.5rem 1rem;
      background: rgba(255, 191, 0, 0.8);
      color: #000;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      z-index: 1000;
    `
    perfButton.addEventListener('click', () => {
      console.log(Profiler.getReport())
      alert('Performance report logged to console')
    })
    document.body.appendChild(perfButton)
  }

  getStatusIndicator(): StatusIndicator {
    return this.statusIndicator
  }

  updateStatus(status: string): void {
    this.statusElement.textContent = status
  }

  log(message: string): void {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = document.createElement('div')
    logEntry.textContent = `[${timestamp}] ${message}`
    this.consoleElement.appendChild(logEntry)
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight
  }

  addTranscription(raw: string, processed: string, wakeWordDetected: boolean): void {
    const timestamp = new Date().toLocaleTimeString()
    const statusClass = wakeWordDetected ? 'detected' : 'ignored'

    this.transcriptionElement.innerHTML = `
      <div class="transcription-entry ${statusClass}">
        <span class="timestamp">[${timestamp}]</span>
        <span class="raw">"${raw}"</span>
        <span class="arrow">→</span>
        <span class="processed">"${processed}"</span>
      </div>
    ` + this.transcriptionElement.innerHTML

    const entries = this.transcriptionElement.querySelectorAll('.transcription-entry')
    if (entries.length > CONFIG.UI.MAX_TRANSCRIPTION_ENTRIES) {
      entries[entries.length - 1].remove()
    }
  }

  clearConsole(): void {
    this.consoleElement.innerHTML = ''
  }

  setButtonState(text: string, disabled: boolean): void {
    this.startButton.textContent = text
    this.startButton.disabled = disabled
  }

  hideButton(): void {
    this.startButton.style.display = 'none'
  }

  showButton(): void {
    this.startButton.style.display = ''
  }
}
