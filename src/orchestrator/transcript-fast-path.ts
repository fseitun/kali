/**
 * Deterministic interpretation of common user transcripts before calling the LLM.
 * Results still go through the same validation and execution pipeline as model output.
 */

import { getDecisionPointApplyState } from "./decision-helpers";
import { forkChoiceBlockingValidation, getMovementDirectionForState } from "./fork-roll-policy";
import {
  getPendingRollSpec,
  isPendingRollKind,
  type Pending,
  type PendingPowerCheck,
  type PendingRevenge,
  type PendingDirectional,
} from "./pending-types";
import { resolveRiddleAnswerToOption } from "./riddle-answer";
import type { ExecutionContext, GameState, PrimitiveAction } from "./types";
import { validatePlayerRolled } from "./validator/player-rolled";
import type { ValidatorContext } from "./validator/types";
import { t } from "@/i18n/translations";

const HELP_RE =
  /^(help|ayuda|qué\s+hago|que\s+hago|what\s+(do\s+i\s+do|should\s+i\s+do))\s*[.!?]?$/i;

function trimTranscript(transcript: string): string {
  return transcript.trim();
}

function isPendingAnimalRiddleForCurrentTurn(game: Record<string, unknown> | undefined): boolean {
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as { kind?: string; playerId?: string } | null | undefined;
  return pending?.kind === "riddle" && Boolean(currentTurn) && pending.playerId === currentTurn;
}

function parseSingleInt(transcript: string): number | null {
  const t = trimTranscript(transcript);
  if (!/^\d+$/.test(t)) {
    return null;
  }
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function parseRollLikeAnswer(answer: string): number | null {
  const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
  const roll = parseInt(rollStr, 10);
  return Number.isNaN(roll) ? null : roll;
}

function tryHelpFastPath(trimmed: string): PrimitiveAction[] | null {
  if (!HELP_RE.test(trimmed)) {
    return null;
  }
  return [{ action: "NARRATE", text: t("game.helpGameplay") }];
}

type PendingRoll = PendingPowerCheck | PendingRevenge | PendingDirectional;

function tryRiddleFastPath(
  _state: GameState,
  trimmed: string,
  game: Record<string, unknown> | undefined,
): PrimitiveAction[] | null {
  if (!isPendingAnimalRiddleForCurrentTurn(game)) {
    return null;
  }
  const pending = game?.pending as {
    kind?: string;
    riddleOptions?: string[];
    correctOption?: string;
  };
  if (
    pending?.kind !== "riddle" ||
    !Array.isArray(pending.riddleOptions) ||
    pending.riddleOptions.length !== 4 ||
    !pending.correctOption
  ) {
    return null;
  }
  const opt = resolveRiddleAnswerToOption(trimmed, pending.riddleOptions);
  return opt !== null ? [{ action: "PLAYER_ANSWERED", answer: opt }] : null;
}

function directionalRollAllowed(state: GameState, currentTurn: string, roll: number): boolean {
  return (
    forkChoiceBlockingValidation(
      state,
      0,
      roll,
      getMovementDirectionForState(state, currentTurn),
    ) === null
  );
}

function getActivePendingRollContext(
  game: Record<string, unknown> | undefined,
): { pending: PendingRoll; currentTurn: string } | null {
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as Pending | null | undefined;
  if (!pending || !currentTurn || pending.playerId !== currentTurn) {
    return null;
  }
  if (!isPendingRollKind(pending)) {
    return null;
  }
  return { pending: pending as PendingRoll, currentTurn };
}

function tryPendingRollFastPath(
  state: GameState,
  trimmed: string,
  game: Record<string, unknown> | undefined,
): PrimitiveAction[] | null {
  const ctx = getActivePendingRollContext(game);
  if (!ctx) {
    return null;
  }
  const { pending, currentTurn } = ctx;
  const roll = parseRollLikeAnswer(trimmed);
  if (roll === null) {
    return null;
  }
  const { min, max } = getPendingRollSpec(pending, state);
  if (roll < min || roll > max) {
    return null;
  }
  if (pending.kind === "directional" && !directionalRollAllowed(state, currentTurn, roll)) {
    return null;
  }
  return [{ action: "PLAYER_ANSWERED", answer: String(roll) }];
}

function tryForkAnswerFastPath(
  state: GameState,
  trimmed: string,
  currentTurn: string | undefined,
): PrimitiveAction[] | null {
  if (!currentTurn) {
    return null;
  }
  if (getDecisionPointApplyState(state, trimmed) === null) {
    return null;
  }
  return [{ action: "PLAYER_ANSWERED", answer: trimmed }];
}

function tryMovementRollFastPath(
  state: GameState,
  trimmed: string,
  validatorContext: ValidatorContext,
): PrimitiveAction[] | null {
  if (validatorContext.isProcessingEffect) {
    return null;
  }
  const rollValue = parseSingleInt(trimmed);
  if (rollValue === null) {
    return null;
  }
  const rolled: PrimitiveAction = { action: "PLAYER_ROLLED", value: rollValue };
  const v = validatePlayerRolled(rolled, state, 0, validatorContext);
  if (!v.valid) {
    return null;
  }
  return [rolled];
}

/**
 * If the transcript can be mapped to primitives without the LLM, returns those actions.
 * Otherwise returns null (caller should call the LLM).
 *
 * @param state - Current game state
 * @param transcript - Raw user transcript
 * @param context - Execution context; skipped when nested
 * @param validatorContext - Same as validateActions (e.g. isProcessingEffect)
 */
function readFastPathGameContext(
  transcript: string,
  context: ExecutionContext,
  state: GameState,
): { trimmed: string; game: Record<string, unknown>; currentTurn: string | undefined } | null {
  if (context.isNestedCall) {
    return null;
  }
  const trimmed = trimTranscript(transcript);
  if (!trimmed || trimmed.startsWith("[SYSTEM:")) {
    return null;
  }
  const game = state.game as Record<string, unknown> | undefined;
  if ((game?.phase as string | undefined) !== "PLAYING") {
    return null;
  }
  return {
    trimmed,
    game: game as Record<string, unknown>,
    currentTurn: game?.turn as string | undefined,
  };
}

export function tryFastPathTranscript(
  state: GameState,
  transcript: string,
  context: ExecutionContext,
  validatorContext: ValidatorContext,
): PrimitiveAction[] | null {
  const ctx = readFastPathGameContext(transcript, context, state);
  if (!ctx) {
    return null;
  }
  const { trimmed, game, currentTurn } = ctx;

  const help = tryHelpFastPath(trimmed);
  if (help) {
    return help;
  }
  const riddle = tryRiddleFastPath(state, trimmed, game);
  if (riddle) {
    return riddle;
  }
  const pendingRoll = tryPendingRollFastPath(state, trimmed, game);
  if (pendingRoll) {
    return pendingRoll;
  }
  const fork = tryForkAnswerFastPath(state, trimmed, currentTurn);
  if (fork) {
    return fork;
  }
  return tryMovementRollFastPath(state, trimmed, validatorContext);
}
