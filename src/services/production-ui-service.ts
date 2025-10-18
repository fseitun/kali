import { StatusIndicator } from '../components/status-indicator'

export class ProductionUIService {
  private statusIndicator: StatusIndicator

  constructor(
    private startButton: HTMLButtonElement
  ) {
    this.statusIndicator = new StatusIndicator('status-indicator')
  }

  getStatusIndicator(): StatusIndicator {
    return this.statusIndicator
  }

  updateStatus(_status: string): void {
  }

  log(_message: string): void {
  }

  addTranscription(_raw: string, _processed: string, _wakeWordDetected: boolean): void {
  }

  clearConsole(): void {
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
