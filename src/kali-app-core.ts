import { CONFIG } from "./config";
import { KALIMBA_EXAMPLES } from "./game-loader/examples/kalimba";
import { GameLoader } from "./game-loader/game-loader";
import type { GameModule } from "./game-loader/types";
import { magicDoorHeartsPhrase } from "./i18n/magic-door-phrases";
import { t } from "./i18n/translations";
import { createLLMClient } from "./llm/llm-client-factory";
import type { LLMClient } from "./llm/LLMClient";
import {
  getMagicDoorConfig,
  getMagicDoorOpeningBonus,
  minDieToOpenMagicDoor,
  type SquareLike,
} from "./orchestrator/board-helpers";
import { inferDecisionPoints } from "./orchestrator/decision-point-inference";
import { NameCollector } from "./orchestrator/name-collector";
import { Orchestrator } from "./orchestrator/orchestrator";
import {
  FAILED_RESULT,
  GamePhase,
  type GameState,
  type OrchestratorGameplayResult,
  type PrimitiveAction,
  type TurnFrame,
  type VoiceOutcomeHints,
} from "./orchestrator/types";
import type { ISpeechService } from "./services/speech-service";
import type { IUIService } from "./services/ui-service";
import { StateManager } from "./state-manager";
import { playerStatePath } from "./state-paths";
import { checkBrowserSupport } from "./utils/browser-support";
import { validateConfig } from "./utils/config-validator";
import { Logger } from "./utils/logger";
import { acquireScreenWakeLock, releaseWakeLock } from "./utils/wake-lock";
import { applySilentSuccessFallback } from "./voice/gameplay-voice-policy";
import { MeteredSpeechService } from "./voice/metered-speech-service";
import type { WakeWordDetector } from "@/voice-recognition/wake-word";

function getMagicDoorAnnouncementContext(
  nextPlayer: { playerId: string; name: string; position: number },
  state: GameState | undefined,
): {
  door: { position: number; target: number };
  playerSlice: Record<string, unknown> | undefined;
} | null {
  const squares = state?.board?.squares as Record<string, SquareLike> | undefined;
  const door = getMagicDoorConfig(squares);
  if (nextPlayer.position !== door?.position) {
    return null;
  }
  const playerSlice = state?.players?.[nextPlayer.playerId] as Record<string, unknown> | undefined;
  if (playerSlice?.magicDoorOpened === true) {
    return null;
  }
  return { door, playerSlice };
}

function magicDoorTurnAnnouncementLine(
  nextPlayer: { playerId: string; name: string; position: number },
  state: GameState | undefined,
): string | null {
  const ctx = getMagicDoorAnnouncementContext(nextPlayer, state);
  if (!ctx) {
    return null;
  }
  const heartsRaw = ctx.playerSlice?.hearts;
  const hearts = typeof heartsRaw === "number" && heartsRaw >= 0 ? heartsRaw : 0;
  const doorBonus = getMagicDoorOpeningBonus(ctx.playerSlice);
  const minDie = minDieToOpenMagicDoor(ctx.door.target, doorBonus);
  return t("game.turnAnnouncementMagicDoor", {
    name: nextPlayer.name,
    position: nextPlayer.position,
    heartsPhrase: magicDoorHeartsPhrase(hearts),
    target: ctx.door.target,
    minDie,
  });
}

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
    private options?: { skipWakeWord?: boolean; debugAllowPositionTeleport?: boolean },
  ) {
    this.speechService = new MeteredSpeechService(speechBackend);
  }

  private getDefaultStatusMessage(): string {
    return this.options?.skipWakeWord
      ? t("ui.status.ready")
      : t("ui.wakeWordReady", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] });
  }

  private getPostInitStatusMessage(): string {
    const defaultStatus = this.getDefaultStatusMessage();
    if (!this.stateManager || this.options?.skipWakeWord) {
      return defaultStatus;
    }
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    if (game?.phase === GamePhase.PLAYING) {
      return t("ui.savedGameDetected", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] });
    }
    return defaultStatus;
  }

  private async handleInitSuccess(shouldStartGame: boolean): Promise<void> {
    const defaultStatus = this.getDefaultStatusMessage();
    if (shouldStartGame) {
      this.uiService.updateStatus(defaultStatus);
      Logger.info("Kali is ready");
      await this.proactiveGameStart();
      return;
    }
    const statusMessage = this.getPostInitStatusMessage();
    this.uiService.updateStatus(statusMessage);
    if (statusMessage !== defaultStatus) {
      await this.speechService.speak(statusMessage);
    }
    Logger.info("Kali is ready");
  }

  private async handleInitError(error: unknown): Promise<void> {
    this.uiService.setButtonState(t("ui.startKali"), false);
    this.uiService.updateStatus(t("ui.initializationFailed"));
    Logger.error(`Error: ${error}`);
    const indicator = this.uiService.getStatusIndicator();
    indicator.setState("idle");
    await this.speechService.speak(t("ui.initializationFailed"));
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

      await this.handleInitSuccess(shouldStartGame);
    } catch (error) {
      await this.handleInitError(error);
    }
  }

  private async initializeOrchestrator(): Promise<void> {
    Logger.brain("Initializing orchestrator...");

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
    const orchestratorOptions =
      this.options?.debugAllowPositionTeleport === true
        ? { allowBypassPositionDecisionGate: true }
        : undefined;
    this.orchestrator = new Orchestrator(
      this.llmClient,
      this.stateManager,
      this.speechService,
      indicator,
      initialState,
      orchestratorOptions,
    );

    Logger.info("Loading sound effects...");
    await gameLoader.loadSoundEffects(this.gameModule, this.speechService);

    Logger.info("Orchestrator ready");
  }

  private formatGameRules(gameModule: GameModule): string {
    const { metadata } = gameModule;
    const fromMeta = metadata.llmExamples;
    const kalimbaFallback = metadata.id === "kalimba" ? KALIMBA_EXAMPLES : [];
    const exampleSource =
      Array.isArray(fromMeta) && fromMeta.length > 0 ? fromMeta : kalimbaFallback;
    const typedExamples = exampleSource.slice(0, 6);
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

    const { WakeWordDetector } = await import("@/voice-recognition/wake-word");
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
      const result = await this.orchestrator.handleTranscript(t("game.proactiveStart"), {
        skipDecisionPointEnforcement: true,
      });
      await this.applyPostGameplayResult(result);
    }
  }

  /**
   * Applies common post-gameplay handling after orchestrator results:
   * turn advancement/announcements and silent-success fallback voice policy.
   */
  private async applyPostGameplayResult(result: OrchestratorGameplayResult): Promise<void> {
    if (!this.orchestrator) {
      return;
    }
    if (result.success && result.turnAdvance.kind === "alreadyAdvanced") {
      const { nextPlayer } = result.turnAdvance;
      const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
      const msg = this.buildGameplayTurnAnnouncement(nextPlayer, pendingPrompt);
      await this.speechService.speak(msg);
      this.orchestrator.setLastNarrationForVoicePolicy(msg);
    } else if (result.success && result.turnAdvance.kind === "callAdvanceTurn") {
      await this.checkAndAdvanceTurn();
    }
    await this.maybeApplySilentGameplayVoice(
      result.success,
      result.voiceOutcomeHints,
      result.turnFrame,
    );
  }

  /**
   * Ensures the gameplay voice-turn invariant after orchestrator + turn follow-ups (see development guidelines).
   */
  private async maybeApplySilentGameplayVoice(
    success: boolean,
    voiceOutcomeHints: VoiceOutcomeHints | undefined,
    turnFrame: TurnFrame | undefined,
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
      turnFrame,
      state,
      speak: (text) => this.speechService.speak(text),
      setLastNarration: (text) => orchestrator.setLastNarrationForVoicePolicy(text),
    });
  }

  private cleanupNameCollection(): void {
    this.currentNameHandler = null;
    this.uiService.setTranscriptInputEnabled?.(false);
    if (this.wakeWordDetector) {
      this.wakeWordDetector.disableDirectTranscription();
    }
  }

  private async runNameCollectionCore(
    stateManager: StateManager,
    gameModule: GameModule,
    orchestrator: Orchestrator,
    llmClient: LLMClient,
  ): Promise<void> {
    const state = stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    Logger.info(`🎮 Name collection check - phase: ${game?.phase} (expected: ${GamePhase.SETUP})`);
    if (game?.phase !== GamePhase.SETUP) {
      Logger.info("Skipping name collection - not in SETUP phase");
      return;
    }

    this.uiService.updateStatus(
      t("ui.wakeWordInstruction", { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }),
    );
    const gameName = (game?.name as string) || "the game";
    const nameCollector = new NameCollector(
      this.speechService,
      gameName,
      () => this.wakeWordDetector?.enableDirectTranscription(),
      llmClient,
      gameModule.metadata,
    );
    const decisionPoints = inferDecisionPoints(gameModule.initialState.board);
    const hasDecisionAtStart = decisionPoints.some((dp) => dp.position === 0);

    this.uiService.setTranscriptInputEnabled?.(true);
    const playerNames = await nameCollector.collectNames(
      (handler) => {
        this.currentNameHandler = handler;
      },
      { skipReadyMessage: hasDecisionAtStart },
    );

    this.cleanupNameCollection();
    orchestrator.setupPlayers(playerNames);
    orchestrator.transitionPhase(GamePhase.PLAYING);
    Logger.info("Name collection complete");
  }

  private async runNameCollection(): Promise<void> {
    const stateManager = this.stateManager;
    const gameModule = this.gameModule;
    const orchestrator = this.orchestrator;
    const llmClient = this.llmClient;
    if (!stateManager || !gameModule || !orchestrator || !llmClient) {
      throw new Error("Cannot run name collection: components not initialized");
    }
    try {
      await this.runNameCollectionCore(stateManager, gameModule, orchestrator, llmClient);
    } catch (error) {
      Logger.error(`Name collection failed: ${error}`);
      this.cleanupNameCollection();
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
   * Turn line after advance or alreadyAdvanced: normal move prompt, magic door opening prompt, or fork prompt.
   */
  private buildGameplayTurnAnnouncement(
    nextPlayer: { playerId: string; name: string; position: number },
    pendingPrompt: string | null | undefined,
  ): string {
    const magicDoorLine = magicDoorTurnAnnouncementLine(
      nextPlayer,
      this.stateManager?.getState() as GameState | undefined,
    );
    if (magicDoorLine !== null) {
      return magicDoorLine;
    }
    if (pendingPrompt) {
      return t("game.turnAnnouncementWithDecision", {
        name: nextPlayer.name,
        position: nextPlayer.position,
        prompt: pendingPrompt,
      });
    }
    return t("game.turnAnnouncement", {
      name: nextPlayer.name,
      position: nextPlayer.position,
    });
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
      const message = this.buildGameplayTurnAnnouncement(nextPlayer, pendingPrompt);
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
      const result = await this.orchestrator.handleTranscript(text);
      await this.applyPostGameplayResult(result);
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
    this.uiService.updateStatus("");
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
   * Debug UI: current turn and each player's board position (read-only).
   */
  getDebugPlayerBoardSnapshot(): {
    turn: string | null | undefined;
    rows: { id: string; name: string; position: number }[];
  } | null {
    if (!this.initialized || !this.stateManager) {
      return null;
    }
    const state = this.stateManager.getState();
    const turn = state.game?.turn;
    const players = state.players ?? {};
    const ids = Object.keys(players).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    const rows = ids.map((id) => {
      const p = players[id];
      return { id, name: p.name, position: p.position };
    });
    return { turn, rows };
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
   * @returns Error message or null when phase, turn, and square index are valid for teleport.
   */
  private validateDebugTeleportPlayingSquare(state: GameState, square: number): string | null {
    const game = state.game as Record<string, unknown> | undefined;
    if (game?.phase !== GamePhase.PLAYING) {
      return "game not in PLAYING phase";
    }
    if (!game.turn) {
      return "no current turn";
    }
    const board = state.board as Record<string, unknown> | undefined;
    const squares = board?.squares as Record<string, unknown> | undefined;
    if (!squares || !(String(square) in squares)) {
      return `square ${square} not on board`;
    }
    return null;
  }

  /**
   * Resolves current player id for debug teleport, or an error message.
   */
  private resolveDebugTeleportOrError(
    square: number,
  ): { ok: true; turn: string } | { ok: false; msg: string } {
    if (!this.options?.debugAllowPositionTeleport) {
      return { ok: false, msg: "disabled (enable VITE_DEBUG_POSITION_TELEPORT at build time)" };
    }
    if (!this.initialized || !this.orchestrator || !this.stateManager) {
      return { ok: false, msg: "app not ready" };
    }
    if (!Number.isInteger(square) || square < 0) {
      return { ok: false, msg: `invalid square ${square}` };
    }
    const state = this.stateManager.getState();
    const squareErr = this.validateDebugTeleportPlayingSquare(state, square);
    if (squareErr !== null) {
      return { ok: false, msg: squareErr };
    }
    const turn = (state.game as Record<string, unknown>).turn as string;
    return { ok: true, turn };
  }

  /**
   * Debug route only: teleport the current player to a board square (SET_STATE).
   * Requires `debugAllowPositionTeleport` and `VITE_DEBUG_POSITION_TELEPORT=true` at build time.
   * @param square - Target square index from the loaded game board
   * @returns Same shape as {@link KaliAppCore.testExecuteActions}
   */
  async submitDebugPositionTeleport(square: number): Promise<OrchestratorGameplayResult> {
    const resolved = this.resolveDebugTeleportOrError(square);
    if (!resolved.ok) {
      Logger.warn(`submitDebugPositionTeleport: ${resolved.msg}`);
      return FAILED_RESULT;
    }
    const path = playerStatePath(resolved.turn, "position");
    return this.testExecuteActions([{ action: "SET_STATE", path, value: square }]);
  }

  /**
   * Test-only: Execute actions directly without LLM interpretation.
   * Only available when orchestrator is initialized.
   * @param actions - Array of primitive actions to validate and execute
   * @returns Orchestrator result with turnAdvance discriminated union
   */
  async testExecuteActions(actions: PrimitiveAction[]): Promise<OrchestratorGameplayResult> {
    if (!this.orchestrator) {
      throw new Error("Orchestrator not initialized");
    }

    this.speechService.beginGameplayTurn();
    const result = await this.orchestrator.testExecuteActions(actions);
    await this.applyPostGameplayResult(result);

    return result;
  }
}
