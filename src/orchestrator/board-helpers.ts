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
 * Kalimba: scimitar in inventory counts as +1 toward the magic-door sum (with hearts).
 */
export function scimitarDoorBonusFromItems(items: unknown): number {
  if (!Array.isArray(items)) {
    return 0;
  }
  return items.includes("scimitar") ? 1 : 0;
}

/**
 * Minimum value on a single opening die such that `die + hearts + doorItemBonus >= target`
 * (Kalimba door rule; scimitar adds one to the non-die total).
 */
export function minDieToOpenMagicDoor(target: number, hearts: number, doorItemBonus = 0): number {
  const effective = hearts + doorItemBonus;
  const diff = target - effective;
  if (diff <= 1) {
    return 1;
  }
  return Math.min(6, diff);
}
