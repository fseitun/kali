import { getPendingForkPromptIfAny, hasMovementForkBlockingPlay } from "./fork-roll-policy";
import { hasPendingForCurrentTurn } from "./pending-types";
import type { GameState, NextPlayer } from "./types";
import { GamePhase } from "./types";
import type { StateManager } from "@/state-manager";
import { GAME_PATH, playerStatePath, STATE_PLAYERS_PREFIX } from "@/state-paths";
import { Logger } from "@/utils/logger";

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
    const state = this.stateManager.getState() as GameState;
    try {
      return getPendingForkPromptIfAny(state);
    } catch (error) {
      Logger.error("Error getting pending decision prompt:", error);
      return null;
    }
  }

  /**
   * Checks if there is pending state (riddle, powerCheck, revenge, directional) that blocks turn advancement.
   * @returns true if game.pending is set for the current player
   */
  hasPendingForCurrentTurn(): boolean {
    const state = this.stateManager.getState();
    return hasPendingForCurrentTurn(state);
  }

  /**
   * Checks if the current player has pending decisions that must be resolved.
   * @returns true if there are unresolved decisions, false otherwise
   */
  hasPendingDecisions(): boolean {
    const state = this.stateManager.getState() as GameState;
    try {
      return hasMovementForkBlockingPlay(state);
    } catch (error) {
      Logger.error("Error checking pending decisions:", error);
      return false;
    }
  }

  /**
   * Advances to the next player's turn with automatic blocking.
   *
   * Blocks advancement if:
   * - Current player has pending decisions
   * - Game has a winner
   * - Game is not in PLAYING phase
   *
   * If the next player has skipTurns > 0, consumes one skip and advances again.
   * Returns skippedPlayers (in order) so the app can announce each skipped player.
   *
   * AUTHORITY: Only the turn manager (via orchestrator) can advance turns.
   *
   * @returns The next player's ID and details, or null if unable to advance. Includes skippedPlayers (all skipped in order).
   */
  private canAdvanceTurn(game: Record<string, unknown>): string | null {
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
    if (this.hasPendingDecisions()) {
      Logger.info("Turn advancement blocked: current player has pending decisions");
      return null;
    }
    if (this.hasPendingForCurrentTurn()) {
      Logger.info(
        "Turn advancement blocked: pending state (riddle/powerCheck/revenge/directional/completeRollMovement)",
      );
      return null;
    }
    return currentTurn;
  }

  /**
   * Walks forward from `currentTurn`, consuming one `skipTurns` from every player it passes,
   * until it reaches a player who is not skipping. Shared by both advancement paths so a run
   * of consecutive skippers is fully consumed and every skipped player is reported.
   */
  private readPlayerTurnInfo(
    players: Record<string, Record<string, unknown>>,
    playerId: string,
  ): { name: string; position: number; skipTurns: number } {
    const player = players[playerId];
    const skipTurns = player?.skipTurns;
    // Clamped at read: SET_STATE can write any player field, and a negative or fractional
    // skipTurns would shrink the step budget below the turns the wheel needs, throwing.
    const skips =
      typeof skipTurns === "number" && Number.isFinite(skipTurns)
        ? Math.max(0, Math.trunc(skipTurns))
        : 0;
    return {
      name: (player?.name as string) || playerId,
      position: (player?.position as number) ?? 0,
      skipTurns: skips,
    };
  }

  private resolveNextPlayerConsumingSkips(
    players: Record<string, Record<string, unknown>>,
    playerOrder: string[],
    currentTurn: string,
  ): NextPlayer {
    const skippedPlayers: Array<{ playerId: string; name: string }> = [];
    // `players` is a snapshot taken before the loop, so spent skips are tracked here rather than
    // re-read: a player the wheel passes twice must not spend the same skip twice.
    const spent = new Map<string, number>();
    // Every step either returns or spends one skip, so the wheel can turn at most once per
    // outstanding skip plus once more to reach whoever plays.
    const steps =
      playerOrder.reduce((total, id) => total + this.readPlayerTurnInfo(players, id).skipTurns, 0) +
      1;
    let index = playerOrder.indexOf(currentTurn);

    for (let step = 0; step < steps; step++) {
      index = (index + 1) % playerOrder.length;
      const playerId = playerOrder[index];
      const { name, position, skipTurns } = this.readPlayerTurnInfo(players, playerId);
      const remaining = skipTurns - (spent.get(playerId) ?? 0);
      if (remaining <= 0) {
        return { playerId, name, position, skippedPlayers };
      }
      spent.set(playerId, (spent.get(playerId) ?? 0) + 1);
      this.stateManager.set(playerStatePath(playerId, "skipTurns"), remaining - 1);
      Logger.info(`⏭️ Skipping ${name} (had ${remaining} skip(s), now ${remaining - 1})`);
      skippedPlayers.push({ playerId, name });
    }

    // Unreachable: the last step always meets a player with nothing left to spend. Throwing beats
    // handing the turn to someone who still owes a skip — the bug this bound replaced.
    throw new Error("Turn advancement exhausted its skip budget without finding a player to play");
  }

  async advanceTurn(): Promise<NextPlayer | null> {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    if (!game || !players) {
      return null;
    }

    const currentTurn = this.canAdvanceTurn(game);
    if (!currentTurn) {
      return null;
    }

    const playerOrder = game.playerOrder as string[] | undefined;
    if (!playerOrder) {
      return null;
    }

    try {
      const next = this.resolveNextPlayerConsumingSkips(players, playerOrder, currentTurn);
      Logger.info(`Auto-advancing turn: ${currentTurn} → ${next.playerId}`);
      this.stateManager.set(GAME_PATH.turn, next.playerId);
      this.restoreParkedRevenge(next.playerId);
      return next;
    } catch (error) {
      Logger.error("Failed to auto-advance turn:", error);
      return null;
    }
  }

  /**
   * Mechanical turn advance: find next player, consume skipTurns, set game.turn.
   * No guards (phase, winner, pending decisions, pending encounter). Used when
   * the caller has already cleared blockers (e.g. power-check lose).
   * @returns Next player details, or null if advance not possible
   */
  advanceTurnMechanical(): NextPlayer | null {
    const state = this.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const players = state.players as Record<string, Record<string, unknown>> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const playerOrder = game?.playerOrder as string[] | undefined;

    if (!game || !players || !currentTurn || !playerOrder?.length) {
      return null;
    }

    const next = this.resolveNextPlayerConsumingSkips(players, playerOrder, currentTurn);
    this.stateManager.set(GAME_PATH.turn, next.playerId);
    this.restoreParkedRevenge(next.playerId);
    return next;
  }

  /**
   * Puts a parked revenge (Kalimba §2C) back in `game.pending` when its owner's turn comes round.
   *
   * The global slot is whatever the player in turn owes, so an opponent's riddle or directional
   * roll overwrites it while the revenge waits. Restore only — never clear — so the losing player
   * keeps the revenge visible in `game.pending` for the rest of the turn they lost it on.
   */
  private restoreParkedRevenge(playerId: string): void {
    const parked = this.stateManager.get(playerStatePath(playerId, "pendingRevenge"));
    if (parked) {
      this.stateManager.set(GAME_PATH.pending, parked);
    }
  }

  /**
   * Validates that a state mutation targets the current turn's player.
   *
   * @param path - State path being mutated (e.g., "players.p1.position")
   * @throws Error if mutation targets wrong player
   */
  async assertPlayerTurnOwnership(path: string): Promise<void> {
    if (!path.startsWith(STATE_PLAYERS_PREFIX)) {
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
