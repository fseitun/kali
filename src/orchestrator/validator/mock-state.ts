import { computeNewPositionFromState } from "../board-traversal";
import { getDecisionPointApplyState } from "../decision-helpers";
import { isStrictRiddleCorrect } from "../riddle-answer";
import type { GameState, PrimitiveAction } from "../types";

type MockStateHandler = (
  primitive: PrimitiveAction,
  mockState: GameState,
  originalState: GameState,
) => GameState | void;

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
  ctx.player.position = computeNewPositionFromState(
    mockState,
    ctx.currentTurn,
    ctx.position,
    ctx.rollValue,
  );
}

function applyRiddleAnswerToMock(
  game: Record<string, unknown>,
  pending: {
    kind?: string;
    playerId?: string;
    correctOption?: string;
    correctOptionSynonyms?: string[];
    riddleOptions?: string[];
    position?: number;
    power?: number;
  },
  currentTurn: string,
  answer: string,
  mockState: GameState,
): GameState | null {
  if (
    pending.kind !== "riddle" ||
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
  game.pending = {
    ...pending,
    kind: "powerCheck",
    riddleCorrect: correct,
  };
  return mockState;
}

function parsePowerCheckRoll(answer: string): number | null {
  const rollStr = answer.replace(/\D/g, "").trim() || answer.trim();
  const roll = parseInt(rollStr, 10);
  return !isNaN(roll) && roll >= 1 && roll <= 18 ? roll : null;
}

function applyRollAnswerToMock(
  game: Record<string, unknown>,
  pending: {
    kind?: string;
    playerId?: string;
    riddleCorrect?: boolean;
    position?: number;
    power?: number;
    dice?: number;
  },
  currentTurn: string,
  answer: string,
  mockState: GameState,
): GameState | null {
  const isRollPhase =
    (pending.kind === "powerCheck" ||
      pending.kind === "revenge" ||
      pending.kind === "directional") &&
    pending.playerId === currentTurn;
  if (!isRollPhase) {
    return null;
  }
  const roll = parsePowerCheckRoll(answer);
  if (roll === null) {
    return null;
  }
  game.pending = null;
  const playersMap = mockState.players as Record<string, Record<string, unknown>>;
  const player = playersMap?.[currentTurn];
  if (player && typeof player.position === "number" && pending.kind === "directional") {
    player.position = computeNewPositionFromState(
      mockState,
      currentTurn,
      player.position,
      roll,
      "backward",
    );
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
  const pending = game?.pending as
    | {
        kind?: string;
        playerId?: string;
        correctOption?: string;
        correctOptionSynonyms?: string[];
        riddleOptions?: string[];
        riddleCorrect?: boolean;
        position?: number;
        power?: number;
        dice?: number;
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

  const rollResult = applyRollAnswerToMock(game, pending, currentTurn, answer, mockState);
  if (rollResult) {
    return rollResult;
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
  const pending = game?.pending as Record<string, unknown> | null | undefined;
  if (pending?.kind !== "riddle") {
    return;
  }
  const p = primitive as {
    text?: string;
    options: unknown;
    correctOption: string;
    correctOptionSynonyms?: string[];
  };
  game.pending = {
    ...pending,
    riddlePrompt: p.text,
    riddleOptions: p.options,
    correctOption: p.correctOption,
    ...(Array.isArray(p.correctOptionSynonyms) && p.correctOptionSynonyms.length > 0
      ? { correctOptionSynonyms: p.correctOptionSynonyms }
      : {}),
  };
}

const MOCK_STATE_HANDLERS: Partial<Record<string, MockStateHandler>> = {
  SET_STATE: handleSetState,
  PLAYER_ROLLED: handlePlayerRolled,
  PLAYER_ANSWERED: handlePlayerAnswered,
  ASK_RIDDLE: handleAskRiddle,
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
