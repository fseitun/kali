import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult } from "./types";

function validateAskRiddleOptions(
  actionRecord: Record<string, unknown>,
  index: number,
): ValidationResult | null {
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
  return null;
}

function validateAskRiddleCorrectOption(
  actionRecord: Record<string, unknown>,
  index: number,
): ValidationResult | null {
  const correctOption = actionRecord.correctOption;
  if (typeof correctOption !== "string" || !correctOption.trim()) {
    return {
      valid: false,
      error: `ASK_RIDDLE at index ${index}: correctOption must be a non-empty string (one of the four options)`,
      errorCode: "invalidActionFormat",
    };
  }
  return null;
}

function validateAskRiddleSynonyms(
  actionRecord: Record<string, unknown>,
  index: number,
): ValidationResult | null {
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
  return null;
}

export function validateAskRiddle(
  action: PrimitiveAction,
  _state: GameState,
  index: number,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const textValidation = validateField(actionRecord, "text", "string", "ASK_RIDDLE", index);
  if (!textValidation.valid) {
    return textValidation;
  }
  const optionsErr = validateAskRiddleOptions(actionRecord, index);
  if (optionsErr) {
    return optionsErr;
  }
  const correctErr = validateAskRiddleCorrectOption(actionRecord, index);
  if (correctErr) {
    return correctErr;
  }
  const synonymsErr = validateAskRiddleSynonyms(actionRecord, index);
  if (synonymsErr) {
    return synonymsErr;
  }
  return { valid: true };
}
