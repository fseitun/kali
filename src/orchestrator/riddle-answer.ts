/**
 * Resolves a riddle answer to a matched option text (or null).
 * Used for strict match: user/LLM says option text, or a 1–4 index / "opción N", or wording that matches an option.
 */

/**
 * Strip optional leading "A) ", "B) ", etc. from option text, then trim and lowercase.
 */
export function normalizeOptionText(option: string): string {
  const stripped = option.replace(/^[A-Da-d][.)]\s*/i, "").trim();
  return stripped.toLowerCase();
}

/**
 * If the answer is a 1-based index 1–4 or "opción N", return that option string.
 * @param trimmed - Already trimmed user answer
 * @param riddleOptions - Exactly four option strings
 * @returns The option at that index, or null
 */
function resolveRiddleOptionBySpokenIndex(trimmed: string, riddleOptions: string[]): string | null {
  const digitOnly = trimmed.match(/^([1-4])$/);
  if (digitOnly) {
    const idx = parseInt(digitOnly[1], 10) - 1;
    const byIndex = riddleOptions[idx];
    return typeof byIndex === "string" ? byIndex : null;
  }

  const optionKeyword = "(?:opci[oó]n|option)";

  const opcionIdx = trimmed.match(new RegExp(`^${optionKeyword}\\s*([1-4])$`, "i"));
  if (opcionIdx) {
    const idx = parseInt(opcionIdx[1], 10) - 1;
    const byIndex = riddleOptions[idx];
    return typeof byIndex === "string" ? byIndex : null;
  }

  const letterOnly = trimmed.match(/^([A-Da-d])(?:[.)])?$/);
  if (letterOnly) {
    const idx = letterOnly[1].toUpperCase().charCodeAt(0) - 65;
    const byIndex = riddleOptions[idx];
    return typeof byIndex === "string" ? byIndex : null;
  }

  const opcionLetter = trimmed.match(new RegExp(`^${optionKeyword}\\s*([A-Da-d])(?:[.)])?$`, "i"));
  if (opcionLetter) {
    const idx = opcionLetter[1].toUpperCase().charCodeAt(0) - 65;
    const byIndex = riddleOptions[idx];
    return typeof byIndex === "string" ? byIndex : null;
  }
  return null;
}

/**
 * Fuzzy match user text to exactly one of four options (equals / contains), or null if ambiguous.
 */
function matchRiddleOptionByFuzzyText(
  normalizedAnswer: string,
  riddleOptions: string[],
): string | null {
  let matchedOption: string | null = null;
  for (let i = 0; i < 4; i++) {
    const opt = riddleOptions[i];
    if (typeof opt !== "string") {
      continue;
    }
    const normalizedOpt = normalizeOptionText(opt);
    const equals = normalizedAnswer === normalizedOpt;
    const answerContainsOption = normalizedAnswer.includes(normalizedOpt);
    const optionContainsAnswer = normalizedOpt.includes(normalizedAnswer);
    if (equals || answerContainsOption || optionContainsAnswer) {
      if (matchedOption !== null) {
        return null;
      }
      matchedOption = opt;
    }
  }
  return matchedOption;
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
  if (!trimmed) {
    return null;
  }

  if (!Array.isArray(riddleOptions) || riddleOptions.length !== 4) {
    return null;
  }

  const byIndex = resolveRiddleOptionBySpokenIndex(trimmed, riddleOptions);
  if (byIndex !== null) {
    return byIndex;
  }

  return matchRiddleOptionByFuzzyText(trimmed.toLowerCase(), riddleOptions);
}

function matchesCorrectOptionSynonyms(
  normalizedAnswer: string,
  correctOptionSynonyms: string[] | undefined,
): boolean {
  if (!Array.isArray(correctOptionSynonyms)) {
    return false;
  }
  for (const syn of correctOptionSynonyms) {
    if (typeof syn !== "string") {
      continue;
    }
    const normalizedSyn = syn.trim().toLowerCase();
    if (!normalizedSyn) {
      continue;
    }
    if (
      normalizedAnswer === normalizedSyn ||
      normalizedAnswer.includes(normalizedSyn) ||
      normalizedSyn.includes(normalizedAnswer)
    ) {
      return true;
    }
  }
  return false;
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
  if (!trimmed) {
    return false;
  }

  const normalizedAnswer = trimmed.toLowerCase();
  const normalizedCorrect = normalizeOptionText(correctOption);

  // Match to one of the four options
  const matchedOption = resolveRiddleAnswerToOption(answer, riddleOptions);
  if (matchedOption !== null && normalizeOptionText(matchedOption) === normalizedCorrect) {
    return true;
  }

  return matchesCorrectOptionSynonyms(normalizedAnswer, correctOptionSynonyms);
}
