import type { ExecutionContext } from "./types";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

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
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;

    if (!currentTurn) {
      return;
    }

    const decisionPoints = state.decisionPoints as
      | Array<{ position: number; prompt: string }>
      | undefined;

    if (!decisionPoints || decisionPoints.length === 0) {
      return;
    }

    try {
      const players = state.players as Record<string, Record<string, unknown>> | undefined;
      const currentPlayer = players?.[currentTurn];

      if (!currentPlayer) {
        return;
      }

      const playerName = (currentPlayer.name as string) || currentTurn;
      const position = currentPlayer.position as number | undefined;

      if (typeof position !== "number") {
        return;
      }

      const decisionPoint = decisionPoints.find((dp) => dp.position === position);
      if (!decisionPoint) {
        return;
      }

      const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
      const hasChoice = choices?.[String(position)] !== undefined;

      if (!hasChoice) {
        Logger.info(
          `Orchestrator enforcing decision point for ${playerName} at position ${position}`,
        );

        const newContext: ExecutionContext = { isNestedCall: true };

        await this.processTranscriptFn(
          `[SYSTEM: ${playerName} (${currentTurn}) is at position ${position} and MUST choose direction at fork before proceeding. Ask them: "${playerName}, ${decisionPoint.prompt}"]`,
          newContext,
        );
      }
    } catch (error) {
      Logger.error("Error enforcing decision points:", error);
    }
  }
}
