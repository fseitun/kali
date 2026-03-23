import { computeNewPositionBackward, computeNewPositionFromState } from "../board-traversal";
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

function isMockPendingDirectionalRoll(
  pending: unknown,
  currentTurn: string,
  playerPosition: number,
): pending is { playerId: string; position: number } {
  return (
    pending !== null &&
    typeof pending === "object" &&
    (pending as { playerId?: string; position?: number }).playerId === currentTurn &&
    (pending as { playerId?: string; position?: number }).position === playerPosition
  );
}

function computeMockPositionAfterRoll(
  mockState: GameState,
  currentTurn: string,
  currentPosition: number,
  rollValue: number,
  player: Record<string, unknown>,
  pendingDir: { playerId: string; position: number } | null | undefined,
): number {
  if (!isMockPendingDirectionalRoll(pendingDir, currentTurn, currentPosition)) {
    return computeNewPositionFromState(mockState, currentTurn, currentPosition, rollValue);
  }
  const inverseMode = !!(player?.inverseMode as boolean | undefined);
  return inverseMode
    ? computeNewPositionFromState(mockState, currentTurn, currentPosition, rollValue)
    : computeNewPositionBackward(mockState, currentTurn, currentPosition, rollValue);
}

function getPlayerRolledContext(
  primitive: PrimitiveAction,
  mockState: GameState,
): {
  currentTurn: string;
  player: Record<string, unknown>;
  position: number;
  rollValue: number;
} | null {
  if (!("value" in primitive) || typeof primitive.value !== "number") {
    return null;
  }
  const game = mockState.game as Record<string, unknown>;
  const currentTurn = game?.turn;
  if (!currentTurn || typeof currentTurn !== "string") {
    return null;
  }
  const players = mockState.players as Record<string, Record<string, unknown>>;
  const player = players?.[currentTurn];
  if (!player || typeof player.position !== "number") {
    return null;
  }
  return {
    currentTurn,
    player,
    position: player.position,
    rollValue: primitive.value,
  };
}

function handlePlayerRolled(
  primitive: PrimitiveAction,
  mockState: GameState,
  _originalState: GameState,
): void {
  const ctx = getPlayerRolledContext(primitive, mockState);
  if (!ctx) {
    return;
  }
  const game = mockState.game as Record<string, unknown>;
  const pendingDir = game?.pendingDirectionalRoll as
    | { playerId: string; position: number }
    | null
    | undefined;

  if (isMockPendingDirectionalRoll(pendingDir, ctx.currentTurn, ctx.position)) {
    game.pendingDirectionalRoll = null;
  }
  ctx.player.position = computeMockPositionAfterRoll(
    mockState,
    ctx.currentTurn,
    ctx.position,
    ctx.rollValue,
    ctx.player,
    pendingDir,
  );
}

function applyRiddleAnswerToMock(
  game: Record<string, unknown>,
  pending: {
    phase?: string;
    playerId?: string;
    correctOption?: string;
    correctOptionSynonyms?: string[];
    riddleOptions?: string[];
  },
  currentTurn: string,
  answer: string,
  mockState: GameState,
): GameState | null {
  if (
    pending.phase !== "riddle" ||
    pending.playerId !== currentTurn ||
    !pending.correctOption ||
    !Array.isArray(pending.riddleOptions) ||
    pending.riddleOptions.length !== 4
  ) {
    return null;
  }
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

function parsePowerCheckRoll(answer: string): number | null {
  const rollStr = answer.replace(/\D/g, "").trim() || answer.trim();
  const roll = parseInt(rollStr, 10);
  return !isNaN(roll) && roll >= 1 && roll <= 12 ? roll : null;
}

function applyPowerCheckAnswerToMock(
  game: Record<string, unknown>,
  pending: { phase?: string; playerId?: string },
  currentTurn: string,
  answer: string,
  mockState: GameState,
): GameState | null {
  const isPowerPhase =
    (pending.phase === "powerCheck" || pending.phase === "revenge") &&
    pending.playerId === currentTurn;
  if (!isPowerPhase) {
    return null;
  }
  const roll = parsePowerCheckRoll(answer);
  if (roll === null) {
    return null;
  }
  game.pendingAnimalEncounter = null;
  const playersMap = mockState.players as Record<string, Record<string, unknown>>;
  const player = playersMap?.[currentTurn];
  if (player && typeof player.position === "number") {
    player.position = player.position + roll;
  }
  return mockState;
}

function applyDecisionPointAnswerToMock(mockState: GameState, answer: string): void {
  const apply = getDecisionPointApplyState(mockState, answer);
  if (!apply) {
    return;
  }
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

  if (!pending || !currentTurn) {
    applyDecisionPointAnswerToMock(mockState, answer);
    return;
  }

  const riddleResult = applyRiddleAnswerToMock(game, pending, currentTurn, answer, mockState);
  if (riddleResult) {
    return riddleResult;
  }

  const powerResult = applyPowerCheckAnswerToMock(game, pending, currentTurn, answer, mockState);
  if (powerResult) {
    return powerResult;
  }

  applyDecisionPointAnswerToMock(mockState, answer);
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
