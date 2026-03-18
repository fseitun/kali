/**
 * Parses a positive integer from an env string, with normalization and validation.
 * Use for numeric env vars (e.g. timeouts) so values like "10_000" or "60,000" work
 * and invalid values fall back to default instead of producing NaN.
 *
 * @param value - Raw env value (string or undefined)
 * @param defaultVal - Value to return when missing, empty, or invalid
 * @param envKey - Optional env key name for warning message
 * @returns Parsed positive integer, or defaultVal if invalid
 */
export function parsePositiveIntEnv(
  value: string | undefined | null,
  defaultVal: number,
  envKey?: string,
): number {
  if (value === undefined || value === null) return defaultVal;
  const trimmed = String(value).trim();
  if (trimmed === "") return defaultVal;

  const normalized = trimmed.replace(/_/g, "").replace(/,/g, "");
  const num = Number(normalized);

  if (!Number.isFinite(num) || num < 1 || num !== Math.floor(num)) {
    if (envKey != null) {
      console.warn(
        `[config] Invalid ${envKey}: "${value}" (expected positive integer). Using default: ${defaultVal}.`,
      );
    }
    return defaultVal;
  }

  return num;
}
