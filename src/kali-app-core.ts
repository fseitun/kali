import { CONFIG } from "./config";
import { KALIMBA_EXAMPLES } from "./game-loader/examples/kalimba";
import { GameLoader } from "./game-loader/game-loader";
import type { GameModule } from "./game-loader/types";
import { t } from "./i18n/translations";
import { createLLMClient } from "./llm/llm-client-factory";
import type { LLMClient } from "./llm/LLMClient";
import { inferDecisionPoints } from "./orchestrator/decision-point-inference";
import { NameCollector } from "./orchestrator/name-collector";
import { Orchestrator } from "./orchestrator/orchestrator";
import {
  GamePhase,
  type GameState,
  type PrimitiveAction,
  type VoiceOutcomeHints,
} from "./orchestrator/types";
import type { ISpeechService } from "./services/speech-service";
import type { IUIService } from "./services/ui-service";
import { StateManager } from "./state-manager";
import { checkBrowserSupport } from "./utils/browser-support";
import { validateConfig } from "./utils/config-validator";
import { Logger } from "./utils/logger";
import { acquireScreenWakeLock, releaseWakeLock } from "./utils/wake-lock";
import { applySilentSuccessFallback } from "./voice/gameplay-voice-policy";
import { MeteredSpeechService } from "./voice/metered-speech-service";
import type { WakeWordDetector } from "./wake-word";

export class KaliAppCore {
  private wakeWordDetector: WakeWordDetector | null = null;
  private orchestrator: Orchestrator | null = null;
  private stateManager: StateManager | null = null;
  private llmClient: LLMClient | null = null;
  private gameModule: GameModule | null = null;
  private initialized = false;
  private currentNameHandler: ((text: string) => void) | null = null;
  private readonly speechService: MeteredSpeechService;

  constructor(
    private uiService: IUIService,
    speechBackend: ISpeechService,
    private options?: { skipWakeWord?: boolean },
  ) {
    this.speechService = new MeteredSpeechService(speechBackend);
  }

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

    if (this.gameModule.stateDisplay) {
      this.stateManager.set("stateDisplay", this.gameModule.stateDisplay);
    }

    Logger.robot(`Configuring LLM (${CONFIG.LLM_PROVIDER}) with game rules...`);
    this.llmClient = createLLMClient();
    this.llmClient.setGameRules(this.formatGameRules(this.gameModule));

    const initialState = this.gameModule.initialState;
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

  private formatGameRules(gameModule: GameModule): string {
    const { metadata } = gameModule;
    const typedExamples = (metadata.id === "kalimba" ? KALIMBA_EXAMPLES : []).slice(0, 4);
    const exampleLines = typedExamples.map(
      (ex) => `User: ${ex.user} | You: ${JSON.stringify(ex.actions)}`,
    );

    const summary = metadata.summary?.trim() ?? "";

    const examplesBlock =
      exampleLines.length > 0
        ? `**Examples:**\n${exampleLines.map((ex, i) => `${i + 1}. ${ex}`).join("\n")}`
        : "";

    return `## ${metadata.name}
**Objective:** ${metadata.objective}
**Your job:** Translate user speech to primitives. Orchestrator does math and turn management. Current task and options are in the state block below.
${summary ? `**Summary (for NARRATE explanations):** ${summary}\n` : ""}${examplesBlock}`;
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

    this.speechService.beginGameplayTurn();

    const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
    if (pendingPrompt) {
      // At game start with a decision point (e.g. path choice): speak turn announcement
      // directly. Avoids proactiveGameStart LLM also asking, causing duplicate path ask.
      await this.announceCurrentTurnIfPending();
    } else {
      const { success, shouldAdvanceTurn, voiceOutcomeHints } =
        await this.orchestrator.handleTranscript(t("game.proactiveStart"), {
          skipDecisionPointEnforcement: true,
        });
      if (success && shouldAdvanceTurn) {
        await this.checkAndAdvanceTurn();
      }
      await this.maybeApplySilentGameplayVoice(success, voiceOutcomeHints);
    }
  }

  /**
   * Ensures the gameplay voice-turn invariant after orchestrator + turn follow-ups (see development guidelines).
   */
  private async maybeApplySilentGameplayVoice(
    success: boolean,
    voiceOutcomeHints: VoiceOutcomeHints | undefined,
  ): Promise<void> {
    const orchestrator = this.orchestrator;
    const stateManager = this.stateManager;
    if (!success || !orchestrator || !stateManager) {
      return;
    }
    if (this.speechService.didSpeakThisTurn()) {
      return;
    }
    const state = stateManager.getState() as GameState;
    await applySilentSuccessFallback({
      hints: voiceOutcomeHints,
      state,
      speak: (text) => this.speechService.speak(text),
      setLastNarration: (text) => orchestrator.setLastNarrationForVoicePolicy(text),
    });
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

      const decisionPoints = inferDecisionPoints(this.gameModule.initialState.board);
      const hasDecisionAtStart = decisionPoints.some((dp) => dp.position === 0);

      this.uiService.setTranscriptInputEnabled?.(true);

      const playerNames = await nameCollector.collectNames(
        (handler) => {
          this.currentNameHandler = handler;
        },
        { skipReadyMessage: hasDecisionAtStart },
      );

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

  private getCurrentPlayerNameAndPosition(state: {
    game?: { turn?: string | null };
    players?: Record<string, { name?: string; position?: number }>;
  }): { name: string; position: number } | null {
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    const currentTurn = game?.turn as string | undefined;
    if (!currentTurn || !players?.[currentTurn]) {
      return null;
    }
    const player = players[currentTurn];
    const name = (player?.name as string) || currentTurn;
    const position = (player?.position as number) ?? 0;
    return { name, position };
  }

  private getCurrentTurnAnnouncementContext(): {
    name: string;
    position: number;
    prompt: string;
    orchestrator: NonNullable<KaliAppCore["orchestrator"]>;
  } | null {
    if (!this.orchestrator || !this.stateManager) {
      return null;
    }
    const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
    if (!pendingPrompt) {
      return null;
    }
    const playerInfo = this.getCurrentPlayerNameAndPosition(this.stateManager.getState());
    if (!playerInfo) {
      return null;
    }
    return {
      ...playerInfo,
      prompt: pendingPrompt,
      orchestrator: this.orchestrator,
    };
  }

  /**
   * Speaks the current player's turn announcement when they have a pending decision.
   * Used at game start before proactive welcome to ensure one clear "your turn, which path?"
   */
  private async announceCurrentTurnIfPending(): Promise<void> {
    const ctx = this.getCurrentTurnAnnouncementContext();
    if (!ctx) {
      return;
    }
    const { orchestrator, ...tParams } = ctx;
    const message = t("game.turnAnnouncementWithDecision", tParams);
    Logger.info(`Announcing current turn (decision pending): ${ctx.name} at ${ctx.position}`);
    await this.speechService.speak(message);
    orchestrator.setLastNarrationForVoicePolicy(message);
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
      for (const skipped of nextPlayer.skippedPlayers) {
        await this.speechService.speak(t("game.skipTurnAnnouncement", { name: skipped.name }));
      }
      const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
      const message = pendingPrompt
        ? t("game.turnAnnouncementWithDecision", {
            name: nextPlayer.name,
            position: nextPlayer.position,
            prompt: pendingPrompt,
          })
        : t("game.turnAnnouncement", {
            name: nextPlayer.name,
            position: nextPlayer.position,
          });
      Logger.info(`Turn start sanity check: ${nextPlayer.name} at ${nextPlayer.position}`);
      await this.speechService.speak(message);
      this.orchestrator.setLastNarrationForVoicePolicy(message);
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
      this.speechService.beginGameplayTurn();
      const { success, shouldAdvanceTurn, turnAdvancedAfterPowerCheckFail, voiceOutcomeHints } =
        await this.orchestrator.handleTranscript(text);

      if (success && turnAdvancedAfterPowerCheckFail) {
        const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
        const revengeMsg = pendingPrompt
          ? t("game.turnAnnouncementWithDecision", {
              name: turnAdvancedAfterPowerCheckFail.name,
              position: turnAdvancedAfterPowerCheckFail.position,
              prompt: pendingPrompt,
            })
          : t("game.turnAnnouncement", {
              name: turnAdvancedAfterPowerCheckFail.name,
              position: turnAdvancedAfterPowerCheckFail.position,
            });
        await this.speechService.speak(revengeMsg);
        this.orchestrator.setLastNarrationForVoicePolicy(revengeMsg);
      } else if (success && shouldAdvanceTurn) {
        await this.checkAndAdvanceTurn();
      }
      await this.maybeApplySilentGameplayVoice(success, voiceOutcomeHints);
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
    turnAdvancedAfterPowerCheckFail?: { playerId: string; name: string; position: number };
    voiceOutcomeHints?: VoiceOutcomeHints;
  }> {
    if (!this.orchestrator) {
      throw new Error("Orchestrator not initialized");
    }

    this.speechService.beginGameplayTurn();
    const result = await this.orchestrator.testExecuteActions(actions);

    if (result.success && result.turnAdvancedAfterPowerCheckFail) {
      const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
      const msg = pendingPrompt
        ? t("game.turnAnnouncementWithDecision", {
            name: result.turnAdvancedAfterPowerCheckFail.name,
            position: result.turnAdvancedAfterPowerCheckFail.position,
            prompt: pendingPrompt,
          })
        : t("game.turnAnnouncement", {
            name: result.turnAdvancedAfterPowerCheckFail.name,
            position: result.turnAdvancedAfterPowerCheckFail.position,
          });
      await this.speechService.speak(msg);
      this.orchestrator.setLastNarrationForVoicePolicy(msg);
    } else if (result.success && result.shouldAdvanceTurn) {
      await this.checkAndAdvanceTurn();
    }

    await this.maybeApplySilentGameplayVoice(result.success, result.voiceOutcomeHints);

    return result;
  }
}
