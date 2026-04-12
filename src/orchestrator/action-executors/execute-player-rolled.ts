import {
  getMagicDoorConfig,
  getMagicDoorOpeningBonus,
  isMagicDoorOpeningRollState,
  type SquareLike,
} from "../board-helpers";
import { applyRollMovementResolvingForks } from "../board-traversal";
import { getMovementDirectionForState } from "../fork-roll-policy";
import type { PendingCompleteRollMovement } from "../pending-types";
import type { ExecutionContext, GameState, PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";
import { getCurrentTurn, playerDisplayName } from "./shared";
import { t } from "@/i18n/translations";
import { GAME_PATH, playerStatePath } from "@/state-paths";
import { Logger } from "@/utils/logger";

function magicDoorOpeningSpeech(
  success: boolean,
  name: string,
  roll: number,
  bonus: number,
  total: number,
  target: number,
): string {
  const args = { name, roll, bonus, total, target };
  return success ? t("game.magicDoorOpenSuccess", args) : t("game.magicDoorOpenFail", args);
}

async function tryExecuteMagicDoorOpeningRoll(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "PLAYER_ROLLED" }>,
  execCtx: ExecutionContext,
  state: Readonly<GameState>,
  currentTurn: string,
  path: string,
): Promise<boolean> {
  if (execCtx.isNestedCall || !isMagicDoorOpeningRollState(state)) {
    return false;
  }
  const door = getMagicDoorConfig(
    (state.board as { squares?: Record<string, SquareLike> } | undefined)?.squares,
  );
  if (!door) {
    throw new Error("Magic door opening roll but no magicDoorCheck square in board");
  }
  const playerRecord = state.players[currentTurn];
  const bonus = getMagicDoorOpeningBonus(playerRecord as Record<string, unknown>);
  const total = primitive.value + bonus;
  const success = total >= door.target;
  const name = playerDisplayName(playerRecord?.name, currentTurn);

  ctx.stateManager.set(GAME_PATH.lastRoll, primitive.value);
  if (success) {
    ctx.stateManager.set(playerStatePath(currentTurn, "magicDoorOpened"), true);
  }

  const msg = magicDoorOpeningSpeech(success, name, primitive.value, bonus, total, door.target);
  Logger.write(
    `Magic door opening: ${path} roll ${primitive.value} + bonus ${bonus} = ${total} vs ${door.target} → ${success ? "opened" : "failed"}`,
  );

  ctx.setLastNarration(msg);
  ctx.statusIndicator.setState("speaking");
  await ctx.speechService.speak(msg);

  const next = ctx.turnManager.advanceTurnMechanical();
  if (next) {
    execCtx.turnAdvancedAfterMagicDoorOpen = next;
  }
  execCtx.skipTrailingNarrateAfterMagicDoorAttempt = true;
  return true;
}

async function executeMovementPlayerRoll(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "PLAYER_ROLLED" }>,
  execCtx: ExecutionContext,
  state: Readonly<GameState>,
  currentTurn: string,
  path: string,
  currentPosition: number,
): Promise<void> {
  const direction = getMovementDirectionForState(state, currentTurn);
  const movement = applyRollMovementResolvingForks(
    state,
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

  execCtx.positionPathsSetByRoll?.add(path);
  ctx.stateManager.set(GAME_PATH.lastRoll, primitive.value);
  await ctx.boardEffectsHandler.checkAndApplyBoardMoves(path, execCtx);
  if (movement.kind === "complete") {
    await ctx.boardEffectsHandler.checkAndApplySquareEffects(path, execCtx);
  }

  ctx.checkAndApplyWinCondition(path);

  if (movement.kind === "complete" && !execCtx.isNestedCall) {
    const finalSquare = ctx.stateManager.get(path);
    if (typeof finalSquare === "number") {
      execCtx.pendingMovementRollNarration = {
        playerId: currentTurn,
        roll: primitive.value,
        square: finalSquare,
      };
    }
  }
}

export async function executePlayerRolled(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "PLAYER_ROLLED" }>,
  execCtx: ExecutionContext,
): Promise<void> {
  const state = ctx.stateManager.getState();
  const currentTurn = getCurrentTurn(state);

  if (!currentTurn) {
    throw new Error("Cannot process PLAYER_ROLLED: No current turn set");
  }

  const path = playerStatePath(currentTurn, "position");
  const currentPosition = ctx.stateManager.get(path);

  if (typeof currentPosition !== "number") {
    throw new Error(`Cannot process PLAYER_ROLLED: ${path} is not a number`);
  }

  if (await tryExecuteMagicDoorOpeningRoll(ctx, primitive, execCtx, state, currentTurn, path)) {
    return;
  }

  await executeMovementPlayerRoll(
    ctx,
    primitive,
    execCtx,
    state,
    currentTurn,
    path,
    currentPosition,
  );
}
