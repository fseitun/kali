import type { PendingPowerCheck, PendingRevenge, PendingRiddle } from "./pending-types";
import type { GameState } from "./types";

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
