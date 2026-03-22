import type { StateManager } from "../../state-manager";
import { getDecisionPoints } from "../decision-point-inference";
import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import { validateSquareEffectPathRestriction } from "./square-effect";
import type { ValidationResult, ValidatorContext } from "./types";

function validateForbiddenSetStatePath(
  path: string,
  index: number,
  state: GameState,
  context: ValidatorContext,
  action: { value?: unknown },
): ValidationResult | null {
  if (path === "game.turn") {
    const game = state.game;
    if (game.phase !== "SETUP") {
      return {
        valid: false,
        error: `SET_STATE at index ${index}: Cannot manually change game.turn. The orchestrator automatically advances turns when all effects are complete. Remove this action and let the orchestrator handle turn advancement.`,
        errorCode: "setStateForbidden",
      };
    }
    return null;
  }
  if (path === "game.phase") {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Cannot manually change game.phase via SET_STATE. The orchestrator manages phase transitions.`,
      errorCode: "setStateForbidden",
    };
  }
  if (path === "game.winner") {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Cannot manually set game.winner via SET_STATE. The orchestrator detects and sets winners.`,
      errorCode: "setStateForbidden",
    };
  }
  if (path === "game.pendingAnimalEncounter") {
    if (context.allowScenarioOnlyStatePaths && action.value === null) {
      return { valid: true };
    }
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Cannot set game.pendingAnimalEncounter. The orchestrator owns encounter state. Use RIDDLE_RESOLVED or PLAYER_ANSWERED with roll value.`,
      errorCode: "setStateForbidden",
    };
  }
  return null;
}

function validateTurnOwnership(
  path: string,
  state: GameState,
  actionType: string,
  index: number,
): ValidationResult {
  if (!path.startsWith("players.")) {
    return { valid: true };
  }

  if (path === "game.turn") {
    return { valid: true };
  }

  const parts = path.split(".");
  if (parts.length < 2) {
    return { valid: true };
  }

  const playerId = parts[1];
  const game = state.game;
  const currentTurn = game.turn;

  if (!currentTurn) {
    return { valid: true };
  }

  if (playerId !== currentTurn) {
    return {
      valid: false,
      error: `${actionType} at index ${index}: Cannot modify players.${playerId} when it's ${currentTurn}'s turn. Modify players.${currentTurn} instead.`,
      errorCode: "wrongTurn",
    };
  }

  return { valid: true };
}

function validateDecisionBeforeMove(
  path: string,
  state: GameState,
  actionType: string,
  index: number,
): ValidationResult {
  if (!path.endsWith(".position") || !path.startsWith("players.")) {
    return { valid: true };
  }

  const parts = path.split(".");
  if (parts.length !== 3) {
    return { valid: true };
  }

  const playerId = parts[1];
  const players = state.players;
  const player = players[playerId];

  if (!player) {
    return { valid: true };
  }

  const currentPosition = player.position;

  if (typeof currentPosition !== "number") {
    return { valid: true };
  }

  const decisionPoints = getDecisionPoints(state);

  if (decisionPoints.length === 0) {
    return { valid: true };
  }

  const decisionPoint = decisionPoints.find((dp) => dp.position === currentPosition);

  if (!decisionPoint) {
    return { valid: true };
  }

  const choices = player.activeChoices as Record<string, number> | undefined;
  const hasChoice = choices?.[String(currentPosition)] !== undefined;

  if (!hasChoice) {
    return {
      valid: false,
      error: `${actionType} at index ${index}: Cannot move from position ${currentPosition}. Player must choose direction at fork first. ${decisionPoint.prompt}`,
      errorCode: "chooseForkFirst",
    };
  }

  return { valid: true };
}

export function validateSetState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number,
  context: ValidatorContext,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const pathValidation = validateField(actionRecord, "path", "string", "SET_STATE", index);
  if (!pathValidation.valid) {
    return pathValidation;
  }

  if (!("value" in action)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index} missing 'value' field`,
      errorCode: "invalidActionFormat",
    };
  }

  if ("path" in action && typeof action.path === "string") {
    const squareEffectValidation = validateSquareEffectPathRestriction(
      action.path,
      index,
      context.isProcessingEffect,
    );
    if (!squareEffectValidation.valid) {
      return squareEffectValidation;
    }

    const forbiddenError = validateForbiddenSetStatePath(
      action.path,
      index,
      state,
      context,
      action as { value?: unknown },
    );
    if (forbiddenError) {
      return forbiddenError;
    }

    const turnValidation = validateTurnOwnership(action.path, state, "SET_STATE", index);
    if (!turnValidation.valid) {
      return turnValidation;
    }

    const decisionMoveValidation = validateDecisionBeforeMove(
      action.path,
      state,
      "SET_STATE",
      index,
    );
    if (!decisionMoveValidation.valid) {
      return decisionMoveValidation;
    }

    if (!stateManager.pathExists(state, action.path)) {
      return {
        valid: false,
        error: `SET_STATE at index ${index} references non-existent path: ${action.path}`,
        errorCode: "pathNotAllowed",
      };
    }
  }

  return { valid: true };
}
