import {
  computeMagicDoorBounceDestination as computeMagicDoorBounceDestinationPolicy,
  isKalimbaOceanForestPortal82Hop as isKalimbaOceanForestPortal82HopPolicy,
  readSquarePortalForwardTarget as readSquarePortalForwardTargetPolicy,
  shouldApplyLeaderSquarePortal as shouldApplyLeaderSquarePortalPolicy,
  shouldSkipBackwardTeleport as shouldSkipBackwardTeleportPolicy,
} from "./board-effects-movement-policy";
import { buildAnimalEncounterLandingSpeech } from "./board-effects-narration-policy";
import {
  appendInventoryEntry,
  consumeProtectionItem,
  incrementCounter,
} from "./board-effects-reward-policy";
import { findSquareByEffect, minDieToOpenMagicDoor } from "./board-helpers";
import type { Pending } from "./pending-types";
import {
  getDirectionalRollDice,
  getSquareKind,
  isAnimalEncounterKind,
  isDeferredRewardKind,
  isRollDirectionalKind,
  squareTriggersLandingPipeline,
} from "./square-types";
import type { DomainEventPayload, ExecutionContext } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { getLocale } from "@/i18n/locale-manager";
import { magicDoorHeartsPhrase } from "@/i18n/magic-door-phrases";
import { t } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { GAME_PATH, playerStatePath, STATE_PLAYERS_PREFIX } from "@/state-paths";
import { Logger } from "@/utils/logger";

/** Per-animal riddle cursor map; written whole so animal names are keys, never path segments. */
const ENCOUNTER_QUESTION_CURSOR_PATH = "game.encounterQuestionCursor";

/** One animal-encounter riddle drawn from the per-animal bank in `game.encounterQuestions`. */
interface EncounterQuestion {
  kali: string;
  question: string;
  options: [string, string, string, string];
  correctOption: string;
}

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
  constructor(
    private stateManager: StateManager,
    private speechService: ISpeechService,
    private statusIndicator: IStatusIndicator,
    private setLastNarration: (text: string) => void,
  ) {}

  private recordDomainEvent(
    context: ExecutionContext | undefined,
    event: DomainEventPayload,
  ): void {
    if (!context) {
      return;
    }
    const eventId = (context.nextDomainEventId ?? 0) + 1;
    context.nextDomainEventId = eventId;
    const withId = { eventId, ...event };
    context.domainEvents = context.domainEvents ?? [];
    context.domainEvents.push(withId);
    context.domainEventHistory = context.domainEventHistory ?? [];
    context.domainEventHistory.push(withId);
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
    const board = state.board;
    const squares = board?.squares;

    if (!squares) {
      return;
    }

    const squareData = squares[position.toString()];
    const landingPosition = position;
    const landingSquareData = squareData;

    // Kalimba §9: the shut door is impassable, so an overshoot never really reaches the square it
    // flew onto — it bounces before that square's own mechanics (e.g. a skull at 190) can fire.
    this.applyMagicDoorBounceIfApplicable(path, squares, context);
    if ((this.stateManager.get(path) as number) !== landingPosition) {
      return;
    }

    this.applyTeleportIfApplicable(path, position, squareData, state, context);

    const afterJumpToLeader = this.stateManager.get(path) as number;
    if (
      shouldApplyLeaderSquarePortalPolicy(landingSquareData, landingPosition, afterJumpToLeader)
    ) {
      this.applyJumpToLeaderLeaderSquarePortal(path, afterJumpToLeader, squares, context);
    }

    // A teleport can also carry the player past a shut door; the same rule applies to where it
    // dropped them.
    this.applyMagicDoorBounceIfApplicable(path, squares, context);

    const finalPosition = this.stateManager.get(path) as number;
    this.setJumpToLeaderRelocatedIfNeeded(
      path,
      context,
      landingSquareData,
      landingPosition,
      finalPosition,
    );
  }

  /**
   * Emits Golden Fox relocation for deterministic narration policy.
   */
  private setJumpToLeaderRelocatedIfNeeded(
    path: string,
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
    const playerId = path.match(/^players\.([^.]+)\.position$/)?.[1];
    if (!playerId) {
      return;
    }
    this.recordDomainEvent(context, {
      kind: "goldenFoxRelocated",
      playerId,
      toPosition: finalPosition,
    });
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
   * @param context - When present, records the bounce for post-roll narration
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
    const bounceTo = computeMagicDoorBounceDestinationPolicy(
      overshotPosition,
      magicDoorPosition,
      false,
    );
    if (typeof bounceTo === "number" && typeof magicDoorPosition === "number") {
      Logger.info(
        `Magic door bounce: overshot ${overshotPosition} (door ${magicDoorPosition}), bouncing to ${bounceTo}`,
      );
      this.stateManager.set(path, bounceTo);
      const playerId = path.match(/^players\.([^.]+)\.position$/)?.[1];
      if (playerId) {
        this.recordDomainEvent(context, {
          kind: "magicDoorBounce",
          playerId,
          doorPosition: magicDoorPosition,
          overshotPosition,
          finalPosition: bounceTo,
        });
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
    return readSquarePortalForwardTargetPolicy(squareData);
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
    return isKalimbaOceanForestPortal82HopPolicy(squareData, landingPosition, portalTarget);
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
    const match = path.match(/^players\.([^.]+)\.position$/);
    const playerId = match?.[1];
    const player = playerId
      ? (state.players as Record<string, Record<string, unknown>>)?.[playerId]
      : undefined;
    return shouldSkipBackwardTeleportPolicy(
      position,
      destination,
      player?.retreatEffectsReversed === true,
    );
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
    this.captureSkullReturnNarrationContext(path, squareData, position, destination, context);
    this.finishKalimbaOceanForestPortal82Hop(
      squareData,
      position,
      destination,
      path,
      true,
      context,
    );
  }

  private captureSkullReturnNarrationContext(
    path: string,
    squareData: Record<string, unknown>,
    fromSquare: number,
    toSquare: number,
    context?: ExecutionContext,
  ): void {
    if (!context || toSquare !== 187) {
      return;
    }
    const isEffectSkull = squareData.effect === "returnTo187";
    const name = typeof squareData.name === "string" ? squareData.name : "";
    const isNamedSkull = /skull|calavera/i.test(name);
    if (!isEffectSkull && !isNamedSkull) {
      return;
    }
    const playerId = path.match(/^players\.([^.]+)\.position$/)?.[1];
    if (!playerId) {
      return;
    }
    this.recordDomainEvent(context, {
      kind: "skullReturnToSnakeHead",
      playerId,
      fromSquare,
      toSquare,
    });
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
    const current = this.stateManager.get(playerStatePath(playerId, "hearts"));
    this.stateManager.set(playerStatePath(playerId, "hearts"), incrementCounter(current));
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
    const current = this.stateManager.get(playerStatePath(playerId, "instruments"));
    const next = appendInventoryEntry(current, instrument);
    this.stateManager.set(playerStatePath(playerId, "instruments"), next);
    return `instrument: ${instrument}`;
  }

  private applyItemEffect(playerId: string, squareData: Record<string, unknown>): string | null {
    const item = squareData.item as string | undefined;
    if (typeof item !== "string" || item.length === 0) {
      return null;
    }
    const current = this.stateManager.get(playerStatePath(playerId, "items"));
    const next = appendInventoryEntry(current, item);
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
    const current = this.stateManager.get(playerStatePath(playerId, "skipTurns"));
    this.stateManager.set(playerStatePath(playerId, "skipTurns"), incrementCounter(current));
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
    const items = this.stateManager.get(playerStatePath(playerId, "items"));
    const { nextItems, consumed } = consumeProtectionItem(items, "torch");
    if (consumed) {
      this.stateManager.set(playerStatePath(playerId, "items"), nextItems);
      return "torch used (no skip)";
    }
    const current = this.stateManager.get(playerStatePath(playerId, "skipTurns"));
    this.stateManager.set(playerStatePath(playerId, "skipTurns"), incrementCounter(current));
    return "skip next turn (no torch)";
  }

  private applyCheckAntiWaspEffect(playerId: string): string {
    const items = this.stateManager.get(playerStatePath(playerId, "items"));
    const { nextItems, consumed } = consumeProtectionItem(items, "anti-wasp");
    if (consumed) {
      this.stateManager.set(playerStatePath(playerId, "items"), nextItems);
      return "anti-wasp used (no skip)";
    }
    const current = this.stateManager.get(playerStatePath(playerId, "skipTurns"));
    this.stateManager.set(playerStatePath(playerId, "skipTurns"), incrementCounter(current));
    return "skip next turn (no anti-wasp)";
  }

  /**
   * Ocean–forest one-shot portal: player already consumed 82→45; later visits to 82 get the
   * short "you already paid this one" line instead of the teleport.
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
   * Mutates state for the current player only. Runs before the landing line is spoken.
   *
   * @param path - State path that was mutated (e.g. players.p1.position)
   * @param squareData - Square config from board.squares[position]
   * @returns Summary of applied effects, used to build the spoken landing line
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

  private isValidPositionPath(path: string): boolean {
    return path.endsWith(".position") && path.startsWith(STATE_PLAYERS_PREFIX);
  }

  private getSquareDataForPosition(position: number): {
    squares: Record<string, Record<string, unknown>>;
    squareData: Record<string, unknown>;
  } | null {
    const state = this.stateManager.getState();
    const board = state.board;
    const squares = board?.squares;
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

  /**
   * Stores the riddle the player is about to hear. The question object is picked once per
   * landing and reused for the spoken prompt, so grading matches what was read aloud.
   */
  private setPendingAnimalEncounter(
    playerId: string,
    position: number,
    power: number,
    question: EncounterQuestion,
  ): void {
    this.stateManager.set(GAME_PATH.pending, {
      kind: "riddle",
      position,
      power,
      playerId,
      riddlePrompt: question.question,
      riddleOptions: question.options,
      correctOption: question.correctOption,
    });
  }

  /**
   * A square with no encounter mechanic clears only the landing player's own pending:
   * another player's cross-turn revenge (Kalimba §2C) must survive their opponents' landings.
   */
  private clearOwnPendingOnPlainSquare(
    kind: ReturnType<typeof getSquareKind>,
    playerId: string,
  ): void {
    if (isAnimalEncounterKind(kind) || isRollDirectionalKind(kind)) {
      return;
    }
    const pending = this.stateManager.get(GAME_PATH.pending) as Pending | null | undefined;
    if (pending && pending.playerId !== playerId) {
      return;
    }
    this.stateManager.set(GAME_PATH.pending, null);
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

  private async speakDeterministicLanding(text: string, context: ExecutionContext): Promise<void> {
    this.setLastNarration(text);
    context.spokeDeterministicLanding = true;
    this.statusIndicator.setState("speaking");
    await this.speechService.speak(text);
  }

  private getEncounterQuestionBank(
    squareName: string,
    locale: "es-AR" | "en-US",
  ): EncounterQuestion[] {
    const fallbackLocale = locale === "es-AR" ? "en-US" : "es-AR";
    const state = this.stateManager.getState() as {
      game?: {
        encounterQuestions?: Record<
          string,
          { "es-AR"?: EncounterQuestion[]; "en-US"?: EncounterQuestion[] }
        >;
      };
    };
    const perAnimal = state.game?.encounterQuestions?.[squareName];
    return perAnimal?.[locale] ?? perAnimal?.[fallbackLocale] ?? [];
  }

  private pickEncounterQuestionFromBank(
    squareName: string,
    bank: EncounterQuestion[],
  ): EncounterQuestion | null {
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
    // Whole-map write: a dot-path key would split an animal name containing "." into two levels
    // and never be read back by the map lookup above.
    this.stateManager.set(ENCOUNTER_QUESTION_CURSOR_PATH, {
      ...cursorMap,
      [squareName]: cursor + 1,
    });
    return {
      kali: picked.kali,
      question: picked.question,
      options: picked.options,
      correctOption: picked.correctOption,
    };
  }

  private getEncounterQuestion(squareName: string, position: number): EncounterQuestion {
    const locale = getLocale();
    const bank = this.getEncounterQuestionBank(squareName, locale);
    const bankQuestion = this.pickEncounterQuestionFromBank(squareName, bank);
    if (bankQuestion) {
      return bankQuestion;
    }
    throw new Error(
      `Missing encounterQuestions for animal "${squareName}" at position ${String(position)} (${locale})`,
    );
  }

  private buildAnimalEncounterSpeech(args: {
    playerName: string;
    question: EncounterQuestion;
  }): string {
    const { playerName, question } = args;
    return buildAnimalEncounterLandingSpeech(
      playerName,
      question.kali,
      question.question,
      question.options,
    );
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

  private buildMagicDoorLandingSpeech(
    playerName: string,
    playerId: string,
    position: number,
    squareData: Record<string, unknown>,
  ): string {
    const target =
      typeof squareData.target === "number" && squareData.target > 0 ? squareData.target : 6;
    const heartsRaw = this.stateManager.get(playerStatePath(playerId, "hearts"));
    const hearts = typeof heartsRaw === "number" && heartsRaw >= 0 ? heartsRaw : 0;
    const minDie = minDieToOpenMagicDoor(target, hearts);
    const heartsPhrase = magicDoorHeartsPhrase(hearts);
    return t("squares.magicDoorLanding", {
      name: playerName,
      position,
      target,
      heartsPhrase,
      minDie,
    });
  }

  /**
   * Build deterministic win speech for landing on the final square.
   */
  private buildWinLandingSpeech(playerName: string): string {
    return t("game.winner", { name: playerName });
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
      isTeleport && portalFrom === undefined ? t("squares.landedTeleportHint") : "";
    return `${base}${portalSuffix}${teleportHint}`.trim();
  }

  /**
   * Applies the landing square's deterministic effects, opens any pending phase it requires,
   * and speaks the deterministic landing line. Reads board.squares config; the orchestrator
   * subsystem owns every state mutation for game rules.
   *
   * @param path - State path that was mutated
   * @param context - Execution context
   */
  async checkAndApplySquareEffects(path: string, context: ExecutionContext): Promise<void> {
    const params = this.getSquareEffectParams(path);
    if (!params) {
      return;
    }

    const { position, squareData, playerId, kind, squareName, power } = params;

    Logger.info(
      `🎯 Orchestrator enforcing square effect at position ${position}: ${kind ?? "unknown"} (${squareName})`,
    );

    const encounterQuestion = this.openPendingForLanding(params);

    const repeatOceanForestPortal = this.isRepeatOceanForestPortalVisit(squareData, kind, playerId);
    const applied = this.applyDeterministicSquareEffects(path, squareData);
    if (applied.some((label) => label.includes("skip next turn"))) {
      context.advanceTurnDespitePowerCheckSuppress = true;
    }

    this.clearOwnPendingOnPlainSquare(kind, playerId);

    const state = this.stateManager.getState() as {
      players?: Record<string, Record<string, unknown>>;
    };
    const rawName = state.players?.[playerId]?.name;
    const playerName =
      typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : playerId;

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
      context,
    });
  }

  /**
   * Opens the pending phase the landing square requires (animal riddle or directional roll) and
   * returns the riddle that was picked, so the spoken prompt is the one that will be graded.
   */
  private openPendingForLanding(
    params: NonNullable<ReturnType<BoardEffectsHandler["getSquareEffectParams"]>>,
  ): EncounterQuestion | null {
    const { kind, playerId, position, power, squareName, squareData } = params;
    if (kind === "rollDirectional") {
      this.setPendingDirectionalRoll(playerId, position, squareData.effect as string | undefined);
      return null;
    }
    if (!isAnimalEncounterKind(kind) || !playerId) {
      return null;
    }
    const question = this.getEncounterQuestion(squareName, position);
    this.setPendingAnimalEncounter(playerId, position, power, question);
    return question;
  }

  private async deliverSquareLandingSpeech(args: {
    kind: ReturnType<typeof getSquareKind>;
    position: number;
    squareName: string;
    power: number;
    playerName: string;
    playerId: string;
    squareData: Record<string, unknown>;
    encounterQuestion: EncounterQuestion | null;
    applied: string[];
    repeatOceanForestPortal: boolean;
    arrivedViaTeleportFrom: number | undefined;
    context: ExecutionContext;
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
      context,
    } = args;

    if (isAnimalEncounterKind(kind)) {
      if (!encounterQuestion) {
        // ADR 0006: an animal with no riddle to ask is a loud failure, never a silent landing —
        // the player would otherwise be left owing an answer to a question nobody read out.
        throw new Error(
          `Animal encounter at position ${position} ("${squareName}") has no riddle to ask`,
        );
      }
      await this.speakDeterministicLanding(
        this.buildAnimalEncounterSpeech({ playerName, question: encounterQuestion }),
        context,
      );
      return;
    }

    if (repeatOceanForestPortal) {
      await this.speakDeterministicLanding(
        t("squares.oceanForestRepeat", { name: playerName, position, squareName }),
        context,
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
        context,
      );
      return;
    }

    if (kind === "magicDoor") {
      await this.speakDeterministicLanding(
        this.buildMagicDoorLandingSpeech(playerName, playerId, position, squareData),
        context,
      );
      return;
    }

    if (kind === "win") {
      await this.speakDeterministicLanding(this.buildWinLandingSpeech(playerName), context);
      return;
    }

    if (kind === "goldenFox") {
      // Board moves already ran, so still standing on the fox square means the jump found nobody
      // ahead: the mover *is* the leader (`getLeaderPosition` counts them). The fox is a no-op,
      // and the table has to hear why nothing happened.
      await this.speakDeterministicLanding(
        t("squares.goldenFoxAlreadyLeader", { name: playerName, position, squareName }),
        context,
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
      context,
    );
  }
}
