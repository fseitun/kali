import type { StatusIndicator } from "../components/status-indicator";
import { t } from "../i18n";
import type { LLMClient } from "../llm/LLMClient";
import { formatStateContext } from "../llm/system-prompt";
import type { ISpeechService } from "../services/speech-service";
import type { StateManager } from "../state-manager";
import { deepClone } from "../utils/deep-clone";
import { Logger } from "../utils/logger";
import { Profiler } from "../utils/profiler";
import { BoardEffectsHandler } from "./board-effects-handler";
import { DecisionPointEnforcer } from "./decision-point-enforcer";
import { TurnManager } from "./turn-manager";
import {
  GamePhase,
  type PrimitiveAction,
  type ExecutionContext,
  type ActionHandler,
  type GameState,
} from "./types";
import { validateActions } from "./validator";

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

  constructor(
    private llmClient: LLMClient,
    private stateManager: StateManager,
    private speechService: ISpeechService,
    private statusIndicator: StatusIndicator,
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
  }

  /**
   * Checks if the orchestrator is currently processing a request.
   * @returns true if processing, false otherwise
   */
  isLocked(): boolean {
    return this.isProcessing;
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
   * @returns Object with success flag and shouldAdvanceTurn; advance turn only when state was mutated
   */
  async handleTranscript(
    transcript: string,
  ): Promise<{ success: boolean; shouldAdvanceTurn: boolean }> {
    if (this.isProcessing) {
      Logger.warn("⏸️ Orchestrator busy, ignoring new request");
      return { success: false, shouldAdvanceTurn: false };
    }

    this.isProcessing = true;
    this.statusIndicator.setState("processing");
    Profiler.start("orchestrator.total");

    try {
      const context: ExecutionContext = { ...this.defaultContext };
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
  async testExecuteActions(
    actions: PrimitiveAction[],
  ): Promise<{ success: boolean; shouldAdvanceTurn: boolean }> {
    if (this.isProcessing) {
      Logger.warn("⏸️ Orchestrator busy, ignoring test request");
      return { success: false, shouldAdvanceTurn: false };
    }

    this.isProcessing = true;
    this.statusIndicator.setState("processing");
    Profiler.start("orchestrator.test");

    try {
      Logger.info("🧪 Test mode: Executing actions directly");
      const context: ExecutionContext = { ...this.defaultContext };
      Profiler.start("orchestrator.test.run");
      const result = await this.runValidatedActions(actions, context, "orchestrator.test");
      Profiler.end("orchestrator.test.run");
      if (result.success) {
        Logger.info("✅ Test actions executed successfully");
      }
      return result;
    } catch (error) {
      Logger.error("❌ Test execution error:", error);
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
  async executePrimitiveActions(
    actions: PrimitiveAction[],
  ): Promise<{ success: boolean; shouldAdvanceTurn: boolean }> {
    if (this.isProcessing) {
      Logger.warn("⏸️ Orchestrator busy, ignoring primitive execution request");
      return { success: false, shouldAdvanceTurn: false };
    }

    this.isProcessing = true;
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
      const player = deepClone(playerTemplate);
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
    Logger.info(`🎮 Phase transition: ${this.stateManager.get("game.phase")} → ${phase}`);
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
   * @returns The next player's ID and details, or null if unable to advance
   */
  async advanceTurn(): Promise<{
    playerId: string;
    name: string;
    position: number;
  } | null> {
    return await this.turnManager.advanceTurn(this.boardEffectsHandler.isProcessingEffect());
  }

  private processTranscriptAsBool(transcript: string, context: ExecutionContext): Promise<boolean> {
    return this.processTranscript(transcript, context).then((r) => r.success);
  }

  private async processTranscript(
    transcript: string,
    context: ExecutionContext,
  ): Promise<{ success: boolean; shouldAdvanceTurn: boolean }> {
    try {
      Logger.brain(`Orchestrator processing: ${transcript} (depth: ${context.depth})`);

      const state = this.stateManager.getState();
      Logger.state("Current state:\n" + formatStateContext(state as Record<string, unknown>));
      Profiler.start(`orchestrator.llm.${context.depth}`);
      const actions = await this.llmClient.getActions(transcript, state);
      Profiler.end(`orchestrator.llm.${context.depth}`);

      Logger.robot("LLM returned actions:", actions);

      if (actions.length === 0) {
        Logger.warn("No actions returned from LLM");
        await this.speechService.speak(t("llm.allRetriesFailed"));
        return { success: false, shouldAdvanceTurn: false };
      }
      return await this.runValidatedActions(actions, context, "orchestrator");
    } catch (error) {
      Logger.error("Orchestrator error:", error);
      return { success: false, shouldAdvanceTurn: false };
    }
  }

  private async runValidatedActions(
    actions: PrimitiveAction[],
    context: ExecutionContext,
    profilerPrefix: string,
  ): Promise<{ success: boolean; shouldAdvanceTurn: boolean }> {
    const state = this.stateManager.getState();
    Logger.state("Current state:\n" + formatStateContext(state as Record<string, unknown>));

    Profiler.start(`${profilerPrefix}.validation.${context.depth}`);
    const validation = validateActions(actions, state, this.stateManager, this);
    Profiler.end(`${profilerPrefix}.validation.${context.depth}`);

    if (!validation.valid) {
      Logger.error("Validation failed:", validation.error);
      await this.speechService.speak(t("errors.validationFailed"));
      return { success: false, shouldAdvanceTurn: false };
    }

    const shouldAdvanceTurn = actions.some(
      (a) =>
        a.action === "PLAYER_ROLLED" ||
        a.action === "SET_STATE" ||
        a.action === "PLAYER_ANSWERED" ||
        a.action === "RESET_GAME",
    );

    Logger.info("Actions validated, executing...");
    Profiler.start(`${profilerPrefix}.execution.${context.depth}`);
    await this.executeActions(actions, context);
    Profiler.end(`${profilerPrefix}.execution.${context.depth}`);
    if (context.depth === 0) {
      Logger.info("Actions executed successfully");
    }

    // Only enforce decision points for top-level (user-initiated) flows.
    // When depth > 0, we're in a nested call from a previous enforcement or board effect;
    // we just executed the LLM's response (e.g. asking the question). Don't re-inject.
    if (context.depth === 0) {
      await this.decisionPointEnforcer.enforceDecisionPoints(context);
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

    for (const action of actions) {
      try {
        await this.executeAction(action, context);
      } catch (error) {
        Logger.error("Failed to execute action:", action, error);
      }
    }
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

        const newPosition = currentPosition + primitive.value;
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

      case "PLAYER_ANSWERED": {
        Logger.info(`Player answered: "${primitive.answer}"`);
        // Store answer in temporary state for orchestrator to process
        this.stateManager.set("game.lastAnswer", primitive.answer);
        break;
      }

      case "RESET_GAME": {
        Logger.info(`🔄 Resetting game state (keepPlayerNames: ${primitive.keepPlayerNames})`);

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
