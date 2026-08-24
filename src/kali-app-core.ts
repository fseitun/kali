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
import { hasPendingForCurrentTurn } from "./orchestrator/pending-types";
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
import { applySilentSuccessFallback, buildTurnAnnouncement } from "./voice/gameplay-voice-policy";
import { MeteredSpeechService } from "./voice/metered-speech-service";
import { routeTranscript, type ListeningMode } from "@/voice/intent-router";

interface SpeechDetectorLike {
  initialize(): Promise<void>;
  startListening(): Promise<void>;
  stopListening?(): Promise<void>;
  destroy(): Promise<void>;
}

const HABITAT_ANIMAL_COOLDOWN_MS = 20_000;
const HABITAT_ANIMAL_JITTER_MIN_MS = 5_000;
const HABITAT_ANIMAL_JITTER_MAX_MS = 15_000;
const HABITAT_ANIMAL_TICK_MS = 5_000;
/** A queued transcript older than this describes a board that has already moved on. */
const STALE_TRANSCRIPT_MS = 8_000;

export class KaliAppCore {
  private speechDetector: SpeechDetectorLike | null = null;
  private orchestrator: Orchestrator | null = null;
  private stateManager: StateManager | null = null;
  private llmClient: LLMClient | null = null;
  private gameModule: GameModule | null = null;
  private initialized = false;
  private currentNameHandler: ((text: string) => void) | null = null;
  private readonly speechService: MeteredSpeechService;
  private activeHabitatAudio: string | null = null;
  private nextHabitatAnimalAtMs = 0;
  private habitatAnimalTimer: ReturnType<typeof setInterval> | null = null;
  private ambientCaptureMuteHolds = 0;
  private listeningMode: ListeningMode = "ambient";
  private promptedModeTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Serializes voice transcripts: the orchestrator drops anything that arrives mid-turn. */
  private transcriptQueue: Promise<void> = Promise.resolve();
  /** Normalized text of every transcript still queued or in flight. */
  private readonly queuedTranscripts = new Set<string>();

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
    // A resumed game is mid-play with nothing scheduled to speak: "partida guardada" alone
    // leaves the table not knowing whose turn it is or what they owe. Deterministic, and
    // outside the wake-word branch above so the debug route resumes out loud too.
    await this.announceCurrentTurn();
    Logger.info("Kali is ready");
  }

  private async handleInitError(error: unknown): Promise<void> {
    // A half-started detector still holds a mic, an AudioContext and a socket; a retry would
    // stack a second one on top and every utterance would be handled twice.
    if (this.speechDetector) {
      try {
        await this.speechDetector.destroy();
      } catch (destroyError) {
        Logger.warn(`Failed to dispose speech detector after init error: ${destroyError}`);
      }
      this.speechDetector = null;
    }
    this.uiService.setButtonState(t("ui.startKali"), false);
    this.uiService.updateStatus(t("ui.initializationFailed"));
    Logger.error(`Error: ${error}`);
    const indicator = this.uiService.getStatusIndicator();
    indicator.setState("idle");
    // getUserMedia rejects with a DOMException; "no mic" needs different words than "broken".
    const micDenied =
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "NotFoundError");
    await this.speechService.speak(
      micDenied ? t("errors.microphoneAccess") : t("ui.initializationFailed"),
    );
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
        Logger.info("Skipping speech recognition (debug mode - text input only)");
      }

      const shouldStartGame = await this.handleSavedGameOrSetup();
      this.syncHabitatAmbientAudio();
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
    this.syncHabitatAmbientAudio();
    this.ensureHabitatAnimalTimer();

    Logger.info("Orchestrator ready");
  }

  private ensureHabitatAnimalTimer(): void {
    // Every tick is a no-op while non-TTS audio is muted; do not run the timer at all.
    if (this.habitatAnimalTimer !== null || CONFIG.STT.MUTE_NON_TTS_AUDIO) {
      return;
    }
    this.habitatAnimalTimer = setInterval(() => {
      this.syncHabitatAmbientAudio();
    }, HABITAT_ANIMAL_TICK_MS);
  }

  private stopHabitatAnimalTimer(): void {
    if (this.habitatAnimalTimer === null) {
      return;
    }
    clearInterval(this.habitatAnimalTimer);
    this.habitatAnimalTimer = null;
  }

  private getCurrentHabitatFromState(): string | null {
    if (!this.stateManager) {
      return null;
    }
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const habitat = game?.currentHabitat;
    return typeof habitat === "string" && habitat.trim() !== "" ? habitat : null;
  }

  private scheduleNextHabitatAnimal(nowMs: number): void {
    const jitterRange = HABITAT_ANIMAL_JITTER_MAX_MS - HABITAT_ANIMAL_JITTER_MIN_MS;
    const jitter = HABITAT_ANIMAL_JITTER_MIN_MS + Math.floor(Math.random() * (jitterRange + 1));
    this.nextHabitatAnimalAtMs = nowMs + HABITAT_ANIMAL_COOLDOWN_MS + jitter;
  }

  private maybePlayHabitatAnimal(habitat: string, nowMs: number): void {
    if (!this.gameModule || !this.stateManager) {
      return;
    }
    const game = this.stateManager.getState().game as Record<string, unknown> | undefined;
    if (game?.phase !== GamePhase.PLAYING) {
      return;
    }
    if (nowMs < this.nextHabitatAnimalAtMs) {
      return;
    }
    const habitatEntry = this.gameModule.habitatAudio?.[habitat];
    if (!habitatEntry || habitatEntry.animalSoundKeys.length === 0) {
      this.scheduleNextHabitatAnimal(nowMs);
      return;
    }
    const index = Math.floor(Math.random() * habitatEntry.animalSoundKeys.length);
    this.speechService.playSound(habitatEntry.animalSoundKeys[index]);
    this.scheduleNextHabitatAnimal(nowMs);
  }

  private syncHabitatAmbientAudio(): void {
    if (!this.gameModule) {
      return;
    }
    const habitat = this.getCurrentHabitatFromState();
    if (!habitat) {
      return;
    }
    if (this.activeHabitatAudio !== habitat) {
      const habitatEntry = this.gameModule.habitatAudio?.[habitat];
      if (habitatEntry) {
        this.speechService.startLoopingSound(habitatEntry.trackSoundKey);
      } else {
        this.speechService.stopLoopingSound();
      }
      this.activeHabitatAudio = habitat;
      this.scheduleNextHabitatAnimal(Date.now());
      return;
    }
    this.maybePlayHabitatAnimal(habitat, Date.now());
  }

  private acquireAmbientCaptureMute(): void {
    this.ambientCaptureMuteHolds += 1;
    if (this.ambientCaptureMuteHolds === 1) {
      this.speechService.setAmbientCaptureMuted(true);
    }
  }

  private releaseAmbientCaptureMute(): void {
    if (this.ambientCaptureMuteHolds === 0) {
      return;
    }
    this.ambientCaptureMuteHolds -= 1;
    if (this.ambientCaptureMuteHolds === 0) {
      this.speechService.setAmbientCaptureMuted(false);
    }
  }

  private setListeningMode(mode: ListeningMode): void {
    this.listeningMode = mode;
  }

  private openPromptedWindow(durationMs = 10_000): void {
    this.setListeningMode("prompted");
    if (this.promptedModeTimeout !== null) {
      clearTimeout(this.promptedModeTimeout);
    }
    this.promptedModeTimeout = setTimeout(() => {
      this.promptedModeTimeout = null;
      if (this.currentNameHandler === null) {
        this.setListeningMode("ambient");
      }
    }, durationMs);
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
    const { DeepgramStream } = await import("@/voice-recognition/deepgram-stream");
    this.speechDetector = new DeepgramStream(
      (text) => this.enqueueStreamTranscript(text),
      (raw, processed, wakeWordDetected) =>
        this.uiService.addTranscription(raw, processed, wakeWordDetected),
      () => {
        void this.speechService.speak(t("errors.sttOnlineFailed"));
      },
      // Gates the microphone while Kali talks: her voice never reaches the recogniser, so no
      // transcript she could obey is ever produced from it. Recognising her words afterwards is
      // unwinnable — she reads the options aloud, so a correct answer is drawn from her own
      // vocabulary by design.
      () => this.speechService.isSelfAudible(),
    );
    Logger.info("Deepgram streaming speech detection enabled");

    await this.speechDetector.initialize();

    await this.speechDetector.startListening();
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
      this.syncHabitatAmbientAudio();

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
      // Axiom 1: the app never resets state itself. RESET_GAME without the roster is the
      // orchestrator's own fresh start, and name collection below finishes it out loud.
      const reset = await this.orchestrator.executePrimitiveActions([
        { action: "RESET_GAME", keepPlayerNames: false },
      ]);
      Logger.info(`Fresh start via RESET_GAME: success=${reset.success}`);
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

    if (this.orchestrator.getPendingDecisionPrompt()) {
      // At game start with a decision point (e.g. path choice): say it deterministically.
      // Letting the LLM welcome the table here makes it ask the same question a second time.
      await this.announceCurrentTurn();
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
    await this.announceGameRestart(result);
    if (result.success && result.turnAdvance.kind === "alreadyAdvanced") {
      const { nextPlayer } = result.turnAdvance;
      await this.announceSkippedPlayers(nextPlayer.skippedPlayers);
      const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
      const msg = this.buildGameplayTurnAnnouncement(nextPlayer, pendingPrompt);
      await this.speechService.speak(msg);
      this.openPromptedWindow();
      this.orchestrator.setLastNarrationForVoicePolicy(msg);
    } else if (result.success && result.turnAdvance.kind === "callAdvanceTurn") {
      await this.checkAndAdvanceTurn();
    }
    const askedForNextAction = await this.maybeApplySilentGameplayVoice(
      result.success,
      result.voiceOutcomeHints,
      result.turnFrame,
    );
    // A busy or failed turn is otherwise a Logger.warn only, and production has no log sink.
    if (!result.success && !this.speechService.didSpeakThisTurn()) {
      await this.speechService.speak(t("errors.somethingWentWrong"));
    }
    // Kali just asked a question — a fork, an animal riddle, an encounter roll — or told the
    // player to roll after their fork choice, so the reply must not need the wake word.
    if (this.currentTurnOwesAnswer() || askedForNextAction) {
      this.openPromptedWindow();
    }
    this.syncHabitatAmbientAudio();
    this.scheduleNameCollectionAfterReset(result);
  }

  private isInSetupPhase(): boolean {
    return this.stateManager?.getState().game?.phase === GamePhase.SETUP;
  }

  /**
   * A reset that kept no roster lands in SETUP, so the names have to be collected again. Name
   * collection awaits the next transcripts and this runs inside the transcript queue: awaiting it
   * here would starve NameCollector of every following utterance.
   *
   * The startup follow-up matters as much as the collection itself: `transitionPhase(PLAYING)`
   * speaks nothing, so without `proactiveGameStart` the new game is silently unplayable.
   */
  private scheduleNameCollectionAfterReset(result: OrchestratorGameplayResult): void {
    if (!result.success || result.gameReset !== true || !this.isInSetupPhase()) {
      return;
    }
    void this.runNameCollection()
      .then(() => this.proactiveGameStart())
      .catch(async (error: unknown) => {
        Logger.error(`Name collection after reset failed: ${error}`);
        await this.speechService.speak(t("errors.somethingWentWrong"));
      });
  }

  /**
   * RESET_GAME leaves the game either playable with the kept roster or back in SETUP. Both are
   * silent without this: `turn-manager` refuses to advance outside PLAYING, so no turn
   * announcement fires on its own (ADR 0003).
   */
  private async announceGameRestart(result: OrchestratorGameplayResult): Promise<void> {
    const orchestrator = this.orchestrator;
    const stateManager = this.stateManager;
    if (!result.success || result.gameReset !== true || !orchestrator || !stateManager) {
      return;
    }
    const restarted = t("game.restarted");
    await this.speechService.speak(restarted);
    orchestrator.setLastNarrationForVoicePolicy(restarted);
    await this.announceCurrentTurn();
  }

  /**
   * Says whose turn it is and what they owe Kali — the fork question, the revenge roll, the
   * magic door, or the plain roll — straight from state, with no LLM in the loop.
   *
   * Every path that resumes play rather than advancing a turn needs this: `turn-manager` only
   * announces on advancement, so a restart and a saved game picked up at startup are both
   * silent without it, and the child is left with nothing to do (ADR 0003).
   */
  private async announceCurrentTurn(): Promise<void> {
    const orchestrator = this.orchestrator;
    const stateManager = this.stateManager;
    if (!orchestrator || !stateManager) {
      return;
    }
    const state = stateManager.getState();
    const playerInfo = this.getCurrentPlayerNameAndPosition(state);
    const turn = state.game?.turn;
    if (state.game?.phase !== GamePhase.PLAYING || !playerInfo || !turn) {
      return;
    }
    const msg = this.buildGameplayTurnAnnouncement(
      { playerId: turn, ...playerInfo },
      orchestrator.getPendingDecisionPrompt(),
    );
    Logger.info(`Announcing current turn: ${playerInfo.name} at ${playerInfo.position}`);
    await this.speechService.speak(msg);
    this.openPromptedWindow();
    orchestrator.setLastNarrationForVoicePolicy(msg);
  }

  /**
   * Ensures the gameplay voice-turn invariant after orchestrator + turn follow-ups (see development guidelines).
   *
   * @returns true when it spoke a fallback line, which always asks for the next roll or answer
   */
  private async maybeApplySilentGameplayVoice(
    success: boolean,
    voiceOutcomeHints: VoiceOutcomeHints | undefined,
    turnFrame: TurnFrame | undefined,
  ): Promise<boolean> {
    const orchestrator = this.orchestrator;
    const stateManager = this.stateManager;
    if (!success || !orchestrator || !stateManager) {
      return false;
    }
    if (this.speechService.didSpeakThisTurn()) {
      return false;
    }
    const state = stateManager.getState() as GameState;
    return applySilentSuccessFallback({
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
    this.setListeningMode("ambient");
    this.releaseAmbientCaptureMute();
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
      () => {
        this.acquireAmbientCaptureMute();
        this.setListeningMode("prompted");
      },
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

  /**
   * Queues one voice transcript. Two children talking over Kali's narration would otherwise
   * race into the orchestrator's `isProcessing` lock and the second utterance would vanish.
   *
   * No self-speech check here any more: the microphone is gated while Kali is audible, so
   * everything that reaches this point was said by a person and is handled on its merits.
   *
   * ponytail: a repeat is only dropped while the first copy is still queued; an identical
   * command said again after that one finished is handled normally. Add a time window if
   * duplicates ever survive that.
   */
  private enqueueStreamTranscript(text: string): void {
    const trimmed = text.trim();
    const key = trimmed.toLowerCase();
    if (this.queuedTranscripts.has(key)) {
      // Nothing happened yet, so the child said it again: acting on both moves them twice.
      Logger.debug(`Ignoring repeat of a transcript still being handled: "${trimmed}"`);
      return;
    }
    this.queuedTranscripts.add(key);
    const arrivedAtMs = Date.now();
    this.transcriptQueue = this.transcriptQueue
      .then(async () => {
        try {
          if (Date.now() - arrivedAtMs > STALE_TRANSCRIPT_MS) {
            Logger.warn(`Dropping stale transcript: "${trimmed}"`);
            await this.askToRepeat();
            return;
          }
          await this.handleStreamTranscript(text);
        } finally {
          this.queuedTranscripts.delete(key);
        }
      })
      // A rejected queue promise would never run another transcript: Kali would go deaf.
      .catch(async (error: unknown) => {
        Logger.error(`Transcript handling failed: ${error}`);
        await this.speechService.speak(t("errors.somethingWentWrong"));
      });
  }

  /** True while the current player still owes Kali an answer: a fork, a riddle, or a roll. */
  private currentTurnOwesAnswer(): boolean {
    if (this.currentNameHandler !== null) {
      return true;
    }
    if (this.orchestrator?.getPendingDecisionPrompt()) {
      return true;
    }
    const state = this.stateManager?.getState();
    return state !== undefined && hasPendingForCurrentTurn(state);
  }

  /** Kali could not act on what she heard: say so, and keep the wake word out of the way. */
  private async askToRepeat(): Promise<void> {
    this.openPromptedWindow();
    await this.speechService.speak(t("errors.sttOnlineTimeout"));
  }

  private async handleStreamTranscript(text: string): Promise<void> {
    const routeDecision = await routeTranscript(
      text,
      {
        mode: this.listeningMode,
        wakeWords: CONFIG.WAKE_WORD.TEXT,
        inNameCollection: this.currentNameHandler !== null,
        // A fork prompt is only one of the things Kali waits on: an animal riddle or an
        // encounter roll owes her an answer too, and after the prompted window lapses that
        // answer is the only thing keeping it from being routed away as chatter.
        awaitingPlayerAnswer: this.currentTurnOwesAnswer(),
      },
      this.llmClient,
    );
    if (routeDecision.kind === "GAME_COMMAND") {
      await this.handleTranscription(routeDecision.transcript);
      return;
    }
    if (routeDecision.kind === "AMBIGUOUS") {
      await this.askToRepeat();
    }
  }

  private getCurrentPlayerNameAndPosition(state: {
    game?: { turn?: string | null };
    players?: Record<string, { name?: string; position?: number }>;
  }): { name: string; position: number } | null {
    const game = state.game;
    const players = state.players;
    const currentTurn = game?.turn as string | undefined;
    if (!currentTurn || !players?.[currentTurn]) {
      return null;
    }
    const player = players[currentTurn];
    const name = (player?.name as string) || currentTurn;
    const position = (player?.position as number) ?? 0;
    return { name, position };
  }

  private buildGameplayTurnAnnouncement(
    nextPlayer: { playerId: string; name: string; position: number },
    pendingPrompt: string | null | undefined,
  ): string {
    return buildTurnAnnouncement(nextPlayer, pendingPrompt, this.stateManager?.getState());
  }

  /**
   * Both advancement paths pass over skipping players; saying nothing loses the table.
   */
  private async announceSkippedPlayers(skipped: readonly { name: string }[]): Promise<void> {
    for (const player of skipped) {
      await this.speechService.speak(t("game.skipTurnAnnouncement", { name: player.name }));
    }
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
      await this.announceSkippedPlayers(nextPlayer.skippedPlayers);
      const pendingPrompt = this.orchestrator.getPendingDecisionPrompt();
      const message = this.buildGameplayTurnAnnouncement(nextPlayer, pendingPrompt);
      Logger.info(`Turn start sanity check: ${nextPlayer.name} at ${nextPlayer.position}`);
      await this.speechService.speak(message);
      this.openPromptedWindow();
      this.orchestrator.setLastNarrationForVoicePolicy(message);
    }
  }

  private async handleTranscription(text: string): Promise<void> {
    Logger.user(`You said: "${text}"`);

    const indicator = this.uiService.getStatusIndicator();
    indicator.setState("listening");

    if (this.currentNameHandler) {
      this.currentNameHandler(text);
      this.openPromptedWindow();
      return;
    }

    // The only ambient-capture hold is NameCollector's, released by cleanupNameCollection.
    // Gameplay never acquires one, so there is nothing to release here.
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
    // No ambient reset here: it would cancel the prompted window Kali just opened when she
    // asked for the next roll or answer. openPromptedWindow's own timeout owns that reset.
  }

  /**
   * Disposes the app and releases resources.
   * Note: If a transcript is in flight (handleTranscription → handleTranscript), it may still
   * complete after destroy(); there is no shared-memory race, only ordering/UX (e.g. UI state).
   */
  async dispose(): Promise<void> {
    await releaseWakeLock();
    if (this.promptedModeTimeout !== null) {
      clearTimeout(this.promptedModeTimeout);
      this.promptedModeTimeout = null;
    }
    if (this.speechDetector) {
      await this.speechDetector.destroy();
      this.speechDetector = null;
    }
    this.stopHabitatAnimalTimer();
    this.speechService.stopLoopingSound();
    this.ambientCaptureMuteHolds = 0;
    this.speechService.setAmbientCaptureMuted(false);
    this.activeHabitatAudio = null;
    this.nextHabitatAnimalAtMs = 0;

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
    const board = state.board;
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
