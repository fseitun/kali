import "./styles/shared.css";
import "./styles/production.css";
import "./i18n";
import { CONFIG } from "./config";
import { t } from "./i18n";
import { KaliAppCore } from "./kali-app-core";
import { ProductionUIService } from "./services/production-ui-service";
import { SpeechService } from "./services/speech-service";
import { initLogBuffer } from "./utils/log-buffer";
import { Logger } from "./utils/logger";

/**
 * Non-standard event; only Chromium-based browsers. Used to trigger native PWA install prompt.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

class KaliApp {
  private core: KaliAppCore;
  private uiService: ProductionUIService;
  private speechService: SpeechService;
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private static instance: KaliApp | null = null;

  constructor() {
    if (KaliApp.instance) {
      void KaliApp.instance.dispose();
    }
    KaliApp.instance = this;

    const startButton = document.getElementById("start-button") as HTMLButtonElement;

    this.uiService = new ProductionUIService(startButton);
    this.speechService = new SpeechService();

    Logger.setUIService(this.uiService);

    this.core = new KaliAppCore(this.uiService, this.speechService);

    this.setupStartButton(startButton);
    this.setupInstallPrompt();
    this.setupExportButton();
  }

  private setupExportButton(): void {
    if (!CONFIG.UI.SHOW_EXPORT_BUTTON) return;
    initLogBuffer();
    const exportButton = document.createElement("button");
    exportButton.textContent = t("ui.exportLogs");
    exportButton.className = "export-logs-button";
    exportButton.style.cssText = `
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
    exportButton.addEventListener("click", () => {
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
    document.body.appendChild(exportButton);
  }

  private setupInstallPrompt(): void {
    if (this.isAlreadyInstalled()) return;

    const installButton = document.getElementById("install-button") as HTMLButtonElement | null;
    if (!installButton) return;

    window.addEventListener("beforeinstallprompt", (e: Event) => {
      e.preventDefault();
      this.installPrompt = e as BeforeInstallPromptEvent;
      installButton.textContent = t("ui.installButton");
      installButton.hidden = false;
    });

    installButton.addEventListener("click", async () => {
      if (!this.installPrompt) return;
      await this.installPrompt.prompt();
      this.installPrompt = null;
      installButton.hidden = true;
    });

    window.addEventListener("appinstalled", () => {
      this.installPrompt = null;
      installButton.hidden = true;
    });
  }

  private isAlreadyInstalled(): boolean {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  }

  private setupStartButton(startButton: HTMLButtonElement): void {
    startButton.textContent = t("ui.startKali");

    startButton.addEventListener("click", async () => {
      if (this.core.isInitialized()) return;

      this.speechService.prime();
      this.uiService.setButtonState(t("ui.status.initializing"), true);
      await this.core.initialize();
    });
  }

  private async dispose(): Promise<void> {
    await this.core.dispose();
  }

  public static getInstance(): KaliApp | null {
    return KaliApp.instance;
  }

  public async disposeForHmr(): Promise<void> {
    await this.dispose();
    KaliApp.instance = null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new KaliApp();
});

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    const instance = KaliApp.getInstance();
    if (instance) {
      await instance.disposeForHmr();
    }
  });
}
