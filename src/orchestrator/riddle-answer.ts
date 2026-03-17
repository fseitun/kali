/**
 * Resolves a riddle answer to a matched option text (or null).
 * Used for strict match: user/LLM says option word or synonym; we match against the four options.
 * No letters or indices — option text only.
 */

/**
 * Strip optional leading "A) ", "B) ", etc. from option text, then trim and lowercase.
 */
export function normalizeOptionText(option: string): string {
  const stripped = option.replace(/^[A-Da-d][.)]\s*/i, "").trim();
  return stripped.toLowerCase();
}

/**
 * Resolve user answer to the matched option text (one of riddleOptions), or null.
 * Matches against the four options (normalized: equals or contains).
 * Returns the actual option string that matched (from riddleOptions), or null if no single match.
 */
export function resolveRiddleAnswerToOption(
  answer: string,
  riddleOptions: string[] | undefined,
): string | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;

  if (!Array.isArray(riddleOptions) || riddleOptions.length !== 4) return null;

  const normalizedAnswer = trimmed.toLowerCase();
  let matchedOption: string | null = null;

  for (let i = 0; i < 4; i++) {
    const opt = riddleOptions[i];
    if (typeof opt !== "string") continue;
    const normalizedOpt = normalizeOptionText(opt);
    const equals = normalizedAnswer === normalizedOpt;
    const answerContainsOption = normalizedAnswer.includes(normalizedOpt);
    const optionContainsAnswer = normalizedOpt.includes(normalizedAnswer);
    if (equals || answerContainsOption || optionContainsAnswer) {
      if (matchedOption !== null) return null;
      matchedOption = opt;
    }
  }

  return matchedOption;
}

/**
 * Strict correctness: true if the answer matches the correct option or one of its synonyms (no LLM).
 * - Match answer to the four options; if matched option (normalized) === correctOption (normalized) → true.
 * - If correctOptionSynonyms present, also check whether answer (normalized) equals or is contained in any synonym (normalized) → true.
 */
export function isStrictRiddleCorrect(
  answer: string,
  riddleOptions: string[] | undefined,
  correctOption: string,
  correctOptionSynonyms?: string[],
): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return false;

  const normalizedAnswer = trimmed.toLowerCase();
  const normalizedCorrect = normalizeOptionText(correctOption);

  // Match to one of the four options
  const matchedOption = resolveRiddleAnswerToOption(answer, riddleOptions);
  if (matchedOption !== null && normalizeOptionText(matchedOption) === normalizedCorrect) {
    return true;
  }

  // Match to correctOptionSynonyms
  if (Array.isArray(correctOptionSynonyms)) {
    for (const syn of correctOptionSynonyms) {
      if (typeof syn !== "string") continue;
      const normalizedSyn = syn.trim().toLowerCase();
      if (!normalizedSyn) continue;
      if (
        normalizedAnswer === normalizedSyn ||
        normalizedAnswer.includes(normalizedSyn) ||
        normalizedSyn.includes(normalizedAnswer)
      ) {
        return true;
      }
    }
  }

  return false;
}
