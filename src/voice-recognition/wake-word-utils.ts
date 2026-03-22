/**
 * Utilities for robust wake word detection: normalization and fuzzy matching
 * so ASR misrecognitions (e.g. "callie", "kari") still trigger.
 */

/**
 * Normalizes text for wake word comparison: lowercase and collapse repeated
 * letters so stuttered ASR output (e.g. "kallli") still matches.
 */
export function normalizeForWakeWord(text: string): string {
  const lower = text.toLowerCase().trim();
  return lower.replace(/(.)\1+/g, "$1");
}

/**
 * Returns Levenshtein edit distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  const rows = lenA + 1;
  const cols = lenB + 1;
  const d: number[] = new Array(rows * cols);

  for (let i = 0; i <= lenA; i++) {
    d[i * cols] = i;
  }
  for (let j = 0; j <= lenB; j++) {
    d[j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i * cols + j] = Math.min(
        d[(i - 1) * cols + j] + 1,
        d[i * cols + (j - 1)] + 1,
        d[(i - 1) * cols + (j - 1)] + cost,
      );
    }
  }
  return d[rows * cols - 1];
}

/**
 * Splits transcript into words (alpha-only tokens) for per-word fuzzy match.
 */
function wordsFromTranscript(text: string): string[] {
  const normalized = normalizeForWakeWord(text);
  return normalized.split(/\s+/).filter((w) => /[a-z]/.test(w));
}

/**
 * Returns true if the transcript is considered to contain the wake word.
 * Uses (1) exact substring match over normalized text and (2) per-word fuzzy
 * match so ASR misrecognitions like "callie" or "kari" still trigger.
 *
 * @param transcript - Raw transcript (e.g. from Vosk)
 * @param variants - Canonical wake word spellings and known sound-alikes
 * @param maxEditDistance - Max Levenshtein distance for a word to count (default 1)
 */
export function isWakeWordMatch(
  transcript: string,
  variants: readonly string[],
  maxEditDistance = 1,
): boolean {
  if (!transcript.trim()) {
    return false;
  }

  const normalized = normalizeForWakeWord(transcript);

  // Exact substring: "kali", "hey kali", "california" (for "cali")
  if (variants.some((word) => normalized.includes(normalizeForWakeWord(word)))) {
    return true;
  }

  // Per-word fuzzy: "the callie said" -> "callie" matches "kali" within edit distance
  const words = wordsFromTranscript(transcript);
  const normalizedVariants = variants.map((v) => normalizeForWakeWord(v));

  for (const word of words) {
    if (word.length < 3 || word.length > 10) {
      continue;
    }
    for (const variant of normalizedVariants) {
      if (Math.abs(word.length - variant.length) > maxEditDistance) {
        continue;
      }
      if (levenshtein(word, variant) <= maxEditDistance) {
        return true;
      }
    }
  }

  return false;
}
