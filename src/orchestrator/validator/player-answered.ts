import { getDecisionPointApplyState } from "../decision-helpers";
import { getDecisionPoints } from "../decision-point-inference";
import { forkChoiceBlockingValidation, getMovementDirectionForState } from "../fork-roll-policy";
import type { Pending } from "../pending-types";
import { getPending, getPendingRollSpec, isPendingRollKind } from "../pending-types";
import { parseRollLikeInput } from "../roll-parser";
import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult } from "./types";

function validateRiddlePhaseAnswer(
  pending: Pending | null | undefined,
  currentTurn: string,
  answer: string,
  index: number,
): ValidationResult | null {
  if (pending?.kind !== "riddle" || pending.playerId !== currentTurn || !pending.correctOption) {
    return null;
  }
  if (!answer) {
    return {
      valid: false,
      error: `PLAYER_ANSWERED at index ${index}: requires non-empty answer`,
      errorCode: "invalidAnswer",
    };
  }
  return { valid: true };
}

/**
 * Nothing downstream can read this answer: fork keywords already returned valid above, and the
 * executors all parse digits. Passing it would report success, speak nothing and still owe the
 * roll — so name what to say instead. Several numbers ("1 y 6") get the dice message; no number
 * at all ("cuatro", "no sé") gets the plainer "just say the number".
 */
function gradeUnparseableRollAnswer(answer: string, index: number): ValidationResult {
  if (!/\d/.test(answer)) {
    return {
      valid: false,
      error: `PLAYER_ANSWERED at index ${index}: "${answer}" holds no roll number. Say the number you rolled.`,
      errorCode: "sayRollNumber",
    };
  }
  return {
    valid: false,
    error: `PLAYER_ANSWERED at index ${index}: "${answer}" is not a single roll number. Report one number.`,
    errorCode: "invalidDiceRoll",
  };
}

function validatePendingRollAnswer(
  pending: Pending | null | undefined,
  currentTurn: string,
  answer: string,
  state: GameState,
  index: number,
): ValidationResult | null {
  if (!pending || !isPendingRollKind(pending) || pending.playerId !== currentTurn) {
    return null;
  }
  const roll = parseRollLikeInput(answer);
  if (roll === null) {
    return gradeUnparseableRollAnswer(answer, index);
  }
  const { min, max, label } = getPendingRollSpec(
    pending as Parameters<typeof getPendingRollSpec>[0],
    state,
  );
  if (roll < min || roll > max) {
    return {
      valid: false,
      error: `PLAYER_ANSWERED at index ${index}: Roll must be ${min}-${max} (${label}), got ${roll}.`,
      errorCode: "invalidDiceRoll",
    };
  }
  if (pending.kind === "directional") {
    const forkErr = forkChoiceBlockingValidation(
      state,
      index,
      roll,
      getMovementDirectionForState(state, currentTurn),
    );
    if (forkErr) {
      return forkErr;
    }
  }
  return { valid: true };
}

function validatePathChoiceAB(
  answer: string,
  position: number | undefined,
  decisionPoints: ReturnType<typeof getDecisionPoints>,
  hasChoiceAt: (pos: number) => boolean,
  index: number,
): ValidationResult | null {
  // Only a bare "A"/"B" is a fork letter. Words that merely start with those letters
  // ("Bosque", "Adelante") are ordinary answers and must not be rejected here.
  const letter = answer
    .trim()
    .replace(/[).,!?¡¿]/g, "")
    .toUpperCase();
  if (letter !== "A" && letter !== "B") {
    return null;
  }
  const pathChoiceDp = decisionPoints.find(
    (dp) => dp.position === 0 && (dp.direction ?? "forward") === "forward",
  );
  if (!pathChoiceDp) {
    return { valid: true };
  }
  const atDecisionSquare = typeof position === "number" && position === 0;
  const hasPendingPathChoice = atDecisionSquare && !hasChoiceAt(0);
  if (!hasPendingPathChoice) {
    return {
      valid: false,
      error: `PLAYER_ANSWERED at index ${index}: Path choice (A/B) can only be applied when the current turn player is at position 0 with no fork choice. Current player has no pending path choice.`,
      errorCode: "invalidAnswer",
    };
  }
  return { valid: true };
}

function getValidationContext(
  action: PrimitiveAction,
  state: GameState,
): {
  answer: string;
  currentTurn: string;
  currentPlayer: Record<string, unknown>;
  pending: Pending | null | undefined;
} | null {
  const answer = ((action as { answer?: string }).answer ?? "").trim();
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const currentPlayer = (state.players as Record<string, Record<string, unknown>> | undefined)?.[
    currentTurn ?? ""
  ];
  if (!currentTurn || !currentPlayer) {
    return null;
  }
  return {
    answer,
    currentTurn,
    currentPlayer,
    pending: getPending(game),
  };
}

export function validatePlayerAnswered(
  action: PrimitiveAction,
  state: GameState,
  index: number,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const answerValidation = validateField(
    actionRecord,
    "answer",
    "string",
    "PLAYER_ANSWERED",
    index,
  );
  if (!answerValidation.valid) {
    return answerValidation;
  }

  if ("answer" in action && typeof action.answer === "string" && action.answer.trim() === "") {
    return {
      valid: false,
      error: `PLAYER_ANSWERED at index ${index} requires non-empty answer`,
      errorCode: "invalidAnswer",
    };
  }

  const ctx = getValidationContext(action, state);
  if (!ctx) {
    return { valid: true };
  }

  const { answer, currentTurn, currentPlayer, pending } = ctx;
  const riddleResult = validateRiddlePhaseAnswer(pending, currentTurn, answer, index);
  if (riddleResult !== null) {
    return riddleResult;
  }

  if (getDecisionPointApplyState(state, answer) !== null) {
    return { valid: true };
  }

  const rollResult = validatePendingRollAnswer(pending, currentTurn, answer, state, index);
  if (rollResult !== null) {
    return rollResult;
  }

  const position = currentPlayer.position as number | undefined;
  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  const hasChoiceAt = (pos: number): boolean => choices?.[String(pos)] !== undefined;

  const pathChoiceResult = validatePathChoiceAB(
    answer,
    position,
    getDecisionPoints(state),
    hasChoiceAt,
    index,
  );
  return pathChoiceResult ?? { valid: true };
}
