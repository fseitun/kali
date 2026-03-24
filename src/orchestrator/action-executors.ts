import type { BoardEffectsHandler } from "./board-effects-handler";
import { computeNewPositionFromState } from "./board-traversal";
import { getDecisionPointApplyState } from "./decision-helpers";
import { getPowerCheckDiceConfig, getSquareDataAtPosition } from "./power-check-dice";
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
  const pending = game?.pending as { kind?: string; riddlePrompt?: string } | null | undefined;
  if (
    ctx.boardEffectsHandler.isProcessingEffect() &&
    pending?.kind === "riddle" &&
    primitive.text
  ) {
    ctx.stateManager.set("game.pending", {
      ...pending,
      riddlePrompt: primitive.text,
    });
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
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(primitive.path, context);
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
    state as GameState,
    currentTurn,
    currentPosition,
    primitive.value,
  );

  Logger.write(`Player rolled ${primitive.value}: ${path} ${currentPosition} → ${newPosition}`);

  ctx.stateManager.set(path, newPosition);
  context.positionPathsSetByRoll?.add(path);
  ctx.stateManager.set("game.lastRoll", primitive.value);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, context);
  await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, context);
  ctx.checkAndApplyWinCondition(path);
}

function riddleOutcomeMessage(
  correct: boolean,
  dice: ReturnType<typeof getPowerCheckDiceConfig>,
): string {
  if (correct) {
    return dice.ifRiddleCorrect === 3 ? t("game.riddleCorrect3d6") : t("game.riddleCorrect2d6");
  }
  return dice.ifRiddleWrong === 2 ? t("game.riddleIncorrect2d6") : t("game.riddleIncorrect1d6");
}

function parseNumericRoll(answer: string): number | null {
  const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
  const roll = parseInt(rollStr, 10);
  return Number.isNaN(roll) ? null : roll;
}

function getDirectionalRollContext(state: Record<string, unknown>): {
  currentTurn: string;
  pending: { dice: 1 | 2 | 3 };
  path: string;
  currentPosition: number;
} | null {
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as
    | { kind: string; position: number; playerId: string; dice: 1 | 2 | 3 }
    | null
    | undefined;
  const currentTurn = game?.turn as string | undefined;
  if (pending?.kind !== "directional" || !currentTurn || pending.playerId !== currentTurn) {
    return null;
  }
  const path = `players.${currentTurn}.position`;
  const currentPosition = (state.players as Record<string, Record<string, unknown>>)?.[currentTurn]
    ?.position as number | undefined;
  if (typeof currentPosition !== "number") {
    return null;
  }
  return { currentTurn, pending, path, currentPosition };
}

async function applyDirectionalRoll(
  ctx: ActionExecutorContext,
  path: string,
  currentTurn: string,
  currentPosition: number,
  roll: number,
  context: ExecutionContext,
): Promise<void> {
  const state = ctx.stateManager.getState();
  const newPosition = computeNewPositionFromState(
    state,
    currentTurn,
    currentPosition,
    roll,
    "backward",
  );
  Logger.write(`Directional roll ${roll}: ${path} ${currentPosition} → ${newPosition} (backward)`);
  ctx.stateManager.set(path, newPosition);
  ctx.stateManager.set("game.pending", null);
  ctx.stateManager.set("game.lastRoll", roll);
  context.positionPathsSetByRoll?.add(path);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, context);
  await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, context);
  ctx.checkAndApplyWinCondition(path);
}

async function tryHandleDirectionalRollAnswer(
  ctx: ActionExecutorContext,
  answer: string,
  context: ExecutionContext,
): Promise<boolean> {
  const state = ctx.stateManager.getState();
  const dirCtx = getDirectionalRollContext(state as Record<string, unknown>);
  if (!dirCtx) {
    return false;
  }
  const roll = parseNumericRoll(answer);
  if (roll === null) {
    return false;
  }
  const { min, max } = { min: dirCtx.pending.dice, max: dirCtx.pending.dice * 6 };
  if (roll < min || roll > max) {
    return false;
  }
  await applyDirectionalRoll(
    ctx,
    dirCtx.path,
    dirCtx.currentTurn,
    dirCtx.currentPosition,
    roll,
    context,
  );
  return true;
}

async function speakAfterRiddleResolved(
  ctx: ActionExecutorContext,
  riddleResult: { correct: boolean },
): Promise<void> {
  const st = ctx.stateManager.getState() as GameState;
  const game = st.game as Record<string, unknown> | undefined;
  const pendingEncounter = game?.pending as { kind?: string; position?: number } | undefined;
  const squareData =
    pendingEncounter && typeof pendingEncounter.position === "number"
      ? getSquareDataAtPosition(st, pendingEncounter.position)
      : undefined;
  const msg = riddleOutcomeMessage(riddleResult.correct, getPowerCheckDiceConfig(squareData));
  ctx.setLastNarration(msg);
  ctx.statusIndicator.setState("speaking");
  await ctx.speechService.speak(msg);
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
    await speakAfterRiddleResolved(ctx, riddleResult);
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

  const directionalRollHandled = await tryHandleDirectionalRollAnswer(
    ctx,
    primitive.answer,
    context,
  );
  if (directionalRollHandled) {
    return;
  }

  const applyState = getDecisionPointApplyState(ctx.stateManager.getState(), primitive.answer);
  if (applyState) {
    Logger.write(
      `Auto-applying PLAYER_ANSWERED to decision point: ${applyState.path} = ${JSON.stringify(applyState.value)}`,
    );
    ctx.stateManager.set(applyState.path, applyState.value);
    await ctx.boardEffectsHandler.checkAndApplyBoardMoves(applyState.path, context);
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
