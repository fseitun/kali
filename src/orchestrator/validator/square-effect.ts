import type { ValidationResult } from "./types";

/** Player state keys that are orchestrator-owned during square effects; LLM must not SET_STATE these. */
const SQUARE_EFFECT_FORBIDDEN_PLAYER_KEYS = new Set(["skipTurns", "position"]);

/**
 * Player state keys that may be SET_STATE during square effect: explicit user choices (activeChoices),
 * game-designed non-deterministic outcomes (bonusDiceNextTurn, inverseMode), rewards after riddle
 * (points, hearts for animal squares), and clearing items/instruments after use.
 */
const SQUARE_EFFECT_ALLOWED_PLAYER_KEYS = new Set([
  "activeChoices",
  "items",
  "instruments",
  "bonusDiceNextTurn",
  "inverseMode",
  "points",
  "hearts",
]);

export function validateSquareEffectPathRestriction(
  path: string,
  index: number,
  isProcessingEffect: boolean,
): ValidationResult {
  if (!isProcessingEffect) return { valid: true };

  const playerMatch = path.match(/^players\.([^.]+)\.(.+)$/);
  if (!playerMatch) return { valid: true };

  const key = playerMatch[2];
  if (SQUARE_EFFECT_FORBIDDEN_PLAYER_KEYS.has(key)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Cannot set players.*.${key} during square effect processing. The orchestrator applies game-rule state; use NARRATE only.`,
      errorCode: "resolveSquareEffectFirst",
    };
  }
  if (!SQUARE_EFFECT_ALLOWED_PLAYER_KEYS.has(key)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Path "${path}" is not allowed during square effect processing. Only explicit user-choice fields (e.g. activeChoices) are permitted.`,
      errorCode: "resolveSquareEffectFirst",
    };
  }
  return { valid: true };
}
