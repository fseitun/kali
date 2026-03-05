import type { StateManager } from "../state-manager";
import { Logger } from "../utils/logger";
import type { ExecutionContext } from "./types";

/**
 * Handles automatic board mechanics and square-based effects.
 *
 * Responsibilities:
 * - Auto-apply board moves (snakes, ladders, portals)
 * - Apply deterministic square effects from config (points, hearts, skipTurn, item, instrument)
 * - Trigger LLM for narration only (no game-rule state from LLM)
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
      Logger.info(`🎲 Auto-applying ${moveType}: position ${position} → ${destination}`);
      this.stateManager.set(path, destination);
    }
  }

  /**
   * Applies deterministic square effects from config (points, heart, skipTurn, item, instrument).
   * Mutates state for the current player only. Used before asking LLM to narrate.
   *
   * @param path - State path that was mutated (e.g. players.p1.position)
   * @param squareData - Square config from board.squares[position]
   * @returns Summary of applied effects for narration prompt
   */
  private applyDeterministicSquareEffects(
    path: string,
    squareData: Record<string, unknown>,
  ): string[] {
    const match = path.match(/^players\.([^.]+)\.position$/);
    const playerId = match?.[1];
    if (!playerId) {
      return [];
    }

    const applied: string[] = [];

    const points = squareData.points as number | undefined;
    if (typeof points === "number" && points > 0) {
      const current = (this.stateManager.get(`players.${playerId}.points`) as number) ?? 0;
      const next = current + points;
      this.stateManager.set(`players.${playerId}.points`, next);
      applied.push(`+${points} points`);
    }

    if (squareData.heart === true) {
      const current = (this.stateManager.get(`players.${playerId}.hearts`) as number) ?? 0;
      this.stateManager.set(`players.${playerId}.hearts`, current + 1);
      applied.push("+1 heart");
    }

    if (squareData.effect === "skipTurn") {
      const current = (this.stateManager.get(`players.${playerId}.skipTurns`) as number) ?? 0;
      this.stateManager.set(`players.${playerId}.skipTurns`, current + 1);
      applied.push("skip next turn");
    }

    const item = squareData.item as string | undefined;
    if (typeof item === "string" && item.length > 0) {
      const current = (this.stateManager.get(`players.${playerId}.items`) as unknown[]) ?? [];
      const next = Array.isArray(current) ? [...current, item] : [item];
      this.stateManager.set(`players.${playerId}.items`, next);
      applied.push(`item: ${item}`);
    }

    const instrument = squareData.instrument as string | undefined;
    if (typeof instrument === "string" && instrument.length > 0) {
      const current = (this.stateManager.get(`players.${playerId}.instruments`) as unknown[]) ?? [];
      const next = Array.isArray(current) ? [...current, instrument] : [instrument];
      this.stateManager.set(`players.${playerId}.instruments`, next);
      applied.push(`instrument: ${instrument}`);
    }

    return applied;
  }

  /**
   * Applies deterministic square effects from config, then triggers LLM for narration only.
   * Reads board.squares config; orchestrator owns all state mutations for game rules.
   *
   * @param path - State path that was mutated
   * @param context - Execution context for depth tracking
   */
  async checkAndApplySquareEffects(path: string, context: ExecutionContext): Promise<void> {
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
    const squares = board?.squares as Record<string, Record<string, unknown>> | undefined;

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

      const applied = this.applyDeterministicSquareEffects(path, squareData);
      const appliedText = applied.length > 0 ? ` Orchestrator applied: ${applied.join(", ")}.` : "";

      const newContext: ExecutionContext = {
        depth: context.depth + 1,
        maxDepth: context.maxDepth,
      };

      const squareInfo = JSON.stringify(squareData);
      const transcript =
        applied.length > 0
          ? `[SYSTEM: Current player just landed on square ${position} (${squareName}).${appliedText} Narrate this encounter. Square data for flavour: ${squareInfo}]`
          : `[SYSTEM: Current player just landed on square ${position}. Square data: ${squareInfo}. You MUST process this square's effect now according to game rules.]`;

      this.isProcessingSquareEffect = true;
      try {
        await this.processTranscriptFn(transcript, newContext);
      } finally {
        this.isProcessingSquareEffect = false;
      }
    }
  }
}
