import type { GameState, PrimitiveAction } from "./types";

/**
 * Returns true if the answer looks like a power-check roll (numeric 1–12).
 * Used to reorder so power-check PLAYER_ANSWERED runs before PLAYER_ROLLED.
 */
export function isPowerCheckNumericAnswer(answer: string): boolean {
  const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
  const roll = parseInt(rollStr, 10);
  return !isNaN(roll) && roll >= 1 && roll <= 12;
}

/**
 * When state has pendingAnimalEncounter phase powerCheck/revenge and the batch contains both
 * PLAYER_ROLLED and PLAYER_ANSWERED (numeric), reorder so all power-check answers run before
 * any PLAYER_ROLLED. Ensures "Pasaste" is spoken before square-effect narration (e.g. plants).
 */
export function reorderPowerCheckBeforeRoll(
  actions: PrimitiveAction[],
  state: GameState,
): PrimitiveAction[] {
  const game = state.game as Record<string, unknown> | undefined;
  const pending = game?.pending as { kind?: string } | null | undefined;
  const kind = pending?.kind;
  if (kind !== "powerCheck" && kind !== "revenge") {
    return actions;
  }
  const hasRoll = actions.some((a) => a.action === "PLAYER_ROLLED");
  const powerCheckAnswers = actions.filter(
    (a) =>
      a.action === "PLAYER_ANSWERED" &&
      "answer" in a &&
      typeof (a as { answer: string }).answer === "string" &&
      isPowerCheckNumericAnswer((a as { answer: string }).answer),
  );
  if (!hasRoll || powerCheckAnswers.length === 0) {
    return actions;
  }
  const rest = actions.filter(
    (a) =>
      !(
        a.action === "PLAYER_ANSWERED" &&
        "answer" in a &&
        typeof (a as { answer: string }).answer === "string" &&
        isPowerCheckNumericAnswer((a as { answer: string }).answer)
      ),
  );
  return [...powerCheckAnswers, ...rest];
}
