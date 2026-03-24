import { forkChoiceBlockingValidation } from "../fork-roll-policy";
import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult, ValidatorContext } from "./types";

type Pending = { kind?: string; playerId?: string } | null | undefined;

function isAwaitingRiddleForTurn(pending: Pending, currentTurn: string | undefined): boolean {
  return pending?.kind === "riddle" && Boolean(currentTurn) && pending.playerId === currentTurn;
}

function isAwaitingRollForTurn(pending: Pending, currentTurn: string | undefined): boolean {
  return (
    (pending?.kind === "powerCheck" ||
      pending?.kind === "revenge" ||
      pending?.kind === "directional") &&
    Boolean(currentTurn) &&
    pending.playerId === currentTurn
  );
}

function checkPendingBlocksRoll(
  pending: Pending,
  currentTurn: string | undefined,
  index: number,
): ValidationResult | null {
  if (isAwaitingRiddleForTurn(pending, currentTurn)) {
    return {
      valid: false,
      errorCode: "answerRiddleFirst",
      error: `PLAYER_ROLLED at index ${index}: Answer the animal riddle first; movement roll comes after.`,
    };
  }
  if (isAwaitingRollForTurn(pending, currentTurn)) {
    const phaseLabel =
      pending?.kind === "directional" ? "directional" : `${pending?.kind ?? "animal encounter"}`;
    return {
      valid: false,
      errorCode: "sayRollAsAnswer",
      error: `PLAYER_ROLLED at index ${index}: Awaiting ${phaseLabel} roll. Say the number as your answer (PLAYER_ANSWERED), not as a movement roll.`,
    };
  }
  return null;
}

function validatePlayerRolledPhaseRestrictions(
  state: GameState,
  index: number,
  context: ValidatorContext,
): ValidationResult | null {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as Pending;

  if (context.isProcessingEffect) {
    return {
      valid: false,
      errorCode: "resolveSquareEffectFirst",
      error: `PLAYER_ROLLED at index ${index}: Cannot roll dice during square effect processing. The square effect must be resolved first (fight/flee decision, etc.).`,
    };
  }
  return checkPendingBlocksRoll(pending, currentTurn, index);
}

function getRollLimits(state: GameState): { min: number; max: number; label: string } {
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const currentPlayer = currentTurn ? players?.[currentTurn] : undefined;
  const bonusDiceNextTurn = currentPlayer?.bonusDiceNextTurn === true;
  return bonusDiceNextTurn ? { min: 2, max: 12, label: "2d6" } : { min: 1, max: 6, label: "1d6" };
}

function validatePlayerRolledValueRange(
  action: PrimitiveAction,
  state: GameState,
  index: number,
): ValidationResult | null {
  const value = "value" in action && typeof action.value === "number" ? action.value : 0;
  const { min, max, label } = getRollLimits(state);
  if (value < min || value > max) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Roll must be ${min}-${max} (${label}), got ${value}.`,
      errorCode: "invalidDiceRoll",
    };
  }
  return null;
}

export function validatePlayerRolled(
  action: PrimitiveAction,
  state: GameState,
  index: number,
  context: ValidatorContext,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const valueValidation = validateField(actionRecord, "value", "number", "PLAYER_ROLLED", index);
  if (!valueValidation.valid) {
    return valueValidation;
  }

  if ("value" in action && typeof action.value === "number" && action.value <= 0) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index} requires positive value, got ${action.value}`,
      errorCode: "invalidActionFormat",
    };
  }

  const phaseErr = validatePlayerRolledPhaseRestrictions(state, index, context);
  if (phaseErr) {
    return phaseErr;
  }

  const rangeErr = validatePlayerRolledValueRange(action, state, index);
  if (rangeErr) {
    return rangeErr;
  }

  const rollValue = "value" in action && typeof action.value === "number" ? action.value : 0;
  return forkChoiceBlockingValidation(state, index, rollValue, "forward") ?? { valid: true };
}
