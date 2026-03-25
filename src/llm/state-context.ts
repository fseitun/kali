import type { StateDisplayConfig, StateDisplayMetadata } from "@/game-loader/types";
import {
  getLlmStateContext,
  substLlmState,
  type LlmStateContextBundle,
} from "@/i18n/llm-state-context";
import { getEnforceableForkContext } from "@/orchestrator/fork-roll-policy";
import {
  getPowerCheckDiceConfig,
  getPowerCheckRollSpec,
  getSquareDataAtPosition,
} from "@/orchestrator/power-check-dice";
import type { GameState } from "@/orchestrator/types";

export type { StateDisplayConfig, StateDisplayMetadata };

const LOG_FORMAT_MAX_DEPTH = 2;

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `[${value.join(",")}]` : "[]";
  }
  if (typeof value === "object") {
    return "{...}";
  }
  return String(value);
}

function formatFieldValueForLog(value: unknown, depth: number, maxDepth: number): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const formatted = value.map((v) => formatFieldValueForLog(v, depth + 1, maxDepth)).join(", ");
    return `[${formatted}]`;
  }
  if (typeof value === "object") {
    if (depth >= maxDepth) {
      return "{...}";
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "stateDisplay")
      .map(([k, v]) => `${k}=${formatFieldValueForLog(v, depth + 1, maxDepth)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return String(value);
}

type ValueFormatter = (value: unknown, depth: number) => string;

function shouldIncludeValue(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    value !== 0 &&
    value !== false &&
    value !== "" &&
    !(Array.isArray(value) && value.length === 0)
  );
}

function pushFieldIfIncluded(
  fields: string[],
  key: string,
  value: unknown,
  format: ValueFormatter,
): void {
  if (shouldIncludeValue(value)) {
    fields.push(`${key}=${format(value, 0)}`);
  }
}

function processKeys(
  keys: Iterable<string>,
  obj: Record<string, unknown>,
  fields: string[],
  hiddenSet: Set<string>,
  processed: Set<string>,
  format: ValueFormatter,
  primaryMode: boolean,
): void {
  for (const key of keys) {
    if (hiddenSet.has(key) || (!primaryMode && processed.has(key))) {
      continue;
    }
    processed.add(key);
    const value = obj[key];
    if (primaryMode) {
      fields.push(`${key}=${format(value, 0)}`);
    } else {
      pushFieldIfIncluded(fields, key, value, format);
    }
  }
}

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
    processKeys(primary, obj, fields, hiddenSet, processed, format, true);
    processKeys(secondary, obj, fields, hiddenSet, processed, format, false);
    processKeys(Object.keys(obj), obj, fields, hiddenSet, processed, format, false);
  } else {
    for (const [key, value] of Object.entries(obj)) {
      pushFieldIfIncluded(fields, key, value, format);
    }
  }

  return fields;
}

export interface FormatStateContextOptions {
  forLog?: boolean;
}

function buildDecisionPointHint(
  decisionPoint: { choiceKeywords?: Record<string, string[]> },
  L: LlmStateContextBundle,
): string {
  const kw = decisionPoint.choiceKeywords;
  const targetNums =
    kw && Object.keys(kw).length > 0
      ? [...Object.keys(kw)]
          .map((k) => parseInt(k, 10))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => a - b)
      : [];
  if (targetNums.length > 0 && kw) {
    const branchLines = Object.entries(kw)
      .map(([target, phrases]) =>
        substLlmState(L.decisionHintKeywordLine, {
          target,
          phraseList: phrases.join(", "),
        }),
      )
      .join(" | ");
    return substLlmState(L.decisionHintWithKeywords, {
      branchLines,
      targets: targetNums.join(", "),
    });
  }
  return L.decisionHintDefault;
}

function getPlayerAndPositionAtFork(state: Record<string, unknown>): {
  currentPlayer: Record<string, unknown>;
  position: number;
  currentTurn: string;
  decisionPoint: { prompt: string; choiceKeywords?: Record<string, string[]> };
} | null {
  const ctx = getEnforceableForkContext(state as GameState);
  if (!ctx) {
    return null;
  }
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentPlayer = players?.[ctx.playerId];
  if (!currentPlayer) {
    return null;
  }
  return {
    currentPlayer,
    position: ctx.position,
    currentTurn: ctx.playerId,
    decisionPoint: ctx.decisionPoint,
  };
}

function getCurrentPlayerAtFork(state: Record<string, unknown>): {
  playerName: string;
  position: number;
  decisionPoint: { prompt: string; choiceKeywords?: Record<string, string[]> };
} | null {
  const info = getPlayerAndPositionAtFork(state);
  if (!info) {
    return null;
  }
  const { currentPlayer, position, currentTurn, decisionPoint } = info;
  const playerName = (currentPlayer.name as string) || currentTurn;
  return { playerName, position, decisionPoint };
}

function formatDecisionPointContext(
  state: Record<string, unknown>,
  L: LlmStateContextBundle,
): string {
  const info = getCurrentPlayerAtFork(state);
  if (!info) {
    return "";
  }
  const { playerName, position, decisionPoint } = info;
  const hint = buildDecisionPointHint(decisionPoint, L);
  return substLlmState(L.decisionBlock, {
    playerName,
    position,
    prompt: decisionPoint.prompt,
    hint,
  });
}

function buildRiddleEncounterHints(
  state: Record<string, unknown>,
  pending: { position?: number; power?: number },
  L: LlmStateContextBundle,
): string {
  const pos = pending.position;
  if (typeof pos !== "number") {
    return "";
  }
  const squareData = getSquareDataAtPosition(state as GameState, pos);
  if (!squareData) {
    return "";
  }
  const cfg = getPowerCheckDiceConfig(squareData);
  const powerVal =
    (typeof pending.power === "number" ? pending.power : undefined) ??
    (typeof squareData.power === "number" ? squareData.power : 0);
  let hints = substLlmState(L.riddleAfterEncounter, {
    correctDice: cfg.ifRiddleCorrect,
    wrongDice: cfg.ifRiddleWrong,
    power: powerVal,
  });
  const hab = squareData.habitat;
  if (typeof hab === "string" && hab.trim() !== "") {
    hints += substLlmState(L.riddleHabitatNote, { hab });
  }
  return hints;
}

function formatRiddlePhaseContext(
  playerName: string,
  pending: {
    riddlePrompt?: string;
    riddleOptions?: string[];
    correctOption?: string;
    position?: number;
    power?: number;
  },
  state: Record<string, unknown>,
  L: LlmStateContextBundle,
): string {
  const options = pending.riddleOptions;
  const hasStructuredRiddle = options?.length === 4 && pending.correctOption;
  const encounterHints = buildRiddleEncounterHints(state, pending, L);
  const helpInst =
    hasStructuredRiddle && pending.riddlePrompt
      ? L.riddleHelpRepeatStructured
      : L.riddleHelpRegenerate;
  if (!hasStructuredRiddle) {
    return substLlmState(L.riddlePhaseNoStructured, {
      playerName,
      antiLeak: L.riddleAntiLeak,
      encounterHints,
      narrationShape: L.riddleNarrationShape,
      helpInst,
    });
  }
  const optionsList = options?.join(", ") ?? "";
  const mapInst = optionsList ? substLlmState(L.riddleCurrentOptions, { optionsList }) : "";
  return `${substLlmState(L.riddlePhaseStructuredPrefix, { playerName })}${mapInst}${encounterHints}${L.riddleNarrationShape}${L.riddleAntiLeak}${helpInst} [current]`;
}

function formatPowerCheckContext(
  playerName: string,
  riddleCorrect: boolean | undefined,
  squareData: Record<string, unknown> | undefined,
  L: LlmStateContextBundle,
): string {
  const spec = getPowerCheckRollSpec("powerCheck", riddleCorrect, squareData);
  const cfg = getPowerCheckDiceConfig(squareData);
  const n = riddleCorrect === true ? cfg.ifRiddleCorrect : cfg.ifRiddleWrong;
  const rollInstruction =
    n === 1
      ? L.powerRollOneDie
      : substLlmState(L.powerRollSum, {
          min: spec.min,
          max: spec.max,
          label: spec.label,
        });
  const helpLine =
    n === 1 ? L.powerCheckHelpOneDie : substLlmState(L.powerCheckHelpManyDice, { n });
  return substLlmState(L.powerCheckBlock, { playerName, rollInstruction, helpLine });
}

function formatRevengeContext(playerName: string, power: number, L: LlmStateContextBundle): string {
  return substLlmState(L.revengeBlock, { playerName, power });
}

function formatDirectionalRollContext(
  playerName: string,
  dice: 1 | 2 | 3,
  L: LlmStateContextBundle,
): string {
  const min = dice;
  const max = dice * 6;
  const label = `${dice}d6`;
  const rollInstruction =
    dice === 1 ? L.directionalRollOne : substLlmState(L.directionalRollSum, { min, max, label });
  const helpLine =
    dice === 1 ? L.directionalHelpOneDie : substLlmState(L.directionalHelpManyDice, { n: dice });
  return substLlmState(L.directionalBlock, { playerName, label, rollInstruction, helpLine });
}

function getPendingContext(state: Record<string, unknown>): {
  playerName: string;
  pending: Record<string, unknown>;
} | null {
  const game = state.game as Record<string, unknown> | undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const pending = game?.pending as Record<string, unknown> | null | undefined;
  const playerId = pending?.playerId as string | undefined;
  if (!pending || !currentTurn || playerId !== currentTurn || !players?.[currentTurn]) {
    return null;
  }
  const playerName = (players[currentTurn].name as string) || currentTurn;
  return { playerName, pending };
}

function formatPendingContext(state: Record<string, unknown>, L: LlmStateContextBundle): string {
  const ctx = getPendingContext(state);
  if (!ctx) {
    return "";
  }
  const { playerName, pending } = ctx;
  const kind = pending.kind as string | undefined;
  const power = (pending.power as number | undefined) ?? 0;

  if (kind === "riddle") {
    return formatRiddlePhaseContext(
      playerName,
      pending as {
        riddlePrompt?: string;
        riddleOptions?: string[];
        correctOption?: string;
        position?: number;
        power?: number;
      },
      state,
      L,
    );
  }
  if (kind === "powerCheck") {
    const pos = pending.position as number | undefined;
    const squareData =
      typeof pos === "number" ? getSquareDataAtPosition(state as GameState, pos) : undefined;
    return formatPowerCheckContext(
      playerName,
      pending.riddleCorrect as boolean | undefined,
      squareData,
      L,
    );
  }
  if (kind === "revenge") {
    return formatRevengeContext(playerName, power, L);
  }
  if (kind === "directional") {
    const dice = pending.dice as 1 | 2 | 3;
    return formatDirectionalRollContext(playerName, dice, L);
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
function formatGameSection(
  state: Record<string, unknown>,
  displayConfig: StateDisplayMetadata | undefined,
  valueFormatter: ValueFormatter | undefined,
): string {
  const game = state.game as Record<string, unknown> | undefined;
  if (!game) {
    return "";
  }
  const fields = formatObjectFields(game, displayConfig?.game, valueFormatter);
  return fields.length > 0 ? `Game: ${fields.join(", ")}` : "";
}

function formatPlayersSection(
  state: Record<string, unknown>,
  displayConfig: StateDisplayMetadata | undefined,
  valueFormatter: ValueFormatter | undefined,
): string {
  const game = state.game as Record<string, unknown> | undefined;
  const players = state.players as Record<string, Record<string, unknown>> | undefined;
  if (!players) {
    return "";
  }
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
  return playerParts.length > 0 ? `Players: ${playerParts.join(" | ")}` : "";
}

function formatBoardSection(
  state: Record<string, unknown>,
  displayConfig: StateDisplayMetadata | undefined,
  valueFormatter: ValueFormatter | undefined,
): string {
  const board = state.board as Record<string, unknown> | undefined;
  if (!board) {
    return "";
  }
  const fields = formatObjectFields(board, displayConfig?.board, valueFormatter);
  return fields.length > 0 ? `Board: ${fields.join(", ")}` : "";
}

export function formatStateContext(
  state: Record<string, unknown>,
  options?: FormatStateContextOptions,
): string {
  const L = getLlmStateContext();
  const forLog = options?.forLog === true;
  const valueFormatter: ValueFormatter | undefined = forLog
    ? (v, depth) => formatFieldValueForLog(v, depth, LOG_FORMAT_MAX_DEPTH)
    : undefined;
  const displayConfig = state.stateDisplay as StateDisplayMetadata | undefined;

  const parts: string[] = [];
  const gameSection = formatGameSection(state, displayConfig, valueFormatter);
  if (gameSection) {
    parts.push(gameSection);
  }
  const playersSection = formatPlayersSection(state, displayConfig, valueFormatter);
  if (playersSection) {
    parts.push(playersSection);
  }
  const boardSection = formatBoardSection(state, displayConfig, valueFormatter);
  if (boardSection) {
    parts.push(boardSection);
  }

  const decisionContext = formatDecisionPointContext(state, L);
  if (decisionContext) {
    parts.push(decisionContext);
  }
  const pendingContext = formatPendingContext(state, L);
  if (pendingContext) {
    parts.push(pendingContext);
  }

  return parts.join("\n");
}
