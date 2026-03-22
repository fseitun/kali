import { matchAnswerToChoiceKeywords } from "./board-next";
import { getDecisionPoints } from "./decision-point-inference";
import type { GameState } from "./types";

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

/**
 * If current player has a pending decision point, returns the path and value
 * to apply the answer. Writes to activeChoices[position] = targetPosition.
 * No position teleport; movement happens on roll.
 */
export function getDecisionPointApplyState(
  state: GameState,
  answer: string,
): { path: string; value: string | number } | null {
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
  } // Already set

  const path = `players.${currentTurn}.activeChoices.${position}`;

  // Position 0: "A" -> 1, "B" -> 15 (fall through to positionOptions if no match)
  if (position === 0) {
    const first = answer.trim().charAt(0).toUpperCase();
    if (first === "A") {
      return { path, value: 1 };
    }
    if (first === "B") {
      return { path, value: 15 };
    }
  }

  // Branch choice with positionOptions: match answer to target position
  const options = decisionPoint.positionOptions;
  if (options) {
    const trimmed = answer.trim();
    const numMatch = trimmed.match(/\d+/);
    for (const [key, targetPos] of Object.entries(options)) {
      if (trimmed === key || numMatch?.[0] === key) {
        return { path, value: targetPos };
      }
    }
  }

  const keywords = decisionPoint.choiceKeywords;
  if (keywords) {
    const matched = matchAnswerToChoiceKeywords(answer, keywords);
    if (matched !== null) {
      return { path, value: matched };
    }
  }

  return null;
}
