import "./styles/shared.css";
import "./styles/debug.css";
import "./i18n";
import { t } from "./i18n";
import { KaliAppCore } from "./kali-app-core";
import { DebugUIService } from "./services/debug-ui-service";
import { SpeechService } from "./services/speech-service";
import { Logger } from "./utils/logger";

class KaliDebugApp {
  private core: KaliAppCore;
  private uiService: DebugUIService;
  private speechService: SpeechService;
  private static instance: KaliDebugApp | null = null;

  constructor() {
    if (KaliDebugApp.instance) {
      void KaliDebugApp.instance.dispose();
    }
    KaliDebugApp.instance = this;

    const statusElement = document.getElementById("status") as HTMLElement;
    const consoleElement = document.getElementById("console") as HTMLElement;
    const startButton = document.getElementById(
      "start-button",
    ) as HTMLButtonElement;

    this.uiService = new DebugUIService(
      statusElement,
      consoleElement,
      startButton,
    );
    this.speechService = new SpeechService();

    Logger.setUIService(this.uiService);

    this.core = new KaliAppCore(this.uiService, this.speechService);

    statusElement.textContent = t("ui.clickToStart");
    this.setupStartButton(startButton);
    this.setupSkipToPlayingButton();
    this.setupExecuteActionsButton();
  }

  private setupStartButton(startButton: HTMLButtonElement): void {
    startButton.textContent = t("ui.startKali");

    startButton.addEventListener("click", async () => {
      if (this.core.isInitialized()) return;

      this.speechService.prime();
      this.uiService.setButtonState(t("ui.status.initializing"), true);

      // Show skip button as soon as initialization starts
      const skipButton = document.getElementById(
        "skip-to-playing-button",
      ) as HTMLButtonElement;
      skipButton.style.display = "block";

      await this.core.initialize();

      // Hide skip button after initialization completes
      skipButton.style.display = "none";

      const executeButton = document.getElementById(
        "execute-actions-button",
      ) as HTMLButtonElement;
      executeButton.disabled = false;
    });
  }

  private setupSkipToPlayingButton(): void {
    const skipButton = document.getElementById(
      "skip-to-playing-button",
    ) as HTMLButtonElement;

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

        // Enable execute actions button
        const executeButton = document.getElementById(
          "execute-actions-button",
        ) as HTMLButtonElement;
        executeButton.disabled = false;

        this.uiService.updateStatus("Ready to test!");
        Logger.info("✅ Successfully skipped to PLAYING phase");
      } catch (error) {
        Logger.error("Failed to skip to playing:", error);
        skipButton.disabled = false;
        skipButton.textContent = "⚡ Skip to Playing";
      }
    });
  }

  private setupExecuteActionsButton(): void {
    const executeButton = document.getElementById(
      "execute-actions-button",
    ) as HTMLButtonElement;
    const actionsInput = document.getElementById(
      "actions-input",
    ) as HTMLTextAreaElement;
    const resultDiv = document.getElementById(
      "execution-result",
    ) as HTMLElement;

    if (!executeButton || !actionsInput || !resultDiv) {
      Logger.warn("Test actions panel elements not found");
      return;
    }

    // Wire up example buttons
    const exampleButtons = document.querySelectorAll(".example-btn");
    exampleButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const actionData = btn.getAttribute("data-action");
        if (actionData) {
          actionsInput.value = actionData;
          // Format it nicely
          try {
            const parsed = JSON.parse(actionData);
            actionsInput.value = JSON.stringify(parsed, null, 2);
          } catch {
            // If parsing fails, just use the raw data
            actionsInput.value = actionData;
          }
        }
      });
    });

    executeButton.addEventListener("click", async () => {
      if (!this.core.isInitialized()) {
        resultDiv.className = "error";
        resultDiv.textContent = "Error: Kali not initialized";
        return;
      }

      const input = actionsInput.value.trim();
      if (!input) {
        resultDiv.className = "error";
        resultDiv.textContent = "Error: No actions provided";
        return;
      }

      try {
        const actions = JSON.parse(input);

        if (!Array.isArray(actions)) {
          resultDiv.className = "error";
          resultDiv.textContent = "Error: Actions must be an array";
          return;
        }

        executeButton.disabled = true;
        resultDiv.className = "";
        resultDiv.textContent = "Executing...";

        const success = await this.core.testExecuteActions(actions);

        if (success) {
          resultDiv.className = "success";
          resultDiv.textContent = "✅ Actions executed successfully";
        } else {
          resultDiv.className = "error";
          resultDiv.textContent =
            "❌ Execution failed (check console for details)";
        }
      } catch (error) {
        resultDiv.className = "error";
        if (error instanceof SyntaxError) {
          resultDiv.textContent = `❌ Invalid JSON: ${error.message}`;
        } else {
          resultDiv.textContent = `❌ Error: ${error}`;
        }
      } finally {
        executeButton.disabled = false;
      }
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
