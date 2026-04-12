import type { ActionExecutorContext } from "./action-executors/shared";
import { getCurrentTurn, getPlayerNameById } from "./action-executors/shared";
import type { ExecutionContext } from "./types";
import { t } from "@/i18n/translations";

function tryGoldenFoxNarrationOverride(
  ctx: ActionExecutorContext,
  execCtx: ExecutionContext,
): string | undefined {
  const jump = execCtx.jumpToLeaderRelocated;
  if (!jump || !execCtx.positionPathsSetByRoll?.size) {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  const turn = getCurrentTurn(state);
  const name = turn ? getPlayerNameById(state, turn, "") : "";
  execCtx.jumpToLeaderRelocated = undefined;
  return t("game.goldenFoxJump", { name, square: jump.toPosition });
}

function tryMagicDoorBounceNarrationOverride(
  ctx: ActionExecutorContext,
  execCtx: ExecutionContext,
  incomingNarrationText: string | undefined,
): string | undefined {
  const bounce = execCtx.magicDoorBounce;
  if (bounce === undefined) {
    return undefined;
  }
  if (incomingNarrationText === undefined || incomingNarrationText.trim() === "") {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  const turn = getCurrentTurn(state);
  if (turn !== bounce.playerId) {
    return undefined;
  }
  const name = getPlayerNameById(state, bounce.playerId, "");
  execCtx.magicDoorBounce = undefined;
  execCtx.pendingMovementRollNarration = undefined;
  return t("game.magicDoorBounce", {
    name,
    door: bounce.doorPosition,
    overshot: bounce.overshotPosition,
    final: bounce.finalPosition,
  });
}

function tryMovementRollNarrationOverride(
  ctx: ActionExecutorContext,
  execCtx: ExecutionContext,
  incomingNarrationText: string | undefined,
): string | undefined {
  const pending = execCtx.pendingMovementRollNarration;
  if (pending === undefined) {
    return undefined;
  }
  if (incomingNarrationText === undefined || incomingNarrationText.trim() === "") {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  if (state.game.turn !== pending.playerId) {
    return undefined;
  }
  execCtx.pendingMovementRollNarration = undefined;
  const name = getPlayerNameById(state, pending.playerId, "");
  return t("game.rollMovementLanded", { name, roll: pending.roll, square: pending.square });
}

function trySkullReturnNarrationOverride(
  ctx: ActionExecutorContext,
  execCtx: ExecutionContext,
  incomingNarrationText: string | undefined,
): string | undefined {
  const skullReturn = execCtx.skullReturnToSnakeHead;
  if (skullReturn === undefined) {
    return undefined;
  }
  if (incomingNarrationText === undefined || incomingNarrationText.trim() === "") {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  if (state.game.turn !== skullReturn.playerId) {
    return undefined;
  }
  execCtx.skullReturnToSnakeHead = undefined;
  execCtx.pendingMovementRollNarration = undefined;
  const name = getPlayerNameById(state, skullReturn.playerId, "");
  return t("game.skullReturnToSnakeHead", {
    name,
    from: skullReturn.fromSquare,
    to: skullReturn.toSquare,
  });
}

export function resolveDeterministicNarrationOverrides(
  ctx: ActionExecutorContext,
  execCtx: ExecutionContext,
  incomingNarrationText: string | undefined,
): string | undefined {
  const goldenFoxLine = tryGoldenFoxNarrationOverride(ctx, execCtx);
  if (goldenFoxLine !== undefined) {
    ctx.setLastNarration(goldenFoxLine);
    return goldenFoxLine;
  }
  const magicDoorLine = tryMagicDoorBounceNarrationOverride(ctx, execCtx, incomingNarrationText);
  if (magicDoorLine !== undefined) {
    ctx.setLastNarration(magicDoorLine);
    return magicDoorLine;
  }
  const skullReturnLine = trySkullReturnNarrationOverride(ctx, execCtx, incomingNarrationText);
  if (skullReturnLine !== undefined) {
    ctx.setLastNarration(skullReturnLine);
    return skullReturnLine;
  }
  const movementRollLine = tryMovementRollNarrationOverride(ctx, execCtx, incomingNarrationText);
  if (movementRollLine !== undefined) {
    ctx.setLastNarration(movementRollLine);
    return movementRollLine;
  }
  return undefined;
}
