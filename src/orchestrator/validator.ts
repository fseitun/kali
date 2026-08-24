import { GamePhase, type GameState, type PrimitiveAction } from "./types";
import { applyActionToMockState } from "./validator/mock-state";
import { validateNarrate, validateResetGame } from "./validator/narrate-reset";
import { validatePlayerAnswered } from "./validator/player-answered";
import { validatePlayerRolled } from "./validator/player-rolled";
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
  PLAYER_ROLLED: (p, s, _, i) => validatePlayerRolled(p, s, i),
  PLAYER_ANSWERED: (p, s, _, i) => validatePlayerAnswered(p, s, i),
};

/**
 * Gameplay primitives only apply while the game is running: after a win (FINISHED) or before
 * setup completes (SETUP) a roll must not move anyone. SET_STATE stays available in SETUP for
 * name corrections.
 */
const PHASE_GATE: Record<string, { phases: GamePhase[]; errorCode: string }> = {
  PLAYER_ROLLED: { phases: [GamePhase.PLAYING], errorCode: "wrongPhaseForRoll" },
  PLAYER_ANSWERED: { phases: [GamePhase.PLAYING], errorCode: "wrongPhaseForRoll" },
  SET_STATE: { phases: [GamePhase.PLAYING, GamePhase.SETUP], errorCode: "setStateForbidden" },
};

/**
 * The way out of a refusal differs per phase, and voice-only players cannot see which phase
 * they are in: after a win the exit is a new game, during setup it is answering the setup
 * question. `wrongPhaseForRoll` covers the post-win case and says so out loud.
 */
const SETUP_REJECTION_CODE = "setupNotFinished";

function validatePhase(
  primitive: PrimitiveAction,
  state: GameState,
  index: number,
): ValidationResult | null {
  const gate = PHASE_GATE[primitive.action];
  if (!gate) {
    return null;
  }
  const phase = state.game?.phase;
  if (gate.phases.includes(phase)) {
    return null;
  }
  return {
    valid: false,
    error: `${primitive.action} at index ${index}: not allowed while the game phase is ${String(phase)}.`,
    errorCode: phase === GamePhase.SETUP ? SETUP_REJECTION_CODE : gate.errorCode,
  };
}

function isBlankNarrate(action: unknown): boolean {
  const record = action as { action?: string; text?: unknown } | null;
  return record?.action === "NARRATE" && (typeof record.text !== "string" || !record.text.trim());
}

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

  // Voice-only: a batch of nothing but blank NARRATE has no words to say and no state to change,
  // yet it would execute, report success and leave the table in silence. Refusing it at least
  // speaks the validation error. A blank NARRATE beside real work is fine — that work speaks.
  if (actions.length > 0 && actions.every(isBlankNarrate)) {
    return {
      valid: false,
      error: "NARRATE requires non-empty 'text': this batch would speak nothing at all",
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

  const phaseError = validatePhase(primitive, state, index);
  if (phaseError) {
    return phaseError;
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
