import { CONFIG } from '../config'

/**
 * Manages UI updates for status, console logs, and transcription display.
 * Note: This is primarily for development - production is voice-only with dark screen.
 */
export class UIService {
  constructor(
    private statusElement: HTMLElement,
    private consoleElement: HTMLElement,
    private transcriptionElement: HTMLElement,
    private startButton: HTMLButtonElement
  ) {}

  /**
   * Updates the status message display.
   * @param status - The status text to show
   */
  updateStatus(status: string): void {
    this.statusElement.textContent = status
  }

  /**
   * Appends a timestamped message to the console log.
   * @param message - The message to log
   */
  log(message: string): void {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = document.createElement('div')
    logEntry.textContent = `[${timestamp}] ${message}`
    this.consoleElement.appendChild(logEntry)
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight
  }

  /**
   * Displays a transcription entry showing raw input and processed output.
   * @param raw - The raw transcribed text
   * @param processed - The processed/cleaned transcription
   * @param wakeWordDetected - Whether the wake word was detected in this transcription
   */
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
