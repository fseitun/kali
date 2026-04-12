import { t } from "@/i18n/translations";
import type { GameState, TurnFrame, VoiceOutcomeHints } from "@/orchestrator/types";

/**
 * Resolves the current player's display name for TTS.
 *
 * @param state - Snapshot of game state
 * @returns Player name or turn id fallback
 */
function currentPlayerDisplayName(state: GameState): string {
  const game = state.game as Record<string, unknown> | undefined;
  const turn = game?.turn as string | undefined;
  if (!turn) {
    return "";
  }
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const p = players?.[turn];
  const name = p?.name;
  return typeof name === "string" && name.length > 0 ? name : turn;
}

/**
 * When a gameplay turn succeeded but nothing was spoken (no NARRATE, no turn announcement, etc.),
 * speaks deterministic i18n lines based on orchestrator hints.
 *
 * @param options - Hints, state, and speak / last-narration callbacks
 * @returns true if a fallback line was spoken
 */
export async function applySilentSuccessFallback(options: {
  hints: VoiceOutcomeHints | undefined;
  turnFrame?: TurnFrame;
  state: GameState;
  speak: (text: string) => Promise<void>;
  setLastNarration: (text: string) => void;
}): Promise<boolean> {
  const { hints, turnFrame, state, speak, setLastNarration } = options;
  const resolvedHints =
    hints ??
    (turnFrame?.narrationPlans.length === 0 &&
    turnFrame.events.some((event) => event.kind === "forkChoiceStored")
      ? { forkChoiceResolvedWithoutNarrate: true }
      : undefined);
  if (!resolvedHints) {
    return false;
  }

  if (resolvedHints.forkChoiceResolvedWithoutNarrate) {
    const name = currentPlayerDisplayName(state);
    const text = t("game.forkChoiceResolvedRoll", { name });
    setLastNarration(text);
    await speak(text);
    return true;
  }

  return false;
}
