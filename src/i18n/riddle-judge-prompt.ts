import { getLocale } from "./locale-manager";

/**
 * Builds the LLM prompt for fuzzy-matching a spoken riddle answer to the correct option.
 * Spanish (Argentina) is the primary product path; English for en-US parity.
 */
export function buildValidateRiddleAnswerPrompt(
  userAnswer: string,
  options: [string, string, string, string],
  correctOption: string,
): string {
  const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join("\n");

  if (getLocale() === "en-US") {
    return `You are grading a trivia multiple-choice answer. The player heard the question in US English.

Options (exactly 4):
${optionsList}

The correct option is: "${correctOption}"

The player said: "${userAnswer}"

Is the player's answer correct? Treat synonyms, paraphrases, and equivalent wording as correct when they clearly mean the same option. Respond ONLY with valid JSON: {"correct": true} or {"correct": false}. No explanation.

JSON:`;
  }

  return `Eres un juez de respuestas a una pregunta de trivia. Idioma: español (Argentina).

Opciones de la pregunta (exactamente 4):
${optionsList}

La opción correcta es: "${correctOption}"

El usuario respondió: "${userAnswer}"

¿La respuesta del usuario es correcta? Considerá sinónimos, paráfrasis y expresiones equivalentes (incluido voseo y formas coloquiales). Responde ÚNICAMENTE con un JSON válido: {"correct": true} o {"correct": false}. Sin explicación.

JSON:`;
}
