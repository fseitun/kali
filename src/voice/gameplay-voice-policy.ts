import { possessiveScorePhraseEn, possessiveScorePhraseEs } from "@/i18n/kalimba-encounter-phrases";
import { getLocale } from "@/i18n/locale-manager";
import { magicDoorHeartsPhrase } from "@/i18n/magic-door-phrases";
import { t } from "@/i18n/translations";
import {
  getMagicDoorConfig,
  getMagicDoorOpeningBonus,
  minDieToOpenMagicDoor,
} from "@/orchestrator/board-helpers";
import type { GameState, TurnFrame, VoiceOutcomeHints } from "@/orchestrator/types";

interface TurnPlayer {
  playerId: string;
  name: string;
  position: number;
}

/**
 * The magic door turn line, or null when the player is not standing at an unopened door.
 * The door itself, the hearts bonus and the die it takes to open it all come from
 * `board-helpers`, which reads them off the game config: this only assembles the words.
 */
function magicDoorTurnAnnouncement(
  player: TurnPlayer,
  state: GameState | undefined,
): string | null {
  const door = getMagicDoorConfig(state?.board?.squares);
  if (player.position !== door?.position) {
    return null;
  }
  const playerSlice = state?.players?.[player.playerId] as Record<string, unknown> | undefined;
  if (playerSlice?.magicDoorOpened === true) {
    return null;
  }
  const hearts = getMagicDoorOpeningBonus(playerSlice);
  return t("game.turnAnnouncementMagicDoor", {
    name: player.name,
    position: player.position,
    heartsPhrase: magicDoorHeartsPhrase(hearts),
    target: door.target,
    minDie: minDieToOpenMagicDoor(door.target, hearts),
  });
}

/** The revenge this player owes on their own square, or null. */
function revengePendingFor(
  state: GameState | undefined,
  playerId: string,
): { position?: number; power?: number } | null {
  const pending = state?.game?.pending as
    { kind?: string; playerId?: string; position?: number; power?: number } | null | undefined;
  return pending?.kind === "revenge" && pending.playerId === playerId ? pending : null;
}

/**
 * The revenge line, or null when this player owes no revenge roll. A revenge turn looks exactly
 * like an ordinary one from the table's side — same player, same square — so the plain "roll the
 * dice" prompt sends them rolling for movement instead of at the animal, and never says the
 * number they have to reach.
 */
function revengeTurnAnnouncement(player: TurnPlayer, state: GameState | undefined): string | null {
  const pending = revengePendingFor(state, player.playerId);
  if (pending === null) {
    return null;
  }
  const squareName = state?.board?.squares?.[String(pending.position ?? player.position)]?.name;
  const animalScorePhrase =
    getLocale() === "es-AR"
      ? possessiveScorePhraseEs(squareName)
      : possessiveScorePhraseEn(squareName);
  return t("game.turnAnnouncementRevenge", {
    name: player.name,
    position: player.position,
    // Revenge wins on `roll >= power` (riddle-power-check), so this is the number to reach.
    power: pending.power ?? 0,
    animalScorePhrase,
  });
}

/**
 * Turn line after advance or alreadyAdvanced: magic door opening prompt, revenge roll prompt,
 * fork prompt, or the plain move prompt.
 */
export function buildTurnAnnouncement(
  player: TurnPlayer,
  pendingPrompt: string | null | undefined,
  state: GameState | undefined,
): string {
  const magicDoorLine = magicDoorTurnAnnouncement(player, state);
  if (magicDoorLine !== null) {
    return magicDoorLine;
  }
  const revengeLine = revengeTurnAnnouncement(player, state);
  if (revengeLine !== null) {
    return revengeLine;
  }
  if (pendingPrompt) {
    return t("game.turnAnnouncementWithDecision", {
      name: player.name,
      position: player.position,
      prompt: pendingPrompt,
    });
  }
  return t("game.turnAnnouncement", { name: player.name, position: player.position });
}

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
