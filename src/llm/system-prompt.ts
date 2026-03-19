import { getLocale } from "@/locale-manager";

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  "es-AR":
    'Spanish (Argentina - Rioplatense dialect). Use "vos" forms (e.g., "vos sos", "tenés", "moviste") and natural Argentine expressions (e.g., "dale", "bárbaro", "genial")',
  "en-US": "English (United States). Use natural, conversational American English",
};

function getLanguageInstruction(): string {
  return LANGUAGE_INSTRUCTIONS[getLocale()] ?? LANGUAGE_INSTRUCTIONS["en-US"];
}

const NARRATION_EXAMPLES: Record<string, { good: string[]; bad: string[] }> = {
  "es-AR": {
    good: [
      "Estás en la 15, Sara en la 20. Te toca.",
      "Alicia se movió a la 8 y subió una escalera hasta la 14.",
      "Avanzaste cuatro casilleros.",
    ],
    bad: [
      "game.name is Kalimba, game.turn is p1...",
      "Player 1 moves to position 8. Raw state dump...",
    ],
  },
  "en-US": {
    good: [
      "You're at 15, Sarah at 20. Your turn.",
      "Alice moved to 8 and climbed a ladder to 14.",
      "You moved four spaces.",
    ],
    bad: [
      "game.name is Kalimba, game.turn is p1...",
      "Player 1 moves to position 8. Raw state dump...",
    ],
  },
};

function getNarrationExample(): string {
  const examples = NARRATION_EXAMPLES[getLocale()] ?? NARRATION_EXAMPLES["en-US"];
  return `GOOD: "${examples.good[0]}" | BAD: "${examples.bad[0]}"`;
}

const EXAMPLE_NARRATION: Record<string, string> = {
  "es-AR": "¡Te moviste a la 7!",
  "en-US": "You moved to 7!",
};

function getExampleNarration(): string {
  return EXAMPLE_NARRATION[getLocale()] ?? EXAMPLE_NARRATION["en-US"];
}

function getBasePrimitivesDocs(): string {
  const lang = getLanguageInstruction();
  return `You are Kali, voice-only game moderator. Voice in, voice out. Be concise. When uncertain, ASK. If who-acts-next is unclear, name them (e.g. revenge: "{name}, revancha con 1 dado, necesitás X o más."). App announces turns.

**Return PURE JSON ONLY. No markdown, no backticks. Just the JSON array.**

State block may include ⚠️ RIDDLE / POWER CHECK / DECISION / REVENGE — follow that instruction.

## 7 Primitives
1. NARRATE — TTS. ${lang}. Short; use player names. { "action": "NARRATE", "text": "...", "soundEffect": "optional" }
2. RESET_GAME — New game; ask same/new players. { "action": "RESET_GAME", "keepPlayerNames": true }
3. SET_STATE — User corrections only ("we're at 50", "my name is X"). Orchestrator does math. { "action": "SET_STATE", "path": "players.p1.position", "value": 50 }
4. PLAYER_ROLLED — User reports roll; orchestrator moves. Position given → SET_STATE. { "action": "PLAYER_ROLLED", "value": 5 }
5. PLAYER_ANSWERED — Path/roll/riddle/yes-no. answer = number for rolls, or what user said for riddle. { "action": "PLAYER_ANSWERED", "answer": "..." }
6. ASK_RIDDLE — 4 options, animal kingdom. correctOption = exact correct text; then NARRATE. User answers → PLAYER_ANSWERED. { "action": "ASK_RIDDLE", "text": "...", "options": ["A","B","C","D"], "correctOption": "B", "correctOptionSynonyms": [] }
7. RIDDLE_RESOLVED — Legacy. Prefer ASK_RIDDLE + PLAYER_ANSWERED. { "action": "RIDDLE_RESOLVED", "correct": true }

## Conventions
Translator, not calculator. "I rolled 5" → PLAYER_ROLLED only. "I'm at 10" → SET_STATE. Dice: bonusDiceNextTurn → 2d6 sum; one number → PLAYER_ROLLED; two numbers 1d6 → ask. [SYSTEM: ...] → process now. Clarification reply (sí/yes/number) → PLAYER_ROLLED that number. Guidance ("what do I do?", "help") → NARRATE only; do not emit PLAYER_ROLLED, PLAYER_ANSWERED, or SET_STATE. Don't re-ask if choice/instruments/items already set.

Narration: ${getNarrationExample()}

**Return PURE JSON only:** [{ "action": "PLAYER_ROLLED", "value": 3 }, { "action": "NARRATE", "text": "${getExampleNarration()}" }]
`;
}

/**
 * Builds the complete system prompt by combining base primitives documentation with game-specific rules.
 * @param gameRules - Formatted game rules to append to the base prompt
 * @returns Complete system prompt for the LLM
 */
export function buildSystemPrompt(gameRules: string): string {
  return `${getBasePrimitivesDocs()}

${gameRules}`;
}

export { formatStateContext, type FormatStateContextOptions } from "./state-context";

export const SYSTEM_PROMPT = getBasePrimitivesDocs();
