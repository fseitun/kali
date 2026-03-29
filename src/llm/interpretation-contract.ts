import { hasMovementForkBlockingPlay } from "@/orchestrator/fork-roll-policy";
import {
  getPendingRollSpec,
  isPendingRollKind,
  type Pending,
  type PendingDirectional,
  type PendingPowerCheck,
  type PendingRevenge,
} from "@/orchestrator/pending-types";
import type { GameState } from "@/orchestrator/types";

type PendingRoll = PendingPowerCheck | PendingRevenge | PendingDirectional;

function contractForPending(
  pending: Record<string, unknown>,
  state: Record<string, unknown>,
  currentTurn: string,
): string | null {
  if (pending.playerId !== currentTurn) {
    return null;
  }
  if (pending.kind === "riddle") {
    const opts = pending.riddleOptions as unknown[] | undefined;
    if (Array.isArray(opts) && opts.length === 4) {
      return "interpreter_contract: PLAYER_ANSWERED only — user's riddle answer (option text, 1–4, or spoken match to an option). No PLAYER_ROLLED.";
    }
    return "interpreter_contract: ASK_RIDDLE + NARRATE per ⚠️ RIDDLE; then PLAYER_ANSWERED for the user's answer.";
  }
  const pendingTyped = pending as unknown as Pending;
  if (isPendingRollKind(pendingTyped)) {
    const spec = getPendingRollSpec(pendingTyped as PendingRoll, state as GameState);
    return `interpreter_contract: PLAYER_ANSWERED only — numeric roll for this phase; valid range ${spec.min}–${spec.max} (${spec.label}).`;
  }
  if (pending.kind === "completeRollMovement") {
    return "interpreter_contract: PLAYER_ANSWERED only — target square number to finish fork move. No PLAYER_ROLLED.";
  }
  return null;
}

function contractForOpenMovement(
  state: Record<string, unknown>,
  currentTurn: string | undefined,
  players: Record<string, Record<string, unknown>> | undefined,
): string {
  if (hasMovementForkBlockingPlay(state as GameState)) {
    return "interpreter_contract: Resolve fork first — PLAYER_ANSWERED with destination square; do not PLAYER_ROLLED until fork is chosen.";
  }

  const bonusDice =
    currentTurn && players?.[currentTurn]?.bonusDiceNextTurn === true ? true : false;
  return bonusDice
    ? "interpreter_contract: PLAYER_ROLLED for movement; value must be 2–12 (two dice). Do not state final board position in NARRATE."
    : "interpreter_contract: PLAYER_ROLLED for movement; value must be 1–6 (one die). Do not state final board position in NARRATE.";
}

/**
 * Single machine-owned line: expected primitive shape for the interpreter (English for all locales).
 */
export function formatInterpretationContract(state: Record<string, unknown>): string {
  const game = state.game as Record<string, unknown> | undefined;
  if ((game?.phase as string | undefined) !== "PLAYING") {
    return "";
  }
  const currentTurn = game?.turn as string | undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const pending = game?.pending as Record<string, unknown> | null | undefined;

  if (currentTurn && pending && typeof pending === "object") {
    const line = contractForPending(pending, state, currentTurn);
    if (line) {
      return line;
    }
  }

  return contractForOpenMovement(state, currentTurn, players);
}
