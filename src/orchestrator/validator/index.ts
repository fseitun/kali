import type { StateManager } from "../../state-manager";
import type { Orchestrator } from "../orchestrator";
import type { GameState, PrimitiveAction } from "../types";
import { applyActionToMockState } from "./mock-state";
import { validateNarrate, validateResetGame } from "./narrate-reset";
import { validatePlayerAnswered } from "./player-answered";
import { validatePlayerRolled } from "./player-rolled";
import { validateAskRiddle, validateRiddleResolved } from "./riddle";
import { validateSetState } from "./set-state";
import type { ValidationResult } from "./types";

export type { ValidationResult } from "./types";

/**
 * Validates an array of primitive actions against current game state.
 * Uses stateful validation - simulates each action's effect before validating the next.
 * This allows sequential commands like "choose path A and roll 5" to work correctly.
 */
export function validateActions(
  actions: unknown,
  state: GameState,
  stateManager: StateManager,
  orchestrator: Orchestrator,
): ValidationResult {
  if (!Array.isArray(actions)) {
    return {
      valid: false,
      error: "Actions must be an array",
      errorCode: "invalidActionFormat",
    };
  }

  let mockState = structuredClone(state);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action || typeof action !== "object") {
      return {
        valid: false,
        error: `Action at index ${i} is not an object`,
        errorCode: "invalidActionFormat",
      };
    }
    const result = validateAction(
      action as PrimitiveAction,
      mockState,
      stateManager,
      i,
      orchestrator,
    );
    if (!result.valid) {
      return result;
    }

    mockState = applyActionToMockState(mockState, action);
  }

  return { valid: true };
}

function validateAction(
  primitive: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number,
  orchestrator: Orchestrator,
): ValidationResult {
  if (!primitive || typeof primitive !== "object") {
    return {
      valid: false,
      error: `Action at index ${index} is not an object`,
      errorCode: "invalidActionFormat",
    };
  }

  if (!("action" in primitive)) {
    return {
      valid: false,
      error: `Action at index ${index} missing 'action' field`,
      errorCode: "invalidActionFormat",
    };
  }

  switch (primitive.action) {
    case "NARRATE":
      return validateNarrate(primitive, index);
    case "RESET_GAME":
      return validateResetGame(primitive, index);
    case "SET_STATE":
      return validateSetState(primitive, state, stateManager, index, orchestrator);
    case "PLAYER_ROLLED":
      return validatePlayerRolled(primitive, state, index, orchestrator);
    case "PLAYER_ANSWERED":
      return validatePlayerAnswered(primitive, state, index);
    case "ASK_RIDDLE":
      return validateAskRiddle(primitive, state, index);
    case "RIDDLE_RESOLVED":
      return validateRiddleResolved(primitive, state, index, orchestrator);
    default:
      return {
        valid: false,
        error: `Action at index ${index} has invalid action type: ${(primitive as { action: string }).action}`,
        errorCode: "invalidActionFormat",
      };
  }
}
