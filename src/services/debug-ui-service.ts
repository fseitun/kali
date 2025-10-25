import { StatusIndicator } from "../components/status-indicator";
import { t } from "../i18n";
import type { IUIService } from "./ui-service";

export class DebugUIService implements IUIService {
  private statusIndicator: StatusIndicator;

  constructor(
    private statusElement: HTMLElement,
    private consoleElement: HTMLElement,
    private startButton: HTMLButtonElement,
  ) {
    this.statusIndicator = new StatusIndicator("status-indicator");
    this.setupCopyLogsButton();
  }

  private setupCopyLogsButton(): void {
    const copyButton = document.createElement("button");
    copyButton.textContent = t("ui.copyLogs");
    copyButton.className = "copy-logs-button";
    copyButton.style.cssText = `
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      padding: 0.5rem 1rem;
      background: rgba(0, 255, 0, 0.8);
      color: #000;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      z-index: 1000;
    `;
    copyButton.addEventListener("click", async () => {
      const logText = this.consoleElement.innerText;
      try {
        await navigator.clipboard.writeText(logText);
        const originalText = copyButton.textContent;
        copyButton.textContent = t("ui.copied");
        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 2000);
      } catch {
        copyButton.textContent = t("ui.copyFailed");
        setTimeout(() => {
          copyButton.textContent = t("ui.copyLogs");
        }, 2000);
      }
    });
    document.body.appendChild(copyButton);
  }

  getStatusIndicator(): StatusIndicator {
    return this.statusIndicator;
  }

  updateStatus(status: string): void {
    this.statusElement.textContent = status;
  }

  log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.textContent = `[${timestamp}] ${message}`;
    this.consoleElement.appendChild(logEntry);
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  addTranscription(
    _raw: string,
    _processed: string,
    _wakeWordDetected: boolean,
  ): void {}

  clearConsole(): void {
    this.consoleElement.innerHTML = "";
  }

  setButtonState(text: string, disabled: boolean): void {
    this.startButton.textContent = text;
    this.startButton.disabled = disabled;
  }

  hideButton(): void {
    this.startButton.style.display = "none";
  }

  showButton(): void {
    this.startButton.style.display = "";
  }
}
