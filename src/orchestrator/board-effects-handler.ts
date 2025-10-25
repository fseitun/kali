import type { StateManager } from "../state-manager";
import { Logger } from "../utils/logger";
import type { ExecutionContext } from "./types";

/**
 * Handles automatic board mechanics and square-based effects.
 *
 * Responsibilities:
 * - Auto-apply board moves (snakes, ladders, portals)
 * - Trigger square-specific effects via LLM processing
 *
 * Note: Currently contains game-specific logic for Snakes & Ladders and Kalimba.
 * Future work will move this to game config hooks for true game-agnostic orchestrator.
 */
export class BoardEffectsHandler {
  private isProcessingSquareEffect = false;

  constructor(
    private stateManager: StateManager,
    private processTranscriptFn: (
      transcript: string,
      context: ExecutionContext,
    ) => Promise<boolean>,
  ) {}

  /**
   * Checks if currently processing a square effect.
   * Used by turn manager to block turn advancement during effect resolution.
   * @returns true if processing effect, false otherwise
   */
  isProcessingEffect(): boolean {
    return this.isProcessingSquareEffect;
  }

  /**
   * Automatically applies board moves (snakes/ladders) after position changes.
   * Reads board.moves config and silently applies destination changes.
   *
   * @param path - State path that was mutated
   */
  async checkAndApplyBoardMoves(path: string): Promise<void> {
    if (!path.endsWith(".position") || !path.startsWith("players.")) {
      return;
    }

    const position = this.stateManager.get(path) as number;

    if (typeof position !== "number") {
      return;
    }

    const state = this.stateManager.getState();
    const board = state.board as Record<string, unknown> | undefined;
    const moves = board?.moves as Record<string, number> | undefined;

    if (!moves) {
      return;
    }

    const destination = moves[position.toString()];
    if (destination !== undefined && destination !== position) {
      const isLadder = destination > position;
      const moveType = isLadder ? "ladder" : "snake";
      Logger.info(
        `🎲 Auto-applying ${moveType}: position ${position} → ${destination}`,
      );
      this.stateManager.set(path, destination);
    }
  }

  /**
   * Triggers square-specific effects when player lands on special squares.
   * Reads board.squares config and injects LLM processing for effects.
   *
   * @param path - State path that was mutated
   * @param context - Execution context for depth tracking
   */
  async checkAndApplySquareEffects(
    path: string,
    context: ExecutionContext,
  ): Promise<void> {
    if (!path.endsWith(".position") || !path.startsWith("players.")) {
      return;
    }

    if (context.depth >= context.maxDepth - 1) {
      Logger.warn("Skipping square effect check: max depth approaching");
      return;
    }

    const position = this.stateManager.get(path) as number;

    if (typeof position !== "number") {
      return;
    }

    const state = this.stateManager.getState();
    const board = state.board as Record<string, unknown> | undefined;
    const squares = board?.squares as
      | Record<string, Record<string, unknown>>
      | undefined;

    if (!squares) {
      return;
    }

    const squareData = squares[position.toString()];
    if (squareData && Object.keys(squareData).length > 0) {
      const squareType = squareData.type as string;
      const squareName = (squareData.name as string) || "unknown";

      Logger.info(
        `🎯 Orchestrator enforcing square effect at position ${position}: ${squareType} (${squareName})`,
      );

      const newContext: ExecutionContext = {
        depth: context.depth + 1,
        maxDepth: context.maxDepth,
      };

      const squareInfo = JSON.stringify(squareData);

      this.isProcessingSquareEffect = true;
      try {
        await this.processTranscriptFn(
          `[SYSTEM: Current player just landed on square ${position}. Square data: ${squareInfo}. You MUST process this square's effect now according to game rules.]`,
          newContext,
        );
      } finally {
        this.isProcessingSquareEffect = false;
      }
    }
  }
}
