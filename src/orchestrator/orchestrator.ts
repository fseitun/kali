import type { IStatusIndicator } from "../components/status-indicator";
import { t } from "../i18n";
import type { LLMClient } from "../llm/LLMClient";
import { formatStateContext } from "../llm/system-prompt";
import type { ISpeechService } from "../services/speech-service";
import type { StateManager } from "../state-manager";
import { Logger } from "../utils/logger";
import { Profiler } from "../utils/profiler";
import { BoardEffectsHandler } from "./board-effects-handler";
import { computeNewPositionFromState } from "./board-traversal";
import { DecisionPointEnforcer } from "./decision-point-enforcer";
import { reorderPowerCheckBeforeRoll } from "./reorder-power-check";
import { resolveRiddleAnswerToOption, isStrictRiddleCorrect } from "./riddle-answer";
import { TurnManager } from "./turn-manager";
import {
  GamePhase,
  type PrimitiveAction,
  type ExecutionContext,
  type ActionHandler,
  type GameState,
} from "./types";
import { validateActions } from "./validator";

/** Maps validation errorCode to i18n key; fallback to errors.validationFailed for unknown/missing. */
const VALIDATION_ERROR_I18N: Record<string, string> = {
  invalidDiceRoll: "errors.invalidDiceRoll",
  chooseForkFirst: "errors.chooseForkFirst",
  resolveSquareEffectFirst: "errors.resolveSquareEffectFirst",
  wrongPhaseForRoll: "errors.wrongPhaseForRoll",
  invalidAnswer: "errors.invalidAnswer",
  wrongTurn: "errors.wrongTurn",
  setStateForbidden: "errors.setStateForbidden",
  pathNotAllowed: "errors.pathNotAllowed",
  invalidActionFormat: "errors.validationFailed",
};

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
export class Orchestrator {
  private turnManager: TurnManager;
  private boardEffectsHandler: BoardEffectsHandler;
  private decisionPointEnforcer: DecisionPointEnforcer;
  private actionHandlers: Map<string, ActionHandler> = new Map();
  private isProcessing = false;
  private initialState: GameState;
  private readonly defaultContext: ExecutionContext = { depth: 0, maxDepth: 5 };
  /** Last NARRATE text spoken; passed to LLM so short replies (sí/no, number) can be interpreted as answers to that question. */
  private lastNarration = "";

  constructor(
    private llmClient: LLMClient,
    private stateManager: StateManager,
    private speechService: ISpeechService,
    private statusIndicator: IStatusIndicator,
    initialState: GameState,
  ) {
    this.initialState = initialState;

    // Instantiate subsystems
    this.turnManager = new TurnManager(stateManager);
    this.boardEffectsHandler = new BoardEffectsHandler(
      stateManager,
      this.processTranscriptAsBool.bind(this),
    );
    this.decisionPointEnforcer = new DecisionPointEnforcer(
      stateManager,
      this.processTranscriptAsBool.bind(this),
    );

    llmClient.onRetry = () => {
      this.speechService.speak(t("llm.retrying"));
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
    if (this.isProcessing) return false;
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
   * @returns Object with success flag and shouldAdvanceTurn; advance turn only when state was mutated
   */
  async handleTranscript(
    transcript: string,
    options?: { skipDecisionPointEnforcement?: boolean },
  ): Promise<{
    success: boolean;
    shouldAdvanceTurn: boolean;
    turnAdvancedForRevenge?: { playerId: string; name: string; position: number };
  }> {
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
   * @returns Object with success and shouldAdvanceTurn
   */
  async testExecuteActions(actions: PrimitiveAction[]): Promise<{
    success: boolean;
    shouldAdvanceTurn: boolean;
    turnAdvancedForRevenge?: { playerId: string; name: string; position: number };
  }> {
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
   * @returns Object with success and shouldAdvanceTurn
   */
  async executePrimitiveActions(actions: PrimitiveAction[]): Promise<{
    success: boolean;
    shouldAdvanceTurn: boolean;
    turnAdvancedForRevenge?: { playerId: string; name: string; position: number };
  }> {
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
    this.stateManager.set("game.playerOrder", playerOrder);

    // Set first player's turn
    if (playerOrder.length > 0) {
      this.stateManager.set("game.turn", playerOrder[0]);
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
    Logger.info(`Phase transition: ${this.stateManager.get("game.phase")} → ${phase}`);
    this.stateManager.set("game.phase", phase);
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
  ): Promise<{
    success: boolean;
    shouldAdvanceTurn: boolean;
    turnAdvancedForRevenge?: { playerId: string; name: string; position: number };
  }> {
    try {
      Logger.brain(`Orchestrator processing: ${transcript} (depth: ${context.depth})`);

      const state = this.stateManager.getState();
      Logger.state("Current state:\n" + formatStateContext(state as Record<string, unknown>));
      Profiler.start(`orchestrator.llm.${context.depth}`);
      const lastBotUtterance = this.lastNarration !== "" ? this.lastNarration : undefined;
      const actions = await this.llmClient.getActions(transcript, state, lastBotUtterance);
      Profiler.end(`orchestrator.llm.${context.depth}`);

      if (Array.isArray(actions)) {
        Logger.robot(
          `LLM returned ${actions.length} action(s): ${actions.map((a) => a.action).join(", ")}`,
        );
      } else {
        Logger.robot("LLM returned non-array response");
      }

      if (Array.isArray(actions) && actions.length === 0) {
        const canAutoRetryRiddle =
          this.boardEffectsHandler.isProcessingEffect() && this.isRiddlePhaseWithNoRiddleStored();
        if (canAutoRetryRiddle) {
          Logger.info(
            "Auto-unblock: retrying riddle request once (0 actions during square effect)",
          );
          await this.speechService.speak(t("llm.retrying"));
          const retryState = this.stateManager.getState();
          Profiler.start(`orchestrator.llm.retry.${context.depth}`);
          const retryActions = await this.llmClient.getActions(
            transcript,
            retryState,
            lastBotUtterance,
          );
          Profiler.end(`orchestrator.llm.retry.${context.depth}`);
          if (Array.isArray(retryActions) && retryActions.length > 0) {
            Logger.robot(
              `LLM retry returned ${retryActions.length} action(s): ${retryActions.map((a) => a.action).join(", ")}`,
            );
            const normalizedRetry = this.normalizeRiddleAnswerFromTranscript(
              retryActions,
              transcript,
            );
            return await this.runValidatedActions(normalizedRetry, context, "orchestrator");
          }
        }
        Logger.warn("No actions returned from LLM");
        await this.speechService.speak(t("llm.allRetriesFailed"));
        // Turn not advanced; user can say something again to trigger a fresh getActions.
        return { success: false, shouldAdvanceTurn: false };
      }
      const normalizedActions = this.normalizeRiddleAnswerFromTranscript(actions, transcript);
      return await this.runValidatedActions(normalizedActions, context, "orchestrator");
    } catch (error) {
      Logger.error("Orchestrator error:", error);
      await this.speechService.speak(t("errors.somethingWentWrong"));
      return { success: false, shouldAdvanceTurn: false };
    }
  }

  /**
   * When in riddle phase with structured options, resolve the user's transcript to the matched option text.
   * If the transcript matches one of the four options, replace the first PLAYER_ANSWERED answer with that option text.
   */
  private normalizeRiddleAnswerFromTranscript(
    actions: PrimitiveAction[],
    transcript: string,
  ): PrimitiveAction[] {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pendingAnimalEncounter as
      | { phase?: string; riddleOptions?: string[]; correctOption?: string }
      | null
      | undefined;
    if (
      pending?.phase !== "riddle" ||
      !Array.isArray(pending.riddleOptions) ||
      pending.riddleOptions.length !== 4 ||
      !pending.correctOption
    ) {
      return actions;
    }
    const firstIndex = actions.findIndex((a) => a.action === "PLAYER_ANSWERED");
    if (firstIndex === -1) return actions;
    const optionFromTranscript = resolveRiddleAnswerToOption(transcript, pending.riddleOptions);
    if (optionFromTranscript === null) return actions;
    return actions.map((a, i) => {
      if (i === firstIndex && a.action === "PLAYER_ANSWERED" && "answer" in a) {
        return { ...a, answer: optionFromTranscript };
      }
      return a;
    });
  }

  private async runValidatedActions(
    actions: PrimitiveAction[],
    context: ExecutionContext,
    profilerPrefix: string,
  ): Promise<{
    success: boolean;
    shouldAdvanceTurn: boolean;
    turnAdvancedForRevenge?: { playerId: string; name: string; position: number };
  }> {
    const state = this.stateManager.getState();
    Logger.state("Current state:\n" + formatStateContext(state as Record<string, unknown>));

    Profiler.start(`${profilerPrefix}.validation.${context.depth}`);
    const validation = validateActions(actions, state, this.stateManager, this);
    Profiler.end(`${profilerPrefix}.validation.${context.depth}`);

    if (!validation.valid) {
      Logger.error("Validation failed:", validation.error);
      const i18nKey =
        validation.errorCode && VALIDATION_ERROR_I18N[validation.errorCode]
          ? VALIDATION_ERROR_I18N[validation.errorCode]
          : "errors.validationFailed";
      await this.speechService.speak(t(i18nKey));
      return { success: false, shouldAdvanceTurn: false };
    }

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

    const rawShouldAdvanceTurn = actions.some(
      (a) =>
        a.action === "PLAYER_ROLLED" ||
        a.action === "SET_STATE" ||
        a.action === "RESET_GAME" ||
        (a.action === "PLAYER_ANSWERED" && !isForkAnswerAtStart),
    );
    const shouldAdvanceTurn = rawShouldAdvanceTurn && !onlyResolvedForkChoice;

    Logger.info("Actions validated, executing...");
    const actionsToRun =
      context.depth === 0 ? reorderPowerCheckBeforeRoll(actions, state) : actions;
    Profiler.start(`${profilerPrefix}.execution.${context.depth}`);
    await this.executeActions(actionsToRun, context);
    Profiler.end(`${profilerPrefix}.execution.${context.depth}`);
    if (context.depth === 0) {
      Logger.info("Actions executed successfully");
    }

    // Only enforce decision points for top-level (user-initiated) flows.
    // When depth > 0, we're in a nested call from a previous enforcement or board effect;
    // we just executed the LLM's response (e.g. asking the question). Don't re-inject.
    // Skip when skipDecisionPointEnforcement (e.g. proactive start already asked).
    // Skip when we just narrated the decision ask (avoids duplicate "path A or B" question).
    if (
      context.depth === 0 &&
      !context.skipDecisionPointEnforcement &&
      !context.justNarratedDecisionAsk
    ) {
      await this.decisionPointEnforcer.enforceDecisionPoints(context);
    }

    // When power check failed and we advanced turn internally, don't call advanceTurn again
    if (context.turnAdvancedForRevenge) {
      return {
        success: true,
        shouldAdvanceTurn: false,
        turnAdvancedForRevenge: context.turnAdvancedForRevenge,
      };
    }
    return { success: true, shouldAdvanceTurn };
  }

  private async executeActions(
    actions: PrimitiveAction[],
    context: ExecutionContext,
  ): Promise<void> {
    if (context.depth >= context.maxDepth) {
      Logger.warn(`Max execution depth (${context.maxDepth}) reached, stopping`);
      return;
    }

    let skipTrailingNarrate = false;

    for (const action of actions) {
      try {
        if (action.action === "PLAYER_ROLLED") {
          await this.executeAction(action, context);
          const game = this.stateManager.getState().game as Record<string, unknown> | undefined;
          const pending = game?.pendingAnimalEncounter as { phase?: string } | null | undefined;
          if (pending && ["riddle", "powerCheck", "revenge"].includes(pending.phase ?? "")) {
            skipTrailingNarrate = true;
          }
          continue;
        }

        if (skipTrailingNarrate && action.action === "NARRATE") {
          Logger.info(
            "Skipping NARRATE: square effect or power check already narrated by orchestrator",
          );
          continue;
        }

        // Skip NARRATE that is exactly the decision prompt when we already narrated the decision ask
        if (action.action === "NARRATE") {
          const dp = this.getCurrentDecisionPoint();
          if (action.text?.trim() === dp?.prompt && context.justNarratedDecisionAsk) {
            Logger.info("Skipping redundant NARRATE: same as decision prompt (already asked)");
            continue;
          }
        }

        skipTrailingNarrate = false;
        await this.executeAction(action, context);
        if (action.action === "NARRATE") {
          const dp = this.getCurrentDecisionPoint();
          const text = action.text;
          if (dp && text && this.narrateCoversDecision(text, dp.position, dp.prompt)) {
            context.justNarratedDecisionAsk = true;
          }
        }
        if (action.action === "PLAYER_ANSWERED" && context.skipTrailingNarrateForPowerCheck) {
          skipTrailingNarrate = true;
        }
      } catch (error) {
        Logger.error("Failed to execute action:", action, error);
      }
    }
  }

  /**
   * Handles RIDDLE_RESOLVED: updates pendingAnimalEncounter to phase powerCheck, riddleCorrect.
   */
  private async handleRiddleResolved(primitive: {
    action: "RIDDLE_RESOLVED";
    correct: boolean;
  }): Promise<void> {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pendingAnimalEncounter as
      | { position: number; power: number; playerId: string; phase?: string }
      | null
      | undefined;

    if (pending?.phase !== "riddle") {
      return;
    }

    this.stateManager.set("game.pendingAnimalEncounter", {
      ...pending,
      phase: "powerCheck",
      riddleCorrect: primitive.correct,
    });
    Logger.info(`Riddle resolved: correct=${primitive.correct}, phase→powerCheck`);
  }

  /**
   * Handles ASK_RIDDLE: stores riddle text, four options, correct option, and optional synonyms in pendingAnimalEncounter.
   * LLM should follow with NARRATE to speak the riddle and options.
   */
  private async handleAskRiddle(primitive: {
    action: "ASK_RIDDLE";
    text: string;
    options: [string, string, string, string];
    correctOption: string;
    correctOptionSynonyms?: string[];
  }): Promise<void> {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pendingAnimalEncounter as Record<string, unknown> | null | undefined;
    if (pending?.phase !== "riddle") {
      return;
    }
    if (
      !Array.isArray(primitive.options) ||
      primitive.options.length !== 4 ||
      typeof primitive.correctOption !== "string" ||
      !primitive.correctOption.trim()
    ) {
      Logger.warn(
        `ASK_RIDDLE ignored: need options length 4 and non-empty correctOption, got ${primitive.options?.length ?? 0}, correctOption=${String(primitive.correctOption ?? "").slice(0, 20)}`,
      );
      return;
    }
    this.stateManager.set("game.pendingAnimalEncounter", {
      ...pending,
      riddlePrompt: primitive.text,
      riddleOptions: primitive.options,
      correctOption: primitive.correctOption,
      ...(Array.isArray(primitive.correctOptionSynonyms) &&
      primitive.correctOptionSynonyms.length > 0
        ? { correctOptionSynonyms: primitive.correctOptionSynonyms }
        : {}),
    } as Record<string, unknown>);
    Logger.info(
      `Ask riddle stored; correctOption=${primitive.correctOption.slice(0, 30)}${primitive.correctOptionSynonyms?.length ? `, synonyms=${primitive.correctOptionSynonyms.length}` : ""}`,
    );
  }

  /**
   * If PLAYER_ANSWERED is a riddle choice (phase=riddle with correctOption set): strict match first, then LLM if false.
   * Otherwise returns false.
   */
  private async tryHandleRiddleAnswer(
    answer: string,
    _context: ExecutionContext,
  ): Promise<false | { correct: boolean }> {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const pending = game?.pendingAnimalEncounter as
      | {
          phase?: string;
          playerId?: string;
          correctOption?: string;
          correctOptionSynonyms?: string[];
          riddleOptions?: string[];
        }
      | null
      | undefined;
    if (
      pending?.phase !== "riddle" ||
      pending.playerId !== currentTurn ||
      !pending.correctOption ||
      !Array.isArray(pending.riddleOptions) ||
      pending.riddleOptions.length !== 4
    ) {
      return false;
    }

    // Strict JS first: option text + synonyms
    if (
      isStrictRiddleCorrect(
        answer,
        pending.riddleOptions,
        pending.correctOption,
        pending.correctOptionSynonyms,
      )
    ) {
      await this.handleRiddleResolved({ action: "RIDDLE_RESOLVED", correct: true });
      return { correct: true };
    }

    // Strict said false: ask LLM to validate (synonyms/paraphrases)
    const options = pending.riddleOptions as [string, string, string, string];
    const result = await this.llmClient.validateRiddleAnswer(
      answer,
      options,
      pending.correctOption,
    );
    await this.handleRiddleResolved({ action: "RIDDLE_RESOLVED", correct: result.correct });
    return { correct: result.correct };
  }

  /**
   * If PLAYER_ANSWERED is a power-check roll, handles it.
   * Returns false if not handled.
   * Returns { handled: true, passed: true } on win.
   * Returns { handled: true, passed: false, turnAdvanced? } on fail.
   */
  private async tryHandlePowerCheckAnswer(
    answer: string,
    context: ExecutionContext,
  ): Promise<
    | false
    | { handled: true; passed: true }
    | {
        handled: true;
        passed: false;
        turnAdvanced?: { playerId: string; name: string; position: number };
      }
  > {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const pending = game?.pendingAnimalEncounter as
      | {
          position: number;
          power: number;
          playerId: string;
          phase?: string;
          riddleCorrect?: boolean;
        }
      | null
      | undefined;

    if (
      !pending ||
      !currentTurn ||
      pending.playerId !== currentTurn ||
      (pending.phase !== "powerCheck" && pending.phase !== "revenge")
    ) {
      return false;
    }

    const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
    const roll = parseInt(rollStr, 10);
    if (isNaN(roll) || roll < 1 || roll > 12) {
      return false;
    }

    const power = pending.power ?? 0;
    const isRevenge = pending.phase === "revenge";
    const win = isRevenge ? roll >= power : roll > power;

    const playerId = pending.playerId;
    const position = pending.position;
    const board = state.board as Record<string, unknown> | undefined;
    const squares = (board?.squares as Record<string, Record<string, unknown>>) ?? {};
    const squareData = squares[position.toString()];

    if (win) {
      // Speak pass before square effects so "Pasaste" is never after square narration (e.g. plants)
      this.statusIndicator.setState("speaking");
      await this.speechService.speak(t("game.powerCheckPass"));

      const currentPos = this.stateManager.get(`players.${playerId}.position`) as number;
      const winJumpTo = squareData?.winJumpTo as number | undefined;
      const newPosition = typeof winJumpTo === "number" ? winJumpTo : currentPos + roll;

      this.stateManager.set(`players.${playerId}.position`, newPosition);
      this.applyAnimalEncounterRewards(playerId, squareData ?? {});
      this.stateManager.set("game.pendingAnimalEncounter", null);
      Logger.info(`Power check WIN: ${playerId} advances to ${newPosition}`);

      await this.boardEffectsHandler.checkAndApplyBoardMoves(`players.${playerId}.position`);
      await this.boardEffectsHandler.checkAndApplySquareEffects(
        `players.${playerId}.position`,
        context,
      );
      this.checkAndApplyWinCondition(`players.${playerId}.position`);
      return { handled: true, passed: true };
    }

    if (pending.phase === "powerCheck") {
      this.statusIndicator.setState("speaking");
      await this.speechService.speak(t("game.powerCheckFail"));
      this.stateManager.set("game.pendingAnimalEncounter", {
        ...pending,
        phase: "revenge",
      });
      Logger.info(`Power check LOSE: phase→revenge, advancing turn to next player`);
      const turnAdvanced = this.advanceTurnForPowerCheckLose();
      return { handled: true, passed: false, turnAdvanced: turnAdvanced ?? undefined };
    }

    return { handled: true, passed: false };
  }

  /**
   * Advances turn to next player (used when power check fails). Reuses TurnManager logic.
   * Keeps pending encounter with failed player; they get revenge when their turn comes again.
   */
  private advanceTurnForPowerCheckLose(): {
    playerId: string;
    name: string;
    position: number;
  } | null {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const playerOrder = game?.playerOrder as string[] | undefined;

    if (!game || !players || !currentTurn || !playerOrder?.length) return null;

    const currentIndex = playerOrder.indexOf(currentTurn);
    const nextIndex = (currentIndex + 1) % playerOrder.length;
    let nextPlayerId = playerOrder[nextIndex];
    let nextPlayer = players[nextPlayerId];
    let nextPlayerName = (nextPlayer?.name as string) || nextPlayerId;

    // Handle skipTurns: consume one and use the player after (simplified - no recursion)
    const skipTurns = (nextPlayer?.skipTurns as number) ?? 0;
    if (skipTurns > 0) {
      this.stateManager.set(`players.${nextPlayerId}.skipTurns`, skipTurns - 1);
      Logger.info(`⏭️ Skipping ${nextPlayerName} (power check lose advance)`);
      const skipIndex = (nextIndex + 1) % playerOrder.length;
      nextPlayerId = playerOrder[skipIndex];
      nextPlayer = players[nextPlayerId];
      nextPlayerName = (nextPlayer?.name as string) || nextPlayerId;
    }

    this.stateManager.set("game.turn", nextPlayerId);
    const position = (nextPlayer?.position as number) ?? 0;
    return { playerId: nextPlayerId, name: nextPlayerName, position };
  }

  /**
   * Applies rewards from animal encounter (points, heart, instrument).
   */
  private applyAnimalEncounterRewards(playerId: string, squareData: Record<string, unknown>): void {
    const points = squareData.points as number | undefined;
    if (typeof points === "number" && points > 0) {
      const current = (this.stateManager.get(`players.${playerId}.points`) as number) ?? 0;
      this.stateManager.set(`players.${playerId}.points`, current + points);
    }

    if (squareData.heart === true) {
      const current = (this.stateManager.get(`players.${playerId}.hearts`) as number) ?? 0;
      this.stateManager.set(`players.${playerId}.hearts`, current + 1);
    }

    const instrument = squareData.instrument as string | undefined;
    if (typeof instrument === "string" && instrument.length > 0) {
      const current = (this.stateManager.get(`players.${playerId}.instruments`) as unknown[]) ?? [];
      const next = Array.isArray(current) ? [...current, instrument] : [instrument];
      this.stateManager.set(`players.${playerId}.instruments`, next);
    }
  }

  /**
   * True when we are in riddle phase but no full riddle is stored (ASK_RIDDLE never succeeded).
   * Used to auto-retry once when square-effect LLM returns 0 actions.
   */
  private isRiddlePhaseWithNoRiddleStored(): boolean {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pendingAnimalEncounter as
      | { phase?: string; riddleOptions?: unknown[]; correctOption?: string }
      | null
      | undefined;
    if (pending?.phase !== "riddle") return false;
    const options = pending.riddleOptions;
    const hasStructuredRiddle =
      Array.isArray(options) && options.length === 4 && pending.correctOption;
    return !hasStructuredRiddle;
  }

  /**
   * Returns the current decision point (position + prompt) if the current player is at a fork
   * without a choice. Used to detect "NARRATE covers decision" and skip redundant prompt.
   */
  private getCurrentDecisionPoint(): { position: number; prompt: string } | null {
    const prompt = this.turnManager.getPendingDecisionPrompt();
    if (!prompt) return null;
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    const currentPlayer = currentTurn ? players?.[currentTurn] : undefined;
    const position = currentPlayer?.position as number | undefined;
    if (typeof position !== "number") return null;
    return { position, prompt };
  }

  /**
   * True when NARRATE text already asks for the given decision (exact prompt or path A/B wording at 0).
   */
  private narrateCoversDecision(text: string, position: number, prompt: string): boolean {
    const t = (text ?? "").trim();
    if (t.includes(prompt)) return true;
    if (position === 0) {
      const hasA = t.includes("camino A") || t.includes("por el A");
      const hasB = t.includes("camino B") || t.includes("por el B");
      if (hasA && hasB) return true;
    }
    return false;
  }

  /**
   * If current player has a pending decision point, returns the path and value
   * to apply the answer. Writes to activeChoices[position] = targetPosition.
   * No position teleport; movement happens on roll.
   */
  private getDecisionPointApplyState(
    answer: string,
  ): { path: string; value: string | number } | null {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const decisionPoints = state.decisionPoints as
      | Array<{
          position: number;
          prompt: string;
          positionOptions?: Record<string, number>;
        }>
      | undefined;

    if (!currentTurn || !decisionPoints?.length) return null;

    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    const currentPlayer = players?.[currentTurn];
    if (!currentPlayer) return null;

    const position = currentPlayer.position as number | undefined;
    if (typeof position !== "number") return null;

    const decisionPoint = decisionPoints.find((dp) => dp.position === position);
    if (!decisionPoint) return null;

    const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
    if (choices?.[String(position)] !== undefined) return null; // Already set

    const path = `players.${currentTurn}.activeChoices.${position}`;

    // Position 0: "A" -> 1, "B" -> 15 (fall through to positionOptions if no match)
    if (position === 0) {
      const first = answer.trim().charAt(0).toUpperCase();
      if (first === "A") return { path, value: 1 };
      if (first === "B") return { path, value: 15 };
    }

    // Branch choice with positionOptions: match answer to target position
    const options = decisionPoint.positionOptions;
    if (options) {
      const trimmed = answer.trim();
      const numMatch = trimmed.match(/\d+/);
      for (const [key, targetPos] of Object.entries(options)) {
        if (trimmed === key || numMatch?.[0] === key) return { path, value: targetPos };
      }
    }

    return null;
  }

  /**
   * Checks if the current player has reached or exceeded win position.
   * Sets game.winner and transitions to FINISHED if so.
   */
  private checkAndApplyWinCondition(positionPath: string): void {
    if (!positionPath.startsWith("players.") || !positionPath.endsWith(".position")) {
      return;
    }
    const position = this.stateManager.get(positionPath) as number;
    if (typeof position !== "number") return;

    const state = this.stateManager.getState();
    const board = state.board as { winPosition?: number } | undefined;
    const winPosition = board?.winPosition;
    if (typeof winPosition !== "number") return;

    if (position >= winPosition) {
      const match = positionPath.match(/^players\.([^.]+)\.position$/);
      const playerId = match?.[1];
      if (playerId) {
        Logger.info(
          `🏆 Win detected: ${playerId} reached position ${position} (win: ${winPosition})`,
        );
        this.stateManager.set("game.winner", playerId);
        this.stateManager.set("game.phase", GamePhase.FINISHED);
      }
    }
  }

  /**
   * Computes the new position after a dice roll using graph traversal.
   */
  private computeNewPosition(playerId: string, currentPosition: number, roll: number): number {
    const state = this.stateManager.getState();
    return computeNewPositionFromState(state, playerId, currentPosition, roll);
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

    switch (primitive.action) {
      case "NARRATE": {
        const state = this.stateManager.getState();
        const game = state.game as Record<string, unknown> | undefined;
        const pending = game?.pendingAnimalEncounter as
          | { phase?: string; riddleHint?: string }
          | null
          | undefined;
        if (
          this.boardEffectsHandler.isProcessingEffect() &&
          pending?.phase === "riddle" &&
          primitive.text
        ) {
          this.stateManager.set("game.pendingAnimalEncounter", {
            ...pending,
            riddlePrompt: primitive.text,
          } as Record<string, unknown>);
        }
        if (primitive.text) {
          this.lastNarration = primitive.text;
        }
        this.statusIndicator.setState("speaking");
        if (primitive.soundEffect) {
          this.speechService.playSound(primitive.soundEffect);
        }
        await this.speechService.speak(primitive.text);
        break;
      }

      case "SET_STATE": {
        await this.turnManager.assertPlayerTurnOwnership(primitive.path);
        Logger.write(`Setting state: ${primitive.path} = ${JSON.stringify(primitive.value)}`);
        this.stateManager.set(primitive.path, primitive.value);
        await this.boardEffectsHandler.checkAndApplyBoardMoves(primitive.path);
        await this.boardEffectsHandler.checkAndApplySquareEffects(primitive.path, context);
        this.checkAndApplyWinCondition(primitive.path);
        break;
      }

      case "PLAYER_ROLLED": {
        const state = this.stateManager.getState();
        const game = state.game as Record<string, unknown> | undefined;
        const currentTurn = game?.turn as string | undefined;

        if (!currentTurn) {
          throw new Error("Cannot process PLAYER_ROLLED: No current turn set");
        }

        const path = `players.${currentTurn}.position`;
        const currentPosition = this.stateManager.get(path) as number;

        if (typeof currentPosition !== "number") {
          throw new Error(`Cannot process PLAYER_ROLLED: ${path} is not a number`);
        }

        const newPosition = this.computeNewPosition(currentTurn, currentPosition, primitive.value);
        Logger.write(
          `Player rolled ${primitive.value}: ${path} (${currentPosition} + ${primitive.value} = ${newPosition})`,
        );

        this.stateManager.set(path, newPosition);
        this.stateManager.set("game.lastRoll", primitive.value);
        await this.boardEffectsHandler.checkAndApplyBoardMoves(path);
        await this.boardEffectsHandler.checkAndApplySquareEffects(path, context);
        this.checkAndApplyWinCondition(path);
        break;
      }

      case "ASK_RIDDLE": {
        await this.handleAskRiddle(primitive);
        break;
      }

      case "RIDDLE_RESOLVED": {
        await this.handleRiddleResolved(primitive);
        break;
      }

      case "PLAYER_ANSWERED": {
        Logger.info(`Player answered: "${primitive.answer}"`);
        this.stateManager.set("game.lastAnswer", primitive.answer);

        // Riddle phase with structured options: orchestrator resolves A/B/C/D
        const riddleResult = await this.tryHandleRiddleAnswer(primitive.answer, context);
        if (riddleResult) {
          context.skipTrailingNarrateForPowerCheck = true;
          const msg = riddleResult.correct ? t("game.riddleCorrect") : t("game.riddleIncorrect");
          this.statusIndicator.setState("speaking");
          await this.speechService.speak(msg);
          break;
        }

        // Power check / revenge: orchestrator handles roll evaluation (speaks pass/fail inside handler)
        const powerCheckResult = await this.tryHandlePowerCheckAnswer(primitive.answer, context);
        if (powerCheckResult) {
          if ("turnAdvanced" in powerCheckResult && powerCheckResult.turnAdvanced) {
            context.turnAdvancedForRevenge = powerCheckResult.turnAdvanced;
          }
          context.skipTrailingNarrateForPowerCheck = true;
          break;
        }

        // Auto-apply answer to current player's decision point (activeChoices[position] = target).
        const applyState = this.getDecisionPointApplyState(primitive.answer);
        if (applyState) {
          Logger.write(
            `Auto-applying PLAYER_ANSWERED to decision point: ${applyState.path} = ${JSON.stringify(applyState.value)}`,
          );
          this.stateManager.set(applyState.path, applyState.value);
          await this.boardEffectsHandler.checkAndApplyBoardMoves(applyState.path);
          await this.boardEffectsHandler.checkAndApplySquareEffects(applyState.path, context);
        }
        break;
      }

      case "RESET_GAME": {
        Logger.info(`Resetting game state (keepPlayerNames: ${primitive.keepPlayerNames})`);

        const playerNames: Map<string, string> = new Map();
        if (primitive.keepPlayerNames) {
          const currentState = this.stateManager.getState();
          const players = currentState.players as Record<string, { name: string }> | undefined;
          if (players) {
            for (const [id, player] of Object.entries(players)) {
              playerNames.set(id, player.name);
            }
            Logger.info(
              `Extracted ${playerNames.size} player names: [${Array.from(playerNames.values()).join(", ")}]`,
            );
          } else {
            Logger.warn("keepPlayerNames=true but no players found in current state");
          }
        }

        this.stateManager.resetState(this.initialState);
        Logger.info("State reset to initial state");

        if (primitive.keepPlayerNames && playerNames.size > 0) {
          const state = this.stateManager.getState();
          const game = state.game as Record<string, unknown> | undefined;
          const playerOrder = game?.playerOrder as string[] | undefined;

          if (playerOrder && playerOrder.length > 0) {
            Logger.info(`Restoring ${playerNames.size} player names`);
            for (const playerId of playerOrder) {
              const savedName = playerNames.get(playerId);
              if (savedName) {
                this.stateManager.set(`players.${playerId}.name`, savedName);
                Logger.info(`Restored player ${playerId}: "${savedName}"`);
              }
            }
          } else {
            Logger.warn("keepPlayerNames=true but no playerOrder found after reset");
          }
        }

        Logger.info("Game state reset complete");
        break;
      }
    }
  }
}
