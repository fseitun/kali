import { parseRollInRange } from "./roll-parser";
import type { GameState, PrimitiveAction } from "./types";

/**
 * Returns true if the answer looks like a power-check roll (numeric 1–12).
 * Used to reorder so power-check PLAYER_ANSWERED runs before PLAYER_ROLLED.
 */
export function isPowerCheckNumericAnswer(answer: string): boolean {
  return parseRollInRange(answer, 1, 12) !== null;
}

/**
 * When state has pendingAnimalEncounter phase powerCheck/revenge and the batch contains both
 * PLAYER_ROLLED and PLAYER_ANSWERED (numeric), reorder so all power-check answers run before
 * any PLAYER_ROLLED. Ensures "Pasaste" is spoken before square-effect narration (e.g. plants).
 */
function isPowerCheckAnswerAction(a: PrimitiveAction): boolean {
  return (
    a.action === "PLAYER_ANSWERED" &&
    "answer" in a &&
    typeof (a as { answer: string }).answer === "string" &&
    isPowerCheckNumericAnswer((a as { answer: string }).answer)
  );
}

export function reorderPowerCheckBeforeRoll(
  actions: PrimitiveAction[],
  state: GameState,
): PrimitiveAction[] {
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as { kind?: string; playerId?: string } | null | undefined;
  const kind = pending?.kind;
  // Only the current player's own power check reorders their batch; another player's surviving
  // encounter must not reshuffle this turn's actions.
  if ((kind !== "powerCheck" && kind !== "revenge") || pending?.playerId !== game?.turn) {
    return actions;
  }
  const hasRoll = actions.some((a) => a.action === "PLAYER_ROLLED");
  const powerCheckAnswers = actions.filter(isPowerCheckAnswerAction);
  if (!hasRoll || powerCheckAnswers.length === 0) {
    return actions;
  }
  return [...powerCheckAnswers, ...actions.filter((a) => !isPowerCheckAnswerAction(a))];
}
