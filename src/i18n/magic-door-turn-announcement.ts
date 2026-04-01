import { magicDoorHeartsPhrase } from "./magic-door-phrases";
import { t } from "./translations";
import {
  getMagicDoorConfig,
  minDieToOpenMagicDoor,
  scimitarDoorBonusFromItems,
  type SquareLike,
} from "@/orchestrator/board-helpers";
import type { GameState } from "@/orchestrator/types";

function clampNonNegativeHearts(raw: unknown): number {
  const n = typeof raw === "number" ? raw : -1;
  return n >= 0 ? n : 0;
}

function doorOpeningParams(
  nextPlayer: { playerId: string; name: string; position: number },
  state: GameState | undefined,
): { target: number; hearts: number; scimitarBonus: number } | null {
  const squares = state?.board?.squares as Record<string, SquareLike> | undefined;
  const door = getMagicDoorConfig(squares);
  if (nextPlayer.position !== door?.position) {
    return null;
  }
  const p = state?.players?.[nextPlayer.playerId];
  return {
    target: door.target,
    hearts: clampNonNegativeHearts(p?.hearts),
    scimitarBonus: scimitarDoorBonusFromItems(p?.items),
  };
}

/**
 * If the next player is on the magic door square, returns localized TTS for opening the door
 * (hearts + optional scimitar bonus toward the target sum).
 */
export function buildMagicDoorTurnAnnouncementIfOnDoor(
  nextPlayer: { playerId: string; name: string; position: number },
  state: GameState | undefined,
): string | null {
  const params = doorOpeningParams(nextPlayer, state);
  if (!params) {
    return null;
  }
  const { target, hearts, scimitarBonus } = params;
  const minDie = minDieToOpenMagicDoor(target, hearts, scimitarBonus);
  const key =
    scimitarBonus > 0
      ? "game.turnAnnouncementMagicDoorWithScimitar"
      : "game.turnAnnouncementMagicDoor";
  return t(key, {
    name: nextPlayer.name,
    position: nextPlayer.position,
    heartsPhrase: magicDoorHeartsPhrase(hearts),
    target,
    minDie,
  });
}
