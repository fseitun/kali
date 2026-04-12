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
    return { valid: true };
  }
  const { min, max, label } = getPendingRollSpec(
    pending as Parameters<typeof getPendingRollSpec>[0],
    state,
  );
  if (roll < min || roll > max) {
    if (getDecisionPointApplyState(state, answer) !== null) {
      return null;
    }
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
  const firstChar = answer.charAt(0).toUpperCase();
  if (firstChar !== "A" && firstChar !== "B") {
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
