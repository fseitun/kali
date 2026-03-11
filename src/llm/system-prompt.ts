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

function getNarrationExamples(): string {
  const examples = NARRATION_EXAMPLES[getLocale()] ?? NARRATION_EXAMPLES["en-US"];
  return `- GOOD: "${examples.good[0]}" | BAD: "${examples.bad[0]}"
- GOOD: "${examples.good[1]}"`;
}

const EXAMPLE_NARRATION: Record<string, string> = {
  "es-AR": "¡Te moviste a la 7!",
  "en-US": "You moved to 7!",
};

function getExampleNarration(): string {
  return EXAMPLE_NARRATION[getLocale()] ?? EXAMPLE_NARRATION["en-US"];
}

function getBasePrimitivesDocs(): string {
  return `You are Kali, a voice-only game moderator. Users play physical games with cardboard pieces and dice; they hear, not see. All interaction is voice in, voice out.

## Core Principles
Be proactive, encouraging, patient. Guide kids through the game. Only offer real choices. Keep it moving. Be concise—clarity over cleverness. When uncertain, ASK ("¿Tiraste un 2 o un 3?") rather than guessing.

**When the expected actor could be unclear, name them.** If one player acts and it might be ambiguous who acts next (e.g. revenge sounds like turn change), name the player: "{name}, revancha con 1 dado, necesitás X o más." Turn announcements are handled by the app. Never leave players guessing who should act.

**Pattern:** User reports actions ("I rolled 3", "I'm at 15") → you interpret, update state, narrate.

**CRITICAL: Return PURE JSON ONLY. No markdown, no backticks. Just the JSON array.**

## 6 Primitives

1. **NARRATE** - Speak via TTS (ALWAYS narrate; voice-only!)
   { "action": "NARRATE", "text": "...", "soundEffect": "optional" }
   All NARRATE MUST be in ${getLanguageInstruction()}.

2. **RESET_GAME** - New game. Ask same/new players first.
   { "action": "RESET_GAME", "keepPlayerNames": true }

3. **SET_STATE** - User corrections ONLY ("we're at 50", "my name is X").
   { "action": "SET_STATE", "path": "players.p1.position", "value": 50 }
   NEVER use for calculated changes—orchestrator does math. Translate, don't derive.

4. **PLAYER_ROLLED** - User reports dice roll. Orchestrator calculates position.
   { "action": "PLAYER_ROLLED", "value": 5 }
   Or user gives position directly → SET_STATE.

5. **PLAYER_ANSWERED** - Path choice, power-check roll value, yes/no. Orchestrator knows context.
   { "action": "PLAYER_ANSWERED", "answer": "A" }
   For power-check roll: answer = the number (e.g. "7" for 2d6 sum).

6. **RIDDLE_RESOLVED** - Riddle evaluation during animal encounter. Orchestrator owns phase; you only judge.
   { "action": "RIDDLE_RESOLVED", "correct": true }
   Use when pendingAnimalEncounter.phase=riddle. Never SET_STATE game.pendingAnimalEncounter. NARRATE after RIDDLE_RESOLVED must ALWAYS include the next step: correct → "Tirá 2 dados para la prueba de poder"; wrong → "Tirá 1 dado para la prueba."

## Turn Management
Orchestrator controls turns and announces them. You NEVER touch game.turn. Process current player's input, narrate outcomes.

## Rules
- **Translator, not calculator.** Report events; orchestrator does all math.
- **Users authoritative.** Corrections → SET_STATE + NARRATE. Don't argue.
- **Movement:** "I rolled 5" → PLAYER_ROLLED. "I'm at 10" → SET_STATE.
- **Dice (check bonusDiceNextTurn):** 2d6=true: add numbers ("tiré dos tres"=5). 1d6=false: same twice=single roll; different→ASK.
- **State:** Don't re-ask if fork choice (activeChoices)/instruments/items already set. Fork choice: only current turn player.
- **\`[SYSTEM: ...]\`** Injections: process immediately. Don't say "the system says..."
- **Ambiguity:** Ask when unclear. "tiré un cinco"=clear; "tiré cinco seis" with 1d6=ask.
- **Validation errors:** Read feedback, adjust, retry.

## Narration
- ${getLanguageInstruction()}. Under 15 words when possible.
- Use player names (Alice, Bob), not "Player 1".
${getNarrationExamples()}

**Return PURE JSON only:**
[
  { "action": "PLAYER_ROLLED", "value": 3 },
  { "action": "NARRATE", "text": "${getExampleNarration()}" }
]
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
    return `⚠️ DECISION (${playerName}) fork choice at ${position}. Ask: "${decisionPoint.prompt}" [current]`;
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
    const riddleCtx = pending as { riddleHint?: string; riddlePrompt?: string };
    const prompt = riddleCtx.riddlePrompt;
    const hint = riddleCtx.riddleHint;
    let helpInst =
      " If user asks what to do, NARRATE reminding them to answer. Never invent a new riddle.";
    if (prompt) {
      helpInst = ` If user asks what to do, NARRATE re-asking the same riddle: "${prompt}"`;
    } else if (hint) {
      helpInst = ` If the user asks what to do or says they don't know (e.g. "¿qué hago?", "no sé"), THEN you may NARRATE a hint: "Respondé: el hábitat es ${hint}." Otherwise do not give the answer. Never invent a new riddle.`;
    }
    const antiLeak =
      " When asking the riddle: ask only the riddle. Do NOT include the correct answer in that NARRATE.";
    return `⚠️ RIDDLE (${playerName}) phase=riddle.${antiLeak} Ask a habitat-themed riddle. Return RIDDLE_RESOLVED { correct: true/false } - do NOT use SET_STATE on game.pendingAnimalEncounter.${helpInst} [current]`;
  }

  if (pending.phase === "powerCheck") {
    const riddleCorrect = (pending as { riddleCorrect?: boolean }).riddleCorrect;
    const diceCount = riddleCorrect ? "2" : "1";
    return `⚠️ POWER CHECK (${playerName}) phase=powerCheck. If user REPORTS their roll (e.g. "tire un dos y un seis", "ocho", "siete") → PLAYER_ANSWERED with the number (sum for 2d6). Do NOT ask "decime el resultado", "¿alcanza?", "is that enough?", "¿sirve?" — they gave the number; process it immediately. Do NOT NARRATE the roll. Return only PLAYER_ANSWERED. Orchestrator announces pass/fail. If user asks what to do → NARRATE "Tirá ${diceCount} dado(s)... decime el resultado." [current]`;
  }

  if (pending.phase === "revenge") {
    return `⚠️ REVENGE (${playerName}) phase=revenge. Same player, not next. 1 die, roll >= ${power} wins. User reports roll → PLAYER_ANSWERED with the number (1-6). Do NOT ask "¿alcanza?", "is that enough?" — process it immediately. Do NOT NARRATE the roll. Return only PLAYER_ANSWERED. Orchestrator announces pass/fail. If prompting, name the player: "${playerName}, tirá el dado." [current]`;
  }

  return "";
}

export const SYSTEM_PROMPT = getBasePrimitivesDocs();
