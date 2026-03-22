import { matchAnswerToChoiceKeywords } from "./board-next";
import { getDecisionPoints } from "./decision-point-inference";
import type { DecisionPoint, GameState } from "./types";

function getDecisionPointContext(state: GameState): {
  currentTurn: string;
  currentPlayer: Record<string, unknown>;
  position: number;
  decisionPoint: DecisionPoint;
  path: string;
} | null {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const decisionPoints = getDecisionPoints(state);
  if (!currentTurn || !decisionPoints.length) {
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
  const decisionPoint = decisionPoints.find((dp) => dp.position === position);
  if (!decisionPoint) {
    return null;
  }
  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  if (choices?.[String(position)] !== undefined) {
    return null;
  }
  const path = `players.${currentTurn}.activeChoices.${position}`;
  return { currentTurn, currentPlayer, position, decisionPoint, path };
}

function matchDecisionAnswer(
  answer: string,
  position: number,
  decisionPoint: DecisionPoint,
): number | null {
  if (position === 0) {
    const val = matchPosition0Answer(answer);
    if (val !== null) {
      return val;
    }
  }
  if (decisionPoint.positionOptions) {
    const val = matchPositionOptions(answer, decisionPoint.positionOptions);
    if (val !== null) {
      return val;
    }
  }
  if (decisionPoint.choiceKeywords) {
    return matchAnswerToChoiceKeywords(answer, decisionPoint.choiceKeywords);
  }
  return null;
}

/**
 * Returns the current decision point (position + prompt) if the current player is at a fork
 * without a choice. Used to detect "NARRATE covers decision" and skip redundant prompt.
 */
export function getCurrentDecisionPoint(
  getState: () => GameState,
  getPendingDecisionPrompt: () => string | null,
): { position: number; prompt: string } | null {
  const prompt = getPendingDecisionPrompt();
  if (!prompt) {
    return null;
  }
  const state = getState();
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentPlayer = currentTurn ? players?.[currentTurn] : undefined;
  const position = currentPlayer?.position as number | undefined;
  if (typeof position !== "number") {
    return null;
  }
  return { position, prompt };
}

/**
 * True when NARRATE text already asks for the given decision (exact prompt or path A/B wording at 0).
 */
export function narrateCoversDecision(text: string, position: number, prompt: string): boolean {
  const t = (text ?? "").trim();
  if (t.includes(prompt)) {
    return true;
  }
  if (position === 0) {
    const hasA = t.includes("camino A") || t.includes("por el A");
    const hasB = t.includes("camino B") || t.includes("por el B");
    if (hasA && hasB) {
      return true;
    }
  }
  return false;
}

function matchPosition0Answer(answer: string): number | null {
  const first = answer.trim().charAt(0).toUpperCase();
  if (first === "A") {
    return 1;
  }
  if (first === "B") {
    return 15;
  }
  return null;
}

function matchPositionOptions(answer: string, options: Record<string, number>): number | null {
  const trimmed = answer.trim();
  const numMatch = trimmed.match(/\d+/);
  for (const [key, targetPos] of Object.entries(options)) {
    if (trimmed === key || numMatch?.[0] === key) {
      return targetPos;
    }
  }
  return null;
}

/**
 * If current player has a pending decision point, returns the path and value
 * to apply the answer. Writes to activeChoices[position] = targetPosition.
 * No position teleport; movement happens on roll.
 */
export function getDecisionPointApplyState(
  state: GameState,
  answer: string,
): { path: string; value: string | number } | null {
  const ctx = getDecisionPointContext(state);
  if (!ctx) {
    return null;
  }
  const { position, decisionPoint, path } = ctx;
  const value = matchDecisionAnswer(answer, position, decisionPoint);
  return value !== null ? { path, value } : null;
}
