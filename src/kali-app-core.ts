import { CONFIG } from "./config";
import { GameLoader } from "./game-loader";
import type { GameModule } from "./game-loader";
import { t } from "./i18n";
import { DeepInfraClient } from "./llm/DeepInfraClient";
import { GeminiClient } from "./llm/GeminiClient";
import { GroqClient } from "./llm/GroqClient";
import type { LLMClient } from "./llm/LLMClient";
import { MockLLMClient } from "./llm/MockLLMClient";
import { OllamaClient } from "./llm/OllamaClient";
import { OpenRouterClient } from "./llm/OpenRouterClient";
import { inferDecisionPoints } from "./orchestrator/decision-point-inference";
import { NameCollector } from "./orchestrator/name-collector";
import { Orchestrator } from "./orchestrator/orchestrator";
import { GamePhase, type PrimitiveAction } from "./orchestrator/types";
import type { ISpeechService } from "./services/speech-service";
import type { IUIService } from "./services/ui-service";
import { StateManager } from "./state-manager";
import { checkBrowserSupport } from "./utils/browser-support";
import { validateConfig } from "./utils/config-validator";
import { Logger } from "./utils/logger";
import { acquireScreenWakeLock, releaseWakeLock } from "./utils/wake-lock";
import type { WakeWordDetector } from "./wake-word";

export class KaliAppCore {
  private wakeWordDetector: WakeWordDetector | null = null;
  private orchestrator: Orchestrator | null = null;
  private stateManager: StateManager | null = null;
  private llmClient: LLMClient | null = null;
  private gameModule: GameModule | null = null;
  private initialized = false;
  private currentNameHandler: ((text: string) => void) | null = null;

  constructor(
    private uiService: IUIService,
    private speechService: ISpeechService,
    private options?: { skipWakeWord?: boolean },
  ) {}

  async initialize(): Promise<void> {
    try {
      validateConfig();

      const indicator = this.uiService.getStatusIndicator();
      indicator.setState("processing");
      Logger.info("Initializing Kali...");

      checkBrowserSupport();
      await this.initializeOrchestrator();
      if (!this.options?.skipWakeWord) {
        await this.initializeWakeWord();
      } else {
        Logger.info("Skipping Vosk (debug mode - text input only)");
      }

      const shouldStartGame = await this.handleSavedGameOrSetup();

      this.initialized = true;
      this.uiService.hideButton();
      indicator.setState("listening");

      const defaultStatus = this.options?.skipWakeWord
        ? t("ui.status.ready")
        : t("ui.wakeWordReady", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] });
      if (shouldStartGame) {
        this.uiService.updateStatus(defaultStatus);
        Logger.info("Kali is ready");
        await this.proactiveGameStart();
        return;
      }

      let statusMessage = defaultStatus;
      if (this.stateManager && !this.options?.skipWakeWord) {
        const state = this.stateManager.getState();
        const game = state.game as Record<string, unknown> | undefined;
        if (game?.phase === GamePhase.PLAYING) {
          statusMessage = t("ui.savedGameDetected", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] });
        }
      }
      this.uiService.updateStatus(statusMessage);
      if (statusMessage !== defaultStatus) {
        await this.speechService.speak(statusMessage);
      }
      Logger.info("Kali is ready");
    } catch (error) {
      this.uiService.setButtonState(t("ui.startKali"), false);
      this.uiService.updateStatus(t("ui.initializationFailed"));
      Logger.error(`Error: ${error}`);
      const indicator = this.uiService.getStatusIndicator();
      indicator.setState("idle");
      await this.speechService.speak(t("ui.initializationFailed"));
    }
  }

  private async initializeOrchestrator(): Promise<void> {
    Logger.brain("Initializing orchestrator...");

    Logger.info(`Loading game module: ${CONFIG.GAME.DEFAULT_MODULE}...`);
    const gameLoader = new GameLoader(CONFIG.GAME.MODULES_PATH);
    this.gameModule = await gameLoader.loadGame(CONFIG.GAME.DEFAULT_MODULE);

    Logger.info("Initializing game state...");
    this.stateManager = new StateManager();
    this.stateManager.init(this.gameModule.initialState);

    const decisionPoints = inferDecisionPoints(this.gameModule.initialState.board);
    if (decisionPoints.length) {
      this.stateManager.set("decisionPoints", decisionPoints);
    }

    if (this.gameModule.stateDisplay) {
      this.stateManager.set("stateDisplay", this.gameModule.stateDisplay);
    }

    Logger.robot(`Configuring LLM (${CONFIG.LLM_PROVIDER}) with game rules...`);
    this.llmClient = this.createLLMClient();
    this.llmClient.setGameRules(this.formatGameRules(this.gameModule));

    const initialState = {
      ...this.gameModule.initialState,
      ...(decisionPoints.length ? { decisionPoints } : {}),
    };
    const indicator = this.uiService.getStatusIndicator();
    this.orchestrator = new Orchestrator(
      this.llmClient,
      this.stateManager,
      this.speechService,
      indicator,
      initialState,
    );

    Logger.info("Loading sound effects...");
    await gameLoader.loadSoundEffects(this.gameModule, this.speechService);

    Logger.info("Orchestrator ready");
  }

  private createLLMClient(): LLMClient {
    switch (CONFIG.LLM_PROVIDER) {
      case "gemini":
        return new GeminiClient();
      case "groq":
        return new GroqClient();
      case "openrouter":
        return new OpenRouterClient();
      case "deepinfra":
        return new DeepInfraClient();
      case "ollama":
        return new OllamaClient();
      case "mock":
        return new MockLLMClient();
      default:
        throw new Error(`Unknown LLM provider: ${CONFIG.LLM_PROVIDER}`);
    }
  }

  private formatGameRules(gameModule: GameModule): string {
    const { rules, metadata } = gameModule;
    const examples = rules.examples.slice(0, 4);
    const boardSection = rules.boardLayout?.trim() ? `**Board:** ${rules.boardLayout.trim()}` : "";

    return `## ${metadata.name}
**Objective:** ${rules.objective}
**Mechanics:** ${rules.mechanics}
**Turn:** ${rules.turnStructure}
${boardSection ? boardSection + "\n" : ""}**Examples:**
${examples.map((ex: string, i: number) => `${i + 1}. ${ex}`).join("\n")}`;
  }

  private async initializeWakeWord(): Promise<void> {
    Logger.mic("Initializing speech recognition...");
    const indicator = this.uiService.getStatusIndicator();

    const { WakeWordDetector } = await import("./wake-word");
    this.wakeWordDetector = new WakeWordDetector(
      () => this.handleWakeWord(),
      (text) => this.handleTranscription(text),
      (raw, processed, wakeWordDetected) =>
        this.uiService.addTranscription(raw, processed, wakeWordDetected),
    );

    await this.wakeWordDetector.initialize((percent) => {
      this.uiService.updateStatus(`Downloading model... ${percent}%`);
    });

    await this.wakeWordDetector.startListening();
    await acquireScreenWakeLock();
    indicator.setState("listening");
  }

  private async handleSavedGameOrSetup(): Promise<boolean> {
    if (!this.stateManager || !this.gameModule || !this.orchestrator) {
      throw new Error("Cannot handle saved game: components not initialized");
    }

    try {
      const state = this.stateManager.getState();
      const game = state.game as Record<string, unknown> | undefined;

      Logger.info(`Startup phase check - phase: ${game?.phase}`);

      if (game?.phase === GamePhase.PLAYING) {
        Logger.info("Saved game detected - waiting for user command");
        return false;
      } else if (game?.phase === GamePhase.SETUP) {
        Logger.info("Starting name collection...");
        await this.runNameCollection();
        return true;
      }

      Logger.info("No action needed");
      return false;
    } catch (error) {
      Logger.error(`Error handling saved game: ${error}. Starting fresh.`);
      this.stateManager.resetState(this.gameModule.initialState);
      const decisionPoints = inferDecisionPoints(this.gameModule.initialState.board);
      if (decisionPoints.length) {
        this.stateManager.set("decisionPoints", decisionPoints);
      }
      await this.runNameCollection();
      return true;
    }
  }

  private async proactiveGameStart(): Promise<void> {
    if (!this.orchestrator) {
      Logger.error("Cannot start game proactively: orchestrator not initialized");
      return;
    }

    Logger.info("Starting game proactively");

    const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
    if (pendingPrompt) {
      // At game start with a decision point (e.g. path choice): speak turn announcement
      // directly. Avoids proactiveGameStart LLM also asking, causing duplicate path ask.
      await this.announceCurrentTurnIfPending();
    } else {
      const { success, shouldAdvanceTurn } = await this.orchestrator.handleTranscript(
        t("game.proactiveStart"),
        { skipDecisionPointEnforcement: true },
      );
      if (success && shouldAdvanceTurn) {
        await this.checkAndAdvanceTurn();
      }
    }
  }

  private async runNameCollection(): Promise<void> {
    if (!this.stateManager || !this.gameModule || !this.orchestrator) {
      throw new Error("Cannot run name collection: components not initialized");
    }

    try {
      const state = this.stateManager.getState();
      const game = state.game as Record<string, unknown> | undefined;

      Logger.info(
        `🎮 Name collection check - phase: ${game?.phase} (expected: ${GamePhase.SETUP})`,
      );

      if (game?.phase !== GamePhase.SETUP) {
        Logger.info("Skipping name collection - not in SETUP phase");
        return;
      }

      this.uiService.updateStatus(
        t("ui.wakeWordInstruction", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }),
      );
      const gameName = (game.name as string) || "the game";
      if (!this.llmClient) {
        throw new Error("LLM client not initialized");
      }

      const nameCollector = new NameCollector(
        this.speechService,
        gameName,
        () => this.wakeWordDetector?.enableDirectTranscription(),
        this.llmClient,
        this.gameModule.metadata,
      );

      this.uiService.setTranscriptInputEnabled?.(true);

      const playerNames = await nameCollector.collectNames((handler) => {
        this.currentNameHandler = handler;
      });

      this.currentNameHandler = null;
      if (this.wakeWordDetector) {
        this.wakeWordDetector.disableDirectTranscription();
      }
      this.uiService.setTranscriptInputEnabled?.(false);

      // Let orchestrator handle state mutations
      this.orchestrator.setupPlayers(playerNames);
      this.orchestrator.transitionPhase(GamePhase.PLAYING);

      Logger.info("Name collection complete");
    } catch (error) {
      Logger.error(`Name collection failed: ${error}`);
      this.currentNameHandler = null;
      this.uiService.setTranscriptInputEnabled?.(false);
      if (this.wakeWordDetector) {
        this.wakeWordDetector.disableDirectTranscription();
      }
      throw error;
    }
  }

  private handleWakeWord(): void {
    const indicator = this.uiService.getStatusIndicator();
    indicator.setState("active");

    if (this.currentNameHandler) {
      this.uiService.updateStatus(
        t("ui.wakeWordInstruction", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }),
      );
    } else {
      this.uiService.updateStatus(t("ui.listeningForCommand"));
    }
  }

  /**
   * Speaks the current player's turn announcement when they have a pending decision.
   * Used at game start before proactive welcome to ensure one clear "your turn, which path?"
   */
  private async announceCurrentTurnIfPending(): Promise<void> {
    if (!this.orchestrator || !this.stateManager) return;
    const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
    if (!pendingPrompt) return;

    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    const currentTurn = game?.turn as string | undefined;
    if (!currentTurn || !players?.[currentTurn]) return;

    const player = players[currentTurn];
    const name = (player?.name as string) || currentTurn;
    const position = (player?.position as number) ?? 0;

    const message = t("game.turnAnnouncementWithDecision", {
      name,
      position,
      prompt: pendingPrompt,
    });
    Logger.info(`Announcing current turn (decision pending): ${name} at ${position}`);
    await this.speechService.speak(message);
  }

  /**
   * Checks if turn should advance and delegates to orchestrator.
   * UI layer responsibility: announce turn changes to user.
   * When a player is skipped (skipTurns > 0), announces the skip first, then the next player.
   */
  private async checkAndAdvanceTurn(): Promise<void> {
    if (!this.orchestrator) {
      return;
    }

    const result = await this.orchestrator.advanceTurn();

    if (result) {
      const nextPlayer = result;
      if (nextPlayer.skippedPlayer) {
        await this.speechService.speak(
          t("game.skipTurnAnnouncement", {
            name: nextPlayer.skippedPlayer.name,
          }),
        );
      }
      const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
      const message = pendingPrompt
        ? t("game.turnAnnouncementWithDecision", {
            name: nextPlayer.name,
            position: nextPlayer.position,
            prompt: pendingPrompt,
          })
        : t("game.turnHandoff", { name: nextPlayer.name });
      Logger.info(`Turn start sanity check: ${nextPlayer.name} at ${nextPlayer.position}`);
      await this.speechService.speak(message);
    }
  }

  private async handleTranscription(text: string): Promise<void> {
    Logger.user(`You said: "${text}"`);

    const indicator = this.uiService.getStatusIndicator();
    indicator.setState("listening");

    if (this.currentNameHandler) {
      this.currentNameHandler(text);
      return;
    }

    if (this.orchestrator) {
      const { success, shouldAdvanceTurn, turnAdvancedForRevenge } =
        await this.orchestrator.handleTranscript(text);

      if (success && turnAdvancedForRevenge) {
        await this.speechService.speak(
          t("game.turnAnnouncement", {
            name: turnAdvancedForRevenge.name,
            position: turnAdvancedForRevenge.position,
          }),
        );
      } else if (success && shouldAdvanceTurn) {
        await this.checkAndAdvanceTurn();
      }
    }

    this.uiService.updateStatus(
      this.options?.skipWakeWord
        ? t("ui.status.ready")
        : t("ui.wakeWordReady", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }),
    );
  }

  /**
   * Disposes the app and releases resources.
   * Note: If a transcript is in flight (handleTranscription → handleTranscript), it may still
   * complete after destroy(); there is no shared-memory race, only ordering/UX (e.g. UI state).
   */
  async dispose(): Promise<void> {
    await releaseWakeLock();
    if (this.wakeWordDetector) {
      await this.wakeWordDetector.destroy();
      this.wakeWordDetector = null;
    }

    this.orchestrator = null;
    this.stateManager = null;

    this.initialized = false;
    this.uiService.setButtonState(t("ui.startKali"), false);
    this.uiService.showButton();
    this.uiService.updateStatus(t("ui.clickToStart"));
    const indicator = this.uiService.getStatusIndicator();
    indicator.setState("idle");
    this.uiService.clearConsole();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Returns true when the core can accept transcript input (initialized or name collection active).
   * Used by debug UI to allow typing names during setup.
   */
  canAcceptTranscript(): boolean {
    return this.initialized || this.currentNameHandler !== null;
  }

  /**
   * Debug: Submit text directly (skips wake word + STT), LLM interprets.
   * Same path as voice: text → LLM → primitives → orchestrator → TTS.
   * @param text - Free-form command (e.g. "I rolled 5", "say hello")
   */
  async submitTranscript(text: string): Promise<void> {
    await this.handleTranscription(text);
  }

  /**
   * Test-only: Execute actions directly without LLM interpretation.
   * Only available when orchestrator is initialized.
   * @param actions - Array of primitive actions to validate and execute
   * @returns true if execution succeeded, false otherwise
   */
  async testExecuteActions(actions: PrimitiveAction[]): Promise<{
    success: boolean;
    shouldAdvanceTurn: boolean;
    turnAdvancedForRevenge?: { playerId: string; name: string; position: number };
  }> {
    if (!this.orchestrator) {
      throw new Error("Orchestrator not initialized");
    }

    const result = await this.orchestrator.testExecuteActions(actions);

    if (result.success && result.turnAdvancedForRevenge) {
      await this.speechService.speak(
        t("game.turnAnnouncement", {
          name: result.turnAdvancedForRevenge.name,
          position: result.turnAdvancedForRevenge.position,
        }),
      );
    } else if (result.success && result.shouldAdvanceTurn) {
      await this.checkAndAdvanceTurn();
    }

    return result;
  }
}
