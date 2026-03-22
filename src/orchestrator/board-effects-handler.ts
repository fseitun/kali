import { findSquareByEffect, getWinPosition } from "./board-helpers";
import { getSquareKind, isAnimalEncounterKind, isDeferredRewardKind } from "./square-types";
import type { ExecutionContext } from "./types";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

/**
 * Handles automatic board mechanics and square-based effects for Kalimba.
 *
 * Responsibilities:
 * - Auto-apply teleports from squares (portals, returnTo187); skip backward when inverseMode
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
   * Applies teleports from squares (portals, returnTo187) after position changes.
   * Skips backward teleports when player has inverseMode.
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
    const squares = board?.squares as Record<string, Record<string, unknown>> | undefined;

    if (!squares) {
      return;
    }

    const squareData = squares[position.toString()];
    this.applyTeleportIfApplicable(path, position, squareData, state);

    // Magic door bounce (Kalimba): overshooting door bounces back
    const finalPosition = this.stateManager.get(path) as number;
    const magicDoorFound = findSquareByEffect(squares, "magicDoorCheck");
    const magicDoorPosition = magicDoorFound?.position;
    const winPosition = getWinPosition(squares);
    if (
      typeof magicDoorPosition === "number" &&
      finalPosition > magicDoorPosition &&
      finalPosition < winPosition
    ) {
      const bounceTo = magicDoorPosition - (finalPosition - magicDoorPosition);
      Logger.info(
        `Magic door bounce: overshot ${finalPosition} (door ${magicDoorPosition}), bouncing to ${bounceTo}`,
      );
      this.stateManager.set(path, bounceTo);
    }
  }

  /**
   * Applies teleport (portal, returnTo187, jumpToLeader) if applicable. Uses early returns.
   * Skips backward teleports when player has inverseMode.
   */
  private applyTeleportIfApplicable(
    path: string,
    position: number,
    squareData: Record<string, unknown> | undefined,
    state: {
      game?: Record<string, unknown>;
      players?: Record<string, Record<string, unknown>>;
    },
  ): void {
    if (!squareData) {
      return;
    }

    let destination: number | undefined;
    if (squareData.type === "portal" && typeof squareData.destination === "number") {
      destination = squareData.destination;
    } else if (squareData.effect === "returnTo187") {
      destination = 187;
    } else if (squareData.effect === "jumpToLeader") {
      const match = path.match(/^players\.([^.]+)\.position$/);
      const currentPlayerId = match?.[1];
      const playerOrder = state.game?.playerOrder as string[] | undefined;
      const players = state.players;
      if (currentPlayerId && Array.isArray(playerOrder) && players) {
        let leaderPosition = -1;
        for (const pid of playerOrder) {
          const pos = players[pid]?.position as number | undefined;
          if (typeof pos === "number" && pos > leaderPosition) {
            leaderPosition = pos;
          }
        }
        if (leaderPosition >= 0) {
          destination = leaderPosition;
        }
      }
    }

    if (destination === undefined || destination === position) {
      return;
    }

    const isBackward = destination < position;
    const match = path.match(/^players\.([^.]+)\.position$/);
    const playerId = match?.[1];
    const player = playerId
      ? (state.players as Record<string, Record<string, unknown>>)?.[playerId]
      : undefined;
    const inverseMode = !!player?.inverseMode;

    if (isBackward && inverseMode) {
      Logger.info(
        `Skipping backward teleport (inverseMode): position ${position} → ${destination}`,
      );
      return;
    }

    const moveType = isBackward ? "snake" : "ladder";
    Logger.info(`Auto-applying ${moveType}: position ${position} → ${destination}`);
    this.stateManager.set(path, destination);
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

    if (squareData.effect === "checkTorch") {
      const items = (this.stateManager.get(`players.${playerId}.items`) as unknown[]) ?? [];
      const idx = Array.isArray(items) ? items.indexOf("torch") : -1;
      if (idx >= 0) {
        const next = [...items];
        next.splice(idx, 1);
        this.stateManager.set(`players.${playerId}.items`, next);
        applied.push("torch used (no skip)");
      } else {
        const current = (this.stateManager.get(`players.${playerId}.skipTurns`) as number) ?? 0;
        this.stateManager.set(`players.${playerId}.skipTurns`, current + 1);
        applied.push("skip next turn (no torch)");
      }
    }

    if (squareData.effect === "checkAntiWasp") {
      const items = (this.stateManager.get(`players.${playerId}.items`) as unknown[]) ?? [];
      const idx = Array.isArray(items) ? items.indexOf("anti-wasp") : -1;
      if (idx >= 0) {
        const next = [...items];
        next.splice(idx, 1);
        this.stateManager.set(`players.${playerId}.items`, next);
        applied.push("anti-wasp used (no skip)");
      } else {
        const current = (this.stateManager.get(`players.${playerId}.skipTurns`) as number) ?? 0;
        this.stateManager.set(`players.${playerId}.skipTurns`, current + 1);
        applied.push("skip next turn (no anti-wasp)");
      }
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
  private isValidPositionPath(path: string): boolean {
    return path.endsWith(".position") && path.startsWith("players.");
  }

  private getSquareDataForPosition(position: number): {
    squares: Record<string, Record<string, unknown>>;
    squareData: Record<string, unknown>;
  } | null {
    const state = this.stateManager.getState();
    const board = state.board as Record<string, unknown> | undefined;
    const squares = board?.squares as Record<string, Record<string, unknown>> | undefined;
    if (!squares) {
      return null;
    }
    const squareData = squares[position.toString()];
    const isEmpty =
      !squareData || squareData.type === "empty" || Object.keys(squareData).length === 0;
    if (isEmpty) {
      Logger.info(`No square config for position ${position}, skipping effects`);
      return null;
    }
    return { squares, squareData };
  }

  private getSquareEffectParams(path: string): {
    position: number;
    squareData: Record<string, unknown>;
    squares: Record<string, Record<string, unknown>>;
    playerId: string;
    kind: ReturnType<typeof getSquareKind>;
    squareName: string;
    power: number;
  } | null {
    if (!this.isValidPositionPath(path)) {
      return null;
    }
    const position = this.stateManager.get(path) as number;
    if (typeof position !== "number") {
      return null;
    }
    const boardData = this.getSquareDataForPosition(position);
    if (!boardData) {
      return null;
    }
    const { squareData, squares } = boardData;
    const match = path.match(/^players\.([^.]+)\.position$/);
    const playerId = match?.[1] ?? "";
    const kind = getSquareKind(squareData);
    const squareName = (squareData.name as string) || "unknown";
    const power = (squareData.power as number) ?? 0;
    return { position, squareData, squares, playerId, kind, squareName, power };
  }

  private syncAnimalEncounterState(
    kind: ReturnType<typeof getSquareKind>,
    playerId: string,
    position: number,
    power: number,
    isSetup: boolean,
  ): void {
    if (isSetup && isAnimalEncounterKind(kind) && playerId) {
      this.stateManager.set("game.pendingAnimalEncounter", {
        position,
        power,
        playerId,
        phase: "riddle",
      });
    } else if (!isSetup && !isAnimalEncounterKind(kind)) {
      this.stateManager.set("game.pendingAnimalEncounter", null);
    }
  }

  private buildSquareEffectTranscript(
    kind: ReturnType<typeof getSquareKind>,
    position: number,
    squareName: string,
    power: number,
    applied: string[],
    squareInfo: string,
  ): string {
    const appliedText = applied.length > 0 ? ` Orchestrator applied: ${applied.join(", ")}.` : "";
    if (isAnimalEncounterKind(kind)) {
      return (
        `[SYSTEM: Current player just landed on animal square ${position} (${squareName}, power ${power}). ` +
        `phase=riddle. Ask a riddle with exactly FOUR options. The riddle MUST be about the animal kingdom (e.g. animals, habitats, behavior, diet, classification); it does NOT have to be this square's animal or habitat. ` +
        `Return ASK_RIDDLE with "text", "options" (array of 4 strings), "correctOption" (exact text of the correct option), optionally "correctOptionSynonyms" (array of strings). Then NARRATE the same riddle and options for the user. ` +
        `When the user answers, return PLAYER_ANSWERED with what they said (option text or paraphrase). ` +
        `When phase is powerCheck or revenge, user reports roll → use PLAYER_ANSWERED with the number. Orchestrator owns all phase transitions and rewards. ` +
        `Square data (for flavour only): ${squareInfo}]`
      );
    }
    return applied.length > 0
      ? `[SYSTEM: Current player just landed on square ${position} (${squareName}).${appliedText} Narrate this encounter. Square data for flavour: ${squareInfo}]`
      : `[SYSTEM: Current player just landed on square ${position} (${squareName}). Narrate this encounter. Do not change game state. Square data for flavour: ${squareInfo}]`;
  }

  async checkAndApplySquareEffects(path: string, _context: ExecutionContext): Promise<void> {
    const params = this.getSquareEffectParams(path);
    if (!params) {
      return;
    }

    const { position, squareData, playerId, kind, squareName, power } = params;

    Logger.info(
      `🎯 Orchestrator enforcing square effect at position ${position}: ${kind ?? "unknown"} (${squareName})`,
    );

    this.syncAnimalEncounterState(kind, playerId, position, power, true);

    const applied = this.applyDeterministicSquareEffects(path, squareData);
    const squareInfo = JSON.stringify(squareData);
    const transcript = this.buildSquareEffectTranscript(
      kind,
      position,
      squareName,
      power,
      applied,
      squareInfo,
    );

    this.syncAnimalEncounterState(kind, playerId, position, power, false);

    this.isProcessingSquareEffect = true;
    try {
      await this.processTranscriptFn(transcript, { isNestedCall: true });
    } finally {
      this.isProcessingSquareEffect = false;
    }
  }
}
