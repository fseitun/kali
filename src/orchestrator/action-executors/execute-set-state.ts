import type { ExecutionContext, PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";
import { isPlayerPositionPath } from "./shared";
import { Logger } from "@/utils/logger";

export async function executeSetState(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "SET_STATE" }>,
  execCtx: ExecutionContext,
): Promise<void> {
  if (execCtx.positionPathsSetByRoll?.has(primitive.path)) {
    Logger.write(
      `Ignoring SET_STATE that would overwrite position just set by PLAYER_ROLLED: ${primitive.path}`,
    );
    return;
  }
  await ctx.turnManager.assertPlayerTurnOwnership(primitive.path);
  Logger.write(`Setting state: ${primitive.path} = ${JSON.stringify(primitive.value)}`);
  ctx.stateManager.set(primitive.path, primitive.value);

  const prevSuppress = execCtx.suppressNextOnLandingAtPosition;
  const shouldSuppressLandingTeleport =
    isPlayerPositionPath(primitive.path) && typeof primitive.value === "number";
  if (shouldSuppressLandingTeleport) {
    execCtx.suppressNextOnLandingAtPosition = primitive.value as number;
  }

  try {
    await ctx.boardEffectsHandler.checkAndApplyBoardMoves(primitive.path, execCtx);
  } finally {
    if (shouldSuppressLandingTeleport) {
      execCtx.suppressNextOnLandingAtPosition = prevSuppress;
    }
  }

  await ctx.boardEffectsHandler.checkAndApplySquareEffects(primitive.path, execCtx);
  ctx.checkAndApplyWinCondition(primitive.path);
}
