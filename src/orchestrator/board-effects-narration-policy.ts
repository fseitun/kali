/**
 * Builds deterministic animal encounter landing speech in locale-specific phrasing.
 *
 * @param locale - Active locale code
 * @param playerName - Current player name
 * @param kaliLine - Intro line spoken by Kali
 * @param question - Encounter question text
 * @param options - Four encounter options in order
 * @returns Final deterministic encounter speech text
 */
export function buildAnimalEncounterLandingSpeech(
  locale: "es-AR" | "en-US",
  playerName: string,
  kaliLine: string,
  question: string,
  options: [string, string, string, string],
): string {
  const [a, b, c, d] = options;
  if (locale === "es-AR") {
    return `${playerName}, ${kaliLine} ${question} Opciones: A) ${a}. B) ${b}. C) ${c}. D) ${d}. Decime cual opcion es correcta.`;
  }
  return `${playerName}, ${kaliLine} ${question} Options: A) ${a}. B) ${b}. C) ${c}. D) ${d}. Tell me which option is correct.`;
}
