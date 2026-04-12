import { applyRollMovementResolvingForks, simulateRollFromState } from "../board-traversal";
import { getDecisionPointApplyState } from "../decision-helpers";
import { getMovementDirectionForState } from "../fork-roll-policy";
import type { PendingCompleteRollMovement } from "../pending-types";
import { getPowerCheckDiceConfig, getSquareDataAtPosition } from "../power-check-dice";
import { parseRollLikeInput } from "../roll-parser";
import type { ExecutionContext, GameState, PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";
import { getCurrentTurn } from "./shared";
import { possessiveScorePhraseEn, possessiveScorePhraseEs } from "@/i18n/kalimba-encounter-phrases";
import { getLocale } from "@/i18n/locale-manager";
import { t } from "@/i18n/translations";
import { GAME_PATH, playerStatePath } from "@/state-paths";
import { Logger } from "@/utils/logger";

function riddleOutcomeMessage(
  correct: boolean,
  dice: ReturnType<typeof getPowerCheckDiceConfig>,
  squareName: string | undefined,
  includeHeartHint: boolean,
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
    const base = t("game.riddleCorrectPowerRoll", {
      extraDicePhrase,
      diceCount: dice.ifRiddleCorrect,
      animalScorePhrase,
    });
    return includeHeartHint ? base + t("game.riddleHeartIfWin") : base;
  }

  const wrongCount = dice.ifRiddleWrong;
  const diceRollPhrase =
    wrongCount === 1
      ? t("game.riddlePowerRollOneDie")
      : t("game.riddlePowerRollManyDice", { count: wrongCount });
  return t("game.riddleIncorrectPowerRoll", { diceRollPhrase, animalScorePhrase });
}

function getDirectionalRollContext(state: Readonly<GameState>): {
  currentTurn: string;
  pending: { dice: 1 | 2 | 3 };
  path: string;
  currentPosition: number;
} | null {
  const pending = state.game.pending as
    | { kind: string; position: number; playerId: string; dice: 1 | 2 | 3 }
    | null
    | undefined;
  const currentTurn = getCurrentTurn(state);
  if (pending?.kind !== "directional" || !currentTurn || pending.playerId !== currentTurn) {
    return null;
  }
  const path = playerStatePath(currentTurn, "position");
  const currentPosition = state.players[currentTurn]?.position;
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
  execCtx: ExecutionContext,
): Promise<void> {
  const state = ctx.stateManager.getState();
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
  execCtx.positionPathsSetByRoll?.add(path);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, execCtx);
  if (movement.kind === "complete") {
    await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, execCtx);
  }
  ctx.checkAndApplyWinCondition(path);
}

function getCompleteRollMovementResolution(
  state: Readonly<GameState>,
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
  const pos = getPosition(path);
  if (typeof pos !== "number") {
    return null;
  }
  const player = state.players[currentTurn];
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
  execCtx: ExecutionContext,
): Promise<boolean> {
  const state = ctx.stateManager.getState();
  const pending = state.game.pending as PendingCompleteRollMovement | null | undefined;
  const currentTurn = getCurrentTurn(state);
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
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, execCtx);
  await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, execCtx);
  ctx.checkAndApplyWinCondition(path);
  return true;
}

async function tryHandleDirectionalRollAnswer(
  ctx: ActionExecutorContext,
  answer: string,
  execCtx: ExecutionContext,
): Promise<boolean> {
  const state = ctx.stateManager.getState();
  const dirCtx = getDirectionalRollContext(state);
  if (!dirCtx) {
    return false;
  }
  const roll = parseRollLikeInput(answer);
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
    execCtx,
  );
  return true;
}

async function speakAfterRiddleOutcome(
  ctx: ActionExecutorContext,
  riddleResult: { correct: boolean },
): Promise<void> {
  const state = ctx.stateManager.getState();
  const pendingEncounter = state.game.pending as { kind?: string; position?: number } | undefined;
  const squareData =
    pendingEncounter && typeof pendingEncounter.position === "number"
      ? getSquareDataAtPosition(state, pendingEncounter.position)
      : undefined;
  const squareName = typeof squareData?.name === "string" ? squareData.name : undefined;
  const includeHeartHint = riddleResult.correct === true && squareData?.heart === true;
  const msg = riddleOutcomeMessage(
    riddleResult.correct,
    getPowerCheckDiceConfig(squareData),
    squareName,
    includeHeartHint,
  );
  ctx.setLastNarration(msg);
  ctx.statusIndicator.setState("speaking");
  await ctx.speechService.speak(msg);
}

export async function executePlayerAnswered(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "PLAYER_ANSWERED" }>,
  execCtx: ExecutionContext,
): Promise<void> {
  Logger.info(`Player answered: "${primitive.answer}"`);
  ctx.stateManager.set(GAME_PATH.lastAnswer, primitive.answer);

  const riddleResult = await ctx.riddlePowerCheckHandler.tryHandleRiddleAnswer(
    primitive.answer,
    execCtx,
  );
  if (riddleResult) {
    execCtx.skipTrailingNarrateForPowerCheck = true;
    await speakAfterRiddleOutcome(ctx, riddleResult);
    return;
  }

  const powerCheckResult = await ctx.riddlePowerCheckHandler.tryHandlePowerCheckAnswer(
    primitive.answer,
    execCtx,
  );
  if (powerCheckResult) {
    if ("turnAdvanced" in powerCheckResult && powerCheckResult.turnAdvanced) {
      execCtx.turnAdvancedAfterPowerCheckFail = powerCheckResult.turnAdvanced;
    }
    execCtx.skipTrailingNarrateForPowerCheck = true;
    return;
  }

  const directionalRollHandled = await tryHandleDirectionalRollAnswer(
    ctx,
    primitive.answer,
    execCtx,
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
    const completedForkMove = await tryCompletePendingRollAfterForkChoice(ctx, execCtx);
    if (completedForkMove) {
      return;
    }
    await ctx.boardEffectsHandler.checkAndApplyBoardMoves(applyState.path, execCtx);
    await ctx.boardEffectsHandler.checkAndApplySquareEffects(applyState.path, execCtx);
  }
}
