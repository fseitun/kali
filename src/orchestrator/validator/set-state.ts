import type { StateManager } from "../../state-manager";
import { getWinPosition } from "../board-helpers";
import { getDecisionPoints } from "../decision-point-inference";
import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult, ValidatorContext } from "./types";
import { GAME_PATH, STATE_PLAYERS_PREFIX } from "@/state-paths";

const FORBIDDEN_PATH_ERRORS: Record<string, { allowScenarioNull?: boolean; error: string }> = {
  [GAME_PATH.phase]: {
    error:
      "Cannot manually change game.phase via SET_STATE. The orchestrator manages phase transitions.",
  },
  [GAME_PATH.winner]: {
    error:
      "Cannot manually set game.winner via SET_STATE. The orchestrator detects and sets winners.",
  },
  [GAME_PATH.playerOrder]: {
    error:
      "Cannot manually set game.playerOrder via SET_STATE. The orchestrator owns player setup and turn order.",
  },
  [GAME_PATH.pending]: {
    allowScenarioNull: true,
    error:
      "Cannot set game.pending. The orchestrator owns pending state (riddle, powerCheck, revenge, directional, completeRollMovement). Use PLAYER_ANSWERED for riddle answers and encounter rolls as appropriate.",
  },
};

/** Leaves under `game` the interpreter may correct. Everything else under `game` is orchestrator-owned. */
const WRITABLE_GAME_PATHS = new Set<string>([GAME_PATH.lastRoll, GAME_PATH.lastAnswer]);

const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype", ""]);

/** A forbidden path also forbids everything under it (`game.pending.riddleCorrect`). */
function coversPath(forbidden: string, path: string): boolean {
  return path === forbidden || path.startsWith(`${forbidden}.`);
}

function isScenarioClear(context: ValidatorContext, action: { value?: unknown }): boolean {
  return Boolean(context.allowScenarioOnlyStatePaths) && action.value === null;
}

function validateForbiddenSetStatePath(
  path: string,
  index: number,
  state: GameState,
  context: ValidatorContext,
  action: { value?: unknown },
): ValidationResult | null {
  if (coversPath(GAME_PATH.turn, path)) {
    if (path === GAME_PATH.turn && state.game?.phase === "SETUP") {
      return null;
    }
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Cannot manually change game.turn. The orchestrator automatically advances turns when all effects are complete. Remove this action and let the orchestrator handle turn advancement.`,
      errorCode: "setStateForbidden",
    };
  }

  for (const [forbidden, rule] of Object.entries(FORBIDDEN_PATH_ERRORS)) {
    if (!coversPath(forbidden, path)) {
      continue;
    }
    // Scenarios may clear the exact path (never a descendant of it).
    if (rule.allowScenarioNull && path === forbidden && isScenarioClear(context, action)) {
      return { valid: true };
    }
    return {
      valid: false,
      error: `SET_STATE at index ${index}: ${rule.error}`,
      errorCode: "setStateForbidden",
    };
  }
  return null;
}

/**
 * SET_STATE is a user-correction primitive: it may only write player fields and a couple of
 * game leaves. Anything else (whole `players.<id>` or `game` objects, board topology) would let
 * the untrusted interpreter bypass the authority checks below.
 */
function validateWritableSetStatePath(path: string, index: number): ValidationResult | null {
  const parts = path.split(".");

  if (parts.some((part) => UNSAFE_SEGMENTS.has(part))) {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: path ${path} contains a reserved segment.`,
      errorCode: "pathNotAllowed",
    };
  }

  if (parts[0] === "players" && parts.length >= 3) {
    return null;
  }
  // game.turn only reaches here through the SETUP exception in validateForbiddenSetStatePath.
  if (WRITABLE_GAME_PATHS.has(path) || path === GAME_PATH.turn) {
    return null;
  }

  return {
    valid: false,
    error: `SET_STATE at index ${index}: path ${path} is not writable. SET_STATE may only set players.<id>.<field> or ${[...WRITABLE_GAME_PATHS].join(", ")}.`,
    errorCode: "pathNotAllowed",
  };
}

function describeType(value: unknown): string {
  return Array.isArray(value) ? "array" : typeof value;
}

function validatePositionValue(
  value: unknown,
  state: GameState,
  index: number,
): ValidationResult | null {
  const winPosition = getWinPosition(state.board?.squares);
  const isSquareIndex =
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= winPosition;
  if (isSquareIndex) {
    return null;
  }
  return {
    valid: false,
    error: `SET_STATE at index ${index}: position must be a whole square number between 0 and ${winPosition}, got ${String(value)}.`,
    errorCode: "invalidActionFormat",
  };
}

/**
 * The value must keep the shape already in state, and a position must be a real square index —
 * a string or fractional position corrupts board movement for the rest of the game.
 */
function validateSetStateValue(
  path: string,
  value: unknown,
  state: GameState,
  stateManager: StateManager,
  index: number,
): ValidationResult | null {
  const current = stateManager.getByPath(state, path);
  if (typeof value !== typeof current || Array.isArray(value) !== Array.isArray(current)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: ${path} holds a ${describeType(current)}, got ${describeType(value)}.`,
      errorCode: "invalidActionFormat",
    };
  }

  return path.endsWith(".position") ? validatePositionValue(value, state, index) : null;
}

function validateTurnOwnership(
  path: string,
  state: GameState,
  actionType: string,
  index: number,
): ValidationResult {
  if (!path.startsWith(STATE_PLAYERS_PREFIX)) {
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

function validateForkChoiceBeforePositionSet(
  playerId: string,
  state: GameState,
  actionType: string,
  index: number,
): ValidationResult {
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

  const decisionPoint = decisionPoints.find(
    (dp) => dp.position === currentPosition && (dp.direction ?? "forward") === "forward",
  );

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

function validateDecisionBeforeMove(
  path: string,
  state: GameState,
  actionType: string,
  index: number,
  context: ValidatorContext,
): ValidationResult {
  if (!path.endsWith(".position") || !path.startsWith(STATE_PLAYERS_PREFIX)) {
    return { valid: true };
  }

  const parts = path.split(".");
  if (parts.length !== 3) {
    return { valid: true };
  }

  if (context.allowBypassPositionDecisionGate) {
    return { valid: true };
  }

  return validateForkChoiceBeforePositionSet(parts[1], state, actionType, index);
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
    return validateSetStatePath(action.path, action, state, stateManager, index, context);
  }

  return { valid: true };
}

function validateSetStatePath(
  path: string,
  action: PrimitiveAction & { value?: unknown },
  state: GameState,
  stateManager: StateManager,
  index: number,
  context: ValidatorContext,
): ValidationResult {
  const forbiddenError = validateForbiddenSetStatePath(path, index, state, context, action);
  if (forbiddenError) {
    return forbiddenError;
  }

  const writableError = validateWritableSetStatePath(path, index);
  if (writableError) {
    return writableError;
  }

  const turnValidation = validateTurnOwnership(path, state, "SET_STATE", index);
  if (!turnValidation.valid) {
    return turnValidation;
  }

  const decisionMoveValidation = validateDecisionBeforeMove(
    path,
    state,
    "SET_STATE",
    index,
    context,
  );
  if (!decisionMoveValidation.valid) {
    return decisionMoveValidation;
  }

  if (!stateManager.pathExists(state, path)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index} references non-existent path: ${path}`,
      errorCode: "pathNotAllowed",
    };
  }

  return validateSetStateValue(path, action.value, state, stateManager, index) ?? { valid: true };
}
