import { getDecisionPoints } from "./decision-point-inference";
import type { DecisionPoint, ExecutionContext, GameState } from "./types";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

function getCurrentPlayerAtDecisionPoint(
  state: GameState,
  currentTurn: string,
): { position: number; playerName: string; decisionPoint: DecisionPoint } | null {
  const decisionPoints = getDecisionPoints(state);
  if (decisionPoints.length === 0) {
    return null;
  }
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentPlayer = players?.[currentTurn];
  if (!currentPlayer) {
    return null;
  }
  const position = currentPlayer.position as number | undefined;
  if (typeof position !== "number") {
    return null;
  }
  const decisionPoint = decisionPoints.find((dp) => dp.position === position);
  if (!decisionPoint) {
    return null;
  }
  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  if (choices?.[String(position)] !== undefined) {
    return null;
  }
  const playerName = (currentPlayer.name as string) || currentTurn;
  return { position, playerName, decisionPoint };
}

function getEnforceableDecisionPoint(
  state: GameState,
): { playerId: string; playerName: string; position: number; decisionPoint: DecisionPoint } | null {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  if (!currentTurn) {
    return null;
  }
  const info = getCurrentPlayerAtDecisionPoint(state, currentTurn);
  if (!info) {
    return null;
  }
  return {
    playerId: currentTurn,
    playerName: info.playerName,
    position: info.position,
    decisionPoint: info.decisionPoint,
  };
}

/**
 * Enforces decision point requirements in game flow.
 *
 * Responsibilities:
 * - Check if current player is at a decision point
 * - Verify required fields are filled
 * - Inject prompts to ask player for decisions
 */
export class DecisionPointEnforcer {
  constructor(
    private stateManager: StateManager,
    private processTranscriptFn: (
      transcript: string,
      context: ExecutionContext,
    ) => Promise<boolean>,
  ) {}

  /**
   * Enforces decision points for current player.
   * If player is at a decision point and hasn't filled required field,
   * injects a prompt to ask for the decision.
   *
   * @param context - Execution context
   */
  async enforceDecisionPoints(_context: ExecutionContext): Promise<void> {
    try {
      const state = this.stateManager.getState();
      const info = getEnforceableDecisionPoint(state);
      if (!info) {
        return;
      }

      const { playerId, playerName, position, decisionPoint } = info;
      Logger.info(
        `Orchestrator enforcing decision point for ${playerName} at position ${position}`,
      );
      const newContext: ExecutionContext = { isNestedCall: true };
      await this.processTranscriptFn(
        `[SYSTEM: ${playerName} (${playerId}) is at position ${position} and MUST choose direction at fork before proceeding. Ask them: "${playerName}, ${decisionPoint.prompt}"]`,
        newContext,
      );
    } catch (error) {
      Logger.error("Error enforcing decision points:", error);
    }
  }
}
