import {
  findSquareByEffect,
  getWinPosition,
  minDieToOpenMagicDoor,
  scimitarDoorBonusFromItems,
} from "./board-helpers";
import {
  getDirectionalRollDice,
  getSquareKind,
  isAnimalEncounterKind,
  isDeferredRewardKind,
  isRollDirectionalKind,
  squareTriggersLandingPipeline,
} from "./square-types";
import type { ExecutionContext } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { getLocale } from "@/i18n/locale-manager";
import { magicDoorHeartsPhrase } from "@/i18n/magic-door-phrases";
import { t } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { GAME_PATH, playerStatePath, STATE_PLAYERS_PREFIX } from "@/state-paths";
import { Logger } from "@/utils/logger";

/**
 * Handles automatic board mechanics and square-based effects for Kalimba.
 *
 * Responsibilities:
 * - Auto-apply teleports from squares (portals, returnTo187); skip backward when retreatEffectsReversed
 * - Golden fox (`jumpToLeader`): after moving to the leader’s square, resolve that square’s portals for the mover only (e.g. 82→45); other players on that square are not moved
 * - Magic door bounce (overshooting 186)
 * - Apply deterministic square effects from config (hearts, skipTurn, item, instrument)
 * - Prepare deterministic encounter riddles for animal squares; other squares use deterministic TTS
 */
export class BoardEffectsHandler {
  private isProcessingSquareEffect = false;

  constructor(
    private stateManager: StateManager,
    _processTranscriptFn: (transcript: string, context: ExecutionContext) => Promise<boolean>,
    private speechService: ISpeechService,
    private statusIndicator: IStatusIndicator,
    private setLastNarration: (text: string) => void,
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
   * Skips backward teleports when player has retreatEffectsReversed.
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
    const landingPosition = position;
    const landingSquareData = squareData;
    this.applyTeleportIfApplicable(path, position, squareData, state, context);

    const afterJumpToLeader = this.stateManager.get(path) as number;
    if (
      landingSquareData?.effect === "jumpToLeader" &&
      typeof afterJumpToLeader === "number" &&
      afterJumpToLeader !== landingPosition
    ) {
      this.applyJumpToLeaderLeaderSquarePortal(path, afterJumpToLeader, squares, context);
    }

    this.applyMagicDoorBounceIfApplicable(path, squares, context);

    const finalPosition = this.stateManager.get(path) as number;
    this.setJumpToLeaderRelocatedIfNeeded(
      context,
      landingSquareData,
      landingPosition,
      finalPosition,
    );
  }

  /**
   * Records Golden Fox relocation on the execution context for accurate post-roll narration.
   */
  private setJumpToLeaderRelocatedIfNeeded(
    context: ExecutionContext | undefined,
    landingSquareData: Record<string, unknown> | undefined,
    landingPosition: number,
    finalPosition: number,
  ): void {
    if (
      !context ||
      landingSquareData?.effect !== "jumpToLeader" ||
      typeof finalPosition !== "number" ||
      typeof landingPosition !== "number" ||
      finalPosition === landingPosition
    ) {
      return;
    }
    context.jumpToLeaderRelocated = { toPosition: finalPosition };
  }

  /** After a successful door open, forward movement past 186 is legal—do not treat it as overshoot. */
  private playerHasOpenedMagicDoor(path: string): boolean {
    const m = path.match(/^players\.([^.]+)\.position$/);
    const id = m?.[1];
    if (!id) {
      return false;
    }
    return this.stateManager.get(playerStatePath(id, "magicDoorOpened")) === true;
  }

  /**
   * Kalimba: overshooting the magic door bounces back symmetrically toward start.
   *
   * @param path - Player position path being resolved
   * @param squares - Board squares map
   * @param context - When present and not a nested LLM call, records bounce for post-roll narration
   */
  private applyMagicDoorBounceIfApplicable(
    path: string,
    squares: Record<string, Record<string, unknown>>,
    context?: ExecutionContext,
  ): void {
    if (this.playerHasOpenedMagicDoor(path)) {
      return;
    }

    const overshotPosition = this.stateManager.get(path) as number;
    const magicDoorFound = findSquareByEffect(squares, "magicDoorCheck");
    const magicDoorPosition = magicDoorFound?.position;
    const winPosition = getWinPosition(squares);
    if (
      typeof magicDoorPosition === "number" &&
      overshotPosition > magicDoorPosition &&
      overshotPosition < winPosition
    ) {
      const bounceTo = magicDoorPosition - (overshotPosition - magicDoorPosition);
      Logger.info(
        `Magic door bounce: overshot ${overshotPosition} (door ${magicDoorPosition}), bouncing to ${bounceTo}`,
      );
      this.stateManager.set(path, bounceTo);
      if (context && !context.isNestedCall) {
        const match = path.match(/^players\.([^.]+)\.position$/);
        const playerId = match?.[1];
        if (playerId) {
          context.magicDoorBounce = {
            playerId,
            doorPosition: magicDoorPosition,
            overshotPosition,
            finalPosition: bounceTo,
          };
        }
      }
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

  /**
   * Forward portal target from `destination` or first `nextOnLanding` entry.
   *
   * @param squareData - Square config
   * @returns Destination index, or undefined
   */
  private readSquarePortalForwardTarget(squareData: Record<string, unknown>): number | undefined {
    if (typeof squareData.destination === "number") {
      return squareData.destination;
    }
    if (Array.isArray(squareData.nextOnLanding) && squareData.nextOnLanding.length > 0) {
      const dest = squareData.nextOnLanding[0];
      return typeof dest === "number" ? dest : undefined;
    }
    return undefined;
  }

  /**
   * Kalimba ocean–forest portal (square 82): one backward hop to 45 per player per game,
   * identified by `oceanForestOneShotPortal` on that square in board JSON.
   */
  private isKalimbaOceanForestPortal82Hop(
    squareData: Record<string, unknown> | undefined,
    landingPosition: number,
    portalTarget: number,
  ): boolean {
    return (
      landingPosition === 82 && portalTarget === 45 && squareData?.oceanForestOneShotPortal === true
    );
  }

  private consumeOceanForestPortal82Penalty(playerId: string): void {
    this.stateManager.set(playerStatePath(playerId, "oceanForestPenaltyConsumed"), true);
    this.stateManager.set(playerStatePath(playerId, "retreatEffectsReversed"), true);
  }

  /**
   * Portal/ladder forward target from `nextOnLanding` / `destination`, or undefined if suppressed
   * or Kalimba 82→45 already consumed for this player.
   */
  private resolvePortalForwardDestination(
    squareData: Record<string, unknown>,
    path: string,
    state: { players?: Record<string, Record<string, unknown>> },
    landingPosition: number,
    suppressNextOnLanding: boolean,
  ): number | undefined {
    if (suppressNextOnLanding) {
      return undefined;
    }
    const portalForward = this.readSquarePortalForwardTarget(squareData);
    if (portalForward === undefined) {
      return undefined;
    }
    const playerId = path.match(/^players\.([^.]+)\.position$/)?.[1];
    if (
      playerId &&
      this.isKalimbaOceanForestPortal82Hop(squareData, landingPosition, portalForward)
    ) {
      const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
      if (player?.oceanForestPenaltyConsumed === true) {
        return undefined;
      }
    }
    return portalForward;
  }

  private getTeleportDestination(
    squareData: Record<string, unknown>,
    path: string,
    state: { game?: Record<string, unknown>; players?: Record<string, Record<string, unknown>> },
    landingPosition: number,
    context?: ExecutionContext,
  ): number | undefined {
    if (squareData.effect === "jumpToLeader") {
      return this.getLeaderPosition(path, state);
    }
    const suppressNextOnLanding =
      context?.suppressNextOnLandingAtPosition !== undefined &&
      context.suppressNextOnLandingAtPosition === landingPosition;
    const portal = this.resolvePortalForwardDestination(
      squareData,
      path,
      state,
      landingPosition,
      suppressNextOnLanding,
    );
    if (portal !== undefined) {
      return portal;
    }
    if (squareData.effect === "returnTo187") {
      return 187;
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
    return player?.retreatEffectsReversed === true;
  }

  /**
   * One-shot Kalimba 82→45 penalty + retreat flip; suppress 45→82 in the same resolution wave when we actually moved.
   */
  private finishKalimbaOceanForestPortal82Hop(
    squareData: Record<string, unknown>,
    fromPosition: number,
    destination: number,
    path: string,
    didApplyPositionChange: boolean,
    context?: ExecutionContext,
  ): void {
    if (!this.isKalimbaOceanForestPortal82Hop(squareData, fromPosition, destination)) {
      return;
    }
    const moverId = path.match(/^players\.([^.]+)\.position$/)?.[1];
    if (!moverId) {
      return;
    }
    this.consumeOceanForestPortal82Penalty(moverId);
    if (didApplyPositionChange && context) {
      context.suppressNextOnLandingAtPosition = 45;
    }
  }

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

    const destination = this.getTeleportDestination(squareData, path, state, position, context);
    if (destination === undefined || destination === position) {
      return;
    }

    if (this.shouldSkipBackwardTeleport(path, position, destination, state)) {
      Logger.info(
        `Skipping backward teleport (retreatEffectsReversed): position ${position} → ${destination}`,
      );
      this.finishKalimbaOceanForestPortal82Hop(
        squareData,
        position,
        destination,
        path,
        false,
        context,
      );
      return;
    }

    if (context) {
      context.arrivedViaTeleportFrom = position;
    }
    const moveType =
      squareData.effect === "jumpToLeader"
        ? "jumpToLeader"
        : destination < position
          ? "snake"
          : "ladder";
    Logger.info(`Auto-applying ${moveType}: position ${position} → ${destination}`);
    this.stateManager.set(path, destination);
    this.finishKalimbaOceanForestPortal82Hop(
      squareData,
      position,
      destination,
      path,
      true,
      context,
    );
  }

  /**
   * After `jumpToLeader`, resolve portals on the leader’s square for the mover only (e.g. 82→45).
   * Penalty flags are set inside `applyTeleportIfApplicable` / `finishKalimbaOceanForestPortal82Hop`.
   */
  private applyJumpToLeaderLeaderSquarePortal(
    path: string,
    leaderSquare: number,
    squares: Record<string, Record<string, unknown>>,
    context?: ExecutionContext,
  ): void {
    const stateAfterJump = this.stateManager.getState() as {
      game?: Record<string, unknown>;
      players?: Record<string, Record<string, unknown>>;
    };
    const leaderSquareData = squares[leaderSquare.toString()];
    this.applyTeleportIfApplicable(path, leaderSquare, leaderSquareData, stateAfterJump, context);
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
   * Ocean–forest one-shot portal: player already consumed 82→45; short LLM path on later visits to 82.
   */
  private isRepeatOceanForestPortalVisit(
    squareData: Record<string, unknown>,
    kind: ReturnType<typeof getSquareKind>,
    playerId: string,
  ): boolean {
    if (kind !== "portal" || squareData.oceanForestOneShotPortal !== true) {
      return false;
    }
    return this.stateManager.get(playerStatePath(playerId, "oceanForestPenaltyConsumed")) === true;
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
    squareName: string,
    isSetup: boolean,
  ): void {
    if (isSetup && isAnimalEncounterKind(kind) && playerId) {
      const question = this.getEncounterQuestion(squareName, position);
      this.stateManager.set(GAME_PATH.pending, {
        kind: "riddle",
        position,
        power,
        playerId,
        phase: "riddle",
        riddlePrompt: question.question,
        riddleOptions: question.options,
        correctOption: question.correctOption,
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

  private getNoChoicePortalFromSquare(
    kind: ReturnType<typeof getSquareKind>,
    arrivedViaTeleportFrom: number | undefined,
    squareData: Record<string, unknown> | undefined,
  ): number | undefined {
    const teleportKinds = ["portal", "goldenFox", "skull"] as const;
    const isTeleport = kind && teleportKinds.includes(kind as (typeof teleportKinds)[number]);
    const raw = squareData?.nextOnLanding;
    const nextOnLanding = Array.isArray(raw) ? (raw as number[]) : [];
    if (
      isTeleport &&
      typeof arrivedViaTeleportFrom === "number" &&
      nextOnLanding.includes(arrivedViaTeleportFrom)
    ) {
      return arrivedViaTeleportFrom;
    }
    return undefined;
  }

  private formatAppliedEffectsForSpeech(applied: string[]): string {
    if (applied.length === 0) {
      return "";
    }
    const parts = applied.map((label) => {
      if (label === "+1 heart") {
        return t("squares.appliedHeart");
      }
      if (label.startsWith("instrument: ")) {
        return t("squares.appliedInstrument", { instrument: label.slice("instrument: ".length) });
      }
      if (label.startsWith("item: ")) {
        const itemKey = label.slice("item: ".length);
        const itemLabel =
          t(`items.${itemKey}`) !== `items.${itemKey}` ? t(`items.${itemKey}`) : itemKey;
        return t("squares.appliedItem", { item: itemLabel });
      }
      if (label === "skip next turn") {
        return t("squares.appliedSkipTurn");
      }
      if (label === "torch used (no skip)") {
        return t("squares.appliedTorchUsed");
      }
      if (label === "skip next turn (no torch)") {
        return t("squares.appliedSkipNoTorch");
      }
      if (label === "anti-wasp used (no skip)") {
        return t("squares.appliedAntiWaspUsed");
      }
      if (label === "skip next turn (no anti-wasp)") {
        return t("squares.appliedSkipNoAntiWasp");
      }
      return label;
    });
    return parts.join(" ");
  }

  private async speakDeterministicLanding(text: string): Promise<void> {
    this.setLastNarration(text);
    this.statusIndicator.setState("speaking");
    await this.speechService.speak(text);
  }

  private getAnimalNamesFromBoard(): string[] {
    const state = this.stateManager.getState();
    const board = state.board as Record<string, unknown> | undefined;
    const squares = board?.squares as Record<string, Record<string, unknown>> | undefined;
    if (!squares) {
      return [];
    }
    const names = new Set<string>();
    for (const sq of Object.values(squares)) {
      if (typeof sq.name === "string" && typeof sq.power === "number") {
        names.add(sq.name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  private getEncounterQuestionBank(
    squareName: string,
    locale: "es-AR" | "en-US",
  ): Array<{
    kali: string;
    question: string;
    options: [string, string, string, string];
    correctOption: string;
  }> {
    const fallbackLocale = locale === "es-AR" ? "en-US" : "es-AR";
    const state = this.stateManager.getState() as {
      game?: {
        encounterQuestions?: Record<
          string,
          {
            "es-AR"?: Array<{
              kali: string;
              question: string;
              options: [string, string, string, string];
              correctOption: string;
            }>;
            "en-US"?: Array<{
              kali: string;
              question: string;
              options: [string, string, string, string];
              correctOption: string;
            }>;
          }
        >;
      };
    };
    const perAnimal = state.game?.encounterQuestions?.[squareName];
    return perAnimal?.[locale] ?? perAnimal?.[fallbackLocale] ?? [];
  }

  private pickEncounterQuestionFromBank(
    squareName: string,
    bank: Array<{
      kali: string;
      question: string;
      options: [string, string, string, string];
      correctOption: string;
    }>,
  ): {
    kali: string;
    question: string;
    options: [string, string, string, string];
    correctOption: string;
  } | null {
    if (bank.length === 0) {
      return null;
    }
    const state = this.stateManager.getState() as {
      game?: {
        encounterQuestionCursor?: Record<string, number>;
      };
    };
    const cursorMap = state.game?.encounterQuestionCursor ?? {};
    const cursor = cursorMap[squareName] ?? 0;
    const picked = bank[cursor % bank.length];
    this.stateManager.set(`game.encounterQuestionCursor.${squareName}`, cursor + 1);
    return {
      kali: picked.kali,
      question: picked.question,
      options: picked.options,
      correctOption: picked.correctOption,
    };
  }

  private buildFallbackEncounterQuestion(
    squareName: string,
    position: number,
    locale: "es-AR" | "en-US",
  ): {
    kali: string;
    question: string;
    options: [string, string, string, string];
    correctOption: string;
  } {
    const allAnimalNames = this.getAnimalNamesFromBoard().filter((name) => name !== squareName);
    const filler =
      locale === "es-AR" ? ["Elefante", "Tiburon", "Lobo"] : ["Elephant", "Shark", "Wolf"];
    const distractors = [...allAnimalNames, ...filler].slice(0, 3);
    const correctIndex = Math.abs(position) % 4;
    const arranged = [...distractors];
    arranged.splice(correctIndex, 0, squareName);
    const options = arranged.slice(0, 4) as [string, string, string, string];
    if (locale === "es-AR") {
      return {
        kali: `${squareName} aparecio frente a vos...`,
        question: "Que animal encontraron en este casillero?",
        options,
        correctOption: squareName,
      };
    }
    return {
      kali: `${squareName} appeared right in front of you...`,
      question: "Which animal did you find on this square?",
      options,
      correctOption: squareName,
    };
  }

  private getEncounterQuestion(
    squareName: string,
    position: number,
  ): {
    kali: string;
    question: string;
    options: [string, string, string, string];
    correctOption: string;
  } {
    const locale = getLocale();
    const bank = this.getEncounterQuestionBank(squareName, locale);
    const bankQuestion = this.pickEncounterQuestionFromBank(squareName, bank);
    if (bankQuestion) {
      return bankQuestion;
    }
    return this.buildFallbackEncounterQuestion(squareName, position, locale);
  }

  private buildAnimalEncounterSpeech(args: {
    playerName: string;
    question: { kali: string; question: string; options: [string, string, string, string] };
  }): string {
    const { playerName, question } = args;
    const [a, b, c, d] = question.options;
    const locale = getLocale();
    if (locale === "es-AR") {
      return `${playerName}, ${question.kali} ${question.question} Opciones: A) ${a}. B) ${b}. C) ${c}. D) ${d}. Decime cual opcion es correcta.`;
    }
    return `${playerName}, ${question.kali} ${question.question} Options: A) ${a}. B) ${b}. C) ${c}. D) ${d}. Tell me which option is correct.`;
  }

  private buildDirectionalDeterministicSpeech(
    playerName: string,
    position: number,
    squareName: string,
    squareData: Record<string, unknown>,
    playerId: string,
  ): string {
    const dice = getDirectionalRollDice(squareData.effect as string | undefined) ?? 2;
    const retreatReversed =
      this.stateManager.get(playerStatePath(playerId, "retreatEffectsReversed")) === true;
    const movementPhrase = retreatReversed
      ? t("squares.directionalMovementForwardRetreat")
      : t("squares.directionalMovementBackward");
    return t("squares.directionalIntro", {
      name: playerName,
      position,
      squareName,
      dice,
      movementPhrase,
    });
  }

  private resolveNextPlayerDisplayName(currentPlayerId: string): string {
    const state = this.stateManager.getState() as {
      game?: { playerOrder?: string[] };
      players?: Record<string, { name?: string }>;
    };
    const order = state.game?.playerOrder;
    if (!order?.length) {
      return "";
    }
    const idx = order.indexOf(currentPlayerId);
    if (idx < 0) {
      return "";
    }
    const nextId = order[(idx + 1) % order.length];
    const raw = state.players?.[nextId]?.name;
    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : nextId;
  }

  private buildMagicDoorLandingSpeech(
    playerName: string,
    playerId: string,
    position: number,
    squareName: string,
    squareData: Record<string, unknown>,
  ): string {
    const target =
      typeof squareData.target === "number" && squareData.target > 0 ? squareData.target : 6;
    const heartsRaw = this.stateManager.get(playerStatePath(playerId, "hearts"));
    const hearts = typeof heartsRaw === "number" && heartsRaw >= 0 ? heartsRaw : 0;
    const items = this.stateManager.get(playerStatePath(playerId, "items"));
    const scimitarBonus = scimitarDoorBonusFromItems(items);
    const minDie = minDieToOpenMagicDoor(target, hearts, scimitarBonus);
    const heartsPhrase = magicDoorHeartsPhrase(hearts);
    const nextPlayer = this.resolveNextPlayerDisplayName(playerId);
    const key =
      scimitarBonus > 0 ? "squares.magicDoorLandingWithScimitar" : "squares.magicDoorLanding";
    return t(key, {
      name: playerName,
      position,
      squareName,
      nextPlayer,
      target,
      heartsPhrase,
      minDie,
    });
  }

  private buildNonAnimalDeterministicSpeech(
    playerName: string,
    position: number,
    squareName: string,
    applied: string[],
    kind: ReturnType<typeof getSquareKind>,
    arrivedViaTeleportFrom: number | undefined,
    squareData: Record<string, unknown> | undefined,
  ): string {
    const appliedSummary = this.formatAppliedEffectsForSpeech(applied);
    let base = t("squares.landedBase", { name: playerName, position, squareName });
    if (appliedSummary) {
      base = t("squares.landedWithApplied", { base, applied: appliedSummary });
    }
    const teleportKinds = ["portal", "goldenFox", "skull"] as const;
    const isTeleport = kind && teleportKinds.includes(kind as (typeof teleportKinds)[number]);
    const portalFrom = this.getNoChoicePortalFromSquare(kind, arrivedViaTeleportFrom, squareData);
    const portalSuffix =
      portalFrom !== undefined ? t("squares.landedPortalNoChoice", { fromSquare: portalFrom }) : "";
    const teleportHint =
      isTeleport && portalFrom === undefined
        ? `${t("squares.landedTeleportHint")} ${t("narration.stateSquareNumber")}`
        : "";
    return `${base}${portalSuffix}${teleportHint}`.trim();
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

    this.syncAnimalEncounterState(kind, playerId, position, power, squareName, true);

    if (kind === "rollDirectional") {
      this.setPendingDirectionalRoll(playerId, position, squareData.effect as string | undefined);
    }

    const repeatOceanForestPortal = this.isRepeatOceanForestPortalVisit(squareData, kind, playerId);
    const applied = this.applyDeterministicSquareEffects(path, squareData);
    if (applied.some((label) => label.includes("skip next turn"))) {
      context.advanceTurnDespitePowerCheckSuppress = true;
    }
    const encounterQuestion = isAnimalEncounterKind(kind)
      ? this.getEncounterQuestion(squareName, position)
      : null;

    this.syncAnimalEncounterState(kind, playerId, position, power, squareName, false);

    const state = this.stateManager.getState() as {
      players?: Record<string, Record<string, unknown>>;
    };
    const rawName = state.players?.[playerId]?.name;
    const playerName =
      typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : playerId;

    this.isProcessingSquareEffect = true;
    try {
      await this.deliverSquareLandingSpeech({
        kind,
        position,
        squareName,
        power,
        playerName,
        playerId,
        squareData,
        encounterQuestion,
        applied,
        repeatOceanForestPortal,
        arrivedViaTeleportFrom: context.arrivedViaTeleportFrom,
      });
    } finally {
      this.isProcessingSquareEffect = false;
    }
  }

  private async deliverSquareLandingSpeech(args: {
    kind: ReturnType<typeof getSquareKind>;
    position: number;
    squareName: string;
    power: number;
    playerName: string;
    playerId: string;
    squareData: Record<string, unknown>;
    encounterQuestion: {
      kali: string;
      question: string;
      options: [string, string, string, string];
      correctOption: string;
    } | null;
    applied: string[];
    repeatOceanForestPortal: boolean;
    arrivedViaTeleportFrom: number | undefined;
  }): Promise<void> {
    const {
      kind,
      position,
      squareName,
      playerName,
      playerId,
      squareData,
      encounterQuestion,
      applied,
      repeatOceanForestPortal,
      arrivedViaTeleportFrom,
    } = args;

    if (isAnimalEncounterKind(kind)) {
      if (!encounterQuestion) {
        return;
      }
      await this.speakDeterministicLanding(
        this.buildAnimalEncounterSpeech({ playerName, question: encounterQuestion }),
      );
      return;
    }

    if (repeatOceanForestPortal) {
      await this.speakDeterministicLanding(
        t("squares.oceanForestRepeat", { name: playerName, position, squareName }),
      );
      return;
    }

    if (kind === "rollDirectional") {
      await this.speakDeterministicLanding(
        this.buildDirectionalDeterministicSpeech(
          playerName,
          position,
          squareName,
          squareData,
          playerId,
        ),
      );
      return;
    }

    if (kind === "magicDoor") {
      await this.speakDeterministicLanding(
        this.buildMagicDoorLandingSpeech(playerName, playerId, position, squareName, squareData),
      );
      return;
    }

    await this.speakDeterministicLanding(
      this.buildNonAnimalDeterministicSpeech(
        playerName,
        position,
        squareName,
        applied,
        kind,
        arrivedViaTeleportFrom,
        squareData,
      ),
    );
  }
}
