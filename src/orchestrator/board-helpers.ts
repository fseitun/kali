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
  if (!squares) return null;
  for (const [key, sq] of Object.entries(squares)) {
    if (sq?.effect === effect) {
      const pos = parseInt(key, 10);
      if (!Number.isNaN(pos)) return { position: pos, square: sq };
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
