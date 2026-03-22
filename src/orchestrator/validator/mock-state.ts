import { computeNewPositionFromState } from "../board-traversal";
import { getDecisionPointApplyState } from "../decision-helpers";
import { getDecisionPoints } from "../decision-point-inference";
import { isStrictRiddleCorrect } from "../riddle-answer";
import type { GameState, PrimitiveAction } from "../types";

type MockStateHandler = (
  primitive: PrimitiveAction,
  mockState: GameState,
  originalState: GameState,
) => GameState | void;

/**
 * True when the current player is at a decision point and has not yet made a choice.
 */
export function hasPendingDecisionsInState(state: GameState): boolean {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  if (!currentTurn) {
    return false;
  }
  const decisionPoints = getDecisionPoints(state);
  if (!decisionPoints.length) {
    return false;
  }
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentPlayer = players?.[currentTurn];
  if (!currentPlayer) {
    return false;
  }
  const position = currentPlayer.position as number | undefined;
  if (typeof position !== "number") {
    return false;
  }
  const dp = decisionPoints.find((d) => d.position === position);
  if (!dp) {
    return false;
  }
  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  const hasChoice = choices?.[String(position)] !== undefined;
  return !hasChoice;
}

function handleSetState(
  primitive: PrimitiveAction,
  mockState: GameState,
  originalState: GameState,
): GameState | void {
  if (!("path" in primitive) || !("value" in primitive)) {
    return;
  }
  const parts = primitive.path.split(".");
  let current: Record<string, unknown> = mockState;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      return originalState;
    }
    const next = current[part];
    if (typeof next !== "object" || next === null) {
      return originalState;
    }
    current = next as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = primitive.value;
}

function handlePlayerRolled(
  primitive: PrimitiveAction,
  mockState: GameState,
  _originalState: GameState,
): void {
  if (!("value" in primitive)) {
    return;
  }
  const rollValue = primitive.value;
  if (typeof rollValue !== "number") {
    return;
  }
  const game = mockState.game;
  const currentTurn = game?.turn;
  if (!currentTurn || typeof currentTurn !== "string") {
    return;
  }
  const players = mockState.players as Record<string, Record<string, unknown>>;
  const player = players?.[currentTurn];
  if (!player || typeof player.position !== "number") {
    return;
  }
  player.position = computeNewPositionFromState(mockState, currentTurn, player.position, rollValue);
}

function handlePlayerAnswered(
  primitive: PrimitiveAction,
  mockState: GameState,
  _originalState: GameState,
): GameState | void {
  if (!("answer" in primitive)) {
    return;
  }
  const game = mockState.game as Record<string, unknown>;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pendingAnimalEncounter as
    | {
        phase?: string;
        playerId?: string;
        correctOption?: string;
        correctOptionSynonyms?: string[];
        riddleOptions?: string[];
      }
    | null
    | undefined;
  const answer = primitive.answer.trim();

  if (
    pending?.phase === "riddle" &&
    pending.playerId === currentTurn &&
    pending.correctOption &&
    Array.isArray(pending.riddleOptions) &&
    pending.riddleOptions.length === 4
  ) {
    const correct = isStrictRiddleCorrect(
      answer,
      pending.riddleOptions,
      pending.correctOption,
      pending.correctOptionSynonyms,
    );
    game.pendingAnimalEncounter = {
      ...pending,
      phase: "powerCheck",
      riddleCorrect: correct,
    };
    return mockState;
  }

  if (
    (pending?.phase === "powerCheck" || pending?.phase === "revenge") &&
    pending.playerId === currentTurn
  ) {
    const rollStr = answer.replace(/\D/g, "").trim() || answer.trim();
    const roll = parseInt(rollStr, 10);
    if (isNaN(roll) || roll < 1 || roll > 12) {
      return;
    }
    game.pendingAnimalEncounter = null;
    const playersMap = mockState.players as Record<string, Record<string, unknown>>;
    const player = currentTurn ? playersMap?.[currentTurn] : undefined;
    if (player && typeof player.position === "number") {
      player.position = player.position + roll;
    }
    return mockState;
  }

  const apply = getDecisionPointApplyState(mockState, answer);
  if (apply) {
    const parts = apply.path.split(".");
    let current: Record<string, unknown> = mockState;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let next = current[part] as Record<string, unknown> | undefined;
      if (typeof next !== "object" || next === null) {
        next = {};
        current[part] = next;
      }
      current = next;
    }
    current[parts[parts.length - 1]] = apply.value;
  }
}

function handleAskRiddle(
  primitive: PrimitiveAction,
  mockState: GameState,
  _originalState: GameState,
): void {
  if (!("options" in primitive) || !("correctOption" in primitive)) {
    return;
  }
  const game = mockState.game as Record<string, unknown>;
  const pending = game?.pendingAnimalEncounter as Record<string, unknown> | null | undefined;
  if (pending?.phase !== "riddle") {
    return;
  }
  const p = primitive as {
    text?: string;
    options: unknown;
    correctOption: string;
    correctOptionSynonyms?: string[];
  };
  game.pendingAnimalEncounter = {
    ...pending,
    riddlePrompt: p.text,
    riddleOptions: p.options,
    correctOption: p.correctOption,
    ...(Array.isArray(p.correctOptionSynonyms) && p.correctOptionSynonyms.length > 0
      ? { correctOptionSynonyms: p.correctOptionSynonyms }
      : {}),
  } as Record<string, unknown>;
}

function handleRiddleResolved(
  primitive: PrimitiveAction,
  mockState: GameState,
  _originalState: GameState,
): void {
  if (!("correct" in primitive)) {
    return;
  }
  const game = mockState.game as Record<string, unknown>;
  const pending = game?.pendingAnimalEncounter as
    | { position: number; power: number; playerId: string; phase?: string }
    | null
    | undefined;
  if (pending?.phase !== "riddle") {
    return;
  }
  game.pendingAnimalEncounter = {
    ...pending,
    phase: "powerCheck",
    riddleCorrect: primitive.correct,
  };
}

const MOCK_STATE_HANDLERS: Partial<Record<string, MockStateHandler>> = {
  SET_STATE: handleSetState,
  PLAYER_ROLLED: handlePlayerRolled,
  PLAYER_ANSWERED: handlePlayerAnswered,
  ASK_RIDDLE: handleAskRiddle,
  RIDDLE_RESOLVED: handleRiddleResolved,
};

/**
 * Simulates the effect of an action on mock state for stateful validation.
 * @param state - Mock state to apply action to
 * @param primitive - Action to simulate
 * @returns Updated mock state
 */
export function applyActionToMockState(state: GameState, primitive: PrimitiveAction): GameState {
  const mockState = structuredClone(state);

  try {
    const handler = MOCK_STATE_HANDLERS[primitive.action];
    if (handler) {
      const result = handler(primitive, mockState, state);
      if (result !== undefined) {
        return result;
      }
    }
  } catch {
    return state;
  }

  return mockState;
}
