import "@/styles/shared.css";
import "@/styles/debug.css";
import "@/i18n/translations";
import { CONFIG } from "@/config";
import { getLocale } from "@/i18n/locale-manager";
import { setLocale, t } from "@/i18n/translations";
import { KaliAppCore } from "@/kali-app-core";
import { setupVersionRefreshPrompt } from "@/pwa-register";
import { DebugUIService } from "@/services/debug-ui-service";
import { NoOpSpeechService } from "@/services/no-op-speech-service";
import {
  getLogCategories,
  isLogCategoryEnabled,
  setLogCategoryEnabled,
} from "@/utils/debug-options";
import { Logger } from "@/utils/logger";

setLocale(getLocale());

const DEBUG_BOARD_POLL_MS = 400;

class KaliDebugApp {
  private core: KaliAppCore;
  private uiService: DebugUIService;
  private speechService: NoOpSpeechService;
  /** Browser timer handle (`window.setInterval`); avoid `ReturnType<typeof setInterval>` (clashes with Node `Timeout`). */
  private boardRefreshId: number | null = null;
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
      debugAllowPositionTeleport: CONFIG.DEBUG_POSITION_TELEPORT,
    });

    statusElement.textContent = "";

    const versionNoticeMessage = document.getElementById("version-notice-message");
    const versionRefresh = document.getElementById("version-refresh");
    if (versionNoticeMessage) {
      versionNoticeMessage.textContent = t("ui.versionNoticeMessage");
    }
    if (versionRefresh) {
      versionRefresh.textContent = t("ui.versionRefreshButton");
    }

    // eslint-disable-next-line no-console -- build id for DevTools when verifying deployed version
    console.log("Kali build:", CONFIG.BUILD_ID);
    setupVersionRefreshPrompt();

    this.setupLogOptions();
    this.setupStartButton(startButton);
    this.setupTranscriptInput();
  }

  private renderDebugPlayerBoard(): void {
    const el = document.getElementById("debug-player-board");
    if (!el) {
      return;
    }
    const snap = this.core.getDebugPlayerBoardSnapshot();
    if (!snap) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    el.hidden = false;
    el.replaceChildren();
    for (const row of snap.rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "debug-player-row";
      if (row.id === snap.turn) {
        rowEl.classList.add("debug-player-row--current");
      }
      rowEl.textContent = `${row.name}: ${row.position}`;
      el.appendChild(rowEl);
    }
  }

  private startBoardRefresh(): void {
    this.stopBoardRefresh();
    this.boardRefreshId = window.setInterval(() => {
      this.renderDebugPlayerBoard();
    }, DEBUG_BOARD_POLL_MS);
  }

  private stopBoardRefresh(): void {
    if (this.boardRefreshId !== null) {
      window.clearInterval(this.boardRefreshId);
      this.boardRefreshId = null;
    }
  }

  private setupLogOptions(): void {
    const container = document.getElementById("log-categories");
    if (!container) {
      return;
    }

    const defaultEnabled = new Set(["user", "narration"]);

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
      if (this.core.isInitialized()) {
        return;
      }

      this.speechService.prime();
      this.uiService.setButtonState(t("ui.status.initializing"), true);

      await this.core.initialize();

      this.uiService.updateStatus("");
      this.renderDebugPlayerBoard();
      this.startBoardRefresh();

      const submitButton = document.getElementById("submit-transcript-button") as HTMLButtonElement;
      if (submitButton) {
        submitButton.disabled = false;
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
      if (!text) {
        return;
      }

      if (!this.core.canAcceptTranscript()) {
        Logger.warn("Kali not initialized");
        return;
      }

      submitButton.disabled = true;
      input.value = "";

      try {
        const posMatch = /^\/pos\s+(\d+)\s*$/i.exec(text);
        if (posMatch && CONFIG.DEBUG_POSITION_TELEPORT) {
          const square = Number.parseInt(posMatch[1], 10);
          await this.core.submitDebugPositionTeleport(square);
          return;
        }
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
    this.stopBoardRefresh();
    this.uiService.dispose?.();
    await this.core.dispose();
    this.renderDebugPlayerBoard();
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
