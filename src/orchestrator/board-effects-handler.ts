import { getSquareKind, isAnimalEncounterKind, isDeferredRewardKind } from "./square-types";
import type { ExecutionContext } from "./types";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

/**
 * Handles automatic board mechanics and square-based effects for Kalimba.
 *
 * Responsibilities:
 * - Auto-apply board moves (board.moves: portals, path merge)
 * - Magic door bounce (overshooting 186)
 * - Apply deterministic square effects from config (points, hearts, skipTurn, item, instrument)
 * - Trigger LLM for narration only (no game-rule state from LLM)
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
      Logger.info(`Auto-applying ${moveType}: position ${position} → ${destination}`);
      this.stateManager.set(path, destination);
    }

    // Magic door bounce (Kalimba): overshooting 186 bounces back
    const finalPosition = this.stateManager.get(path) as number;
    const magicDoor = board?.magicDoorPosition as number | undefined;
    const winPosition = board?.winPosition as number | undefined;
    if (
      typeof magicDoor === "number" &&
      typeof winPosition === "number" &&
      finalPosition > magicDoor &&
      finalPosition < winPosition
    ) {
      const bounceTo = magicDoor - (finalPosition - magicDoor);
      Logger.info(
        `Magic door bounce: overshot ${finalPosition} (door ${magicDoor}), bouncing to ${bounceTo}`,
      );
      this.stateManager.set(path, bounceTo);
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

    const kind = getSquareKind(squareData);
    const deferRewards = isDeferredRewardKind(kind);

    const applied: string[] = [];

    if (!deferRewards) {
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

      const instrument = squareData.instrument as string | undefined;
      if (typeof instrument === "string" && instrument.length > 0) {
        const current =
          (this.stateManager.get(`players.${playerId}.instruments`) as unknown[]) ?? [];
        const next = Array.isArray(current) ? [...current, instrument] : [instrument];
        this.stateManager.set(`players.${playerId}.instruments`, next);
        applied.push(`instrument: ${instrument}`);
      }
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

    return applied;
  }

  /**
   * Applies deterministic square effects from config, then triggers LLM for narration only.
   * Reads board.squares config; orchestrator owns all state mutations for game rules.
   *
   * @param path - State path that was mutated
   * @param context - Execution context
   */
  async checkAndApplySquareEffects(path: string, _context: ExecutionContext): Promise<void> {
    if (!path.endsWith(".position") || !path.startsWith("players.")) {
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
    if (!squareData || squareData.type === "empty" || Object.keys(squareData).length === 0) {
      Logger.info(`No square config for position ${position}, skipping effects`);
      return;
    }

    const kind = getSquareKind(squareData);
    const squareName = (squareData.name as string) || "unknown";
    const match = path.match(/^players\.([^.]+)\.position$/);
    const playerId = match?.[1] ?? "";
    const power = (squareData.power as number) ?? 0;

    Logger.info(
      `🎯 Orchestrator enforcing square effect at position ${position}: ${kind ?? "unknown"} (${squareName})`,
    );

    if (isAnimalEncounterKind(kind) && playerId) {
      this.stateManager.set("game.pendingAnimalEncounter", {
        position,
        power,
        playerId,
        phase: "riddle",
      });
    }

    const applied = this.applyDeterministicSquareEffects(path, squareData);
    const appliedText = applied.length > 0 ? ` Orchestrator applied: ${applied.join(", ")}.` : "";

    const newContext: ExecutionContext = { isNestedCall: true };

    const squareInfo = JSON.stringify(squareData);
    let transcript: string;
    if (isAnimalEncounterKind(kind)) {
      transcript =
        `[SYSTEM: Current player just landed on animal square ${position} (${squareName}, power ${power}). ` +
        `phase=riddle. Ask a riddle with exactly FOUR options. The riddle MUST be about the animal kingdom (e.g. animals, habitats, behavior, diet, classification); it does NOT have to be this square's animal or habitat. ` +
        `Return ASK_RIDDLE with "text", "options" (array of 4 strings), "correctOption" (exact text of the correct option), optionally "correctOptionSynonyms" (array of strings). Then NARRATE the same riddle and options for the user. ` +
        `When the user answers, return PLAYER_ANSWERED with what they said (option text or paraphrase). ` +
        `When phase is powerCheck or revenge, user reports roll → use PLAYER_ANSWERED with the number. Orchestrator owns all phase transitions and rewards. ` +
        `Square data (for flavour only): ${squareInfo}]`;
    } else {
      transcript =
        applied.length > 0
          ? `[SYSTEM: Current player just landed on square ${position} (${squareName}).${appliedText} Narrate this encounter. Square data for flavour: ${squareInfo}]`
          : `[SYSTEM: Current player just landed on square ${position} (${squareName}). Narrate this encounter. Do not change game state. Square data for flavour: ${squareInfo}]`;
      this.stateManager.set("game.pendingAnimalEncounter", null);
    }

    this.isProcessingSquareEffect = true;
    try {
      await this.processTranscriptFn(transcript, newContext);
    } finally {
      this.isProcessingSquareEffect = false;
    }
  }
}
