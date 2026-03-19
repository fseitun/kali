import type { ValidationResult } from "../types";

export function validateField(
  action: Record<string, unknown>,
  fieldName: string,
  fieldType: string,
  actionType: string,
  index: number,
  required = true,
): ValidationResult {
  if (!(fieldName in action)) {
    if (required) {
      return {
        valid: false,
        error: `${actionType} at index ${index} missing '${fieldName}' field`,
        errorCode: "invalidActionFormat",
      };
    }
    return { valid: true };
  }

  if (typeof action[fieldName] !== fieldType) {
    return {
      valid: false,
      error: `${actionType} at index ${index} has invalid '${fieldName}' field type`,
      errorCode: "invalidActionFormat",
    };
  }

  return { valid: true };
}
