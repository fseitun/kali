import "./styles/shared.css";
import "./styles/production.css";
import "./i18n";
import { t } from "./i18n";
import { KaliAppCore } from "./kali-app-core";
import { ProductionUIService } from "./services/production-ui-service";
import { SpeechService } from "./services/speech-service";
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
