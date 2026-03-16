/**
 * Resolves a riddle answer (letter or option text) to a single letter "A"|"B"|"C"|"D".
 * Used so that when the user (or LLM) says the option word (e.g. "miércoles") instead of
 * the letter ("A"), the pipeline still accepts and scores the answer.
 */
const LETTERS = ["A", "B", "C", "D"] as const;
export type RiddleLetter = (typeof LETTERS)[number];

/**
 * Strip optional leading "A) ", "B) ", etc. from option text, then trim and lowercase.
 */
function normalizeOptionText(option: string): string {
  const stripped = option.replace(/^[A-Da-d]\)\s*/i, "").trim();
  return stripped.toLowerCase();
}

/**
 * Resolve user answer to a riddle letter using stored options.
 * - If answer is already a single letter A–D (or starts with one), return it.
 * - Else match answer against riddleOptions (after stripping "A) ", etc.): if exactly one
 *   option matches (equals or contains), return that option's letter; otherwise null.
 */
export function resolveRiddleAnswerToLetter(
  answer: string,
  riddleOptions: string[] | undefined,
): RiddleLetter | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;

  const firstChar = trimmed.charAt(0).toUpperCase();
  if (LETTERS.includes(firstChar as RiddleLetter)) {
    return firstChar as RiddleLetter;
  }

  if (!Array.isArray(riddleOptions) || riddleOptions.length !== 4) return null;

  const normalizedAnswer = trimmed.toLowerCase();
  let matchedIndex: number | null = null;

  for (let i = 0; i < 4; i++) {
    const opt = riddleOptions[i];
    if (typeof opt !== "string") continue;
    const normalizedOpt = normalizeOptionText(opt);
    const equals = normalizedAnswer === normalizedOpt;
    const answerContainsOption = normalizedAnswer.includes(normalizedOpt);
    const optionContainsAnswer = normalizedOpt.includes(normalizedAnswer);
    if (equals || answerContainsOption || optionContainsAnswer) {
      if (matchedIndex !== null) return null;
      matchedIndex = i;
    }
  }

  if (matchedIndex === null) return null;
  return LETTERS[matchedIndex];
}
