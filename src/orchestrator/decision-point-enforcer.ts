import { getEnforceableForkContext } from "./fork-roll-policy";
import { shouldDeferForkPromptForPendingEncounter } from "./pending-types";
import type { ExecutionContext } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { t } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

/**
 * Enforces decision point requirements in game flow.
 *
 * Responsibilities:
 * - Check if current player is at a decision point
 * - Verify required fields are filled
 * - Speak the fork prompt directly (no LLM round-trip)
 */
export class DecisionPointEnforcer {
  constructor(
    private stateManager: StateManager,
    private speechService: ISpeechService,
    private statusIndicator: IStatusIndicator,
    private setLastNarration: (text: string) => void,
  ) {}

  /**
   * Enforces decision points for current player.
   * If player is at a decision point and hasn't filled required field,
   * speaks the configured fork prompt via TTS.
   *
   * @param context - Execution context
   */
  async enforceDecisionPoints(_context: ExecutionContext): Promise<void> {
    try {
      const state = this.stateManager.getState();
      if (shouldDeferForkPromptForPendingEncounter(state)) {
        return;
      }
      const info = getEnforceableForkContext(state);
      if (!info) {
        return;
      }

      const { playerName, position, decisionPoint } = info;
      Logger.info(
        `Orchestrator enforcing decision point for ${playerName} at position ${position}`,
      );
      const text = t("game.forkChoiceAsk", { name: playerName, prompt: decisionPoint.prompt });
      this.setLastNarration(text);
      this.statusIndicator.setState("speaking");
      await this.speechService.speak(text);
    } catch (error) {
      Logger.error("Error enforcing decision points:", error);
    }
  }
}
