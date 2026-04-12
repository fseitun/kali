import type { PendingPowerCheck, PendingRevenge, PendingRiddle } from "./pending-types";
import type { GameState } from "./types";

export function isValidAskRiddleInput(primitive: {
  options: unknown;
  correctOption: unknown;
}): boolean {
  return (
    Array.isArray(primitive.options) &&
    primitive.options.length === 4 &&
    typeof primitive.correctOption === "string" &&
    primitive.correctOption.trim().length > 0
  );
}

export function buildNextPendingFromAskRiddle(
  pending: PendingRiddle,
  primitive: {
    text: string;
    options: [string, string, string, string];
    correctOption: string;
    correctOptionSynonyms?: string[];
  },
): PendingRiddle {
  const synonyms =
    Array.isArray(primitive.correctOptionSynonyms) && primitive.correctOptionSynonyms.length > 0
      ? { correctOptionSynonyms: primitive.correctOptionSynonyms }
      : {};
  return {
    ...pending,
    riddlePrompt: primitive.text,
    riddleOptions: primitive.options,
    correctOption: primitive.correctOption,
    ...synonyms,
  };
}

export function createPowerCheckPendingFromRiddle(
  pending: PendingRiddle,
  correct: boolean,
): PendingPowerCheck {
  return {
    kind: "powerCheck",
    playerId: pending.playerId,
    position: pending.position,
    power: pending.power,
    riddleCorrect: correct,
    phase: "powerCheck",
  };
}

export function getPowerCheckContext(state: GameState): {
  pending: PendingPowerCheck | PendingRevenge;
  playerId: string;
  position: number;
  power: number;
  isRevenge: boolean;
} | null {
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as PendingPowerCheck | PendingRevenge | null | undefined;
  if (
    !pending ||
    !currentTurn ||
    pending.playerId !== currentTurn ||
    (pending.kind !== "powerCheck" && pending.kind !== "revenge")
  ) {
    return null;
  }
  return {
    pending,
    playerId: pending.playerId,
    position: pending.position,
    power: pending.power ?? 0,
    isRevenge: pending.kind === "revenge",
  };
}
