import "./styles/shared.css";
import "./styles/debug.css";
import "./i18n";
import { CONFIG } from "./config";
import { t } from "./i18n";
import { KaliAppCore } from "./kali-app-core";
import { setupVersionRefreshPrompt } from "./pwa-register";
import { DebugUIService } from "./services/debug-ui-service";
import { NoOpSpeechService } from "./services/no-op-speech-service";
import {
  getLogCategories,
  isLogCategoryEnabled,
  setLogCategoryEnabled,
} from "./utils/debug-options";
import { Logger } from "./utils/logger";

function getLLMDisplayLabel(): string {
  switch (CONFIG.LLM_PROVIDER) {
    case "gemini":
      return `Gemini (${CONFIG.GEMINI.MODEL.replace(/^models\//, "")})`;
    case "groq":
      return `Groq (${CONFIG.GROQ.MODEL})`;
    case "openrouter":
      return `OpenRouter (${CONFIG.OPENROUTER.MODEL})`;
    case "deepinfra":
      return `DeepInfra (${CONFIG.DEEPINFRA.MODEL})`;
    case "ollama":
      return `Ollama (${CONFIG.OLLAMA.MODEL})`;
    case "mock":
      return "Mock";
    default:
      return String(CONFIG.LLM_PROVIDER);
  }
}

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

    this.core = new KaliAppCore(this.uiService, this.speechService, {
      skipWakeWord: true,
    });

    statusElement.textContent = t("ui.clickToStart");

    const llmIndicator = document.getElementById("llm-indicator");
    if (llmIndicator) llmIndicator.textContent = getLLMDisplayLabel();

    const versionNoticeMessage = document.getElementById("version-notice-message");
    const versionRefresh = document.getElementById("version-refresh");
    if (versionNoticeMessage) versionNoticeMessage.textContent = t("ui.versionNoticeMessage");
    if (versionRefresh) versionRefresh.textContent = t("ui.versionRefreshButton");

    const versionCurrent = document.getElementById("version-current");
    if (versionCurrent) {
      const buildLabel = t("ui.buildLabel");
      versionCurrent.textContent = `${buildLabel}${CONFIG.BUILD_ID}`;
      versionCurrent.title = `${buildLabel}${CONFIG.BUILD_ID}`;
    }

    // eslint-disable-next-line no-console -- build id for DevTools when verifying deployed version
    console.log("Kali build:", CONFIG.BUILD_ID);
    setupVersionRefreshPrompt();

    this.setupLogOptions();
    this.setupStartButton(startButton);
    this.setupTranscriptInput();
  }

  private setupLogOptions(): void {
    const container = document.getElementById("log-categories");
    if (!container) return;

    const defaultEnabled = new Set([
      "actions",
      "brain",
      "general",
      "init",
      "llm",
      "narration",
      "prompt",
      "state",
      "transcription",
      "user",
      "voice",
    ]);

    for (const { id, label, icon } of getLogCategories()) {
      const enabled = defaultEnabled.has(id);
      setLogCategoryEnabled(id, enabled);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-toggle";
      btn.dataset.category = id;
      btn.title = label;
      btn.setAttribute("aria-pressed", String(enabled));
      btn.textContent = icon ?? "";
      btn.addEventListener("click", () => {
        const next = !isLogCategoryEnabled(id);
        setLogCategoryEnabled(id, next);
        btn.setAttribute("aria-pressed", String(next));
      });
      container.appendChild(btn);
    }
  }

  private setupStartButton(startButton: HTMLButtonElement): void {
    startButton.textContent = t("ui.startKali");

    startButton.addEventListener("click", async () => {
      if (this.core.isInitialized()) return;

      this.speechService.prime();
      this.uiService.setButtonState(t("ui.status.initializing"), true);

      await this.core.initialize();

      const submitButton = document.getElementById("submit-transcript-button") as HTMLButtonElement;
      if (submitButton) submitButton.disabled = false;
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

      Logger.user(`Transcript: ${text}`);

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
    this.uiService.dispose?.();
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
