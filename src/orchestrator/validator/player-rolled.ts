import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import { hasPendingDecisionsInState } from "./mock-state";
import type { ValidationResult, ValidatorContext } from "./types";

type PendingEncounter = { phase?: string; playerId?: string } | null | undefined;

function isAwaitingRiddleForTurn(
  pending: PendingEncounter,
  currentTurn: string | undefined,
): boolean {
  return pending?.phase === "riddle" && Boolean(currentTurn) && pending.playerId === currentTurn;
}

function isAwaitingEncounterRollForTurn(
  pending: PendingEncounter,
  currentTurn: string | undefined,
): boolean {
  return (
    (pending?.phase === "powerCheck" || pending?.phase === "revenge") &&
    pending?.playerId === currentTurn
  );
}

function validatePlayerRolledPhaseRestrictions(
  state: GameState,
  index: number,
  context: ValidatorContext,
): ValidationResult | null {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pendingAnimalEncounter as PendingEncounter;

  if (context.isProcessingEffect) {
    return {
      valid: false,
      errorCode: "resolveSquareEffectFirst",
      error: `PLAYER_ROLLED at index ${index}: Cannot roll dice during square effect processing. The square effect must be resolved first (fight/flee decision, etc.).`,
    };
  }
  if (hasPendingDecisionsInState(state)) {
    return {
      valid: false,
      errorCode: "chooseForkFirst",
      error: `PLAYER_ROLLED at index ${index}: Cannot roll until direction is chosen at fork. Choose path/branch first.`,
    };
  }
  if (isAwaitingRiddleForTurn(pending, currentTurn)) {
    return {
      valid: false,
      errorCode: "answerRiddleFirst",
      error: `PLAYER_ROLLED at index ${index}: Answer the animal riddle first; movement roll comes after.`,
    };
  }
  if (isAwaitingEncounterRollForTurn(pending, currentTurn)) {
    return {
      valid: false,
      errorCode: "sayEncounterRollAsAnswer",
      error: `PLAYER_ROLLED at index ${index}: Awaiting ${pending?.phase} roll for animal encounter. Say the number as your answer, not as a movement roll.`,
    };
  }
  return null;
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

  return { valid: true };
}
