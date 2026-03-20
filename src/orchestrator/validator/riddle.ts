import type { Orchestrator } from "../orchestrator";
import type { GameState, PrimitiveAction } from "../types";
import type { ValidationResult } from "./types";
import { validateField } from "./common";

export function validateAskRiddle(
  action: PrimitiveAction,
  _state: GameState,
  index: number,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const textValidation = validateField(actionRecord, "text", "string", "ASK_RIDDLE", index);
  if (!textValidation.valid) return textValidation;
  if (!Array.isArray(actionRecord.options) || actionRecord.options.length !== 4) {
    return {
      valid: false,
      error: `ASK_RIDDLE at index ${index}: options must be an array of exactly 4 strings`,
      errorCode: "invalidActionFormat",
    };
  }
  for (let i = 0; i < 4; i++) {
    if (typeof actionRecord.options[i] !== "string") {
      return {
        valid: false,
        error: `ASK_RIDDLE at index ${index}: options[${i}] must be a string`,
        errorCode: "invalidActionFormat",
      };
    }
  }
  const correctOption = actionRecord.correctOption;
  if (typeof correctOption !== "string" || !correctOption.trim()) {
    return {
      valid: false,
      error: `ASK_RIDDLE at index ${index}: correctOption must be a non-empty string (one of the four options)`,
      errorCode: "invalidActionFormat",
    };
  }
  if (
    "correctOptionSynonyms" in actionRecord &&
    actionRecord.correctOptionSynonyms !== undefined &&
    !Array.isArray(actionRecord.correctOptionSynonyms)
  ) {
    return {
      valid: false,
      error: `ASK_RIDDLE at index ${index}: correctOptionSynonyms must be an array of strings if present`,
      errorCode: "invalidActionFormat",
    };
  }
  return { valid: true };
}

export function validateRiddleResolved(
  action: PrimitiveAction,
  state: GameState,
  index: number,
  _orchestrator: Orchestrator,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const correctValidation = validateField(
    actionRecord,
    "correct",
    "boolean",
    "RIDDLE_RESOLVED",
    index,
  );
  if (!correctValidation.valid) return correctValidation;

  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pendingAnimalEncounter as
    | { phase?: string; playerId?: string }
    | null
    | undefined;

  if (!pending || pending.playerId !== currentTurn) {
    return {
      valid: false,
      error: `RIDDLE_RESOLVED at index ${index}: No pending riddle for current player. Only use when phase=riddle.`,
      errorCode: "wrongPhaseForRoll",
    };
  }

  if (pending.phase !== "riddle") {
    return {
      valid: false,
      error: `RIDDLE_RESOLVED at index ${index}: Expected phase=riddle, got phase=${pending.phase}. Use PLAYER_ANSWERED for power-check roll.`,
      errorCode: "wrongPhaseForRoll",
    };
  }

  return { valid: true };
}
