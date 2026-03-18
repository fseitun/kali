import { getLocale } from "../locale-manager";

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

interface StateDisplayConfig {
  primary?: string[];
  secondary?: string[];
  hidden?: string[];
}

interface StateDisplayMetadata {
  game?: StateDisplayConfig;
  players?: StateDisplayConfig;
  board?: StateDisplayConfig;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return value.length > 0 ? `[${value.join(",")}]` : "[]";
  }
  if (typeof value === "object") return "{...}";
  return String(value);
}

function formatObjectFields(obj: Record<string, unknown>, config?: StateDisplayConfig): string[] {
  const fields: string[] = [];
  const processed = new Set<string>();

  if (config) {
    const { primary = [], secondary = [], hidden = [] } = config;
    const hiddenSet = new Set(hidden);

    for (const key of primary) {
      if (hiddenSet.has(key)) continue;
      processed.add(key);
      const value = obj[key];
      fields.push(`${key}=${formatFieldValue(value)}`);
    }

    for (const key of secondary) {
      if (hiddenSet.has(key) || processed.has(key)) continue;
      processed.add(key);
      const value = obj[key];
      if (value !== null && value !== undefined && value !== 0 && value !== false && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        fields.push(`${key}=${formatFieldValue(value)}`);
      }
    }

    for (const key of Object.keys(obj)) {
      if (hiddenSet.has(key) || processed.has(key)) continue;
      const value = obj[key];
      if (value !== null && value !== undefined && value !== 0 && value !== false && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        fields.push(`${key}=${formatFieldValue(value)}`);
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && value !== 0 && value !== false && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        fields.push(`${key}=${formatFieldValue(value)}`);
      }
    }
  }

  return fields;
}

/**
 * Formats game state into a concise, human-readable context for the LLM.
 * Uses game-specific stateDisplay metadata if available, otherwise shows all fields.
 * @param state - The game state object
 * @returns Formatted state string
 */
export function formatStateContext(state: Record<string, unknown>): string {
  const parts: string[] = [];
  const displayConfig = state.stateDisplay as StateDisplayMetadata | undefined;

  const game = state.game as Record<string, unknown> | undefined;
  if (game) {
    const fields = formatObjectFields(game, displayConfig?.game);
    if (fields.length > 0) parts.push(`Game: ${fields.join(", ")}`);
  }

  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  if (players) {
    const playerParts = Object.entries(players).map(([id, player]) => {
      const fields = formatObjectFields(player, displayConfig?.players);
      return `${id}:${fields.join(",")}`;
    });
    if (playerParts.length > 0) parts.push(`Players: ${playerParts.join(" | ")}`);
  }

  const board = state.board as Record<string, unknown> | undefined;
  if (board) {
    const fields = formatObjectFields(board, displayConfig?.board);
    if (fields.length > 0) parts.push(`Board: ${fields.join(", ")}`);
  }

  const decisionContext = formatDecisionPointContext(state);
  if (decisionContext) parts.push(decisionContext);

  const animalEncounterContext = formatAnimalEncounterContext(state);
  if (animalEncounterContext) parts.push(animalEncounterContext);

  return parts.join("\n");
}

function formatDecisionPointContext(state: Record<string, unknown>): string {
  const decisionPoints = state.decisionPoints as
    | Array<{ position: number; prompt: string }>
    | undefined;

  if (!decisionPoints || decisionPoints.length === 0) {
    return "";
  }

  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;

  if (!players || !currentTurn) {
    return "";
  }

  const currentPlayer = players[currentTurn];
  if (!currentPlayer) return "";

  const position = currentPlayer.position as number | undefined;
  if (typeof position !== "number") return "";

  const decisionPoint = decisionPoints.find((dp) => dp.position === position);
  if (!decisionPoint) return "";

  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  const hasChoice = choices?.[String(position)] !== undefined;

  if (!hasChoice) {
    const playerName = (currentPlayer.name as string) || currentTurn;
    return `⚠️ DECISION (${playerName}) fork choice at ${position}. Ask: "${decisionPoint.prompt}" If user asks what to do or for help → NARRATE the path options (e.g. from the prompt); do NOT emit PLAYER_ANSWERED. They must state their choice. [current]`;
  }

  return "";
}

function formatAnimalEncounterContext(state: Record<string, unknown>): string {
  const game = state.game as Record<string, unknown> | undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pendingAnimalEncounter as
    | { phase?: string; power?: number; playerId?: string }
    | null
    | undefined;

  if (!pending || !currentTurn || pending.playerId !== currentTurn || !players?.[currentTurn]) {
    return "";
  }

  const playerName = (players[currentTurn].name as string) || currentTurn;
  const power = pending.power ?? 0;

  if (pending.phase === "riddle") {
    const riddleCtx = pending as {
      riddlePrompt?: string;
      riddleOptions?: string[];
      correctOption?: string;
    };
    const prompt = riddleCtx.riddlePrompt;
    const options = riddleCtx.riddleOptions;
    const hasStructuredRiddle = options?.length === 4 && riddleCtx.correctOption;
    const antiLeak =
      " When asking the riddle: ask only the riddle and the four options. Do NOT include the correct answer in that NARRATE.";
    let helpInst: string;
    if (hasStructuredRiddle && prompt) {
      helpInst =
        " If user asks what to do, NARRATE re-asking the same riddle and the four options.";
    } else {
      helpInst =
        " If user asks what to do or says they didn't hear, you MUST return ASK_RIDDLE (text, options, correctOption, optional correctOptionSynonyms) followed by NARRATE speaking that same riddle and options. Do NOT return only a NARRATE saying 'choose an option' without speaking the actual riddle.";
    }
    if (!hasStructuredRiddle) {
      return `⚠️ RIDDLE (${playerName}) phase=riddle.${antiLeak} Ask a riddle with exactly FOUR options. The riddle MUST be about the animal kingdom (e.g. animals, habitats, behavior, diet, classification). Return ASK_RIDDLE with "text", "options" (array of 4 strings), "correctOption" (exact text of the correct option), optionally "correctOptionSynonyms" (array of synonyms). Then NARRATE the riddle and options. When user answers, return PLAYER_ANSWERED with what they said - do NOT use RIDDLE_RESOLVED.${helpInst} [current]`;
    }
    const optionsList = options?.join(", ") ?? "";
    const mapInst =
      optionsList &&
      ` Current options: ${optionsList}. Return PLAYER_ANSWERED with the user's answer (option text or what they said).`;
    return `⚠️ RIDDLE (${playerName}) phase=riddle. User must choose one of the four options. Return PLAYER_ANSWERED with what the user said - do NOT use RIDDLE_RESOLVED. Orchestrator resolves correct/incorrect (strict match then LLM).${mapInst}${helpInst} [current]`;
  }

  if (pending.phase === "powerCheck") {
    const riddleCorrect = (pending as { riddleCorrect?: boolean }).riddleCorrect;
    const diceCount = riddleCorrect ? "2" : "1";
    return `⚠️ POWER CHECK (${playerName}) phase=powerCheck. If user REPORTS their roll (e.g. "tire un dos y un seis", "ocho", "siete") → PLAYER_ANSWERED with the number (sum for 2d6). Do NOT ask "decime el resultado", "¿alcanza?", "is that enough?", "¿sirve?" — they gave the number; process it immediately. Do NOT NARRATE the roll. Return only PLAYER_ANSWERED. Orchestrator announces pass/fail. If user asks what to do → NARRATE "Tirá ${diceCount} dado(s)... decime el resultado." [current]`;
  }

  if (pending.phase === "revenge") {
    return `⚠️ REVENGE (${playerName}) phase=revenge. Same player, not next. 1 die, roll >= ${power} wins. User reports roll → PLAYER_ANSWERED with the number (1-6). Do NOT ask "¿alcanza?", "is that enough?" — process it immediately. Do NOT NARRATE the roll. Return only PLAYER_ANSWERED. Orchestrator announces pass/fail. If user asks what to do → NARRATE that they should roll one die and report the number (need ${power} or more). If prompting, name the player: "${playerName}, tirá el dado." [current]`;
  }

  return "";
}

export const SYSTEM_PROMPT = getBasePrimitivesDocs();
