import { getEnforceableForkContext } from "./fork-roll-policy";
import { GamePhase } from "./types";
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
   * Only while play is running: outside PLAYING the "current player" is a template
   * (`Player 1` at position 0 after a reset to SETUP), and asking it which way to go
   * is a question nobody at the table can answer.
   */
  async enforceDecisionPoints(): Promise<void> {
    try {
      const state = this.stateManager.getState();
      if (state.game?.phase !== GamePhase.PLAYING) {
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
