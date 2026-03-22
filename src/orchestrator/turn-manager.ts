import { getDecisionPoints } from "./decision-point-inference";
import type { DecisionPoint } from "./types";
import { GamePhase } from "./types";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

function getPendingDecisionPromptAt(
  decisionPoints: DecisionPoint[],
  position: number,
  activeChoices: Record<string, number> | undefined,
): string | null {
  const decisionPoint = decisionPoints.find((dp) => dp.position === position);
  if (!decisionPoint) {
    return null;
  }
  const hasChoice = activeChoices?.[String(position)] !== undefined;
  return hasChoice ? null : decisionPoint.prompt;
}

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
   * Returns the prompt for the current player's pending decision, if any.
   * Used to include decision prompts (e.g. path choice) in turn announcements.
   * @returns The decision prompt string, or null if no pending decision
   */
  getPendingDecisionPrompt(): string | null {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    if (!currentTurn) {
      return null;
    }

    const decisionPoints = getDecisionPoints(state);
    if (decisionPoints.length === 0) {
      return null;
    }

    try {
      const players = state.players as Record<string, Record<string, unknown>> | undefined;
      const currentPlayer = players?.[currentTurn];
      if (!currentPlayer) {
        return null;
      }

      const position = currentPlayer.position as number | undefined;
      if (typeof position !== "number") {
        return null;
      }

      const activeChoices = currentPlayer.activeChoices as Record<string, number> | undefined;
      return getPendingDecisionPromptAt(decisionPoints, position, activeChoices);
    } catch (error) {
      Logger.error("Error getting pending decision prompt:", error);
      return null;
    }
  }

  /**
   * Checks if there is a pending animal encounter that blocks turn advancement.
   * @returns true if game.pendingAnimalEncounter is set for the current player
   */
  hasPendingAnimalEncounter(): boolean {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const pending = game?.pendingAnimalEncounter as { playerId: string } | null | undefined;

    if (!currentTurn || !pending || typeof pending !== "object") {
      return false;
    }
    return pending.playerId === currentTurn;
  }

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

    const decisionPoints = getDecisionPoints(state);

    if (decisionPoints.length === 0) {
      return false;
    }

    try {
      const players = state.players as Record<string, Record<string, unknown>> | undefined;
      const currentPlayer = players?.[currentTurn];

      if (!currentPlayer) {
        return false;
      }

      const position = currentPlayer.position as number | undefined;

      if (typeof position !== "number") {
        return false;
      }

      const decisionPoint = decisionPoints.find((dp) => dp.position === position);
      if (!decisionPoint) {
        return false;
      }

      const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
      const hasChoice = choices?.[String(position)] !== undefined;
      return !hasChoice;
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
   * If the next player has skipTurns > 0, consumes one skip and advances again.
   * Returns skippedPlayers (in order) so the app can announce each skipped player.
   *
   * AUTHORITY: Only the turn manager (via orchestrator) can advance turns.
   *
   * @param isProcessingSquareEffect - Flag indicating if square effect is currently being processed
   * @returns The next player's ID and details, or null if unable to advance. Includes skippedPlayers (all skipped in order).
   */
  private canAdvanceTurn(
    game: Record<string, unknown>,
    isProcessingSquareEffect: boolean,
  ): string | null {
    const phase = game.phase as string | undefined;
    if (phase !== GamePhase.PLAYING) {
      return null;
    }
    if (game.winner) {
      Logger.info("Game has winner, not advancing turn");
      return null;
    }
    const currentTurn = game.turn as string | undefined;
    if (!currentTurn) {
      Logger.warn("No current turn set, cannot advance");
      return null;
    }
    const playerOrder = game.playerOrder as string[] | undefined;
    if (!playerOrder || playerOrder.length === 0) {
      Logger.warn("No playerOrder set, cannot advance");
      return null;
    }
    if (isProcessingSquareEffect) {
      Logger.info("Turn advancement blocked: square effect being processed");
      return null;
    }
    if (this.hasPendingDecisions()) {
      Logger.info("Turn advancement blocked: current player has pending decisions");
      return null;
    }
    if (this.hasPendingAnimalEncounter()) {
      Logger.info("Turn advancement blocked: pending animal encounter");
      return null;
    }
    return currentTurn;
  }

  private async advanceTurnWithSkips(
    nextPlayerId: string,
    nextPlayer: Record<string, unknown> | undefined,
    nextPlayerName: string,
    skipTurns: number,
    isProcessingSquareEffect: boolean,
  ): Promise<{
    playerId: string;
    name: string;
    position: number;
    skippedPlayers: Array<{ playerId: string; name: string }>;
  }> {
    this.stateManager.set(`players.${nextPlayerId}.skipTurns`, skipTurns - 1);
    Logger.info(`⏭️ Skipping ${nextPlayerName} (had ${skipTurns} skip(s), now ${skipTurns - 1})`);
    this.stateManager.set("game.turn", nextPlayerId);
    const currentSkipped = { playerId: nextPlayerId, name: nextPlayerName };
    const afterSkipped = await this.advanceTurn(isProcessingSquareEffect);
    if (afterSkipped) {
      return {
        ...afterSkipped,
        skippedPlayers: [currentSkipped, ...afterSkipped.skippedPlayers],
      };
    }
    return {
      playerId: nextPlayerId,
      name: nextPlayerName,
      position: (nextPlayer?.position as number) || 0,
      skippedPlayers: [currentSkipped],
    };
  }

  private getNextPlayerInfo(
    players: Record<string, Record<string, unknown>>,
    playerOrder: string[],
    currentTurn: string,
  ): {
    nextPlayerId: string;
    nextPlayer: Record<string, unknown> | undefined;
    nextPlayerName: string;
    skipTurns: number;
  } {
    const currentIndex = playerOrder.indexOf(currentTurn);
    const nextIndex = (currentIndex + 1) % playerOrder.length;
    const nextPlayerId = playerOrder[nextIndex];
    const nextPlayer = players[nextPlayerId];
    const nextPlayerName = (nextPlayer?.name as string) || nextPlayerId;
    const skipTurns = (nextPlayer?.skipTurns as number) ?? 0;
    return { nextPlayerId, nextPlayer, nextPlayerName, skipTurns };
  }

  async advanceTurn(isProcessingSquareEffect: boolean): Promise<{
    playerId: string;
    name: string;
    position: number;
    skippedPlayers: Array<{ playerId: string; name: string }>;
  } | null> {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    if (!game || !players) {
      return null;
    }

    const currentTurn = this.canAdvanceTurn(game, isProcessingSquareEffect);
    if (!currentTurn) {
      return null;
    }

    const playerOrder = game.playerOrder as string[] | undefined;
    if (!playerOrder) {
      return null;
    }

    const nextInfo = this.getNextPlayerInfo(players, playerOrder, currentTurn);

    try {
      const { nextPlayerId, nextPlayer, nextPlayerName, skipTurns } = nextInfo;

      if (skipTurns > 0) {
        return this.advanceTurnWithSkips(
          nextPlayerId,
          nextPlayer,
          nextPlayerName,
          skipTurns,
          isProcessingSquareEffect,
        );
      }

      Logger.info(`Auto-advancing turn: ${currentTurn} → ${nextPlayerId}`);
      this.stateManager.set("game.turn", nextPlayerId);

      const nextPlayerPosition = (nextPlayer?.position as number) || 0;

      return {
        playerId: nextPlayerId,
        name: nextPlayerName,
        position: nextPlayerPosition,
        skippedPlayers: [],
      };
    } catch (error) {
      Logger.error("Failed to auto-advance turn:", error);
      return null;
    }
  }

  private applySkipTurns(
    players: Record<string, Record<string, unknown>>,
    playerOrder: string[],
    nextIndex: number,
  ): { nextPlayerId: string; nextPlayerName: string; nextPlayer: Record<string, unknown> } {
    let nextPlayerId = playerOrder[nextIndex];
    let nextPlayer = players[nextPlayerId];
    let nextPlayerName = (nextPlayer?.name as string) || nextPlayerId;
    const skipTurns = (nextPlayer?.skipTurns as number) ?? 0;
    if (skipTurns > 0) {
      this.stateManager.set(`players.${nextPlayerId}.skipTurns`, skipTurns - 1);
      Logger.info(`⏭️ Skipping ${nextPlayerName} (power check lose advance)`);
      const skipIndex = (nextIndex + 1) % playerOrder.length;
      nextPlayerId = playerOrder[skipIndex];
      nextPlayer = players[nextPlayerId];
      nextPlayerName = (nextPlayer?.name as string) || nextPlayerId;
    }
    return { nextPlayerId, nextPlayerName, nextPlayer };
  }

  /**
   * Mechanical turn advance: find next player, handle skipTurns, set game.turn.
   * No guards (phase, winner, pending decisions, pending encounter). Used when
   * the caller has already cleared blockers (e.g. power-check lose).
   * @returns Next player details, or null if advance not possible
   */
  advanceTurnMechanical(): {
    playerId: string;
    name: string;
    position: number;
  } | null {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const playerOrder = game?.playerOrder as string[] | undefined;

    if (!game || !players || !currentTurn || !playerOrder?.length) {
      return null;
    }

    const currentIndex = playerOrder.indexOf(currentTurn);
    const nextIndex = (currentIndex + 1) % playerOrder.length;
    const { nextPlayerId, nextPlayerName, nextPlayer } = this.applySkipTurns(
      players,
      playerOrder,
      nextIndex,
    );

    this.stateManager.set("game.turn", nextPlayerId);
    const position = (nextPlayer?.position as number) ?? 0;
    return { playerId: nextPlayerId, name: nextPlayerName, position };
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
