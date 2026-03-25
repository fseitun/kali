import type { GameState, PrimitiveAction } from "./types";
import { applyActionToMockState } from "./validator/mock-state";
import { validateNarrate, validateResetGame } from "./validator/narrate-reset";
import { validatePlayerAnswered } from "./validator/player-answered";
import { validatePlayerRolled } from "./validator/player-rolled";
import { validateAskRiddle } from "./validator/riddle";
import { validateSetState } from "./validator/set-state";
import type { ValidationResult, ValidatorContext } from "./validator/types";
import type { StateManager } from "@/state-manager";

export type { ValidationResult } from "./validator/types";

type ActionValidator = (
  p: PrimitiveAction,
  s: GameState,
  sm: StateManager,
  i: number,
  ctx: ValidatorContext,
) => ValidationResult;

const ACTION_VALIDATORS: Record<string, ActionValidator> = {
  NARRATE: (p, _, __, i) => validateNarrate(p, i),
  RESET_GAME: (p, _, __, i) => validateResetGame(p, i),
  SET_STATE: validateSetState,
  PLAYER_ROLLED: (p, s, _, i, ctx) => validatePlayerRolled(p, s, i, ctx),
  PLAYER_ANSWERED: (p, s, _, i) => validatePlayerAnswered(p, s, i),
  ASK_RIDDLE: (p, s, _, i) => validateAskRiddle(p, s, i),
};

/**
 * Validates an array of primitive actions against current game state.
 * Uses stateful validation - simulates each action's effect before validating the next.
 * This allows sequential commands like "choose path A and roll 5" to work correctly.
 */
export function validateActions(
  actions: unknown,
  state: GameState,
  stateManager: StateManager,
  context: ValidatorContext,
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
    const result = validateAction(action as PrimitiveAction, mockState, stateManager, i, context);
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
  context: ValidatorContext,
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

  const fn = ACTION_VALIDATORS[primitive.action];
  if (fn) {
    return fn(primitive, state, stateManager, index, context);
  }
  return {
    valid: false,
    error: `Action at index ${index} has invalid action type: ${(primitive as { action: string }).action}`,
    errorCode: "invalidActionFormat",
  };
}
