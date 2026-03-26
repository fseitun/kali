import type { BoardEffectsHandler } from "./board-effects-handler";
import { applyRollMovementResolvingForks, simulateRollFromState } from "./board-traversal";
import { getDecisionPointApplyState } from "./decision-helpers";
import { getMovementDirectionForState } from "./fork-roll-policy";
import type { PendingCompleteRollMovement } from "./pending-types";
import { getPowerCheckDiceConfig, getSquareDataAtPosition } from "./power-check-dice";
import type { RiddlePowerCheckHandler } from "./riddle-power-check";
import type { TurnManager } from "./turn-manager";
import type { ExecutionContext, GameState, PrimitiveAction } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { possessiveScorePhraseEn, possessiveScorePhraseEs } from "@/i18n/kalimba-encounter-phrases";
import { getLocale } from "@/i18n/locale-manager";
import { t } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { GAME_PATH, playerStatePath } from "@/state-paths";
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

/**
 * When the roller was moved by Golden Fox, replace LLM narration with deterministic final-square text.
 * @returns Spoken line, or undefined to use the primitive / default path.
 */
function tryGoldenFoxNarrationOverride(
  ctx: ActionExecutorContext,
  context: ExecutionContext,
): string | undefined {
  const jump = context.jumpToLeaderRelocated;
  if (!jump || !context.positionPathsSetByRoll?.size) {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  const turn = game?.turn as string | undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const player = turn ? players?.[turn] : undefined;
  const name = typeof player?.name === "string" ? player.name : "";
  context.jumpToLeaderRelocated = undefined;
  return t("game.goldenFoxJump", { name, square: jump.toPosition });
}

export async function executeNarrate(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "NARRATE" }>,
  context: ExecutionContext,
): Promise<void> {
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as { kind?: string; riddlePrompt?: string } | null | undefined;

  const goldenFoxLine = tryGoldenFoxNarrationOverride(ctx, context);
  let textToSpeak: string;
  if (goldenFoxLine !== undefined) {
    textToSpeak = goldenFoxLine;
    ctx.setLastNarration(textToSpeak);
  } else {
    if (
      ctx.boardEffectsHandler.isProcessingEffect() &&
      pending?.kind === "riddle" &&
      primitive.text
    ) {
      ctx.stateManager.set(GAME_PATH.pending, {
        ...pending,
        riddlePrompt: primitive.text,
      });
    }
    if (primitive.text) {
      ctx.setLastNarration(primitive.text);
    }
    textToSpeak = primitive.text ?? "";
  }

  ctx.statusIndicator.setState("speaking");
  if (primitive.soundEffect) {
    ctx.speechService.playSound(primitive.soundEffect);
  }
  await ctx.speechService.speak(textToSpeak);
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

  const path = playerStatePath(currentTurn, "position");
  const currentPosition = ctx.stateManager.get(path) as number;

  if (typeof currentPosition !== "number") {
    throw new Error(`Cannot process PLAYER_ROLLED: ${path} is not a number`);
  }

  const direction = getMovementDirectionForState(state as GameState, currentTurn);
  const movement = applyRollMovementResolvingForks(
    state as GameState,
    currentTurn,
    currentPosition,
    primitive.value,
    direction,
  );

  if (movement.kind === "complete") {
    Logger.write(
      `Player rolled ${primitive.value}: ${path} ${currentPosition} → ${movement.finalPosition}`,
    );
    ctx.stateManager.set(path, movement.finalPosition);
  } else {
    Logger.write(
      `Player rolled ${primitive.value}: ${path} ${currentPosition} → ${movement.positionAtFork} (fork; ${movement.remainingSteps} step(s) left)`,
    );
    ctx.stateManager.set(path, movement.positionAtFork);
    ctx.stateManager.set(GAME_PATH.pending, {
      kind: "completeRollMovement",
      playerId: currentTurn,
      remainingSteps: movement.remainingSteps,
      direction: movement.direction,
    } satisfies PendingCompleteRollMovement);
  }

  context.positionPathsSetByRoll?.add(path);
  ctx.stateManager.set(GAME_PATH.lastRoll, primitive.value);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, context);
  if (movement.kind === "complete") {
    await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, context);
  }
  ctx.checkAndApplyWinCondition(path);
}

function riddleOutcomeMessage(
  correct: boolean,
  dice: ReturnType<typeof getPowerCheckDiceConfig>,
  squareName: string | undefined,
): string {
  const locale = getLocale();
  const animalScorePhrase =
    locale === "es-AR" ? possessiveScorePhraseEs(squareName) : possessiveScorePhraseEn(squareName);

  if (correct) {
    const gap = dice.ifRiddleCorrect - dice.ifRiddleWrong;
    const extraDicePhrase =
      gap === 1
        ? t("game.riddlePowerExtraDieOne")
        : gap > 1
          ? t("game.riddlePowerExtraDiceMany", { count: gap })
          : "";
    return t("game.riddleCorrectPowerRoll", {
      extraDicePhrase,
      diceCount: dice.ifRiddleCorrect,
      animalScorePhrase,
    });
  }

  const wrongCount = dice.ifRiddleWrong;
  const diceRollPhrase =
    wrongCount === 1
      ? t("game.riddlePowerRollOneDie")
      : t("game.riddlePowerRollManyDice", { count: wrongCount });
  return t("game.riddleIncorrectPowerRoll", { diceRollPhrase, animalScorePhrase });
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
  const path = playerStatePath(currentTurn, "position");
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
  const state = ctx.stateManager.getState() as GameState;
  const direction = getMovementDirectionForState(state, currentTurn);
  const movement = applyRollMovementResolvingForks(
    state,
    currentTurn,
    currentPosition,
    roll,
    direction,
  );

  if (movement.kind === "complete") {
    Logger.write(
      `Directional roll ${roll}: ${path} ${currentPosition} → ${movement.finalPosition} (${direction})`,
    );
    ctx.stateManager.set(path, movement.finalPosition);
  } else {
    Logger.write(
      `Directional roll ${roll}: ${path} ${currentPosition} → ${movement.positionAtFork} (${direction}, fork; ${movement.remainingSteps} step(s) left)`,
    );
    ctx.stateManager.set(path, movement.positionAtFork);
    ctx.stateManager.set(GAME_PATH.pending, {
      kind: "completeRollMovement",
      playerId: currentTurn,
      remainingSteps: movement.remainingSteps,
      direction: movement.direction,
    } satisfies PendingCompleteRollMovement);
  }

  if (movement.kind === "complete") {
    ctx.stateManager.set(GAME_PATH.pending, null);
  }
  ctx.stateManager.set(GAME_PATH.lastRoll, roll);
  context.positionPathsSetByRoll?.add(path);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, context);
  if (movement.kind === "complete") {
    await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, context);
  }
  ctx.checkAndApplyWinCondition(path);
}

function getCompleteRollMovementResolution(
  state: GameState,
  pending: PendingCompleteRollMovement | null | undefined,
  currentTurn: string | undefined,
  getPosition: (path: string) => unknown,
): { path: string; pos: number; newPos: number } | null {
  if (
    pending?.kind !== "completeRollMovement" ||
    pending.playerId !== currentTurn ||
    pending.remainingSteps <= 0 ||
    !currentTurn
  ) {
    return null;
  }
  const path = playerStatePath(currentTurn, "position");
  const pos = getPosition(path) as number;
  if (typeof pos !== "number") {
    return null;
  }
  const player = (state.players as Record<string, Record<string, unknown>>)?.[currentTurn];
  const activeChoices = (player?.activeChoices as Record<string, number>) ?? {};
  const newPos = simulateRollFromState(
    state,
    currentTurn,
    pos,
    pending.remainingSteps,
    pending.direction,
    activeChoices,
  );
  return { path, pos, newPos };
}

async function tryCompletePendingRollAfterForkChoice(
  ctx: ActionExecutorContext,
  context: ExecutionContext,
): Promise<boolean> {
  const state = ctx.stateManager.getState() as GameState;
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as PendingCompleteRollMovement | null | undefined;
  const currentTurn = game?.turn as string | undefined;
  const resolved = getCompleteRollMovementResolution(state, pending, currentTurn, (p) =>
    ctx.stateManager.get(p),
  );
  if (!resolved) {
    return false;
  }
  const { path, pos, newPos } = resolved;
  ctx.stateManager.set(path, newPos);
  ctx.stateManager.set(GAME_PATH.pending, null);
  Logger.write(`Completed fork-paused movement: ${path} ${pos} → ${newPos}`);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, context);
  await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, context);
  ctx.checkAndApplyWinCondition(path);
  return true;
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

async function speakAfterRiddleOutcome(
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
  const squareName = typeof squareData?.name === "string" ? squareData.name : undefined;
  const msg = riddleOutcomeMessage(
    riddleResult.correct,
    getPowerCheckDiceConfig(squareData),
    squareName,
  );
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
  ctx.stateManager.set(GAME_PATH.lastAnswer, primitive.answer);

  const riddleResult = await ctx.riddlePowerCheckHandler.tryHandleRiddleAnswer(
    primitive.answer,
    context,
  );
  if (riddleResult) {
    context.skipTrailingNarrateForPowerCheck = true;
    await speakAfterRiddleOutcome(ctx, riddleResult);
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
    const completedForkMove = await tryCompletePendingRollAfterForkChoice(ctx, context);
    if (completedForkMove) {
      return;
    }
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
      ctx.stateManager.set(playerStatePath(playerId, "name"), savedName);
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
