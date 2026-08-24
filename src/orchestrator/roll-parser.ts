/**
 * Parses transcript-like numeric input holding exactly one integer ("saqué 4" → 4).
 * Returns null for anything else — several digit groups ("1 y 6", "3.5") are ambiguous,
 * never a single roll, and must not be concatenated into a bogus number.
 */
export function parseRollLikeInput(answer: string): number | null {
  const match = /^\D*(\d+)\D*$/.exec(answer.trim());
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Parses roll-like input and validates it is within [min, max].
 */
export function parseRollInRange(answer: string, min: number, max: number): number | null {
  const roll = parseRollLikeInput(answer);
  if (roll === null) {
    return null;
  }
  return roll >= min && roll <= max ? roll : null;
}
