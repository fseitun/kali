import type { RollMovementDirection } from "./board-traversal";
import { getPowerCheckRollSpec, getSquareDataAtPosition } from "./power-check-dice";
import type { GameState } from "./types";

/** Riddle phase: awaiting riddle answer (not a roll). */
export interface PendingRiddle {
  kind: "riddle";
  playerId: string;
  position: number;
  power: number;
  phase?: "riddle";
  riddlePrompt?: string;
  riddleOptions?: string[];
  correctOption?: string;
  correctOptionSynonyms?: string[];
}

/** Power check phase: awaiting Nd6 roll. */
export interface PendingPowerCheck {
  kind: "powerCheck";
  playerId: string;
  position: number;
  power: number;
  riddleCorrect: boolean;
  phase?: "powerCheck";
}

/** Revenge phase: awaiting 1d6 roll. */
export interface PendingRevenge {
  kind: "revenge";
  playerId: string;
  position: number;
  power: number;
  phase?: "revenge";
}

/** Directional roll: awaiting Nd6 roll to move backward. */
export interface PendingDirectional {
  kind: "directional";
  playerId: string;
  position: number;
  dice: 1 | 2 | 3;
}

/**
 * A dice roll (normal or encounter) was applied partially: the player stopped on a fork and
 * must choose a branch via `activeChoices` before the remaining steps run.
 */
export interface PendingCompleteRollMovement {
  kind: "completeRollMovement";
  playerId: string;
  remainingSteps: number;
  direction: RollMovementDirection;
  phase?: "completeRollMovement";
}

export type Pending =
  | PendingRiddle
  | PendingPowerCheck
  | PendingRevenge
  | PendingDirectional
  | PendingCompleteRollMovement;

export function isPendingRollKind(p: Pending | null | undefined): boolean {
  return p?.kind === "powerCheck" || p?.kind === "revenge" || p?.kind === "directional";
}

export function getPendingRollSpec(
  pending: PendingPowerCheck | PendingRevenge | PendingDirectional,
  state: GameState,
): { min: number; max: number; label: string } {
  if (pending.kind === "directional") {
    return { min: pending.dice, max: pending.dice * 6, label: `${pending.dice}d6` };
  }
  if (pending.kind === "revenge") {
    return { min: 1, max: 6, label: "1d6" };
  }
  const squareData = getSquareDataAtPosition(state, pending.position);
  return getPowerCheckRollSpec("powerCheck", pending.riddleCorrect, squareData);
}

export function hasPendingForCurrentTurn(state: {
  game?: Record<string, unknown>;
  players?: Record<string, Record<string, unknown>>;
}): boolean {
  const game = state.game;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as Pending | null | undefined;

  if (!currentTurn || !pending || typeof pending !== "object") {
    return false;
  }
  return pending.playerId === currentTurn;
}

export function getPending(game: Record<string, unknown> | undefined): Pending | null | undefined {
  return game?.pending as Pending | null | undefined;
}

/**
 * When the current player owes a power check or revenge roll, fork prompts and DECISION
 * LLM lines should wait until that roll is resolved (encounter before branch choice).
 */
export function shouldDeferForkPromptForPendingEncounter(state: {
  game?: Record<string, unknown>;
}): boolean {
  const game = state.game;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as Pending | null | undefined;
  if (!currentTurn || !pending || typeof pending !== "object") {
    return false;
  }
  if (pending.playerId !== currentTurn) {
    return false;
  }
  return pending.kind === "powerCheck" || pending.kind === "revenge";
}
