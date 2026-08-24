import { t } from "@/i18n/translations";

/**
 * Builds the deterministic animal-encounter landing speech.
 *
 * @param playerName - Current player name
 * @param kaliLine - Intro line spoken by Kali
 * @param question - Encounter question text
 * @param options - Four encounter options in order
 * @returns Final deterministic encounter speech text
 */
export function buildAnimalEncounterLandingSpeech(
  playerName: string,
  kaliLine: string,
  question: string,
  options: [string, string, string, string],
): string {
  const [a, b, c, d] = options;
  return t("squares.encounterOptionsPrompt", {
    name: playerName,
    kaliLine,
    question,
    a,
    b,
    c,
    d,
  });
}
