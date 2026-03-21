import { matchAnswerToChoiceKeywords } from "../board-next";
import { computeNewPositionFromState } from "../board-traversal";
import { isStrictRiddleCorrect } from "../riddle-answer";
import type { GameState, PrimitiveAction } from "../types";

/**
 * True when the current player is at a decision point and has not yet made a choice.
 */
export function hasPendingDecisionsInState(state: GameState): boolean {
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
export function applyActionToMockState(state: GameState, primitive: PrimitiveAction): GameState {
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
      // Power check / revenge: numeric answer clears pending and advances position for mock
      if (
        (pending?.phase === "powerCheck" || pending?.phase === "revenge") &&
        pending.playerId === currentTurn
      ) {
        const rollStr = answer.replace(/\D/g, "").trim() || answer.trim();
        const roll = parseInt(rollStr, 10);
        if (!isNaN(roll) && roll >= 1 && roll <= 12) {
          game.pendingAnimalEncounter = null;
          const playersMap = mockState.players as Record<string, Record<string, unknown>>;
          const player = currentTurn ? playersMap?.[currentTurn] : undefined;
          if (player && typeof player.position === "number") {
            player.position = player.position + roll;
          }
          return mockState;
        }
      }
      const decisionPoints = mockState.decisionPoints as
        | Array<{
            position: number;
            positionOptions?: Record<string, number>;
            choiceKeywords?: Record<string, string[]>;
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
      if (target === null && dp.choiceKeywords) {
        target = matchAnswerToChoiceKeywords(answer, dp.choiceKeywords);
      }
      if (target !== null) {
        player.activeChoices ??= {};
        (player.activeChoices as Record<string, number>)[String(position)] = target;
      }
    } else if (
      primitive.action === "ASK_RIDDLE" &&
      "options" in primitive &&
      "correctOption" in primitive
    ) {
      const game = mockState.game as Record<string, unknown>;
      const pending = game?.pendingAnimalEncounter as Record<string, unknown> | null | undefined;
      if (pending?.phase === "riddle") {
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
        };
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
