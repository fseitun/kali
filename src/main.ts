import "./styles/shared.css";
import "./styles/production.css";
import "./i18n";
import { t } from "./i18n";
import { KaliAppCore } from "./kali-app-core";
import { ProductionUIService } from "./services/production-ui-service";
import { SpeechService } from "./services/speech-service";
import { Logger } from "./utils/logger";

class KaliApp {
  private core: KaliAppCore;
  private uiService: ProductionUIService;
  private speechService: SpeechService;
  private static instance: KaliApp | null = null;

  constructor() {
    if (KaliApp.instance) {
      void KaliApp.instance.dispose();
    }
    KaliApp.instance = this;

    const startButton = document.getElementById(
      "start-button",
    ) as HTMLButtonElement;

    this.uiService = new ProductionUIService(startButton);
    this.speechService = new SpeechService();

    Logger.setUIService(this.uiService);

    this.core = new KaliAppCore(this.uiService, this.speechService);

    this.setupStartButton(startButton);
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
