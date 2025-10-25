import type { StatusIndicator } from "../components/status-indicator";

export interface IUIService {
  getStatusIndicator(): StatusIndicator;
  setButtonState(text: string, disabled: boolean): void;
  hideButton(): void;
  showButton(): void;
  updateStatus(status: string): void;
  clearConsole(): void;
  log(message: string): void;
  addTranscription(
    raw: string,
    processed: string,
    wakeWordDetected: boolean,
  ): void;
}
