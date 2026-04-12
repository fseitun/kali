/**
 * Parses transcript-like numeric input by extracting digits first.
 * Returns null when no valid integer is present.
 */
export function parseRollLikeInput(answer: string): number | null {
  const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
  const roll = parseInt(rollStr, 10);
  return Number.isNaN(roll) ? null : roll;
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
