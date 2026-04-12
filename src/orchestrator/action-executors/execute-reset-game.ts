import type { ExecutionContext, PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";
import { playerStatePath } from "@/state-paths";
import { Logger } from "@/utils/logger";

function extractPlayerNames(
  state: Readonly<{ players?: Record<string, { name: string }> }>,
): Map<string, string> {
  const playerNames = new Map<string, string>();
  const players = state.players;
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
  const playerOrder = state.game.playerOrder;
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
  _execCtx: ExecutionContext,
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
