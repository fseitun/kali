import type { BoardEffectsHandler } from "./board-effects-handler";
import { appendInventoryEntry, incrementCounter } from "./board-effects-reward-policy";
import { getNextTargets } from "./board-next";
import { applyRollMovementResolvingForks } from "./board-traversal";
import { formatForkTargetsForSpeech } from "./decision-point-inference";
import type {
  PendingCompleteRollMovement,
  PendingPowerCheck,
  PendingRevenge,
  PendingRiddle,
} from "./pending-types";
import { getPowerCheckRollSpec } from "./power-check-dice";
import { isStrictRiddleCorrect } from "./riddle-answer";
import {
  createPowerCheckPendingFromRiddle,
  getPowerCheckContext,
} from "./riddle-power-check-helpers";
import { parseRollInRange } from "./roll-parser";
import type { TurnManager } from "./turn-manager";
import {
  GamePhase,
  type ExecutionContext,
  type GameState,
  type NextPlayer,
  type SquareData,
} from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
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
 * Handles riddle and power-check (animal encounter) logic: PLAYER_ANSWERED for
 * riddle/power-check, turn advance on power-check fail, rewards. The riddle itself comes from
 * the deterministic bank in `BoardEffectsHandler`, never from the interpreter.
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

  async tryHandleRiddleAnswer(answer: string): Promise<false | { correct: boolean }> {
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
        state,
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
    // Beating the animal settles any revenge this player was owing on it.
    this.deps.stateManager.set(playerStatePath(playerId, "pendingRevenge"), null);
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
    const name = this.displayNameForPlayer(this.deps.stateManager.getState(), playerId);
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
      context.turnAdvancedAfterPowerCheckWin = next;
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
    const options = formatForkTargetsForSpeech(forkTargets);
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

  /**
   * Kalimba §2B/C: a failed power check or revenge roll leaves the player on the animal square
   * with a revenge pending for their next turn, and ends the current turn.
   */
  private async handleEncounterRollLose(pending: PendingPowerCheck | PendingRevenge): Promise<{
    handled: true;
    passed: false;
    turnAdvanced?: NextPlayer;
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
    };
    this.deps.stateManager.set(GAME_PATH.pending, next);
    // `game.pending` is a single slot the player whose turn it is keeps overwriting, but a revenge
    // outlives its owner's turn (§2C). Park a copy on the player so an opponent landing on an
    // animal cannot erase it; `TurnManager` puts it back when the turn returns to them.
    this.deps.stateManager.set(playerStatePath(pending.playerId, "pendingRevenge"), next);
    Logger.info(`${pending.kind} LOSE: phase→revenge, advancing turn to next player`);
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
        turnAdvanced?: NextPlayer;
      }
  > {
    const state = this.deps.stateManager.getState();
    const ctx = getPowerCheckContext(state);
    if (!ctx) {
      return false;
    }

    const { pending, playerId, position, power, isRevenge } = ctx;

    const board = state.board;
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
      return this.handlePowerCheckWin(playerId, squareData, currentPos, roll, context);
    }

    return this.handleEncounterRollLose(pending);
  }

  private applyAnimalEncounterRewards(playerId: string, squareData: Record<string, unknown>): void {
    if (squareData.heart === true) {
      const heartsPath = playerStatePath(playerId, "hearts");
      this.deps.stateManager.set(
        heartsPath,
        incrementCounter(this.deps.stateManager.get(heartsPath)),
      );
    }

    const instrument = squareData.instrument;
    if (typeof instrument === "string" && instrument.length > 0) {
      const instrumentsPath = playerStatePath(playerId, "instruments");
      this.deps.stateManager.set(
        instrumentsPath,
        appendInventoryEntry(this.deps.stateManager.get(instrumentsPath), instrument),
      );
    }
  }
}
