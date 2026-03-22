import type { BoardEffectsHandler } from "./board-effects-handler";
import { computeNewPositionFromState } from "./board-traversal";
import { getDecisionPointApplyState } from "./decision-helpers";
import type { RiddlePowerCheckHandler } from "./riddle-power-check";
import type { TurnManager } from "./turn-manager";
import type { ExecutionContext, GameState, PrimitiveAction } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { t } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

export interface ActionExecutorContext {
  stateManager: StateManager;
  speechService: ISpeechService;
  statusIndicator: IStatusIndicator;
  turnManager: TurnManager;
  boardEffectsHandler: BoardEffectsHandler;
  riddlePowerCheckHandler: RiddlePowerCheckHandler;
  initialState: GameState;
  setLastNarration: (text: string) => void;
  checkAndApplyWinCondition: (positionPath: string) => void;
}

export async function executeNarrate(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "NARRATE" }>,
  _context: ExecutionContext,
): Promise<void> {
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pendingAnimalEncounter as
    | { phase?: string; riddleHint?: string }
    | null
    | undefined;
  if (
    ctx.boardEffectsHandler.isProcessingEffect() &&
    pending?.phase === "riddle" &&
    primitive.text
  ) {
    ctx.stateManager.set("game.pendingAnimalEncounter", {
      ...pending,
      riddlePrompt: primitive.text,
    } as Record<string, unknown>);
  }
  if (primitive.text) {
    ctx.setLastNarration(primitive.text);
  }
  ctx.statusIndicator.setState("speaking");
  if (primitive.soundEffect) {
    ctx.speechService.playSound(primitive.soundEffect);
  }
  await ctx.speechService.speak(primitive.text);
}

export async function executeSetState(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "SET_STATE" }>,
  context: ExecutionContext,
): Promise<void> {
  if (context.positionPathsSetByRoll?.has(primitive.path)) {
    Logger.write(
      `Ignoring SET_STATE that would overwrite position just set by PLAYER_ROLLED: ${primitive.path}`,
    );
    return;
  }
  await ctx.turnManager.assertPlayerTurnOwnership(primitive.path);
  Logger.write(`Setting state: ${primitive.path} = ${JSON.stringify(primitive.value)}`);
  ctx.stateManager.set(primitive.path, primitive.value);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(primitive.path);
  await ctx.boardEffectsHandler.checkAndApplySquareEffects(primitive.path, context);
  ctx.checkAndApplyWinCondition(primitive.path);
}

export async function executePlayerRolled(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "PLAYER_ROLLED" }>,
  context: ExecutionContext,
): Promise<void> {
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;

  if (!currentTurn) {
    throw new Error("Cannot process PLAYER_ROLLED: No current turn set");
  }

  const path = `players.${currentTurn}.position`;
  const currentPosition = ctx.stateManager.get(path) as number;

  if (typeof currentPosition !== "number") {
    throw new Error(`Cannot process PLAYER_ROLLED: ${path} is not a number`);
  }

  const newPosition = computeNewPositionFromState(
    state,
    currentTurn,
    currentPosition,
    primitive.value,
  );
  Logger.write(`Player rolled ${primitive.value}: ${path} ${currentPosition} → ${newPosition}`);

  ctx.stateManager.set(path, newPosition);
  context.positionPathsSetByRoll?.add(path);
  ctx.stateManager.set("game.lastRoll", primitive.value);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path);
  await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, context);
  ctx.checkAndApplyWinCondition(path);
}

export async function executePlayerAnswered(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "PLAYER_ANSWERED" }>,
  context: ExecutionContext,
): Promise<void> {
  Logger.info(`Player answered: "${primitive.answer}"`);
  ctx.stateManager.set("game.lastAnswer", primitive.answer);

  const riddleResult = await ctx.riddlePowerCheckHandler.tryHandleRiddleAnswer(
    primitive.answer,
    context,
  );
  if (riddleResult) {
    context.skipTrailingNarrateForPowerCheck = true;
    const msg = riddleResult.correct ? t("game.riddleCorrect") : t("game.riddleIncorrect");
    ctx.setLastNarration(msg);
    ctx.statusIndicator.setState("speaking");
    await ctx.speechService.speak(msg);
    return;
  }

  const powerCheckResult = await ctx.riddlePowerCheckHandler.tryHandlePowerCheckAnswer(
    primitive.answer,
    context,
  );
  if (powerCheckResult) {
    if ("turnAdvanced" in powerCheckResult && powerCheckResult.turnAdvanced) {
      context.turnAdvancedAfterPowerCheckFail = powerCheckResult.turnAdvanced;
    }
    context.skipTrailingNarrateForPowerCheck = true;
    return;
  }

  const applyState = getDecisionPointApplyState(ctx.stateManager.getState(), primitive.answer);
  if (applyState) {
    Logger.write(
      `Auto-applying PLAYER_ANSWERED to decision point: ${applyState.path} = ${JSON.stringify(applyState.value)}`,
    );
    ctx.stateManager.set(applyState.path, applyState.value);
    await ctx.boardEffectsHandler.checkAndApplyBoardMoves(applyState.path);
    await ctx.boardEffectsHandler.checkAndApplySquareEffects(applyState.path, context);
  }
}

function extractPlayerNames(state: unknown): Map<string, string> {
  const playerNames = new Map<string, string>();
  const players = (state as { players?: Record<string, { name: string }> }).players;
  if (!players) {
    return playerNames;
  }
  for (const [id, player] of Object.entries(players)) {
    playerNames.set(id, player.name);
  }
  return playerNames;
}

function restorePlayerNames(ctx: ActionExecutorContext, playerNames: Map<string, string>): void {
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  const playerOrder = game?.playerOrder as string[] | undefined;
  if (!playerOrder?.length) {
    Logger.warn("keepPlayerNames=true but no playerOrder found after reset");
    return;
  }
  Logger.info(`Restoring ${playerNames.size} player names`);
  for (const playerId of playerOrder) {
    const savedName = playerNames.get(playerId);
    if (savedName) {
      ctx.stateManager.set(`players.${playerId}.name`, savedName);
      Logger.info(`Restored player ${playerId}: "${savedName}"`);
    }
  }
}

export async function executeResetGame(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "RESET_GAME" }>,
  _context: ExecutionContext,
): Promise<void> {
  Logger.info(`Resetting game state (keepPlayerNames: ${primitive.keepPlayerNames})`);

  let playerNames = new Map<string, string>();
  if (primitive.keepPlayerNames) {
    const currentState = ctx.stateManager.getState();
    playerNames = extractPlayerNames(currentState);
    if (playerNames.size > 0) {
      Logger.info(
        `Extracted ${playerNames.size} player names: [${Array.from(playerNames.values()).join(", ")}]`,
      );
    } else {
      Logger.warn("keepPlayerNames=true but no players found in current state");
    }
  }

  ctx.stateManager.resetState(ctx.initialState);
  Logger.info("State reset to initial state");

  if (primitive.keepPlayerNames && playerNames.size > 0) {
    restorePlayerNames(ctx, playerNames);
  }

  Logger.info("Game state reset complete");
}
