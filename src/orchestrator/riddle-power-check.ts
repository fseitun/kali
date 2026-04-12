import type { BoardEffectsHandler } from "./board-effects-handler";
import { getNextTargets } from "./board-next";
import { applyRollMovementResolvingForks } from "./board-traversal";
import type {
  PendingCompleteRollMovement,
  PendingPowerCheck,
  PendingRevenge,
  PendingRiddle,
} from "./pending-types";
import { getPowerCheckRollSpec } from "./power-check-dice";
import { isStrictRiddleCorrect } from "./riddle-answer";
import {
  buildNextPendingFromAskRiddle,
  createPowerCheckPendingFromRiddle,
  getPowerCheckContext,
  isValidAskRiddleInput,
} from "./riddle-power-check-helpers";
import { parseRollInRange } from "./roll-parser";
import type { TurnManager } from "./turn-manager";
import { GamePhase, type ExecutionContext, type GameState, type SquareData } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { getLocale } from "@/i18n/locale-manager";
import { t } from "@/i18n/translations";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { GAME_PATH, playerStatePath } from "@/state-paths";
import { Logger } from "@/utils/logger";

export interface RiddlePowerCheckDeps {
  stateManager: StateManager;
  speechService: ISpeechService;
  boardEffectsHandler: BoardEffectsHandler;
  turnManager: TurnManager;
  statusIndicator: IStatusIndicator;
  setLastNarration: (text: string) => void;
  checkAndApplyWinCondition: (positionPath: string) => void;
}

/**
 * Handles riddle and power-check (animal encounter) logic: ASK_RIDDLE and
 * PLAYER_ANSWERED for riddle/power-check, turn advance on power-check fail, rewards.
 */
export class RiddlePowerCheckHandler {
  constructor(private deps: RiddlePowerCheckDeps) {}

  /** After a riddle answer is judged, move pending to power-check. */
  private transitionRiddleToPowerCheck(correct: boolean): void {
    const state = this.deps.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pending as PendingRiddle | null | undefined;

    if (pending?.kind !== "riddle") {
      return;
    }

    const next = createPowerCheckPendingFromRiddle(pending, correct);
    this.deps.stateManager.set(GAME_PATH.pending, next);
    Logger.info(`Riddle resolved: correct=${correct}, phase→powerCheck`);
  }

  handleAskRiddle(primitive: {
    action: "ASK_RIDDLE";
    text: string;
    options: [string, string, string, string];
    correctOption: string;
    correctOptionSynonyms?: string[];
  }): void {
    const state = this.deps.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pending as PendingRiddle | null | undefined;
    if (pending?.kind !== "riddle") {
      return;
    }
    if (!isValidAskRiddleInput(primitive)) {
      Logger.warn(
        `ASK_RIDDLE ignored: need options length 4 and non-empty correctOption, got ${primitive.options?.length ?? 0}, correctOption=${String(primitive.correctOption ?? "").slice(0, 20)}`,
      );
      return;
    }
    const next = buildNextPendingFromAskRiddle(pending, primitive);
    this.deps.stateManager.set(GAME_PATH.pending, next);
    Logger.info(
      `Ask riddle stored; correctOption=${primitive.correctOption.slice(0, 30)}${primitive.correctOptionSynonyms?.length ? `, synonyms=${primitive.correctOptionSynonyms.length}` : ""}`,
    );
  }

  async tryHandleRiddleAnswer(
    answer: string,
    _context: ExecutionContext,
  ): Promise<false | { correct: boolean }> {
    const state = this.deps.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const pending = game?.pending as PendingRiddle | null | undefined;
    if (
      pending?.kind !== "riddle" ||
      pending.playerId !== currentTurn ||
      !pending.correctOption ||
      !Array.isArray(pending.riddleOptions) ||
      pending.riddleOptions.length !== 4
    ) {
      return false;
    }

    if (
      isStrictRiddleCorrect(
        answer,
        pending.riddleOptions,
        pending.correctOption,
        pending.correctOptionSynonyms,
      )
    ) {
      this.transitionRiddleToPowerCheck(true);
      return { correct: true };
    }

    this.transitionRiddleToPowerCheck(false);
    return { correct: false };
  }

  private async handlePowerCheckWin(
    playerId: string,
    _position: number,
    squareData: Record<string, unknown>,
    currentPos: number,
    roll: number,
    context: ExecutionContext,
  ): Promise<{ handled: true; passed: true }> {
    const state = this.deps.stateManager.getState();
    const passMsg = t("game.powerCheckPass");
    this.deps.setLastNarration(passMsg);
    this.deps.statusIndicator.setState("speaking");
    await this.deps.speechService.speak(passMsg);

    const winJumpTo = squareData?.winJumpTo as number | undefined;
    let newPosition: number;
    let pendingAfter: PendingCompleteRollMovement | null = null;
    /** Kalimba §2B/C: the power/revenge die both beats the animal and advances along the graph; no separate movement die. */
    let powerDieWasFullGraphAdvance = false;

    if (typeof winJumpTo === "number") {
      newPosition = winJumpTo;
    } else {
      const movement = applyRollMovementResolvingForks(
        state as GameState,
        playerId,
        currentPos,
        roll,
        "forward",
      );
      if (movement.kind === "complete") {
        newPosition = movement.finalPosition;
        powerDieWasFullGraphAdvance = true;
      } else {
        newPosition = movement.positionAtFork;
        pendingAfter = {
          kind: "completeRollMovement",
          playerId,
          remainingSteps: movement.remainingSteps,
          direction: movement.direction,
        };
      }
    }

    this.deps.stateManager.set(playerStatePath(playerId, "position"), newPosition);
    this.applyAnimalEncounterRewards(playerId, squareData);
    if (squareData.heart === true) {
      const heartMsg = t("squares.appliedHeart");
      this.deps.setLastNarration(heartMsg);
      this.deps.statusIndicator.setState("speaking");
      await this.deps.speechService.speak(heartMsg);
    }
    this.deps.stateManager.set(GAME_PATH.pending, pendingAfter);
    Logger.info(
      pendingAfter
        ? `Power check WIN: ${playerId} pauses at fork ${newPosition}, ${pendingAfter.remainingSteps} step(s) remain`
        : `Power check WIN: ${playerId} advances to ${newPosition}`,
    );

    const positionPath = playerStatePath(playerId, "position");
    await this.deps.boardEffectsHandler.checkAndApplyBoardMoves(positionPath, context);

    if (pendingAfter?.kind === "completeRollMovement") {
      await this.maybeSpeakPowerCheckForkPrompt(playerId, newPosition, pendingAfter);
    } else {
      await this.speakLandedOnAnimalIfNeededThenSquareEffects(
        playerId,
        newPosition,
        positionPath,
        context,
      );
    }
    this.deps.checkAndApplyWinCondition(positionPath);

    await this.applyPowerCheckWinSpeechAndTurnFollowUp(playerId, context, positionPath, {
      powerDieWasFullGraphAdvance,
      winJumpTo,
      pendingAfter,
    });

    return { handled: true, passed: true };
  }

  /**
   * §2B full graph advance, stable winJumpTo (turn ends / app advances), or ADR 0003-style nudge.
   */
  private async applyPowerCheckWinSpeechAndTurnFollowUp(
    playerId: string,
    context: ExecutionContext,
    positionPath: string,
    args: {
      powerDieWasFullGraphAdvance: boolean;
      winJumpTo: number | undefined;
      pendingAfter: PendingCompleteRollMovement | null;
    },
  ): Promise<void> {
    const { powerDieWasFullGraphAdvance, winJumpTo, pendingAfter } = args;
    if (powerDieWasFullGraphAdvance) {
      this.applyPowerDieFullGraphAdvanceFollowUp(context);
      return;
    }
    if (
      typeof winJumpTo === "number" &&
      !pendingAfter &&
      (this.deps.stateManager.get(positionPath) as number) === winJumpTo
    ) {
      // Win jump completed in one step; portal off the jump target keeps the ADR 0003 nudge path.
      context.advanceTurnDespitePowerCheckSuppress = true;
      return;
    }
    if (!this.shouldSpeakAfterEncounterMovementNudge(playerId, context)) {
      return;
    }
    const name = this.displayNameForPlayer(
      this.deps.stateManager.getState() as GameState,
      playerId,
    );
    const landed = this.deps.stateManager.get(playerStatePath(playerId, "position")) as number;
    const nudge = t("game.afterEncounterRollPrompt", { name, position: landed });
    this.deps.setLastNarration(nudge);
    this.deps.statusIndicator.setState("speaking");
    await this.deps.speechService.speak(nudge);
  }

  /**
   * After §2B full graph advance: end the turn unless the landing square opened a new encounter
   * for the current player (e.g. chained animal).
   */
  private applyPowerDieFullGraphAdvanceFollowUp(context: ExecutionContext): void {
    if (this.deps.turnManager.hasPendingForCurrentTurn()) {
      context.advanceTurnDespitePowerCheckSuppress = true;
      return;
    }
    const next = this.deps.turnManager.advanceTurnMechanical();
    if (next) {
      context.turnAdvancedAfterPowerCheckWin = {
        playerId: next.playerId,
        name: next.name,
        position: next.position,
      };
    }
  }

  private displayNameForPlayer(state: GameState, playerId: string): string {
    const p = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
    const name = p?.name;
    return typeof name === "string" && name.length > 0 ? name : playerId;
  }

  private async maybeSpeakPowerCheckForkPrompt(
    playerId: string,
    forkSquare: number,
    pending: PendingCompleteRollMovement,
  ): Promise<void> {
    const postMove = this.deps.stateManager.getState() as GameState;
    const forkSq = (postMove.board as { squares?: Record<string, SquareData> })?.squares?.[
      String(forkSquare)
    ];
    const forkTargets = getNextTargets(forkSq);
    if (forkTargets.length < 2) {
      return;
    }
    const forkName = this.displayNameForPlayer(postMove, playerId);
    const options = this.formatForkOptionsForSpeech(forkTargets);
    const forkMsg = t("game.powerCheckPassForkPrompt", {
      name: forkName,
      forkSquare,
      remainingSteps: pending.remainingSteps,
      options,
    });
    this.deps.setLastNarration(forkMsg);
    this.deps.statusIndicator.setState("speaking");
    await this.deps.speechService.speak(forkMsg);
  }

  private async speakLandedOnAnimalIfNeededThenSquareEffects(
    playerId: string,
    newPosition: number,
    positionPath: string,
    context: ExecutionContext,
  ): Promise<void> {
    const postMove = this.deps.stateManager.getState() as GameState;
    const landSq = (postMove.board as { squares?: Record<string, Record<string, unknown>> })
      ?.squares?.[String(newPosition)];
    const landPower = landSq?.power;
    if (typeof landPower === "number" && landPower >= 1) {
      const moverName = this.displayNameForPlayer(postMove, playerId);
      const landedMsg = t("game.powerCheckPassLandedAt", {
        name: moverName,
        position: newPosition,
      });
      this.deps.setLastNarration(landedMsg);
      this.deps.statusIndicator.setState("speaking");
      await this.deps.speechService.speak(landedMsg);
    }
    await this.deps.boardEffectsHandler.checkAndApplySquareEffects(positionPath, context);
  }

  private formatForkOptionsForSpeech(targets: number[]): string {
    const locale = getLocale();
    const sep = locale === "es-AR" ? " o " : " or ";
    return targets.map(String).join(sep);
  }

  /**
   * Prompt for a **separate** movement die only when the encounter resolution did not already
   * move the token along the board graph with the power/revenge roll (Kalimba §2B/C: full graph
   * advance ends the turn via `advanceTurnMechanical` + `turnAdvancedAfterPowerCheckWin`, not this nudge).
   *
   * Still prompt when `winJumpTo` or chained board effects placed the player without that
   * semantics (e.g. ADR 0003 portal after eagle jump), or when `game.pending` holds fork
   * remainder (`completeRollMovement` — fork prompt is spoken separately).
   *
   * Skipped when `advanceTurnDespitePowerCheckSuppress` is already true (e.g. skip-turn landing
   * from `BoardEffectsHandler`) without §2B mechanical advance.
   */
  private shouldSpeakAfterEncounterMovementNudge(
    playerId: string,
    context: ExecutionContext,
  ): boolean {
    if (context.advanceTurnDespitePowerCheckSuppress === true) {
      return false;
    }
    const state = this.deps.stateManager.getState() as GameState;
    const game = state.game as Record<string, unknown> | undefined;
    if (!game || game.pending != null || game.phase !== GamePhase.PLAYING || game.winner != null) {
      return false;
    }
    if (game.turn !== playerId) {
      return false;
    }
    const position = (state.players as Record<string, Record<string, unknown>>)?.[playerId]
      ?.position;
    return typeof position === "number";
  }

  private async handlePowerCheckLose(pending: PendingPowerCheck): Promise<{
    handled: true;
    passed: false;
    turnAdvanced?: { playerId: string; name: string; position: number };
  }> {
    const failMsg = t("game.powerCheckFail");
    this.deps.setLastNarration(failMsg);
    this.deps.statusIndicator.setState("speaking");
    await this.deps.speechService.speak(failMsg);
    const next: PendingRevenge = {
      kind: "revenge",
      playerId: pending.playerId,
      position: pending.position,
      power: pending.power,
      phase: "revenge",
    };
    this.deps.stateManager.set(GAME_PATH.pending, next);
    Logger.info(`Power check LOSE: phase→revenge, advancing turn to next player`);
    const turnAdvanced = this.deps.turnManager.advanceTurnMechanical();
    return { handled: true, passed: false, turnAdvanced: turnAdvanced ?? undefined };
  }

  private parsePowerCheckRoll(answer: string, min: number, max: number): number | null {
    return parseRollInRange(answer, min, max);
  }

  async tryHandlePowerCheckAnswer(
    answer: string,
    context: ExecutionContext,
  ): Promise<
    | false
    | { handled: true; passed: true }
    | {
        handled: true;
        passed: false;
        turnAdvanced?: { playerId: string; name: string; position: number };
      }
  > {
    const state = this.deps.stateManager.getState();
    const ctx = getPowerCheckContext(state);
    if (!ctx) {
      return false;
    }

    const { pending, playerId, position, power, isRevenge } = ctx;

    const board = state.board as Record<string, unknown> | undefined;
    const squares = (board?.squares as Record<string, Record<string, unknown>>) ?? {};
    const squareData = squares[position.toString()] ?? {};
    const rollSpec =
      pending.kind === "powerCheck"
        ? getPowerCheckRollSpec("powerCheck", pending.riddleCorrect, squareData)
        : getPowerCheckRollSpec("revenge", undefined, squareData);
    const roll = this.parsePowerCheckRoll(answer, rollSpec.min, rollSpec.max);
    if (roll === null) {
      return false;
    }

    this.deps.stateManager.set(GAME_PATH.lastRoll, roll);

    const win = isRevenge ? roll >= power : roll > power;

    if (win) {
      const currentPos = this.deps.stateManager.get(
        playerStatePath(playerId, "position"),
      ) as number;
      return this.handlePowerCheckWin(playerId, position, squareData, currentPos, roll, context);
    }

    if (pending.kind === "powerCheck") {
      return this.handlePowerCheckLose(pending);
    }

    return { handled: true, passed: false };
  }

  applyAnimalEncounterRewards(playerId: string, squareData: Record<string, unknown>): void {
    if (squareData.heart === true) {
      const current =
        (this.deps.stateManager.get(playerStatePath(playerId, "hearts")) as number) ?? 0;
      this.deps.stateManager.set(playerStatePath(playerId, "hearts"), current + 1);
    }

    const instrument = squareData.instrument as string | undefined;
    if (typeof instrument === "string" && instrument.length > 0) {
      const current =
        (this.deps.stateManager.get(playerStatePath(playerId, "instruments")) as unknown[]) ?? [];
      const next = Array.isArray(current) ? [...current, instrument] : [instrument];
      this.deps.stateManager.set(playerStatePath(playerId, "instruments"), next);
    }
  }
}
