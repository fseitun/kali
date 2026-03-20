import type { Orchestrator } from "../orchestrator";
import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import { hasPendingDecisionsInState } from "./mock-state";
import type { ValidationResult } from "./types";

export function validatePlayerRolled(
  action: PrimitiveAction,
  state: GameState,
  index: number,
  orchestrator: Orchestrator,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const valueValidation = validateField(actionRecord, "value", "number", "PLAYER_ROLLED", index);
  if (!valueValidation.valid) return valueValidation;

  // Value must be positive
  if ("value" in action && typeof action.value === "number") {
    if (action.value <= 0) {
      return {
        valid: false,
        error: `PLAYER_ROLLED at index ${index} requires positive value, got ${action.value}`,
        errorCode: "invalidActionFormat",
      };
    }
  }

  if (orchestrator.isProcessingEffect()) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Cannot roll dice during square effect processing. The square effect must be resolved first (fight/flee decision, etc.).`,
      errorCode: "resolveSquareEffectFirst",
    };
  }

  const hasPending = hasPendingDecisionsInState(state);
  if (hasPending) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Cannot roll until direction is chosen at fork. Choose path/branch first.`,
      errorCode: "chooseForkFirst",
    };
  }

  // When awaiting power check or revenge for animal encounter, roll values go via PLAYER_ANSWERED
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pendingAnimalEncounter as
    | { phase?: string; playerId?: string }
    | null
    | undefined;
  const awaitingRoll =
    (pending?.phase === "powerCheck" || pending?.phase === "revenge") &&
    pending?.playerId === currentTurn;
  if (awaitingRoll) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Awaiting ${pending?.phase} roll for animal encounter. Use PLAYER_ANSWERED with the roll value, not PLAYER_ROLLED.`,
      errorCode: "wrongPhaseForRoll",
    };
  }

  // Kalimba: 1d6 → 1–6, 2d6 (bonusDiceNextTurn) → 2–12. Reject impossible values.
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentPlayer = currentTurn ? players?.[currentTurn] : undefined;
  const bonusDiceNextTurn = currentPlayer?.bonusDiceNextTurn === true;
  const minRoll = bonusDiceNextTurn ? 2 : 1;
  const maxRoll = bonusDiceNextTurn ? 12 : 6;
  const value = "value" in action && typeof action.value === "number" ? action.value : 0;
  if (value < minRoll || value > maxRoll) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Roll must be ${minRoll}-${maxRoll} (${bonusDiceNextTurn ? "2d6" : "1d6"}), got ${value}.`,
      errorCode: "invalidDiceRoll",
    };
  }

  return { valid: true };
}
