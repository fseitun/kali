import { distinctEndPositionsAfterRoll, type RollMovementDirection } from "./board-traversal";
import { getDecisionPoints } from "./decision-point-inference";
import type { DecisionPoint, GameState } from "./types";
import type { ValidationResult } from "./validator/types";

export function getMovementDirectionForState(
  state: GameState,
  playerId: string,
): RollMovementDirection {
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as { kind?: string; playerId?: string } | undefined;
  if (pending?.kind === "directional" && pending.playerId === playerId) {
    const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
    if (player?.retreatEffectsReversed === true) {
      return "forward";
    }
    return "backward";
  }
  return "forward";
}

function decisionDirection(dp: { direction?: RollMovementDirection }): RollMovementDirection {
  return dp.direction ?? "forward";
}

function findDecisionPointAt(
  state: GameState,
  position: number,
  direction: RollMovementDirection,
): DecisionPoint | undefined {
  return getDecisionPoints(state).find(
    (dp) => dp.position === position && decisionDirection(dp) === direction,
  );
}

function getCurrentTurnPlayerSlice(state: GameState): {
  currentTurn: string;
  currentPlayer: Record<string, unknown>;
  position: number;
} | null {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  if (!currentTurn) {
    return null;
  }
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentPlayer = players?.[currentTurn];
  if (!currentPlayer) {
    return null;
  }
  const position = currentPlayer.position as number | undefined;
  if (typeof position !== "number") {
    return null;
  }
  return { currentTurn, currentPlayer, position };
}

/**
 * Minimum/maximum movement roll for the current turn player (normal dice or bonus 2d6;
 * directional pending uses that phase's dice count).
 */
export function getMovementRollRange(
  state: GameState,
  playerId: string,
): { min: number; max: number } {
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as { kind?: string; playerId?: string; dice?: number } | undefined;
  if (
    pending?.kind === "directional" &&
    pending.playerId === playerId &&
    typeof pending.dice === "number"
  ) {
    const d = pending.dice;
    return { min: d, max: d * 6 };
  }
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const player = players?.[playerId];
  const bonusDiceNextTurn = player?.bonusDiceNextTurn === true;
  return bonusDiceNextTurn ? { min: 2, max: 12 } : { min: 1, max: 6 };
}

/**
 * True if this roll and direction can land on more than one square without a stored fork choice at `start`.
 */
export function forkChoiceRequiredForRoll(
  state: GameState,
  playerId: string,
  start: number,
  roll: number,
  direction: RollMovementDirection,
): boolean {
  const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
  if (!player) {
    return false;
  }
  const dp = findDecisionPointAt(state, start, direction);
  if (!dp) {
    return false;
  }
  const choices = player.activeChoices as Record<string, number> | undefined;
  if (choices?.[String(start)] !== undefined) {
    return false;
  }
  return distinctEndPositionsAfterRoll(state, playerId, start, roll, direction).size > 1;
}

/**
 * When the current-turn player’s fork choice would change where this roll lands, return a validation error.
 * Used for PLAYER_ROLLED (forward) and directional PLAYER_ANSWERED (backward).
 */
export function forkChoiceBlockingValidation(
  state: GameState,
  index: number,
  roll: number,
  direction: RollMovementDirection,
): ValidationResult | null {
  const slice = getCurrentTurnPlayerSlice(state);
  if (
    !slice ||
    !forkChoiceRequiredForRoll(state, slice.currentTurn, slice.position, roll, direction)
  ) {
    return null;
  }
  const error =
    direction === "forward"
      ? `PLAYER_ROLLED at index ${index}: Cannot roll until direction is chosen at fork. Choose path/branch first.`
      : `PLAYER_ANSWERED at index ${index}: Choose backward path at the fork first, then report your roll.`;
  return { valid: false, errorCode: "chooseForkFirst", error };
}

/**
 * True if some roll in [min,max] produces more than one possible landing square (fork choice matters).
 */
export function forkMattersForSomeRollInRange(
  state: GameState,
  playerId: string,
  position: number,
  direction: RollMovementDirection,
  minRoll: number,
  maxRoll: number,
): boolean {
  const player = (state.players as Record<string, Record<string, unknown>>)?.[playerId];
  if (!player) {
    return false;
  }
  const dp = findDecisionPointAt(state, position, direction);
  if (!dp) {
    return false;
  }
  const choices = player.activeChoices as Record<string, number> | undefined;
  if (choices?.[String(position)] !== undefined) {
    return false;
  }
  for (let r = minRoll; r <= maxRoll; r++) {
    if (distinctEndPositionsAfterRoll(state, playerId, position, r, direction).size > 1) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the current player must resolve a fork before rolling / before directional roll answer,
 * given possible roll outcomes for their movement mode.
 */
export function hasMovementForkBlockingPlay(state: GameState): boolean {
  const slice = getCurrentTurnPlayerSlice(state);
  if (!slice) {
    return false;
  }
  const { currentTurn, position } = slice;
  const direction = getMovementDirectionForState(state, currentTurn);
  const { min, max } = getMovementRollRange(state, currentTurn);
  return forkMattersForSomeRollInRange(state, currentTurn, position, direction, min, max);
}

/**
 * True while the current player's animal encounter expects a dice report before anything else.
 * Fork prompts and DECISION hints are deferred until this clears (roll first).
 */
export function isEncounterRollPendingForCurrentTurn(state: GameState): boolean {
  const slice = getCurrentTurnPlayerSlice(state);
  if (!slice) {
    return false;
  }
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as { kind?: string; playerId?: string } | undefined;
  return (
    (pending?.kind === "powerCheck" || pending?.kind === "revenge") &&
    pending.playerId === slice.currentTurn
  );
}

/**
 * Fork context to enforce in LLM / voice when a choice matters for at least one legal roll.
 */
export function getEnforceableForkContext(state: GameState): {
  playerId: string;
  playerName: string;
  position: number;
  decisionPoint: DecisionPoint;
} | null {
  const slice = getCurrentTurnPlayerSlice(state);
  if (!slice) {
    return null;
  }
  if (isEncounterRollPendingForCurrentTurn(state)) {
    return null;
  }
  const { currentTurn, currentPlayer, position } = slice;
  const direction = getMovementDirectionForState(state, currentTurn);
  const { min, max } = getMovementRollRange(state, currentTurn);
  if (!forkMattersForSomeRollInRange(state, currentTurn, position, direction, min, max)) {
    return null;
  }
  const decisionPoint = findDecisionPointAt(state, position, direction);
  if (!decisionPoint) {
    return null;
  }
  return {
    playerId: currentTurn,
    playerName: (currentPlayer.name as string) || currentTurn,
    position,
    decisionPoint,
  };
}

export function getPendingForkPromptIfAny(state: GameState): string | null {
  return getEnforceableForkContext(state)?.decisionPoint.prompt ?? null;
}
