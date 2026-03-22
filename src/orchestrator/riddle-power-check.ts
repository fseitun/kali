import type { BoardEffectsHandler } from "./board-effects-handler";
import { computeNewPositionFromState } from "./board-traversal";
import { isStrictRiddleCorrect } from "./riddle-answer";
import type { TurnManager } from "./turn-manager";
import type { ExecutionContext, GameState } from "./types";
import type { IStatusIndicator } from "@/components/status-indicator";
import { t } from "@/i18n/translations";
import type { LLMClient } from "@/llm/LLMClient";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { Logger } from "@/utils/logger";

export interface RiddlePowerCheckDeps {
  stateManager: StateManager;
  speechService: ISpeechService;
  llmClient: LLMClient;
  boardEffectsHandler: BoardEffectsHandler;
  turnManager: TurnManager;
  statusIndicator: IStatusIndicator;
  setLastNarration: (text: string) => void;
  checkAndApplyWinCondition: (positionPath: string) => void;
}

/**
 * Handles riddle and power-check (animal encounter) logic: ASK_RIDDLE, RIDDLE_RESOLVED,
 * PLAYER_ANSWERED for riddle/power-check, turn advance on power-check fail, rewards.
 */
export class RiddlePowerCheckHandler {
  constructor(private deps: RiddlePowerCheckDeps) {}

  handleRiddleResolved(primitive: { action: "RIDDLE_RESOLVED"; correct: boolean }): void {
    const state = this.deps.stateManager.getState();
    const game = state.game as Record<string, unknown> | undefined;
    const pending = game?.pendingAnimalEncounter as
      | { position: number; power: number; playerId: string; phase?: string }
      | null
      | undefined;

    if (pending?.phase !== "riddle") {
      return;
    }

    this.deps.stateManager.set("game.pendingAnimalEncounter", {
      ...pending,
      phase: "powerCheck",
      riddleCorrect: primitive.correct,
    });
    Logger.info(`Riddle resolved: correct=${primitive.correct}, phase→powerCheck`);
  }

  private isValidAskRiddleInput(primitive: { options: unknown; correctOption: unknown }): boolean {
    return (
      Array.isArray(primitive.options) &&
      primitive.options.length === 4 &&
      typeof primitive.correctOption === "string" &&
      primitive.correctOption.trim().length > 0
    );
  }

  private buildPendingWithRiddle(
    pending: Record<string, unknown>,
    primitive: {
      text: string;
      options: [string, string, string, string];
      correctOption: string;
      correctOptionSynonyms?: string[];
    },
  ): Record<string, unknown> {
    const synonyms =
      Array.isArray(primitive.correctOptionSynonyms) && primitive.correctOptionSynonyms.length > 0
        ? { correctOptionSynonyms: primitive.correctOptionSynonyms }
        : {};
    return {
      ...pending,
      riddlePrompt: primitive.text,
      riddleOptions: primitive.options,
      correctOption: primitive.correctOption,
      ...synonyms,
    };
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
    const pending = game?.pendingAnimalEncounter as Record<string, unknown> | null | undefined;
    if (pending?.phase !== "riddle") {
      return;
    }
    if (!this.isValidAskRiddleInput(primitive)) {
      Logger.warn(
        `ASK_RIDDLE ignored: need options length 4 and non-empty correctOption, got ${primitive.options?.length ?? 0}, correctOption=${String(primitive.correctOption ?? "").slice(0, 20)}`,
      );
      return;
    }
    this.deps.stateManager.set(
      "game.pendingAnimalEncounter",
      this.buildPendingWithRiddle(pending, primitive),
    );
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
    const pending = game?.pendingAnimalEncounter as
      | {
          phase?: string;
          playerId?: string;
          correctOption?: string;
          correctOptionSynonyms?: string[];
          riddleOptions?: string[];
        }
      | null
      | undefined;
    if (
      pending?.phase !== "riddle" ||
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
      this.handleRiddleResolved({ action: "RIDDLE_RESOLVED", correct: true });
      return { correct: true };
    }

    const options = pending.riddleOptions as [string, string, string, string];
    const result = await this.deps.llmClient.validateRiddleAnswer(
      answer,
      options,
      pending.correctOption,
    );
    this.handleRiddleResolved({ action: "RIDDLE_RESOLVED", correct: result.correct });
    return { correct: result.correct };
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
    const newPosition =
      typeof winJumpTo === "number"
        ? winJumpTo
        : computeNewPositionFromState(state as GameState, playerId, currentPos, roll);

    this.deps.stateManager.set(`players.${playerId}.position`, newPosition);
    this.applyAnimalEncounterRewards(playerId, squareData);
    this.deps.stateManager.set("game.pendingAnimalEncounter", null);
    Logger.info(`Power check WIN: ${playerId} advances to ${newPosition}`);

    await this.deps.boardEffectsHandler.checkAndApplyBoardMoves(`players.${playerId}.position`);
    await this.deps.boardEffectsHandler.checkAndApplySquareEffects(
      `players.${playerId}.position`,
      context,
    );
    this.deps.checkAndApplyWinCondition(`players.${playerId}.position`);
    return { handled: true, passed: true };
  }

  private async handlePowerCheckLose(pending: {
    position: number;
    power: number;
    playerId: string;
    phase?: string;
  }): Promise<{
    handled: true;
    passed: false;
    turnAdvanced?: { playerId: string; name: string; position: number };
  }> {
    const failMsg = t("game.powerCheckFail");
    this.deps.setLastNarration(failMsg);
    this.deps.statusIndicator.setState("speaking");
    await this.deps.speechService.speak(failMsg);
    this.deps.stateManager.set("game.pendingAnimalEncounter", {
      ...pending,
      phase: "revenge",
    });
    Logger.info(`Power check LOSE: phase→revenge, advancing turn to next player`);
    const turnAdvanced = this.deps.turnManager.advanceTurnMechanical();
    return { handled: true, passed: false, turnAdvanced: turnAdvanced ?? undefined };
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
    const game = state.game as Record<string, unknown> | undefined;
    const currentTurn = game?.turn as string | undefined;
    const pending = game?.pendingAnimalEncounter as
      | {
          position: number;
          power: number;
          playerId: string;
          phase?: string;
          riddleCorrect?: boolean;
        }
      | null
      | undefined;

    if (
      !pending ||
      !currentTurn ||
      pending.playerId !== currentTurn ||
      (pending.phase !== "powerCheck" && pending.phase !== "revenge")
    ) {
      return false;
    }

    const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
    const roll = parseInt(rollStr, 10);
    if (isNaN(roll) || roll < 1 || roll > 12) {
      return false;
    }

    const power = pending.power ?? 0;
    const isRevenge = pending.phase === "revenge";
    const win = isRevenge ? roll >= power : roll > power;

    const playerId = pending.playerId;
    const position = pending.position;
    const board = state.board as Record<string, unknown> | undefined;
    const squares = (board?.squares as Record<string, Record<string, unknown>>) ?? {};
    const squareData = squares[position.toString()] ?? {};

    if (win) {
      const currentPos = this.deps.stateManager.get(`players.${playerId}.position`) as number;
      return this.handlePowerCheckWin(playerId, position, squareData, currentPos, roll, context);
    }

    if (pending.phase === "powerCheck") {
      return this.handlePowerCheckLose(pending);
    }

    return { handled: true, passed: false };
  }

  applyAnimalEncounterRewards(playerId: string, squareData: Record<string, unknown>): void {
    const points = squareData.points as number | undefined;
    if (typeof points === "number" && points > 0) {
      const current = (this.deps.stateManager.get(`players.${playerId}.points`) as number) ?? 0;
      this.deps.stateManager.set(`players.${playerId}.points`, current + points);
    }

    if (squareData.heart === true) {
      const current = (this.deps.stateManager.get(`players.${playerId}.hearts`) as number) ?? 0;
      this.deps.stateManager.set(`players.${playerId}.hearts`, current + 1);
    }

    const instrument = squareData.instrument as string | undefined;
    if (typeof instrument === "string" && instrument.length > 0) {
      const current =
        (this.deps.stateManager.get(`players.${playerId}.instruments`) as unknown[]) ?? [];
      const next = Array.isArray(current) ? [...current, instrument] : [instrument];
      this.deps.stateManager.set(`players.${playerId}.instruments`, next);
    }
  }
}
