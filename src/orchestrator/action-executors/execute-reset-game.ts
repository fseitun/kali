import { GamePhase, type ExecutionContext, type GameState, type PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";
import { Logger } from "@/utils/logger";

/**
 * Names worth carrying into the new game: only a roster that finished setup has real ones, and
 * only a complete roster can be rebuilt (`initialState` holds just `minPlayers` templates).
 */
function keptPlayerNames(state: GameState): string[] {
  if (state.game.phase === GamePhase.SETUP) {
    return [];
  }
  const playerOrder = state.game.playerOrder ?? [];
  const names = playerOrder.map((id) => state.players?.[id]?.name);
  const allNamed = names.every((name) => typeof name === "string" && name.trim() !== "");
  return playerOrder.length > 0 && allNamed ? names : [];
}

/**
 * Restarts the game. With the roster kept, the orchestrator rebuilds it and play resumes at the
 * first player; otherwise the game drops to SETUP and the app collects names again. Either way
 * `gameReset` on the result tells the app to finish the restart out loud — a reset that leaves
 * the app silent in SETUP is the bug this shape exists to prevent.
 */
export async function executeResetGame(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "RESET_GAME" }>,
  _execCtx: ExecutionContext,
): Promise<void> {
  const names = primitive.keepPlayerNames ? keptPlayerNames(ctx.stateManager.getState()) : [];

  ctx.stateManager.resetState(ctx.initialState);

  if (names.length === 0) {
    ctx.transitionPhase(GamePhase.SETUP);
    Logger.info("Game reset to SETUP; names will be collected again");
    return;
  }

  ctx.setupPlayers(names);
  ctx.transitionPhase(GamePhase.PLAYING);
  Logger.info(`Game reset keeping ${names.length} player(s): [${names.join(", ")}]`);
}
