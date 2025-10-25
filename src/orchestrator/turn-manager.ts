import type { StateManager } from "../state-manager";
import { Logger } from "../utils/logger";
import { GamePhase } from "./types";

/**
 * Manages turn-based gameplay mechanics.
 *
 * Responsibilities:
 * - Check if current player has pending decisions
 * - Advance turn to next player with appropriate blocking
 * - Validate turn ownership for state mutations
 *
 * Authority: Part of the orchestrator subsystem. All turn state
 * mutations go through this manager, but orchestrator coordinates overall flow.
 */
export class TurnManager {
  constructor(private stateManager: StateManager) {}

  /**
   * Checks if the current player has pending decisions that must be resolved.
   * @returns true if there are unresolved decisions, false otherwise
   */
  hasPendingDecisions(): boolean {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;

    if (!currentTurn) {
      return false;
    }

    const decisionPoints = state.decisionPoints as
      | Array<{
          position: number;
          requiredField: string;
          prompt: string;
        }>
      | undefined;

    if (!decisionPoints || decisionPoints.length === 0) {
      return false;
    }

    try {
      const players = state.players as
        | Record<string, Record<string, unknown>>
        | undefined;
      const currentPlayer = players?.[currentTurn];

      if (!currentPlayer) {
        return false;
      }

      const position = currentPlayer.position as number | undefined;

      if (typeof position !== "number") {
        return false;
      }

      const decisionPoint = decisionPoints.find(
        (dp) => dp.position === position,
      );
      if (!decisionPoint) {
        return false;
      }

      const fieldValue = currentPlayer[decisionPoint.requiredField];
      return fieldValue === null || fieldValue === undefined;
    } catch (error) {
      Logger.error("Error checking pending decisions:", error);
      return false;
    }
  }

  /**
   * Advances to the next player's turn with automatic blocking.
   *
   * Blocks advancement if:
   * - Square effect is being processed
   * - Current player has pending decisions
   * - Game has a winner
   * - Game is not in PLAYING phase
   *
   * AUTHORITY: Only the turn manager (via orchestrator) can advance turns.
   *
   * @param isProcessingSquareEffect - Flag indicating if square effect is currently being processed
   * @returns The next player's ID and details, or null if unable to advance
   */
  async advanceTurn(
    isProcessingSquareEffect: boolean,
  ): Promise<{ playerId: string; name: string; position: number } | null> {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as
      | Record<string, Record<string, unknown>>
      | undefined;

    if (!game || !players) {
      return null;
    }

    const currentTurn = game.turn as string | undefined;
    const winner = game.winner as string | undefined;
    const phase = game.phase as string | undefined;
    const playerOrder = game.playerOrder as string[] | undefined;

    if (phase !== GamePhase.PLAYING) {
      return null;
    }

    if (winner) {
      Logger.info("Game has winner, not advancing turn");
      return null;
    }

    if (!currentTurn) {
      Logger.warn("No current turn set, cannot advance");
      return null;
    }

    if (!playerOrder || playerOrder.length === 0) {
      Logger.warn("No playerOrder set, cannot advance");
      return null;
    }

    if (isProcessingSquareEffect) {
      Logger.info("⏸️ Turn advancement blocked: square effect being processed");
      return null;
    }

    if (this.hasPendingDecisions()) {
      Logger.info(
        "⏸️ Turn advancement blocked: current player has pending decisions",
      );
      return null;
    }

    try {
      const currentIndex = playerOrder.indexOf(currentTurn);
      const nextIndex = (currentIndex + 1) % playerOrder.length;
      const nextPlayerId = playerOrder[nextIndex];
      const nextPlayer = players[nextPlayerId];

      Logger.info(`🔄 Auto-advancing turn: ${currentTurn} → ${nextPlayerId}`);
      this.stateManager.set("game.turn", nextPlayerId);

      const nextPlayerName = (nextPlayer?.name as string) || nextPlayerId;
      const nextPlayerPosition = (nextPlayer?.position as number) || 0;

      return {
        playerId: nextPlayerId,
        name: nextPlayerName,
        position: nextPlayerPosition,
      };
    } catch (error) {
      Logger.error("Failed to auto-advance turn:", error);
      return null;
    }
  }

  /**
   * Validates that a state mutation targets the current turn's player.
   *
   * @param path - State path being mutated (e.g., "players.p1.position")
   * @throws Error if mutation targets wrong player
   */
  async assertPlayerTurnOwnership(path: string): Promise<void> {
    if (!path.startsWith("players.")) {
      return;
    }

    const parts = path.split(".");
    if (parts.length < 2) {
      return;
    }

    const playerId = parts[1];
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;

    if (!currentTurn) {
      return;
    }

    if (playerId !== currentTurn) {
      throw new Error(
        `Turn ownership violation: Cannot modify players.${playerId} when it's ${currentTurn}'s turn. ` +
          `This should have been caught by the validator - indicates a bug in validation logic.`,
      );
    }
  }
}
