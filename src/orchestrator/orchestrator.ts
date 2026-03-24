import type { ActionExecutorContext } from "./action-executors";
import {
  executeNarrate,
  executePlayerAnswered,
  executePlayerRolled,
  executeResetGame,
  executeSetState,
} from "./action-executors";
import { BoardEffectsHandler } from "./board-effects-handler";
import { getWinPosition } from "./board-helpers";
import { getCurrentDecisionPoint, narrateCoversDecision } from "./decision-helpers";
import { DecisionPointEnforcer } from "./decision-point-enforcer";
import { reorderPowerCheckBeforeRoll } from "./reorder-power-check";
import { resolveRiddleAnswerToOption } from "./riddle-answer";
import { RiddlePowerCheckHandler } from "./riddle-power-check";
import { TurnManager } from "./turn-manager";
import {
  GamePhase,
  type OrchestratorGameplayResult,
  type PrimitiveAction,
  type ExecutionContext,
  type ActionHandler,
  type GameState,
  type VoiceOutcomeHints,
} from "./types";
import { VALIDATION_ERROR_I18N } from "./validation-i18n";
import { validateActions, type ValidationResult } from "./validator";
import { validatePlayerRolled } from "./validator/player-rolled";
import type { ValidatorContext } from "./validator/types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { t } from "@/i18n/translations";
import type { LLMClient } from "@/llm/LLMClient";
import { formatStateContext } from "@/llm/state-context";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { GAME_PATH, STATE_PLAYERS_PREFIX } from "@/state-paths";
import { Logger } from "@/utils/logger";
import { Profiler } from "@/utils/profiler";

/**
 * Core orchestrator that processes voice transcripts through LLM,
 * validates generated actions, and executes them on game state.
 *
 * AUTHORITY: The orchestrator owns all game state transitions including:
 * - Turn advancement
 * - Phase transitions
 * - Player setup
 * - Board mechanics
 */
/** Optional orchestrator options (e.g. integration scenario mode). */
export interface OrchestratorOptions {
  /** When true, validator allows SET_STATE game.pending to null for scripted integration scenarios. */
  allowScenarioOnlyStatePaths?: boolean;
  /** When true, SET_STATE on players.*.position bypasses the fork-choice gate (debug teleport; build-time gated via env). */
  allowBypassPositionDecisionGate?: boolean;
}

function isPendingAnimalRiddleForCurrentTurn(game: Record<string, unknown> | undefined): boolean {
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as { kind?: string; playerId?: string } | null | undefined;
  return pending?.kind === "riddle" && Boolean(currentTurn) && pending.playerId === currentTurn;
}

function normalizedRiddleOptionFromTranscript(
  transcript: string,
  actions: PrimitiveAction[],
  firstAnsweredIndex: number,
  riddleOptions: string[],
): string | null {
  const fromTranscript = resolveRiddleAnswerToOption(transcript, riddleOptions);
  if (fromTranscript !== null) {
    return fromTranscript;
  }
  const answered = actions[firstAnsweredIndex];
  if (answered?.action === "PLAYER_ANSWERED" && typeof answered.answer === "string") {
    return resolveRiddleAnswerToOption(answered.answer, riddleOptions);
  }
  return null;
}

export class Orchestrator {
  private turnManager: TurnManager;
  private boardEffectsHandler: BoardEffectsHandler;
  private decisionPointEnforcer: DecisionPointEnforcer;
  private riddlePowerCheckHandler: RiddlePowerCheckHandler;
  private actionHandlers: Map<string, ActionHandler> = new Map();
  private isProcessing = false;
  private initialState: GameState;
  private readonly defaultContext: ExecutionContext = {};
  /** Last NARRATE text spoken; passed to LLM so short replies (sí/no, number) can be interpreted as answers to that question. */
  private lastNarration = "";

  constructor(
    private llmClient: LLMClient,
    private stateManager: StateManager,
    private speechService: ISpeechService,
    private statusIndicator: IStatusIndicator,
    initialState: GameState,
    readonly options?: OrchestratorOptions,
  ) {
    this.initialState = initialState;

    this.turnManager = new TurnManager(stateManager);
    this.boardEffectsHandler = new BoardEffectsHandler(
      stateManager,
      this.processTranscriptAsBool.bind(this),
    );
    this.decisionPointEnforcer = new DecisionPointEnforcer(
      stateManager,
      this.processTranscriptAsBool.bind(this),
    );
    this.riddlePowerCheckHandler = new RiddlePowerCheckHandler({
      stateManager,
      speechService,
      llmClient,
      boardEffectsHandler: this.boardEffectsHandler,
      turnManager: this.turnManager,
      statusIndicator,
      setLastNarration: (text) => {
        this.lastNarration = text;
      },
      checkAndApplyWinCondition: (path) => this.checkAndApplyWinCondition(path),
    });

    llmClient.onRetry = () => {
      void this.speechService.speak(t("llm.retrying"));
    };
  }

  /**
   * Checks if the orchestrator is currently processing a request.
   * @returns true if processing, false otherwise
   */
  isLocked(): boolean {
    return this.isProcessing;
  }

  /**
   * Tries to acquire the processing lock. Must be called synchronously before any await.
   * Prevents TOCTOU: check and set are in one place so two concurrent callers cannot both pass.
   * @returns true if lock was acquired, false if already processing
   */
  private tryAcquireProcessing(): boolean {
    if (this.isProcessing) {
      return false;
    }
    this.isProcessing = true;
    return true;
  }

  /**
   * Checks if the orchestrator is currently processing a square effect.
   * Used by validator to block inappropriate actions during effect resolution.
   * @returns true if processing square effect, false otherwise
   */
  isProcessingEffect(): boolean {
    return this.boardEffectsHandler.isProcessingEffect();
  }

  /**
   * Registers a custom action handler for extending primitive actions.
   * @param actionType - The action type to handle (e.g., "CUSTOM_ACTION")
   * @param handler - Function to execute when action is encountered
   */
  registerActionHandler(actionType: string, handler: ActionHandler): void {
    this.actionHandlers.set(actionType, handler);
  }

  /**
   * Processes a voice transcript by sending to LLM and executing returned actions.
   * This is the main entry point for handling user voice commands.
   * @param transcript - The transcribed user command
   * @param options - Optional flags; skipDecisionPointEnforcement for system-initiated flows (e.g. proactive start)
   * @returns Success, turn flags, optional next-player-after-power-check-fail, and voice hints for app-layer fallback TTS
   */
  async handleTranscript(
    transcript: string,
    options?: { skipDecisionPointEnforcement?: boolean },
  ): Promise<OrchestratorGameplayResult> {
    if (!this.tryAcquireProcessing()) {
      Logger.warn("Orchestrator busy, ignoring new request");
      return { success: false, shouldAdvanceTurn: false };
    }
    this.statusIndicator.setState("processing");
    Profiler.start("orchestrator.total");

    try {
      const context: ExecutionContext = {
        ...this.defaultContext,
        skipDecisionPointEnforcement: options?.skipDecisionPointEnforcement,
      };
      const result = await this.processTranscript(transcript, context);
      return result;
    } finally {
      this.isProcessing = false;
      Profiler.end("orchestrator.total");
      this.statusIndicator.setState("listening");
    }
  }

  /**
   * Test-only: Execute actions directly without LLM interpretation.
   * Bypasses LLM for testing orchestrator validation and execution logic.
   * @param actions - Array of primitive actions to validate and execute
   * @returns Object with success, shouldAdvanceTurn, and optional voice hints
   */
  async testExecuteActions(actions: PrimitiveAction[]): Promise<OrchestratorGameplayResult> {
    if (!this.tryAcquireProcessing()) {
      Logger.warn("Orchestrator busy, ignoring test request");
      return { success: false, shouldAdvanceTurn: false };
    }
    this.statusIndicator.setState("processing");
    Profiler.start("orchestrator.test");

    try {
      Logger.info("Test mode: Executing actions directly");
      const context: ExecutionContext = { ...this.defaultContext };
      Profiler.start("orchestrator.test.run");
      const result = await this.runValidatedActions(actions, context, "orchestrator.test");
      Profiler.end("orchestrator.test.run");
      if (result.success) {
        Logger.info("Test actions executed successfully");
      }
      return result;
    } catch (error) {
      Logger.error("Test execution error:", error);
      return { success: false, shouldAdvanceTurn: false };
    } finally {
      this.isProcessing = false;
      Profiler.end("orchestrator.test");
      this.statusIndicator.setState("listening");
    }
  }

  /**
   * Public entry point for executing primitive actions without LLM interpretation.
   * Intended for non-LLM interpreters (debug tools, alternate UIs) that already
   * produced a validated PrimitiveAction[] request.
   * @param actions - Array of primitive actions to validate and execute
   * @returns Object with success, shouldAdvanceTurn, and optional voice hints
   */
  async executePrimitiveActions(actions: PrimitiveAction[]): Promise<OrchestratorGameplayResult> {
    if (!this.tryAcquireProcessing()) {
      Logger.warn("Orchestrator busy, ignoring primitive execution request");
      return { success: false, shouldAdvanceTurn: false };
    }
    this.statusIndicator.setState("processing");
    Profiler.start("orchestrator.primitives.total");

    try {
      const context: ExecutionContext = { ...this.defaultContext };
      return await this.runValidatedActions(actions, context, "orchestrator.primitives");
    } finally {
      this.isProcessing = false;
      Profiler.end("orchestrator.primitives.total");
      this.statusIndicator.setState("listening");
    }
  }

  /**
   * Sets up players in game state from name collection data.
   * AUTHORITY: Only the orchestrator can initialize player state.
   * @param playerNames - Array of player names in turn order
   */
  setupPlayers(playerNames: string[]): void {
    const currentState = this.stateManager.getState();
    const playersArray = Object.values(
      currentState.players as Record<string, Record<string, unknown>>,
    );
    const playerTemplate = playersArray[0];

    const players: Record<string, Record<string, unknown>> = {};
    const playerOrder: string[] = [];

    playerNames.forEach((name, index) => {
      const playerId = `p${index + 1}`;
      const player = structuredClone(playerTemplate);
      player.id = playerId;
      player.name = name;
      player.position = 0;
      players[playerId] = player;
      playerOrder.push(playerId);
    });

    this.stateManager.set("players", players);
    this.stateManager.set(GAME_PATH.playerOrder, playerOrder);

    // Set first player's turn
    if (playerOrder.length > 0) {
      this.stateManager.set(GAME_PATH.turn, playerOrder[0]);
    }

    Logger.info("Players created:", players);
    Logger.info("Player order:", playerOrder);
  }

  /**
   * Transitions the game to a new phase.
   * AUTHORITY: Only the orchestrator can change game phase.
   * @param phase - The phase to transition to
   */
  transitionPhase(phase: GamePhase): void {
    Logger.info(`Phase transition: ${this.stateManager.get(GAME_PATH.phase)} → ${phase}`);
    this.stateManager.set(GAME_PATH.phase, phase);
  }

  /**
   * Checks if the current player has pending decisions that must be resolved.
   * @returns true if there are unresolved decisions, false otherwise
   */
  hasPendingDecisions(): boolean {
    return this.turnManager.hasPendingDecisions();
  }

  /**
   * Returns the prompt for the current player's pending decision, if any.
   * Used for decision-aware turn announcements (e.g. path choice at position 0).
   * @returns The decision prompt string, or null if no pending decision
   */
  getPendingDecisionPrompt(): string | null {
    return this.turnManager.getPendingDecisionPrompt();
  }

  /**
   * Updates the last bot utterance after app-layer voice policy speaks (LLM context for short replies).
   *
   * @param text - The line the user heard
   */
  setLastNarrationForVoicePolicy(text: string): void {
    this.lastNarration = text;
  }

  /**
   * Advances to the next player's turn.
   * AUTHORITY: Only the orchestrator can advance turns.
   * @returns The next player's ID and details, or null if unable to advance. Includes skippedPlayers (all skipped in order).
   */
  async advanceTurn(): Promise<{
    playerId: string;
    name: string;
    position: number;
    skippedPlayers: Array<{ playerId: string; name: string }>;
  } | null> {
    return await this.turnManager.advanceTurn(this.boardEffectsHandler.isProcessingEffect());
  }

  private processTranscriptAsBool(transcript: string, context: ExecutionContext): Promise<boolean> {
    return this.processTranscript(transcript, context).then((r) => r.success);
  }

  private async processTranscript(
    transcript: string,
    context: ExecutionContext,
  ): Promise<OrchestratorGameplayResult> {
    try {
      Logger.brain(
        `Orchestrator processing: ${transcript} (${context.isNestedCall ? "nested" : "top"})`,
      );

      const state = this.stateManager.getState();
      Logger.state(
        "Current state:\n" + formatStateContext(state as Record<string, unknown>, { forLog: true }),
      );
      const profilerKey = context.isNestedCall ? "nested" : "top";
      Profiler.start(`orchestrator.llm.${profilerKey}`);
      const lastBotUtterance = this.lastNarration !== "" ? this.lastNarration : undefined;
      const actions = await this.llmClient.getActions(transcript, state, lastBotUtterance);
      Profiler.end(`orchestrator.llm.${profilerKey}`);

      if (Array.isArray(actions)) {
        Logger.robot(
          `LLM returned ${actions.length} action(s): ${actions.map((a) => a.action).join(", ")}`,
        );
      } else {
        Logger.robot("LLM returned non-array response");
      }

      if (Array.isArray(actions) && actions.length === 0) {
        const retryActions = await this.handleEmptyActionsWithRetry(
          transcript,
          context,
          lastBotUtterance,
          profilerKey,
        );
        if (retryActions && retryActions.length > 0) {
          return await this.runValidatedActions(retryActions, context, "orchestrator");
        }
        Logger.warn("No actions returned from LLM");
        await this.speechService.speak(t("llm.allRetriesFailed"));
        return { success: false, shouldAdvanceTurn: false };
      }
      const normalizedActions = this.coerceMovementPlayerAnsweredToPlayerRolled(
        this.normalizeRiddleAnswerFromTranscript(actions, transcript),
      );
      return await this.runValidatedActions(normalizedActions, context, "orchestrator");
    } catch (error) {
      Logger.error("Orchestrator error:", error);
      await this.speechService.speak(t("errors.somethingWentWrong"));
      return { success: false, shouldAdvanceTurn: false };
    }
  }

  /**
   * When LLM returns 0 actions during square effect + riddle phase, retries once.
   * @returns Normalized actions if retry succeeded with non-empty result, otherwise null
   */
  private async handleEmptyActionsWithRetry(
    transcript: string,
    _context: ExecutionContext,
    lastBotUtterance: string | undefined,
    profilerKey: string,
  ): Promise<PrimitiveAction[] | null> {
    const canAutoRetryRiddle =
      this.boardEffectsHandler.isProcessingEffect() && this.isRiddlePhaseWithNoRiddleStored();
    if (!canAutoRetryRiddle) {
      return null;
    }

    Logger.info("Auto-unblock: retrying riddle request once (0 actions during square effect)");
    await this.speechService.speak(t("llm.retrying"));
    const retryState = this.stateManager.getState();
    Profiler.start(`orchestrator.llm.retry.${profilerKey}`);
    const retryActions = await this.llmClient.getActions(transcript, retryState, lastBotUtterance);
    Profiler.end(`orchestrator.llm.retry.${profilerKey}`);
    if (!Array.isArray(retryActions) || retryActions.length === 0) {
      return null;
    }

    Logger.robot(
      `LLM retry returned ${retryActions.length} action(s): ${retryActions.map((a) => a.action).join(", ")}`,
    );
    return this.coerceMovementPlayerAnsweredToPlayerRolled(
      this.normalizeRiddleAnswerFromTranscript(retryActions, transcript),
    );
  }

  /**
   * When the LLM returns PLAYER_ANSWERED with a dice-only answer but the game expects a
   * movement PLAYER_ROLLED, rewrite so the roll applies and turn logic stays correct.
   * Returns actions unchanged when a riddle is pending for the current player (digits are option indices or answers).
   * Otherwise skipped when validatePlayerRolled would fail (fork pending, power check, etc.).
   */
  private coerceMovementPlayerAnsweredToPlayerRolled(
    actions: PrimitiveAction[],
  ): PrimitiveAction[] {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    if (isPendingAnimalRiddleForCurrentTurn(game)) {
      return actions;
    }

    if (actions.length !== 1) {
      return actions;
    }
    const action = actions[0];
    if (action.action !== "PLAYER_ANSWERED") {
      return actions;
    }
    if (!("answer" in action) || typeof action.answer !== "string") {
      return actions;
    }
    const trimmed = action.answer.trim();
    if (!/^\d+$/.test(trimmed)) {
      return actions;
    }
    const value = parseInt(trimmed, 10);
    if (!Number.isFinite(value)) {
      return actions;
    }
    const rolled: PrimitiveAction = { action: "PLAYER_ROLLED", value };
    const validation = validatePlayerRolled(rolled, state, 0, {
      isProcessingEffect: this.boardEffectsHandler.isProcessingEffect(),
    });
    if (!validation.valid) {
      return actions;
    }
    Logger.info(`Coerced PLAYER_ANSWERED "${trimmed}" → PLAYER_ROLLED (${value})`);
    return [rolled];
  }

  /**
   * When in riddle phase with four options, map transcript or the first PLAYER_ANSWERED answer
   * (option text, 1–4, or "opción N") to the canonical option string on that action.
   */
  private normalizeRiddleAnswerFromTranscript(
    actions: PrimitiveAction[],
    transcript: string,
  ): PrimitiveAction[] {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pending as
      | { kind?: string; riddleOptions?: string[]; correctOption?: string }
      | null
      | undefined;
    if (
      pending?.kind !== "riddle" ||
      !Array.isArray(pending.riddleOptions) ||
      pending.riddleOptions.length !== 4 ||
      !pending.correctOption
    ) {
      return actions;
    }
    const firstIndex = actions.findIndex((a) => a.action === "PLAYER_ANSWERED");
    if (firstIndex === -1) {
      return actions;
    }
    const optionText = normalizedRiddleOptionFromTranscript(
      transcript,
      actions,
      firstIndex,
      pending.riddleOptions,
    );
    if (optionText === null) {
      return actions;
    }
    return actions.map((a, i) => {
      if (i === firstIndex && a.action === "PLAYER_ANSWERED" && "answer" in a) {
        return { ...a, answer: optionText };
      }
      return a;
    });
  }

  private getProfilerKey(context: ExecutionContext): "nested" | "top" {
    return context.isNestedCall ? "nested" : "top";
  }

  private resolveValidationErrorI18n(validation: ValidationResult): string {
    return validation.errorCode && VALIDATION_ERROR_I18N[validation.errorCode]
      ? VALIDATION_ERROR_I18N[validation.errorCode]
      : "errors.validationFailed";
  }

  private computeShouldAdvanceTurn(
    actions: PrimitiveAction[],
    _hasPendingDecisions: boolean,
    isForkAnswerAtStart: boolean,
    onlyResolvedForkChoice: boolean,
  ): boolean {
    const rawShouldAdvanceTurn = actions.some(
      (a) =>
        a.action === "PLAYER_ROLLED" ||
        a.action === "SET_STATE" ||
        a.action === "RESET_GAME" ||
        (a.action === "PLAYER_ANSWERED" && !isForkAnswerAtStart),
    );
    return rawShouldAdvanceTurn && !onlyResolvedForkChoice;
  }

  private computeVoiceOutcomeHints(
    context: ExecutionContext,
    onlyResolvedForkChoice: boolean,
    actions: PrimitiveAction[],
  ): VoiceOutcomeHints | undefined {
    return !context.isNestedCall &&
      onlyResolvedForkChoice &&
      !actions.some((a) => a.action === "NARRATE")
      ? { forkChoiceResolvedWithoutNarrate: true }
      : undefined;
  }

  private computeForkChoiceFlags(actions: PrimitiveAction[]): {
    hasPendingDecisions: boolean;
    isForkAnswerAtStart: boolean;
    onlyResolvedForkChoice: boolean;
  } {
    const hasPendingDecisions = this.turnManager.hasPendingDecisions();
    const isForkAnswerAtStart =
      hasPendingDecisions &&
      actions.some((a) => a.action === "PLAYER_ANSWERED") &&
      !actions.some((a) => a.action === "PLAYER_ROLLED");

    const setStateActions = actions.filter((a) => a.action === "SET_STATE");
    const activeChoicesPath = /^players\.\w+\.activeChoices\.\d+$/;
    const allSetStateTargetForkChoice =
      setStateActions.length === 0 ||
      setStateActions.every(
        (a) =>
          typeof (a as { path?: string }).path === "string" &&
          activeChoicesPath.test((a as { path: string }).path),
      );
    const onlyResolvedForkChoice =
      hasPendingDecisions &&
      !actions.some((a) => a.action === "PLAYER_ROLLED") &&
      (actions.some((a) => a.action === "PLAYER_ANSWERED") ||
        setStateActions.some(
          (a) =>
            typeof (a as { path?: string }).path === "string" &&
            activeChoicesPath.test((a as { path: string }).path),
        )) &&
      allSetStateTargetForkChoice;

    return { hasPendingDecisions, isForkAnswerAtStart, onlyResolvedForkChoice };
  }

  private getValidatorContext(): ValidatorContext {
    return {
      isProcessingEffect: this.boardEffectsHandler.isProcessingEffect(),
      allowScenarioOnlyStatePaths: this.options?.allowScenarioOnlyStatePaths,
      allowBypassPositionDecisionGate: this.options?.allowBypassPositionDecisionGate,
    };
  }

  private async runValidatedActions(
    actions: PrimitiveAction[],
    context: ExecutionContext,
    profilerPrefix: string,
  ): Promise<OrchestratorGameplayResult> {
    const state = this.stateManager.getState();
    Logger.state(
      "Current state:\n" + formatStateContext(state as Record<string, unknown>, { forLog: true }),
    );

    Profiler.start(`${profilerPrefix}.validation.${this.getProfilerKey(context)}`);
    const validation = validateActions(
      actions,
      state,
      this.stateManager,
      this.getValidatorContext(),
    );
    Profiler.end(`${profilerPrefix}.validation.${this.getProfilerKey(context)}`);

    if (!validation.valid) {
      Logger.warn("Validation failed:", validation.error);
      await this.speechService.speak(t(this.resolveValidationErrorI18n(validation)));
      return { success: false, shouldAdvanceTurn: false };
    }

    const { hasPendingDecisions, isForkAnswerAtStart, onlyResolvedForkChoice } =
      this.computeForkChoiceFlags(actions);

    const shouldAdvanceTurn = this.computeShouldAdvanceTurn(
      actions,
      hasPendingDecisions,
      isForkAnswerAtStart,
      onlyResolvedForkChoice,
    );

    const voiceOutcomeHints = this.computeVoiceOutcomeHints(
      context,
      onlyResolvedForkChoice,
      actions,
    );

    Logger.info("Actions validated, executing...");

    const actionsToRun = context.isNestedCall
      ? actions
      : reorderPowerCheckBeforeRoll(actions, state);
    Profiler.start(`${profilerPrefix}.execution.${this.getProfilerKey(context)}`);
    await this.executeActions(actionsToRun, context);
    Profiler.end(`${profilerPrefix}.execution.${this.getProfilerKey(context)}`);
    if (!context.isNestedCall) {
      Logger.info("Actions executed successfully");
    }
    Logger.state(
      "Current state (after actions):\n" +
        formatStateContext(this.stateManager.getState() as Record<string, unknown>, {
          forLog: true,
        }),
    );

    // After initial power-check loss the app announces the next player (incl. fork prompt);
    // skip nested enforce here to avoid duplicating the fork question (see turnAdvancedAfterPowerCheckFail).
    const shouldEnforceDecisionPoints =
      !context.isNestedCall &&
      !context.skipDecisionPointEnforcement &&
      !context.justNarratedDecisionAsk &&
      !context.turnAdvancedAfterPowerCheckFail;
    if (shouldEnforceDecisionPoints) {
      await this.decisionPointEnforcer.enforceDecisionPoints(context);
    }

    return this.buildActionResult(context, shouldAdvanceTurn, voiceOutcomeHints);
  }

  private buildActionResult(
    context: ExecutionContext,
    shouldAdvanceTurn: boolean,
    voiceOutcomeHints: VoiceOutcomeHints | undefined,
  ): OrchestratorGameplayResult {
    const turnAdvanced = context.turnAdvancedAfterPowerCheckFail;
    const effectiveShouldAdvance =
      !turnAdvanced && !context.skipTrailingNarrateForPowerCheck && shouldAdvanceTurn;
    return turnAdvanced
      ? {
          success: true,
          shouldAdvanceTurn: false,
          turnAdvancedAfterPowerCheckFail: turnAdvanced,
          voiceOutcomeHints,
        }
      : { success: true, shouldAdvanceTurn: effectiveShouldAdvance, voiceOutcomeHints };
  }

  private shouldSkipAction(
    action: PrimitiveAction,
    context: ExecutionContext,
    skipTrailingNarrate: boolean,
  ): boolean {
    if (skipTrailingNarrate && action.action === "NARRATE") {
      Logger.info(
        "Skipping NARRATE: square effect or power check already narrated by orchestrator",
      );
      return true;
    }
    if (action.action === "NARRATE") {
      const dp = getCurrentDecisionPoint(
        () => this.stateManager.getState(),
        () => this.turnManager.getPendingDecisionPrompt(),
      );
      if (action.text?.trim() === dp?.prompt && context.justNarratedDecisionAsk) {
        Logger.info("Skipping redundant NARRATE: same as decision prompt (already asked)");
        return true;
      }
    }
    return false;
  }

  private handleNarratePostExecute(
    action: Extract<PrimitiveAction, { action: "NARRATE" }>,
    context: ExecutionContext,
  ): void {
    const dp = getCurrentDecisionPoint(
      () => this.stateManager.getState(),
      () => this.turnManager.getPendingDecisionPrompt(),
    );
    const text = action.text;
    if (dp && text && narrateCoversDecision(text, dp.position, dp.prompt)) {
      context.justNarratedDecisionAsk = true;
    }
  }

  private handlePlayerRolledPostExecute(): boolean {
    const game = this.stateManager.getState().game as Record<string, unknown> | undefined;
    const pending = game?.pending as { kind?: string } | null | undefined;
    return Boolean(
      pending && ["riddle", "powerCheck", "revenge", "directional"].includes(pending.kind ?? ""),
    );
  }

  /**
   * Updates context flags after executing an action. Returns true if skipTrailingNarrate should be set.
   */
  private handlePostExecute(action: PrimitiveAction, context: ExecutionContext): boolean {
    if (action.action === "NARRATE") {
      this.handleNarratePostExecute(action, context);
      return false;
    }
    if (action.action === "PLAYER_ANSWERED" && context.skipTrailingNarrateForPowerCheck) {
      return true;
    }
    if (action.action === "PLAYER_ROLLED") {
      return this.handlePlayerRolledPostExecute();
    }
    return false;
  }

  private async executeActions(
    actions: PrimitiveAction[],
    context: ExecutionContext,
  ): Promise<void> {
    context.positionPathsSetByRoll = context.positionPathsSetByRoll ?? new Set();
    context.positionPathsSetByRoll.clear();

    let skipTrailingNarrate = false;

    for (const action of actions) {
      try {
        if (this.shouldSkipAction(action, context, skipTrailingNarrate)) {
          continue;
        }
        skipTrailingNarrate = false;
        await this.executeAction(action, context);
        if (this.handlePostExecute(action, context)) {
          skipTrailingNarrate = true;
        }
      } catch (error) {
        Logger.error("Failed to execute action:", action, error);
      }
    }
  }

  /**
   * True when we are in riddle phase but no full riddle is stored (ASK_RIDDLE never succeeded).
   * Used to auto-retry once when square-effect LLM returns 0 actions.
   */
  private isRiddlePhaseWithNoRiddleStored(): boolean {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pending as
      | { kind?: string; riddleOptions?: unknown[]; correctOption?: string }
      | null
      | undefined;
    if (pending?.kind !== "riddle") {
      return false;
    }
    const options = pending.riddleOptions;
    const hasStructuredRiddle =
      Array.isArray(options) && options.length === 4 && pending.correctOption;
    return !hasStructuredRiddle;
  }

  /**
   * Checks if the current player has reached or exceeded win position.
   * Sets game.winner and transitions to FINISHED if so.
   */
  checkAndApplyWinCondition(positionPath: string): void {
    if (!positionPath.startsWith(STATE_PLAYERS_PREFIX) || !positionPath.endsWith(".position")) {
      return;
    }
    const position = this.stateManager.get(positionPath) as number;
    if (typeof position !== "number") {
      return;
    }

    const state = this.stateManager.getState();
    const board = state.board as { squares?: Record<string, Record<string, unknown>> } | undefined;
    const winPosition = getWinPosition(board?.squares);
    if (typeof winPosition !== "number") {
      return;
    }

    if (position >= winPosition) {
      const match = positionPath.match(/^players\.([^.]+)\.position$/);
      const playerId = match?.[1];
      if (playerId) {
        Logger.info(
          `🏆 Win detected: ${playerId} reached position ${position} (win: ${winPosition})`,
        );
        this.stateManager.set(GAME_PATH.winner, playerId);
        this.stateManager.set(GAME_PATH.phase, GamePhase.FINISHED);
      }
    }
  }

  private getActionExecutorContext(): ActionExecutorContext {
    return {
      stateManager: this.stateManager,
      speechService: this.speechService,
      statusIndicator: this.statusIndicator,
      turnManager: this.turnManager,
      boardEffectsHandler: this.boardEffectsHandler,
      riddlePowerCheckHandler: this.riddlePowerCheckHandler,
      initialState: this.initialState,
      setLastNarration: (text) => {
        this.lastNarration = text;
      },
      checkAndApplyWinCondition: (path) => this.checkAndApplyWinCondition(path),
    };
  }

  private async executeAction(
    primitive: PrimitiveAction,
    context: ExecutionContext,
  ): Promise<void> {
    const customHandler = this.actionHandlers.get(primitive.action);
    if (customHandler) {
      await customHandler(primitive, context);
      return;
    }

    const ctx = this.getActionExecutorContext();

    switch (primitive.action) {
      case "NARRATE":
        await executeNarrate(ctx, primitive, context);
        break;
      case "SET_STATE":
        await executeSetState(ctx, primitive, context);
        break;
      case "PLAYER_ROLLED":
        await executePlayerRolled(ctx, primitive, context);
        break;
      case "ASK_RIDDLE":
        this.riddlePowerCheckHandler.handleAskRiddle(primitive);
        break;
      case "RIDDLE_RESOLVED":
        this.riddlePowerCheckHandler.handleRiddleResolved(primitive);
        break;
      case "PLAYER_ANSWERED":
        await executePlayerAnswered(ctx, primitive, context);
        break;
      case "RESET_GAME":
        await executeResetGame(ctx, primitive, context);
        break;
    }
  }
}
