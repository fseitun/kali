import "./styles/shared.css";
import "./styles/debug.css";
import "./i18n";
import { t } from "./i18n";
import { KaliAppCore } from "./kali-app-core";
import { DebugUIService } from "./services/debug-ui-service";
import { NoOpSpeechService } from "./services/no-op-speech-service";
import { setLogStateEnabled } from "./utils/debug-options";
import { Logger } from "./utils/logger";

class KaliDebugApp {
  private core: KaliAppCore;
  private uiService: DebugUIService;
  private speechService: NoOpSpeechService;
  private static instance: KaliDebugApp | null = null;

  constructor() {
    if (KaliDebugApp.instance) {
      void KaliDebugApp.instance.dispose();
    }
    KaliDebugApp.instance = this;

    const statusElement = document.getElementById("status") as HTMLElement;
    const consoleElement = document.getElementById("console") as HTMLElement;
    const startButton = document.getElementById("start-button") as HTMLButtonElement;
    const submitTranscriptButton = document.getElementById(
      "submit-transcript-button",
    ) as HTMLButtonElement | null;

    this.uiService = new DebugUIService(
      statusElement,
      consoleElement,
      startButton,
      submitTranscriptButton ?? undefined,
    );
    this.speechService = new NoOpSpeechService();

    Logger.setUIService(this.uiService);

    this.core = new KaliAppCore(this.uiService, this.speechService);

    statusElement.textContent = t("ui.clickToStart");
    this.setupStartButton(startButton);
    this.setupSkipToPlayingButton();
    this.setupTranscriptInput();
  }

  private setupStartButton(startButton: HTMLButtonElement): void {
    startButton.textContent = t("ui.startKali");

    startButton.addEventListener("click", async () => {
      if (this.core.isInitialized()) return;

      const logStateCheckbox = document.getElementById(
        "log-state-checkbox",
      ) as HTMLInputElement | null;
      setLogStateEnabled(logStateCheckbox?.checked ?? false);

      this.speechService.prime();
      this.uiService.setButtonState(t("ui.status.initializing"), true);

      // Show skip button as soon as initialization starts
      const skipButton = document.getElementById("skip-to-playing-button") as HTMLButtonElement;
      skipButton.style.display = "block";

      await this.core.initialize();

      // Hide skip button after initialization completes
      skipButton.style.display = "none";

      const submitButton = document.getElementById("submit-transcript-button") as HTMLButtonElement;
      if (submitButton) submitButton.disabled = false;
    });
  }

  private setupSkipToPlayingButton(): void {
    const skipButton = document.getElementById("skip-to-playing-button") as HTMLButtonElement;

    if (!skipButton) {
      Logger.warn("Skip to playing button not found");
      return;
    }

    skipButton.addEventListener("click", async () => {
      try {
        skipButton.disabled = true;
        skipButton.textContent = "⏳ Skipping...";

        await this.core.skipToPlaying();

        skipButton.style.display = "none";

        const submitButton = document.getElementById(
          "submit-transcript-button",
        ) as HTMLButtonElement;
        if (submitButton) submitButton.disabled = false;

        this.uiService.updateStatus("Ready to test!");
        Logger.info("✅ Successfully skipped to PLAYING phase");
      } catch (error) {
        Logger.error("Failed to skip to playing:", error);
        skipButton.disabled = false;
        skipButton.textContent = "⚡ Skip to Playing";
      }
    });
  }

  private setupTranscriptInput(): void {
    const form = document.getElementById("transcript-form") as HTMLFormElement;
    const input = document.getElementById("transcript-input") as HTMLInputElement;
    const submitButton = document.getElementById("submit-transcript-button") as HTMLButtonElement;

    if (!form || !input || !submitButton) {
      Logger.warn("Transcript input elements not found");
      return;
    }

    const submit = async (): Promise<void> => {
      const text = input.value.trim();
      if (!text) return;

      Logger.info("User entered:", text);

      if (!this.core.canAcceptTranscript()) {
        Logger.warn("Kali not initialized");
        return;
      }

      submitButton.disabled = true;
      input.value = "";

      try {
        await this.core.submitTranscript(text);
      } finally {
        submitButton.disabled = false;
        input.focus();
      }
    };

    submitButton.addEventListener("click", () => void submit());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void submit();
    });
  }

  private async dispose(): Promise<void> {
    await this.core.dispose();
  }

  public static getInstance(): KaliDebugApp | null {
    return KaliDebugApp.instance;
  }

  public async disposeForHmr(): Promise<void> {
    await this.dispose();
    KaliDebugApp.instance = null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new KaliDebugApp();
});

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    const instance = KaliDebugApp.getInstance();
    if (instance) {
      await instance.disposeForHmr();
    }
  });
}
