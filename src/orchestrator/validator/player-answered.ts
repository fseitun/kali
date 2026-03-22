import { getDecisionPoints } from "../decision-point-inference";
import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult } from "./types";

function validateRiddlePhaseAnswer(
  pending: { phase?: string; playerId?: string; correctOption?: string } | null | undefined,
  currentTurn: string,
  answer: string,
  index: number,
): ValidationResult | null {
  if (pending?.phase !== "riddle" || pending.playerId !== currentTurn || !pending.correctOption) {
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

function getPowerCheckRollLimits(pending: { phase?: string; riddleCorrect?: boolean }): {
  min: number;
  max: number;
  label: string;
} {
  const is2d6 = pending.phase === "powerCheck" && pending.riddleCorrect === true;
  return is2d6 ? { min: 2, max: 12, label: "2d6" } : { min: 1, max: 6, label: "1d6" };
}

function parsePowerCheckRoll(answer: string): number | null {
  const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
  const roll = parseInt(rollStr, 10);
  return Number.isNaN(roll) ? null : roll;
}

function validatePowerCheckRoll(
  roll: number,
  pending: { phase?: string; riddleCorrect?: boolean },
  index: number,
): ValidationResult {
  const { min, max, label } = getPowerCheckRollLimits(pending);
  if (roll >= min && roll <= max) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `PLAYER_ANSWERED at index ${index}: Roll must be ${min}-${max} (${label}), got ${roll}.`,
    errorCode: "invalidDiceRoll",
  };
}

function validatePowerCheckAnswer(
  pending: { phase?: string; playerId?: string; riddleCorrect?: boolean } | null | undefined,
  currentTurn: string,
  answer: string,
  index: number,
): ValidationResult | null {
  const isPowerPhase =
    (pending?.phase === "powerCheck" || pending?.phase === "revenge") &&
    pending?.playerId === currentTurn;
  if (!isPowerPhase || !pending) {
    return null;
  }
  const roll = parsePowerCheckRoll(answer);
  if (roll === null) {
    return { valid: true };
  }
  return validatePowerCheckRoll(roll, pending, index);
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
  const pathChoiceDp = decisionPoints.find((dp) => dp.position === 0);
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
  pending: unknown;
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
  return { answer, currentTurn, currentPlayer, pending: game?.pendingAnimalEncounter };
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
  const riddleResult = validateRiddlePhaseAnswer(
    pending as { phase?: string; playerId?: string; correctOption?: string },
    currentTurn,
    answer,
    index,
  );
  if (riddleResult !== null) {
    return riddleResult;
  }

  const powerResult = validatePowerCheckAnswer(
    pending as { phase?: string; playerId?: string; riddleCorrect?: boolean },
    currentTurn,
    answer,
    index,
  );
  if (powerResult !== null) {
    return powerResult;
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
