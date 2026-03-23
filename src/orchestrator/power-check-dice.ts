import type { GameState } from "./types";

function clampDiceCount(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 6) {
    return fallback;
  }
  return value;
}

/**
 * Optional per-square overrides for the first power-check roll (after the riddle).
 * Defaults match standard animals: 2d6 if riddle correct, 1d6 if wrong. Revenge is always 1d6.
 */
export function getPowerCheckDiceConfig(squareData: Record<string, unknown> | undefined): {
  ifRiddleCorrect: number;
  ifRiddleWrong: number;
} {
  return {
    ifRiddleCorrect: clampDiceCount(squareData?.powerCheckDiceIfRiddleCorrect, 2),
    ifRiddleWrong: clampDiceCount(squareData?.powerCheckDiceIfRiddleWrong, 1),
  };
}

export function getSquareDataAtPosition(
  state: GameState,
  position: number,
): Record<string, unknown> | undefined {
  const board = state.board as Record<string, unknown> | undefined;
  const squares = board?.squares as Record<string, Record<string, unknown>> | undefined;
  return squares?.[String(position)];
}

export function getPowerCheckRollSpec(
  phase: string | undefined,
  riddleCorrect: boolean | undefined,
  squareData: Record<string, unknown> | undefined,
): { min: number; max: number; label: string } {
  if (phase === "revenge") {
    return { min: 1, max: 6, label: "1d6" };
  }
  if (phase !== "powerCheck") {
    return { min: 1, max: 6, label: "1d6" };
  }
  const cfg = getPowerCheckDiceConfig(squareData);
  const n = riddleCorrect === true ? cfg.ifRiddleCorrect : cfg.ifRiddleWrong;
  return { min: n, max: n * 6, label: `${n}d6` };
}
