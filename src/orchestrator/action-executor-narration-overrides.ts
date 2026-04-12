import type { ActionExecutorContext } from "./action-executors";
import type { ExecutionContext } from "./types";
import { t } from "@/i18n/translations";

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

function tryMagicDoorBounceNarrationOverride(
  ctx: ActionExecutorContext,
  context: ExecutionContext,
  text: string | undefined,
): string | undefined {
  const bounce = context.magicDoorBounce;
  if (bounce === undefined) {
    return undefined;
  }
  if (text === undefined || text.trim() === "") {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  const turn = game?.turn as string | undefined;
  if (turn !== bounce.playerId) {
    return undefined;
  }
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const name =
    typeof players?.[bounce.playerId]?.name === "string"
      ? (players[bounce.playerId].name as string)
      : "";
  context.magicDoorBounce = undefined;
  context.pendingMovementRollNarration = undefined;
  return t("game.magicDoorBounce", {
    name,
    door: bounce.doorPosition,
    overshot: bounce.overshotPosition,
    final: bounce.finalPosition,
  });
}

function tryMovementRollNarrationOverride(
  ctx: ActionExecutorContext,
  context: ExecutionContext,
  text: string | undefined,
): string | undefined {
  const pending = context.pendingMovementRollNarration;
  if (pending === undefined) {
    return undefined;
  }
  if (text === undefined || text.trim() === "") {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  if (game?.turn !== pending.playerId) {
    return undefined;
  }
  context.pendingMovementRollNarration = undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const name =
    typeof players?.[pending.playerId]?.name === "string"
      ? (players[pending.playerId].name as string)
      : "";
  return t("game.rollMovementLanded", { name, roll: pending.roll, square: pending.square });
}

function trySkullReturnNarrationOverride(
  ctx: ActionExecutorContext,
  context: ExecutionContext,
  text: string | undefined,
): string | undefined {
  const skullReturn = context.skullReturnToSnakeHead;
  if (skullReturn === undefined) {
    return undefined;
  }
  if (text === undefined || text.trim() === "") {
    return undefined;
  }
  const state = ctx.stateManager.getState();
  const game = state.game as Record<string, unknown> | undefined;
  if (game?.turn !== skullReturn.playerId) {
    return undefined;
  }
  context.skullReturnToSnakeHead = undefined;
  context.pendingMovementRollNarration = undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const name =
    typeof players?.[skullReturn.playerId]?.name === "string"
      ? (players[skullReturn.playerId].name as string)
      : "";
  return t("game.skullReturnToSnakeHead", {
    name,
    from: skullReturn.fromSquare,
    to: skullReturn.toSquare,
  });
}

export function resolveDeterministicNarrationOverrides(
  ctx: ActionExecutorContext,
  context: ExecutionContext,
  text: string | undefined,
): string | undefined {
  const goldenFoxLine = tryGoldenFoxNarrationOverride(ctx, context);
  if (goldenFoxLine !== undefined) {
    ctx.setLastNarration(goldenFoxLine);
    return goldenFoxLine;
  }
  const magicDoorLine = tryMagicDoorBounceNarrationOverride(ctx, context, text);
  if (magicDoorLine !== undefined) {
    ctx.setLastNarration(magicDoorLine);
    return magicDoorLine;
  }
  const skullReturnLine = trySkullReturnNarrationOverride(ctx, context, text);
  if (skullReturnLine !== undefined) {
    ctx.setLastNarration(skullReturnLine);
    return skullReturnLine;
  }
  const movementRollLine = tryMovementRollNarrationOverride(ctx, context, text);
  if (movementRollLine !== undefined) {
    ctx.setLastNarration(movementRollLine);
    return movementRollLine;
  }
  return undefined;
}
