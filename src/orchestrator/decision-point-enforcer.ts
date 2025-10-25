import type { StateManager } from "../state-manager";
import { Logger } from "../utils/logger";
import type { ExecutionContext } from "./types";

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
   * @param context - Execution context for depth tracking
   */
  async enforceDecisionPoints(context: ExecutionContext): Promise<void> {
    if (context.depth >= context.maxDepth - 1) {
      Logger.warn("Skipping decision point check: max depth approaching");
      return;
    }

    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;

    if (!currentTurn) {
      return;
    }

    const decisionPoints = state.decisionPoints as
      | Array<{
          position: number;
          requiredField: string;
          prompt: string;
        }>
      | undefined;

    if (!decisionPoints || decisionPoints.length === 0) {
      return;
    }

    try {
      const players = state.players as
        | Record<string, Record<string, unknown>>
        | undefined;
      const currentPlayer = players?.[currentTurn];

      if (!currentPlayer) {
        return;
      }

      const playerName = (currentPlayer.name as string) || currentTurn;
      const position = currentPlayer.position as number | undefined;

      if (typeof position !== "number") {
        return;
      }

      const decisionPoint = decisionPoints.find(
        (dp) => dp.position === position,
      );
      if (!decisionPoint) {
        return;
      }

      const fieldValue = currentPlayer[decisionPoint.requiredField];
      if (fieldValue === null || fieldValue === undefined) {
        Logger.info(
          `⚠️ Orchestrator enforcing decision point for ${playerName} at position ${position}: ${decisionPoint.requiredField}`,
        );

        const newContext: ExecutionContext = {
          depth: context.depth + 1,
          maxDepth: context.maxDepth,
        };

        await this.processTranscriptFn(
          `[SYSTEM: ${playerName} (${currentTurn}) is at position ${position} and MUST choose '${decisionPoint.requiredField}' before proceeding. Ask them: "${decisionPoint.prompt}"]`,
          newContext,
        );
      }
    } catch (error) {
      Logger.error("Error enforcing decision points:", error);
    }
  }
}
