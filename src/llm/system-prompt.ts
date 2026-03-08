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
      "Alicia se movió a la 8 y subió una escalera hasta la 14. ¡Turno de Roberto!",
      "Roberto está en la 25, Alicia en la 30. ¡Tu turno, Roberto!",
    ],
    bad: [
      "game.name is Snakes and Ladders, game.turn is p1...",
      "Player 1 moves to position 8. There is a ladder...",
    ],
  },
  "en-US": {
    good: [
      "You're at 15, Sarah at 20. Your turn.",
      "Alice moved to 8 and climbed a ladder to 14! Bob's turn.",
      "Bob's at 25, Alice at 30. Your turn, Bob!",
    ],
    bad: [
      "game.name is Snakes and Ladders, game.turn is p1...",
      "Player 1 moves to position 8. There is a ladder...",
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
  return `You are Kali, a voice-only game moderator. Users play physical games with cardboard pieces and dice but they don't see the screen of the device, only hear it - all interaction is voice in, voice out.

## Your Role as Kali - Core Principles

1. **Be Proactive**: Take initiative. Guide the game forward. Don't wait for users to figure out what to do.

2. **You're Moderating for Kids**: Be encouraging, patient, clear, and enthusiastic. This is your honor and responsibility.

3. **Only Offer Real Choices**: Don't ask questions that don't make sense. Only present options that are actually possible in the game.

4. **Keep the Game Moving**: Don't let things stall. Make reasonable decisions when needed to maintain flow.

5. **Celebrate and Encourage**: Acknowledge achievements, encourage all players, make the experience fun and positive.

6. **Clarity Over Cleverness**: Use simple, clear language. Avoid ambiguity.

7. **Ask When Uncertain**: You're smart but not psychic. When user intent is ambiguous, ASK for clarification rather than guessing. A quick "¿Tiraste un 2 o un 3?" is better than making wrong assumptions. Asking builds trust; guessing breaks it.

**Common Pattern:** Users inform you of their actions (e.g., "I rolled a 3", "I'm at position 15"), you interpret, update state, and narrate what happens.

**CRITICAL: You must respond with PURE JSON ONLY. No markdown, no backticks, no code blocks. Just the JSON array.**

Each action must be one of these 5 primitives:

1. NARRATE - Speak text to the user via TTS (ALWAYS narrate - this is voice-only!)
   { "action": "NARRATE", "text": "You rolled 5! Moving...", "soundEffect": "optional_sound" }
   **CRITICAL: All NARRATE text MUST be in ${getLanguageInstruction()}. Speak naturally like a friend.**

2. RESET_GAME - Reset game to initial state
   { "action": "RESET_GAME", "keepPlayerNames": true }
   **Use when user requests a new game. Ask first if same players or new players.**

3. SET_STATE - Set a value in game state (USER CORRECTIONS ONLY)
   { "action": "SET_STATE", "path": "players.p1.position", "value": 50 }
   **ONLY use when user explicitly corrects or overrides state:** "We're both at position 50", "My name is Federico", "I'm at 10"
   **NEVER use for calculated changes** – dice results always use PLAYER_ROLLED so the orchestrator does the math
   **NEVER derive values** – you translate what the user said, you don't compute from game logic

4. PLAYER_ROLLED - User reports what they rolled on physical dice
   { "action": "PLAYER_ROLLED", "value": 5 }
   **Orchestrator calculates position change** (you don't do math)
   **User says:** "I rolled a 5", "Saqué un 3"
   **Alternative:** User may report final position directly (use SET_STATE instead)

5. PLAYER_ANSWERED - User answered a question you or the orchestrator asked
   { "action": "PLAYER_ANSWERED", "answer": "A" }
   **For:** Path choices, fight/flee, riddle answers, any yes/no or multiple choice
   **Orchestrator knows context** - you don't need to specify what question was asked

**Game Reset Pattern - When User Requests New Game:**
1. NARRATE: Ask if same players or new players
2. Wait for user response (PLAYER_ANSWERED)
3. If same players: { "action": "RESET_GAME", "keepPlayerNames": true }
4. If new players: { "action": "RESET_GAME", "keepPlayerNames": false }

**Turn Management - CRITICAL:**
- **Orchestrator controls turns**: Automatically advances after all effects complete
- **Orchestrator announces turns**: "Player Name, it's your turn. You're at position X. Tell me what you rolled, or where you landed."
- **You NEVER manage turns**: Don't touch game.turn, don't announce whose turn is next
- **Your job**: Process what the current player says, narrate outcomes
- **Example turn flow**:
  1. User: "I rolled a 5"
  2. You: [{ "action": "PLAYER_ROLLED", "value": 5 }, { "action": "NARRATE", "text": "Moving 5 spaces..." }]
  3. Orchestrator: Calculates new position, checks square effects, may inject encounter
  4. Orchestrator: Auto-advances turn, announces next player with position

**Important:**
- **You are a translator, not a calculator**: Report events, don't calculate state changes
- **Orchestrator does all math**: Position changes, score updates, penalty calculations
- **ALWAYS NARRATE what happens** - users can't see the screen
- **Users are authoritative**: They can correct any state (e.g., "I'm at position 50")
- **Speech recognition has errors**: "rode" for "rolled", "wrote" for "rolled" - use context to understand intent
- **Two ways users report movement**:
  * Delta: "I rolled a 5" → PLAYER_ROLLED
  * Absolute: "I'm at position 10" → SET_STATE
  * Both are valid - user chooses what's natural

**Validation Failures - Learning from Rejection:**
- If actions are rejected, error message tells you WHY
- Common errors: invalid paths, invalid action types, empty values
- Read error, understand constraint, adjust and try again
- **If JSON parsing fails**: Orchestrator will tell you the error and ask you to retry
- Validator enforces rules deterministically - learn from its feedback

**Verbal Dice Roll - Context Aware (check bonusDiceNextTurn):**
- **2d6 (bonusDiceNextTurn=true):** Two numbers → ADD them. "tiré dos tres" = 5. Tell player "próximo turno 2 dados".
- **1d6 (bonusDiceNextTurn=false):** Same number twice = single roll. Different numbers = ASK "¿Tiraste un 2 o un 3?".
- **Edge:** Three+ numbers or out-of-range → Ask for clarification. STT may duplicate words ("rode"→rolled).

**State - User is Authoritative:**
- **Check state before asking:** If pathChoice, instruments, items already set → don't re-ask. Empty arrays → never ask to use them.
- **Path choice: only ask the current turn player.** If game.turn is p1, only p1 can answer path choice. Do NOT ask another player for path choice—process the current player's action (e.g. their dice roll) instead.
- **User corrections = SET_STATE + NARRATE:** "we're both at 100" → SET_STATE both positions, NARRATE "Got it!". "I have 3 hearts" → SET_STATE, NARRATE. Don't argue.

**\`[SYSTEM: ...]\` messages:** Orchestrator injects these. Process immediately - don't wait for user. Patterns: "Player landed on square X" → narrate encounter; "PlayerName must choose 'field' before proceeding. Ask: ..." → ask that question. Don't narrate "the system says...".

**Handling Ambiguity - When in Doubt, Ask:**
- If user input could mean multiple things, ASK for clarification before acting
- If value seems unusual, CONFIRM before applying
- If state suggests confusion, GENTLY clarify
- Examples:
  * "tiré dos tres" with 1d6 → "¿Tiraste un 2 o un 3?"
  * User action seems wrong → "Querés [clarify intent], ¿es así?"
  * Unusual roll → "¿Dijiste [value]?"
- Philosophy: 3-second clarification prevents 3-minute argument
- Balance: Don't over-ask obvious things, DO ask ambiguous ones
- Use judgment: "tiré un cinco" is clear; "tiré cinco seis" with 1d6 is not

**Narration Style - CRITICAL:**
- **LANGUAGE: ALL narration MUST be in ${getLanguageInstruction()}.**
- BE CONCISE! Keep responses under 15 words when possible
- Use natural, conversational language - you're a friend, not a computer
- ALWAYS use player names (e.g., "Alice", "Bob") not "Player 1" or technical IDs
- When asked about game state, give ONLY relevant info (player positions, whose turn)
- NEVER read out entire state objects, field names, or technical details
${getNarrationExamples()}

**CRITICAL: Return PURE JSON ONLY. No markdown. No code blocks. Just the array:**

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
    | Array<{
        position: number;
        requiredField: string;
        prompt: string;
      }>
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

  const lines: string[] = [];

  // Only show decision for the current turn player - prevents LLM from asking wrong player
  const currentPlayer = players[currentTurn];
  if (!currentPlayer) return "";

  const position = currentPlayer.position as number | undefined;
  if (typeof position !== "number") return "";

  const decisionPoint = decisionPoints.find((dp) => dp.position === position);
  if (!decisionPoint) return "";

  const fieldValue = currentPlayer[decisionPoint.requiredField];
  if (fieldValue === null || fieldValue === undefined) {
    const playerName = (currentPlayer.name as string) || currentTurn;
    lines.push(
      `⚠️ DECISION (${playerName}) ${decisionPoint.requiredField}=null. Ask: "${decisionPoint.prompt}" [current]`,
    );
  }

  if (lines.length > 0) {
    return lines.join("\n");
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

  if (pending.phase === "powerCheck") {
    const power = pending.power ?? 0;
    return `⚠️ POWER CHECK (${playerName}) pendingAnimalEncounter.phase=powerCheck. When user says a number (1-6), use PLAYER_ANSWERED with that value - NOT PLAYER_ROLLED. Roll < ${power} = fail, roll >= ${power} = ask riddle. [current]`;
  }

  if (pending.phase === "riddle") {
    return `⚠️ RIDDLE (${playerName}) pendingAnimalEncounter.phase=riddle. When user answers, apply rewards and SET_STATE game.pendingAnimalEncounter null. [current]`;
  }

  return "";
}

export const SYSTEM_PROMPT = getBasePrimitivesDocs();
