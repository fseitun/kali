import { findSquareByEffect, getWinPosition } from "./board-helpers";
import {
  getDirectionalRollDice,
  getSquareKind,
  isAnimalEncounterKind,
  isDeferredRewardKind,
  isRollDirectionalKind,
  squareTriggersLandingPipeline,
} from "./square-types";
import type { ExecutionContext } from "./types";
import { t } from "@/i18n/translations";
import type { StateManager } from "@/state-manager";
import { GAME_PATH, playerStatePath, STATE_PLAYERS_PREFIX } from "@/state-paths";
import { Logger } from "@/utils/logger";

/**
 * Handles automatic board mechanics and square-based effects for Kalimba.
 *
 * Responsibilities:
 * - Auto-apply teleports from squares (portals, returnTo187); skip backward when inverseMode
 * - Magic door bounce (overshooting 186)
 * - Apply deterministic square effects from config (hearts, skipTurn, item, instrument)
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
   * @param context - Optional execution context; when a teleport is applied, sets arrivedViaTeleportFrom
   */
  async checkAndApplyBoardMoves(path: string, context?: ExecutionContext): Promise<void> {
    if (!path.endsWith(".position") || !path.startsWith(STATE_PLAYERS_PREFIX)) {
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
    this.applyTeleportIfApplicable(path, position, squareData, state, context);

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

  private findMaxPlayerPosition(
    playerOrder: string[],
    players: Record<string, Record<string, unknown>>,
  ): number {
    let max = -1;
    for (const pid of playerOrder) {
      const pos = players[pid]?.position as number | undefined;
      if (typeof pos === "number" && pos > max) {
        max = pos;
      }
    }
    return max;
  }

  private getLeaderPosition(
    path: string,
    state: { game?: Record<string, unknown>; players?: Record<string, Record<string, unknown>> },
  ): number | undefined {
    const match = path.match(/^players\.([^.]+)\.position$/);
    const playerOrder = state.game?.playerOrder as string[] | undefined;
    const players = state.players;
    if (!match?.[1] || !Array.isArray(playerOrder) || !players) {
      return undefined;
    }
    const max = this.findMaxPlayerPosition(playerOrder, players);
    return max >= 0 ? max : undefined;
  }

  private getTeleportDestination(
    squareData: Record<string, unknown>,
    path: string,
    state: { game?: Record<string, unknown>; players?: Record<string, Record<string, unknown>> },
  ): number | undefined {
    if (typeof squareData.destination === "number") {
      return squareData.destination;
    }
    if (Array.isArray(squareData.nextOnLanding) && squareData.nextOnLanding.length > 0) {
      const dest = squareData.nextOnLanding[0];
      if (typeof dest === "number") {
        return dest;
      }
    }
    if (squareData.effect === "returnTo187") {
      return 187;
    }
    if (squareData.effect === "jumpToLeader") {
      return this.getLeaderPosition(path, state);
    }
    return undefined;
  }

  private shouldSkipBackwardTeleport(
    path: string,
    position: number,
    destination: number,
    state: { players?: Record<string, Record<string, unknown>> },
  ): boolean {
    const isBackward = destination < position;
    if (!isBackward) {
      return false;
    }
    const match = path.match(/^players\.([^.]+)\.position$/);
    const playerId = match?.[1];
    const player = playerId
      ? (state.players as Record<string, Record<string, unknown>>)?.[playerId]
      : undefined;
    return !!player?.inverseMode;
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
    context?: ExecutionContext,
  ): void {
    if (!squareData) {
      return;
    }

    const destination = this.getTeleportDestination(squareData, path, state);
    if (destination === undefined || destination === position) {
      return;
    }

    if (this.shouldSkipBackwardTeleport(path, position, destination, state)) {
      Logger.info(
        `Skipping backward teleport (inverseMode): position ${position} → ${destination}`,
      );
      return;
    }

    if (context) {
      context.arrivedViaTeleportFrom = position;
    }
    const moveType = destination < position ? "snake" : "ladder";
    Logger.info(`Auto-applying ${moveType}: position ${position} → ${destination}`);
    this.stateManager.set(path, destination);
  }

  private applyHeartEffect(playerId: string, squareData: Record<string, unknown>): string | null {
    if (squareData.heart !== true) {
      return null;
    }
    const current = (this.stateManager.get(playerStatePath(playerId, "hearts")) as number) ?? 0;
    this.stateManager.set(playerStatePath(playerId, "hearts"), current + 1);
    return "+1 heart";
  }

  private applyInstrumentEffect(
    playerId: string,
    squareData: Record<string, unknown>,
  ): string | null {
    const instrument = squareData.instrument as string | undefined;
    if (typeof instrument !== "string" || instrument.length === 0) {
      return null;
    }
    const current =
      (this.stateManager.get(playerStatePath(playerId, "instruments")) as unknown[]) ?? [];
    const next = Array.isArray(current) ? [...current, instrument] : [instrument];
    this.stateManager.set(playerStatePath(playerId, "instruments"), next);
    return `instrument: ${instrument}`;
  }

  private applyItemEffect(playerId: string, squareData: Record<string, unknown>): string | null {
    const item = squareData.item as string | undefined;
    if (typeof item !== "string" || item.length === 0) {
      return null;
    }
    const current = (this.stateManager.get(playerStatePath(playerId, "items")) as unknown[]) ?? [];
    const next = Array.isArray(current) ? [...current, item] : [item];
    this.stateManager.set(playerStatePath(playerId, "items"), next);
    return `item: ${item}`;
  }

  private applySkipTurnEffect(
    playerId: string,
    squareData: Record<string, unknown>,
  ): string | null {
    if (squareData.effect !== "skipTurn") {
      return null;
    }
    const current = (this.stateManager.get(playerStatePath(playerId, "skipTurns")) as number) ?? 0;
    this.stateManager.set(playerStatePath(playerId, "skipTurns"), current + 1);
    return "skip next turn";
  }

  private applyCheckEffect(playerId: string, effect: unknown): string | null {
    if (effect === "checkTorch") {
      return this.applyCheckTorchEffect(playerId);
    }
    if (effect === "checkAntiWasp") {
      return this.applyCheckAntiWaspEffect(playerId);
    }
    return null;
  }

  private applyCheckTorchEffect(playerId: string): string {
    const items = (this.stateManager.get(playerStatePath(playerId, "items")) as unknown[]) ?? [];
    const idx = Array.isArray(items) ? items.indexOf("torch") : -1;
    if (idx >= 0) {
      const next = [...items];
      next.splice(idx, 1);
      this.stateManager.set(playerStatePath(playerId, "items"), next);
      return "torch used (no skip)";
    }
    const current = (this.stateManager.get(playerStatePath(playerId, "skipTurns")) as number) ?? 0;
    this.stateManager.set(playerStatePath(playerId, "skipTurns"), current + 1);
    return "skip next turn (no torch)";
  }

  private applyCheckAntiWaspEffect(playerId: string): string {
    const items = (this.stateManager.get(playerStatePath(playerId, "items")) as unknown[]) ?? [];
    const idx = Array.isArray(items) ? items.indexOf("anti-wasp") : -1;
    if (idx >= 0) {
      const next = [...items];
      next.splice(idx, 1);
      this.stateManager.set(playerStatePath(playerId, "items"), next);
      return "anti-wasp used (no skip)";
    }
    const current = (this.stateManager.get(playerStatePath(playerId, "skipTurns")) as number) ?? 0;
    this.stateManager.set(playerStatePath(playerId, "skipTurns"), current + 1);
    return "skip next turn (no anti-wasp)";
  }

  /**
   * Applies deterministic square effects from config (heart, skipTurn, item, instrument).
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
      const heartResult = this.applyHeartEffect(playerId, squareData);
      if (heartResult) {
        applied.push(heartResult);
      }
      const instrumentResult = this.applyInstrumentEffect(playerId, squareData);
      if (instrumentResult) {
        applied.push(instrumentResult);
      }
    }

    const skipResult = this.applySkipTurnEffect(playerId, squareData);
    if (skipResult) {
      applied.push(skipResult);
    }

    const checkEffect = this.applyCheckEffect(playerId, squareData.effect);
    if (checkEffect) {
      applied.push(checkEffect);
    }

    const itemResult = this.applyItemEffect(playerId, squareData);
    if (itemResult) {
      applied.push(itemResult);
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
    return path.endsWith(".position") && path.startsWith(STATE_PLAYERS_PREFIX);
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
    if (!squareTriggersLandingPipeline(squareData)) {
      Logger.debug(`Square ${position} has no mechanics, skipping square effects`);
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
    const squareName =
      (squareData.name as string) || (squareData.item ? t(`items.${squareData.item}`) : "unknown");
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
      this.stateManager.set(GAME_PATH.pending, {
        kind: "riddle",
        position,
        power,
        playerId,
        phase: "riddle",
      });
    } else if (!isSetup && !isAnimalEncounterKind(kind) && !isRollDirectionalKind(kind)) {
      this.stateManager.set(GAME_PATH.pending, null);
    }
  }

  private setPendingDirectionalRoll(
    playerId: string,
    position: number,
    effect: string | undefined,
  ): void {
    const dice = getDirectionalRollDice(effect);
    if (dice && playerId) {
      this.stateManager.set(GAME_PATH.pending, {
        kind: "directional",
        position,
        playerId,
        dice,
      });
    }
  }

  private buildNoChoicePortalHint(
    kind: ReturnType<typeof getSquareKind>,
    arrivedViaTeleportFrom: number | undefined,
    squareData: Record<string, unknown> | undefined,
  ): string {
    const teleportKinds = ["portal", "goldenFox", "skull"] as const;
    const isTeleport = kind && teleportKinds.includes(kind as (typeof teleportKinds)[number]);
    const raw = squareData?.nextOnLanding;
    const nextOnLanding = Array.isArray(raw) ? (raw as number[]) : [];
    const isNoChoicePortal =
      isTeleport &&
      typeof arrivedViaTeleportFrom === "number" &&
      nextOnLanding.includes(arrivedViaTeleportFrom);
    return isNoChoicePortal
      ? ` The player arrived via the portal from square ${arrivedViaTeleportFrom}. They stay here. Do NOT offer any choice. Do NOT ask questions. Narrate briefly only.`
      : "";
  }

  private buildNonAnimalSquareEffectTranscript(
    position: number,
    squareName: string,
    applied: string[],
    squareInfo: string,
    kind: ReturnType<typeof getSquareKind>,
    arrivedViaTeleportFrom: number | undefined,
    squareData: Record<string, unknown> | undefined,
  ): string {
    const appliedText = applied.length > 0 ? ` Orchestrator applied: ${applied.join(", ")}.` : "";
    const teleportKinds = ["portal", "goldenFox", "skull"] as const;
    const isTeleport = kind && teleportKinds.includes(kind as (typeof teleportKinds)[number]);
    const noChoicePortalHint = this.buildNoChoicePortalHint(
      kind,
      arrivedViaTeleportFrom,
      squareData,
    );
    const noMoveHint = !isTeleport
      ? ` The player landed on and stays at square ${position}. Do NOT say they move to or go to square ${position} — they are already there. Narrate only the effect.`
      : "";
    const teleportHint =
      isTeleport && !noChoicePortalHint ? ` ${t("narration.stateSquareNumber")}` : "";
    const hints = `${noMoveHint}${noChoicePortalHint}${teleportHint}`;
    const base =
      applied.length > 0
        ? `[SYSTEM: Current player just landed on square ${position} (${squareName}).${appliedText} Narrate this encounter.${hints} Square data for flavour: ${squareInfo}]`
        : `[SYSTEM: Current player just landed on square ${position} (${squareName}). Narrate this encounter. Do not change game state.${hints} Square data for flavour: ${squareInfo}]`;
    return base;
  }

  private buildSquareEffectTranscript(
    kind: ReturnType<typeof getSquareKind>,
    position: number,
    squareName: string,
    power: number,
    applied: string[],
    squareInfo: string,
    arrivedViaTeleportFrom?: number,
    squareData?: Record<string, unknown>,
  ): string {
    if (isAnimalEncounterKind(kind)) {
      return (
        `[SYSTEM: Animal encounter at square ${position} (${squareName}, power ${power}), phase=riddle. ` +
        `Follow the ⚠️ RIDDLE line in state: ASK_RIDDLE with exactly four options (animal kingdom) + correctOption (and optional synonyms), then NARRATE the same riddle; user answer → PLAYER_ANSWERED. ` +
        `For powerCheck/revenge phases, roll → PLAYER_ANSWERED with the number. Orchestrator owns transitions and rewards. ` +
        `Square data (flavour only): ${squareInfo}]`
      );
    }
    if (kind === "rollDirectional") {
      const dice = getDirectionalRollDice(squareData?.effect as string | undefined) ?? 2;
      const min = dice;
      const max = dice * 6;
      return (
        `[SYSTEM: Current player landed on square ${position} (${squareName}). ` +
        `Follow the ⚠️ DIRECTIONAL ROLL line in state. ` +
        `Narrate briefly, then ask the player to roll ${dice} d6 and report the sum; they move backward that many spaces along the path. ` +
        `When they report their roll, return PLAYER_ANSWERED with the number (${min}–${max}). ` +
        `Do not change game state. Square data for flavour: ${squareInfo}]`
      );
    }
    return this.buildNonAnimalSquareEffectTranscript(
      position,
      squareName,
      applied,
      squareInfo,
      kind,
      arrivedViaTeleportFrom,
      squareData,
    );
  }

  async checkAndApplySquareEffects(path: string, context: ExecutionContext): Promise<void> {
    const params = this.getSquareEffectParams(path);
    if (!params) {
      return;
    }

    const { position, squareData, playerId, kind, squareName, power } = params;

    Logger.info(
      `🎯 Orchestrator enforcing square effect at position ${position}: ${kind ?? "unknown"} (${squareName})`,
    );

    this.syncAnimalEncounterState(kind, playerId, position, power, true);

    if (kind === "rollDirectional") {
      this.setPendingDirectionalRoll(playerId, position, squareData.effect as string | undefined);
    }

    const applied = this.applyDeterministicSquareEffects(path, squareData);
    const squareInfo = JSON.stringify(squareData);
    const transcript = this.buildSquareEffectTranscript(
      kind,
      position,
      squareName,
      power,
      applied,
      squareInfo,
      context.arrivedViaTeleportFrom,
      squareData,
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
