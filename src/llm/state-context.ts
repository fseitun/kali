export interface StateDisplayConfig {
  primary?: string[];
  secondary?: string[];
  hidden?: string[];
}

export interface StateDisplayMetadata {
  game?: StateDisplayConfig;
  players?: StateDisplayConfig;
  board?: StateDisplayConfig;
}

const LOG_FORMAT_MAX_DEPTH = 2;

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return value.length > 0 ? `[${value.join(",")}]` : "[]";
  }
  if (typeof value === "object") return "{...}";
  return String(value);
}

function formatFieldValueForLog(value: unknown, depth: number, maxDepth: number): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const formatted = value.map((v) => formatFieldValueForLog(v, depth + 1, maxDepth)).join(", ");
    return `[${formatted}]`;
  }
  if (typeof value === "object") {
    if (depth >= maxDepth) return "{...}";
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "stateDisplay")
      .map(([k, v]) => `${k}=${formatFieldValueForLog(v, depth + 1, maxDepth)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return String(value);
}

type ValueFormatter = (value: unknown, depth: number) => string;

function formatObjectFields(
  obj: Record<string, unknown>,
  config?: StateDisplayConfig,
  valueFormatter?: ValueFormatter,
): string[] {
  const format = valueFormatter ?? ((v: unknown) => formatFieldValue(v));
  const fields: string[] = [];
  const processed = new Set<string>();

  if (config) {
    const { primary = [], secondary = [], hidden = [] } = config;
    const hiddenSet = new Set(hidden);

    for (const key of primary) {
      if (hiddenSet.has(key)) continue;
      processed.add(key);
      const value = obj[key];
      fields.push(`${key}=${format(value, 0)}`);
    }

    for (const key of secondary) {
      if (hiddenSet.has(key) || processed.has(key)) continue;
      processed.add(key);
      const value = obj[key];
      if (value !== null && value !== undefined && value !== 0 && value !== false && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        fields.push(`${key}=${format(value, 0)}`);
      }
    }

    for (const key of Object.keys(obj)) {
      if (hiddenSet.has(key) || processed.has(key)) continue;
      const value = obj[key];
      if (value !== null && value !== undefined && value !== 0 && value !== false && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        fields.push(`${key}=${format(value, 0)}`);
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && value !== 0 && value !== false && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        fields.push(`${key}=${format(value, 0)}`);
      }
    }
  }

  return fields;
}

export interface FormatStateContextOptions {
  forLog?: boolean;
}

function formatDecisionPointContext(state: Record<string, unknown>): string {
  const decisionPoints = state.decisionPoints as
    | Array<{
        position: number;
        prompt: string;
        choiceKeywords?: Record<string, string[]>;
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
    const kw = decisionPoint.choiceKeywords;
    const targetNums =
      kw && Object.keys(kw).length > 0
        ? [...Object.keys(kw)]
            .map((k) => parseInt(k, 10))
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b)
        : [];
    const hint =
      kw && targetNums.length > 0
        ? ` Branch hints from config (not exhaustive): ${Object.entries(kw)
            .map(([target, phrases]) => `target ${target}: ${phrases.join(", ")}`)
            .join(
              " | ",
            )}. When the user clearly chooses a branch, return PLAYER_ANSWERED with the target position number only (one of: ${targetNums.join(", ")}); do not pass through their exact words if you can resolve. If unclear, NARRATE to ask again.`
        : ` When intent is clear, return PLAYER_ANSWERED with the target position number; if unclear, NARRATE to ask again.`;
    return `⚠️ DECISION (${playerName}) fork choice at ${position}. Ask: "${decisionPoint.prompt}" If user asks what to do or for help → NARRATE the path options (e.g. from the prompt); do NOT emit PLAYER_ANSWERED.${hint} If they state a choice, emit PLAYER_ANSWERED with the correct target number. [current]`;
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

/**
 * Formats game state into a concise, human-readable context for the LLM.
 * Uses game-specific stateDisplay metadata if available, otherwise shows all fields.
 * @param state - The game state object
 * @param options - When forLog is true, nested objects are expanded for terminal readability
 * @returns Formatted state string
 */
export function formatStateContext(
  state: Record<string, unknown>,
  options?: FormatStateContextOptions,
): string {
  const forLog = options?.forLog === true;
  const valueFormatter: ValueFormatter | undefined = forLog
    ? (v, depth) => formatFieldValueForLog(v, depth, LOG_FORMAT_MAX_DEPTH)
    : undefined;

  const parts: string[] = [];
  const displayConfig = state.stateDisplay as StateDisplayMetadata | undefined;

  const game = state.game as Record<string, unknown> | undefined;
  if (game) {
    const fields = formatObjectFields(game, displayConfig?.game, valueFormatter);
    if (fields.length > 0) parts.push(`Game: ${fields.join(", ")}`);
  }

  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  if (players) {
    const playerOrder = game?.playerOrder as string[] | undefined;
    const order =
      Array.isArray(playerOrder) && playerOrder.length > 0 ? playerOrder : Object.keys(players);
    const playerParts = order
      .filter((id) => players[id] != null)
      .map((id) => {
        const player = players[id];
        const fields = formatObjectFields(player, displayConfig?.players, valueFormatter);
        return `${id}:${fields.join(",")}`;
      });
    if (playerParts.length > 0) parts.push(`Players: ${playerParts.join(" | ")}`);
  }

  const board = state.board as Record<string, unknown> | undefined;
  if (board) {
    const fields = formatObjectFields(board, displayConfig?.board, valueFormatter);
    if (fields.length > 0) parts.push(`Board: ${fields.join(", ")}`);
  }

  const decisionContext = formatDecisionPointContext(state);
  if (decisionContext) parts.push(decisionContext);

  const animalEncounterContext = formatAnimalEncounterContext(state);
  if (animalEncounterContext) parts.push(animalEncounterContext);

  return parts.join("\n");
}
