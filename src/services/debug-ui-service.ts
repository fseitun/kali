import type { IStatusIndicator } from "../components/status-indicator";
import { NoOpStatusIndicator } from "../components/status-indicator";
import { t } from "../i18n";
import {
  getCategoryIcon,
  getEnabledCategories,
  subscribeToCategoryChanges,
} from "../utils/debug-options";
import { initLogBuffer, type LogEntry, type LogSink } from "../utils/log-buffer";
import type { IUIService } from "./ui-service";

const MAX_DISPLAY_ENTRIES = 3000;

export class DebugUIService implements IUIService {
  private statusIndicator: NoOpStatusIndicator;
  private exportButton: HTMLButtonElement | null = null;
  private sink: LogSink;
  private unsubscribeCategories: (() => void) | null = null;

  constructor(
    private statusElement: HTMLElement,
    private consoleElement: HTMLElement,
    private startButton: HTMLButtonElement,
    private submitTranscriptButton?: HTMLButtonElement,
  ) {
    this.statusIndicator = new NoOpStatusIndicator();
    this.setupExportButton();

    const buffer = initLogBuffer();
    this.sink = {
      onLog: (entry) => this.handleLog(entry),
    };
    buffer.addSink(this.sink);

    this.unsubscribeCategories = subscribeToCategoryChanges(() => {
      this.refreshFromBuffer();
    });
  }

  private setupExportButton(): void {
    if (!window.location.pathname.includes("/debug")) return;
    this.exportButton = document.createElement("button");
    this.exportButton.textContent = t("ui.exportLogs");
    this.exportButton.className = "export-logs-button";
    this.exportButton.style.cssText = `
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      padding: 0.5rem 1rem;
      background: rgba(0, 200, 255, 0.8);
      color: #000;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      z-index: 1000;
    `;
    this.exportButton.addEventListener("click", () => {
      const buffer = initLogBuffer();
      const entries = buffer.getAll();
      const blob = new Blob([JSON.stringify(entries, null, 2)], {
        type: "application/json",
      });
      const name = `kali-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    document.body.appendChild(this.exportButton);
  }

  getStatusIndicator(): IStatusIndicator {
    return this.statusIndicator;
  }

  updateStatus(status: string): void {
    this.statusElement.textContent = status;
  }

  private shouldShow(entry: LogEntry): boolean {
    return getEnabledCategories().has(entry.category);
  }

  private formatErrorContext(entry: LogEntry): string {
    const parts: string[] = [];
    const args = entry.context?.args as unknown[] | undefined;
    if (args?.length) {
      for (const a of args) {
        if (a && typeof a === "object" && "message" in a && "stack" in a) {
          const e = a as { message?: string; stack?: string; name?: string };
          parts.push(e.stack ?? `${e.name ?? "Error"}: ${e.message ?? ""}`);
        } else {
          parts.push(JSON.stringify(a));
        }
      }
    } else if (entry.stack) {
      parts.push(entry.stack);
    }
    return parts.join("\n");
  }

  private getFullPromptOrResponse(entry: LogEntry): string | null {
    if (entry.category !== "prompt") return null;
    const args = entry.context?.args as unknown[] | undefined;
    const first = args?.[0];
    if (first && typeof first === "object") {
      const obj = first as { fullPrompt?: string; fullResponse?: string };
      return obj.fullPrompt ?? obj.fullResponse ?? null;
    }
    return null;
  }

  private getLlmContextArgs(entry: LogEntry): string | null {
    if (entry.category !== "llm") return null;
    const args = entry.context?.args as unknown[] | undefined;
    if (!args?.length) return null;
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return null;
    }
  }

  private renderEntry(entry: LogEntry): void {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const icon = getCategoryIcon(entry.category);
    const wrap = document.createElement("div");
    wrap.className = "log-entry";

    const main = document.createElement("div");
    main.textContent = `[${time}] ${icon} ${entry.message}`;
    if (entry.category === "narration") {
      main.classList.add("log-narration");
    }
    wrap.appendChild(main);

    const args = entry.context?.args as unknown[] | undefined;
    const hasErrorDetails =
      (entry.level === "error" || entry.level === "warn") &&
      (Boolean(entry.stack) || (args?.length ?? 0) > 0);
    if (hasErrorDetails) {
      const details = document.createElement("pre");
      details.className = "log-entry-details";
      details.textContent = this.formatErrorContext(entry);
      wrap.appendChild(details);
    }

    const fullPromptOrResponse = this.getFullPromptOrResponse(entry);
    if (fullPromptOrResponse) {
      const details = document.createElement("pre");
      details.className = "log-entry-prompt";
      details.textContent = fullPromptOrResponse;
      wrap.appendChild(details);
    }

    const llmContextArgs = this.getLlmContextArgs(entry);
    if (llmContextArgs) {
      const details = document.createElement("pre");
      details.className = "log-entry-details";
      details.textContent = llmContextArgs;
      wrap.appendChild(details);
    }

    this.consoleElement.appendChild(wrap);
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  private trimDisplayCap(): void {
    const entries = this.consoleElement.querySelectorAll(".log-entry");
    if (entries.length > MAX_DISPLAY_ENTRIES) {
      const remove = entries.length - MAX_DISPLAY_ENTRIES;
      for (let i = 0; i < remove; i++) {
        entries[i].remove();
      }
    }
  }

  private handleLog(entry: LogEntry): void {
    if (this.shouldShow(entry)) {
      this.renderEntry(entry);
      this.trimDisplayCap();
    }
  }

  refreshFromBuffer(): void {
    const buffer = initLogBuffer();
    const enabled = getEnabledCategories();
    const filtered = buffer.getFiltered(enabled);
    const toShow = filtered.slice(-MAX_DISPLAY_ENTRIES);
    this.consoleElement.innerHTML = "";
    for (const entry of toShow) {
      this.renderEntry(entry);
    }
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  log(_message: string): void {
    // No-op: display is handled by the LogBuffer sink (handleLog)
  }

  addTranscription(_raw: string, _processed: string, _wakeWordDetected: boolean): void {}

  clearConsole(): void {
    this.consoleElement.innerHTML = "";
  }

  dispose(): void {
    if (this.unsubscribeCategories) {
      this.unsubscribeCategories();
      this.unsubscribeCategories = null;
    }
    if (this.exportButton?.parentNode) {
      this.exportButton.remove();
      this.exportButton = null;
    }
    const buffer = initLogBuffer();
    buffer.removeSink(this.sink);
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

  setTranscriptInputEnabled(enabled: boolean): void {
    if (this.submitTranscriptButton) {
      this.submitTranscriptButton.disabled = !enabled;
    }
  }
}
