import type { PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult } from "./types";

export function validateNarrate(action: PrimitiveAction, index: number): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const textValidation = validateField(actionRecord, "text", "string", "NARRATE", index);
  if (!textValidation.valid) {
    return textValidation;
  }

  if (
    "soundEffect" in actionRecord &&
    actionRecord.soundEffect !== null &&
    actionRecord.soundEffect !== undefined
  ) {
    return validateField(actionRecord, "soundEffect", "string", "NARRATE", index, false);
  }

  return { valid: true };
}

/**
 * `keepPlayerNames` is optional: a restart is the only way out of a finished game, and refusing
 * it because the interpreter dropped one boolean would leave the table with nothing to say.
 * Omitted reads as false, so the reset drops to SETUP and the app collects names again.
 */
export function validateResetGame(action: PrimitiveAction, index: number): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  return validateField(actionRecord, "keepPlayerNames", "boolean", "RESET_GAME", index, false);
}
