import { getEnforceableForkContext } from "./fork-roll-policy";
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
    try {
      const state = this.stateManager.getState();
      const info = getEnforceableForkContext(state);
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
