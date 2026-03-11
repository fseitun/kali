import type { StateManager } from "../state-manager";
import { computeNewPositionFromState } from "./board-traversal";
import type { Orchestrator } from "./orchestrator";
import type { GameState, PrimitiveAction } from "./types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

function hasPendingDecisionsInState(state: GameState): boolean {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  if (!currentTurn) return false;
  const decisionPoints = state.decisionPoints as
    | Array<{ position: number; prompt: string }>
    | undefined;
  if (!decisionPoints?.length) return false;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentPlayer = players?.[currentTurn];
  if (!currentPlayer) return false;
  const position = currentPlayer.position as number | undefined;
  if (typeof position !== "number") return false;
  const dp = decisionPoints.find((d) => d.position === position);
  if (!dp) return false;
  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  const hasChoice = choices?.[String(position)] !== undefined;
  return !hasChoice;
}

/**
 * Simulates the effect of an action on mock state for stateful validation.
 * @param state - Mock state to apply action to
 * @param primitive - Action to simulate
 * @returns Updated mock state
 */
function applyActionToMockState(state: GameState, primitive: PrimitiveAction): GameState {
  const mockState = structuredClone(state);

  try {
    if (primitive.action === "SET_STATE" && "path" in primitive && "value" in primitive) {
      const parts = primitive.path.split(".");
      let current: Record<string, unknown> = mockState;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          return state;
        }
        const next = current[part];
        if (typeof next !== "object" || next === null) {
          return state;
        }
        current = next as Record<string, unknown>;
      }

      const lastPart = parts[parts.length - 1];
      current[lastPart] = primitive.value;
    } else if (primitive.action === "PLAYER_ROLLED" && "value" in primitive) {
      const game = mockState.game;
      const currentTurn = game?.turn;
      if (currentTurn && typeof currentTurn === "string") {
        const players = mockState.players as Record<string, Record<string, unknown>>;
        const player = players?.[currentTurn];
        if (player && typeof player.position === "number") {
          player.position = computeNewPositionFromState(
            mockState,
            currentTurn,
            player.position,
            primitive.value,
          );
        }
      }
    } else if (primitive.action === "PLAYER_ANSWERED" && "answer" in primitive) {
      const game = mockState.game as Record<string, unknown>;
      const currentTurn = game?.turn as string | undefined;
      const decisionPoints = mockState.decisionPoints as
        | Array<{
            position: number;
            positionOptions?: Record<string, number>;
          }>
        | undefined;
      const players = mockState.players as Record<string, Record<string, unknown>>;
      const player = currentTurn ? players?.[currentTurn] : undefined;
      if (!currentTurn || !player || !decisionPoints?.length) return mockState;
      const position = player.position as number | undefined;
      if (typeof position !== "number") return mockState;
      const dp = decisionPoints.find((d) => d.position === position);
      if (!dp) return mockState;
      const choices = (player.activeChoices ?? {}) as Record<string, number>;
      if (choices[String(position)] !== undefined) return mockState;

      const answer = primitive.answer.trim();
      let target: number | null = null;
      // Position 0: "A" -> 1, "B" -> 15 (fall through to positionOptions if no match)
      if (position === 0) {
        const first = answer.charAt(0).toUpperCase();
        if (first === "A") target = 1;
        if (first === "B") target = 15;
      }
      if (target === null && dp.positionOptions) {
        const numMatch = answer.match(/\d+/);
        for (const [key, val] of Object.entries(dp.positionOptions)) {
          if (answer === key || numMatch?.[0] === key) {
            target = val;
            break;
          }
        }
      }
      if (target !== null) {
        player.activeChoices ??= {};
        (player.activeChoices as Record<string, number>)[String(position)] = target;
      }
    } else if (primitive.action === "RIDDLE_RESOLVED" && "correct" in primitive) {
      const game = mockState.game as Record<string, unknown>;
      const pending = game?.pendingAnimalEncounter as
        | { position: number; power: number; playerId: string; phase?: string }
        | null
        | undefined;
      if (pending?.phase === "riddle") {
        game.pendingAnimalEncounter = {
          ...pending,
          phase: "powerCheck",
          riddleCorrect: primitive.correct,
        };
      }
    }
  } catch {
    return state;
  }

  return mockState;
}

/**
 * Validates an array of primitive actions against current game state.
 * Uses stateful validation - simulates each action's effect before validating the next.
 * This allows sequential commands like "choose path A and roll 5" to work correctly.
 * @param actions - The actions array to validate
 * @param state - Current game state for path validation
 * @param stateManager - State manager for path operations
 * @param orchestrator - Orchestrator instance for context checking (optional for backward compatibility)
 * @returns Validation result with error message if invalid
 */
export function validateActions(
  actions: unknown,
  state: GameState,
  stateManager: StateManager,
  orchestrator?: Orchestrator,
): ValidationResult {
  if (!Array.isArray(actions)) {
    return {
      valid: false,
      error: "Actions must be an array",
    };
  }

  let mockState = structuredClone(state);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action || typeof action !== "object") {
      return {
        valid: false,
        error: `Action at index ${i} is not an object`,
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
  orchestrator?: Orchestrator,
): ValidationResult {
  if (!primitive || typeof primitive !== "object") {
    return {
      valid: false,
      error: `Action at index ${index} is not an object`,
    };
  }

  if (!("action" in primitive)) {
    return {
      valid: false,
      error: `Action at index ${index} missing 'action' field`,
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
    case "RIDDLE_RESOLVED":
      return validateRiddleResolved(primitive, state, index, orchestrator);
    default:
      return {
        valid: false,
        error: `Action at index ${index} has invalid action type: ${(primitive as { action: string }).action}`,
      };
  }
}

function validateField(
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
      };
    }
    return { valid: true };
  }

  if (typeof action[fieldName] !== fieldType) {
    return {
      valid: false,
      error: `${actionType} at index ${index} has invalid '${fieldName}' field type`,
    };
  }

  return { valid: true };
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

  const decisionPoints = state.decisionPoints as
    | Array<{ position: number; prompt: string }>
    | undefined;

  if (!decisionPoints || decisionPoints.length === 0) {
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
    };
  }

  return { valid: true };
}

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

function validateSquareEffectPathRestriction(
  path: string,
  index: number,
  orchestrator?: Orchestrator,
): ValidationResult {
  if (!orchestrator?.isProcessingEffect()) return { valid: true };

  const playerMatch = path.match(/^players\.([^.]+)\.(.+)$/);
  if (!playerMatch) return { valid: true };

  const key = playerMatch[2];
  if (SQUARE_EFFECT_FORBIDDEN_PLAYER_KEYS.has(key)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Cannot set players.*.${key} during square effect processing. The orchestrator applies game-rule state; use NARRATE only.`,
    };
  }
  if (!SQUARE_EFFECT_ALLOWED_PLAYER_KEYS.has(key)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index}: Path "${path}" is not allowed during square effect processing. Only explicit user-choice fields (e.g. activeChoices) are permitted.`,
    };
  }
  return { valid: true };
}

function validateSetState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number,
  orchestrator?: Orchestrator,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const pathValidation = validateField(actionRecord, "path", "string", "SET_STATE", index);
  if (!pathValidation.valid) return pathValidation;

  if (!("value" in action)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index} missing 'value' field`,
    };
  }

  if ("path" in action && typeof action.path === "string") {
    const squareEffectValidation = validateSquareEffectPathRestriction(
      action.path,
      index,
      orchestrator,
    );
    if (!squareEffectValidation.valid) return squareEffectValidation;

    if (action.path === "game.turn") {
      const game = state.game;
      const currentPhase = game.phase;

      if (currentPhase !== "SETUP") {
        return {
          valid: false,
          error: `SET_STATE at index ${index}: Cannot manually change game.turn. The orchestrator automatically advances turns when all effects are complete. Remove this action and let the orchestrator handle turn advancement.`,
        };
      }
    }

    if (action.path === "game.phase") {
      return {
        valid: false,
        error: `SET_STATE at index ${index}: Cannot manually change game.phase via SET_STATE. The orchestrator manages phase transitions.`,
      };
    }

    if (action.path === "game.winner") {
      return {
        valid: false,
        error: `SET_STATE at index ${index}: Cannot manually set game.winner via SET_STATE. The orchestrator detects and sets winners.`,
      };
    }

    if (action.path === "game.pendingAnimalEncounter") {
      return {
        valid: false,
        error: `SET_STATE at index ${index}: Cannot set game.pendingAnimalEncounter. The orchestrator owns encounter state. Use RIDDLE_RESOLVED or PLAYER_ANSWERED with roll value.`,
      };
    }

    const turnValidation = validateTurnOwnership(action.path, state, "SET_STATE", index);
    if (!turnValidation.valid) return turnValidation;

    const decisionMoveValidation = validateDecisionBeforeMove(
      action.path,
      state,
      "SET_STATE",
      index,
    );
    if (!decisionMoveValidation.valid) return decisionMoveValidation;

    if (!stateManager.pathExists(state, action.path)) {
      return {
        valid: false,
        error: `SET_STATE at index ${index} references non-existent path: ${action.path}`,
      };
    }
  }

  return { valid: true };
}

function validatePlayerRolled(
  action: PrimitiveAction,
  state: GameState,
  index: number,
  orchestrator?: Orchestrator,
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
      };
    }
  }

  if (orchestrator?.isProcessingEffect()) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Cannot roll dice during square effect processing. The square effect must be resolved first (fight/flee decision, etc.).`,
    };
  }

  const hasPending = hasPendingDecisionsInState(state);
  if (hasPending) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Cannot roll until direction is chosen at fork. Choose path/branch first.`,
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
    };
  }

  return { valid: true };
}

function validatePlayerAnswered(
  action: PrimitiveAction,
  state: GameState,
  index: number,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const answerValidation = validateField(
    actionRecord,
    "answer",
    "string",
    "PLAYER_ANSWERED",
    index,
  );
  if (!answerValidation.valid) return answerValidation;

  // Answer cannot be empty
  if ("answer" in action && typeof action.answer === "string") {
    if (action.answer.trim() === "") {
      return {
        valid: false,
        error: `PLAYER_ANSWERED at index ${index} requires non-empty answer`,
      };
    }
  }

  const answer = ((action as { answer?: string }).answer ?? "").trim();
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const currentPlayer = (state.players as Record<string, Record<string, unknown>> | undefined)?.[
    currentTurn ?? ""
  ];
  const decisionPoints = state.decisionPoints as
    | Array<{ position: number; positionOptions?: Record<string, number> }>
    | undefined;

  if (!currentTurn || !currentPlayer) return { valid: true };
  const position = currentPlayer.position as number | undefined;
  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  const hasChoiceAt = (pos: number): boolean => choices?.[String(pos)] !== undefined;

  // Path choice (A/B) can only be applied when at position 0 with pending fork choice
  const firstChar = answer.charAt(0).toUpperCase();
  if (firstChar === "A" || firstChar === "B") {
    const pathChoiceDp = decisionPoints?.find((dp) => dp.position === 0);
    if (!pathChoiceDp) return { valid: true };
    const atDecisionSquare = typeof position === "number" && position === 0;
    const hasPendingPathChoice = atDecisionSquare && !hasChoiceAt(0);
    if (!hasPendingPathChoice) {
      return {
        valid: false,
        error: `PLAYER_ANSWERED at index ${index}: Path choice (A/B) can only be applied when the current turn player is at position 0 with no fork choice. Current player has no pending path choice.`,
      };
    }
    return { valid: true };
  }

  // positionOptions answers (e.g. "97", "99", "102", "105") can only be applied when at that fork with pending choice
  if (!decisionPoints?.length) return { valid: true };
  const numMatch = answer.match(/\d+/);
  for (const dp of decisionPoints) {
    const options = dp.positionOptions;
    if (!options) continue;
    const matchesOption = Object.keys(options).some(
      (key) => answer === key || numMatch?.[0] === key,
    );
    if (!matchesOption) continue;
    const atFork = typeof position === "number" && position === dp.position;
    const hasPending = atFork && !hasChoiceAt(dp.position);
    if (!hasPending) {
      return {
        valid: false,
        error: `PLAYER_ANSWERED at index ${index}: Fork choice (${Object.keys(options).join("/")}) can only be applied when the current turn player is at position ${dp.position} with no fork choice. Current player has no pending choice at that position.`,
      };
    }
    return { valid: true };
  }

  return { valid: true };
}

function validateRiddleResolved(
  action: PrimitiveAction,
  state: GameState,
  index: number,
  _orchestrator?: Orchestrator,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const correctValidation = validateField(
    actionRecord,
    "correct",
    "boolean",
    "RIDDLE_RESOLVED",
    index,
  );
  if (!correctValidation.valid) return correctValidation;

  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pendingAnimalEncounter as
    | { phase?: string; playerId?: string }
    | null
    | undefined;

  if (!pending || pending.playerId !== currentTurn) {
    return {
      valid: false,
      error: `RIDDLE_RESOLVED at index ${index}: No pending riddle for current player. Only use when phase=riddle.`,
    };
  }

  if (pending.phase !== "riddle") {
    return {
      valid: false,
      error: `RIDDLE_RESOLVED at index ${index}: Expected phase=riddle, got phase=${pending.phase}. Use PLAYER_ANSWERED for power-check roll.`,
    };
  }

  return { valid: true };
}

function validateNarrate(action: PrimitiveAction, index: number): ValidationResult {
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

function validateResetGame(action: PrimitiveAction, index: number): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  return validateField(actionRecord, "keepPlayerNames", "boolean", "RESET_GAME", index);
}
