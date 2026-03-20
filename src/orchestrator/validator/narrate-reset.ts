import type { PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult } from "./types";

export function validateNarrate(action: PrimitiveAction, index: number): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const textValidation = validateField(actionRecord, "text", "string", "NARRATE", index);
  if (!textValidation.valid) return textValidation;

  if (
    "soundEffect" in actionRecord &&
    actionRecord.soundEffect !== null &&
    actionRecord.soundEffect !== undefined
  ) {
    return validateField(actionRecord, "soundEffect", "string", "NARRATE", index, false);
  }

  return { valid: true };
}

export function validateResetGame(action: PrimitiveAction, index: number): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  return validateField(actionRecord, "keepPlayerNames", "boolean", "RESET_GAME", index);
}
