/**
 * Helpers for deriving board metadata from squares at runtime.
 * Squares are the single source of truth; these values are not stored on board.
 */

export interface SquareLike {
  effect?: string;
  target?: number;
  [key: string]: unknown;
}

/**
 * Finds the first square with the given effect.
 *
 * @param squares - Board squares keyed by position
 * @param effect - Effect string to match (e.g. "win", "magicDoorCheck")
 * @returns Position and square data, or null if not found
 */
export function findSquareByEffect(
  squares: Record<string, SquareLike> | undefined,
  effect: string,
): { position: number; square: SquareLike } | null {
  if (!squares) {
    return null;
  }
  for (const [key, sq] of Object.entries(squares)) {
    if (sq?.effect === effect) {
      const pos = parseInt(key, 10);
      if (!Number.isNaN(pos)) {
        return { position: pos, square: sq };
      }
    }
  }
  return null;
}

/**
 * Returns the win position from squares (effect=win), or 196 if not found.
 *
 * @param squares - Board squares keyed by position
 * @returns Win position (default 196)
 */
export function getWinPosition(squares: Record<string, SquareLike> | undefined): number {
  const found = findSquareByEffect(squares, "win");
  return found?.position ?? 196;
}

/**
 * Magic door square from config (`effect: magicDoorCheck`). Used for voice copy and prompts.
 */
export function getMagicDoorConfig(
  squares: Record<string, SquareLike> | undefined,
): { position: number; target: number } | null {
  const found = findSquareByEffect(squares, "magicDoorCheck");
  if (!found) {
    return null;
  }
  const target = typeof found.square.target === "number" ? found.square.target : 6;
  return { position: found.position, target };
}

/**
 * Minimum value on a single opening die such that `die + hearts >= target`.
 */
export function minDieToOpenMagicDoor(target: number, hearts: number): number {
  const diff = target - hearts;
  if (diff <= 1) {
    return 1;
  }
  return Math.min(6, diff);
}

/**
 * Hearts toward magic door opening.
 */
export function getMagicDoorOpeningBonus(player: Record<string, unknown> | undefined): number {
  if (!player) {
    return 0;
  }
  const heartsRaw = player.hearts;
  const hearts = typeof heartsRaw === "number" && heartsRaw >= 0 ? heartsRaw : 0;
  return hearts;
}

/**
 * True when the current player is on the magic door square and must roll to open (not yet opened).
 */
export function isMagicDoorOpeningRollState(state: {
  game?: Record<string, unknown>;
  players?: Record<string, Record<string, unknown>>;
  board?: { squares?: Record<string, SquareLike> };
}): boolean {
  const turn = state.game?.turn as string | undefined;
  if (!turn) {
    return false;
  }
  const player = state.players?.[turn];
  if (!player || player.magicDoorOpened === true) {
    return false;
  }
  const pos = player.position;
  if (typeof pos !== "number") {
    return false;
  }
  const door = getMagicDoorConfig(state.board?.squares);
  return door !== null && pos === door.position;
}
