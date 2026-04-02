import type {
  EncounterQuestion,
  EncounterQuestionBankByAnimal,
  GameConfigInput,
  GameModule,
  HabitatDefinition,
  HabitatSegment,
} from "./types";
import { getWinPosition } from "@/orchestrator/board-helpers";
import type { BoardConfig, GameState, Player, SquareData } from "@/orchestrator/types";
import { GamePhase } from "@/orchestrator/types";
import type { ISpeechService } from "@/services/speech-service";
import { Logger } from "@/utils/logger";

function validateSquareAtStart(sq: SquareData): void {
  const n = sq.next;
  if (n === undefined || n === null) {
    throw new Error(`Invalid game config: square 0 must have explicit next (fork or linear)`);
  }
  if (Array.isArray(n)) {
    if (n.length === 0) {
      throw new Error(`Invalid game config: square 0 must have non-empty next or use fork object`);
    }
  } else if (typeof n === "object" && Object.keys(n as object).length === 0) {
    throw new Error(`Invalid game config: square 0 fork next must have at least one branch`);
  }
  if (sq.prev && Array.isArray(sq.prev) && sq.prev.length > 0) {
    throw new Error(`Invalid game config: square 0 must have empty or absent prev`);
  }
}

function validateSquareAtEnd(sq: SquareData, boardLength: number): void {
  const n = sq.next;
  if (n === undefined || n === null) {
    throw new Error(
      `Invalid game config: square ${boardLength} (win) must have explicit next: [] — omitting next would imply a forward step past the board`,
    );
  }
  if (!Array.isArray(n) || n.length !== 0) {
    throw new Error(`Invalid game config: square ${boardLength} must have empty next array`);
  }
}

function validateSquareMiddle(_key: string, _sq: SquareData): void {
  // Middle squares may omit next and/or prev; board-next applies i±1 fallbacks at runtime.
}

/**
 * Fills missing indices `0..winPosition` with `{}` so JSON can omit purely linear squares.
 */
function mergeMissingSquareKeys(
  squares: Record<string, SquareData>,
  winPosition: number,
): Record<string, SquareData> {
  const merged: Record<string, SquareData> = { ...squares };
  for (let i = 0; i <= winPosition; i++) {
    const key = String(i);
    merged[key] ??= {};
  }
  return merged;
}

/**
 * Validates every square 0..boardLength exists (after merge); enforces explicit next on 0 and empty next on win.
 * Other cells may omit next/prev when the default linear graph applies.
 */
function validateBoardTopology(
  squares: Record<string, SquareData>,
  boardLength: number = 196,
): void {
  for (let i = 0; i <= boardLength; i++) {
    const key = String(i);
    const sq = squares[key];
    if (!sq) {
      throw new Error(`Invalid game config: missing square ${key}`);
    }
    if (i === 0) {
      validateSquareAtStart(sq);
    } else if (i === boardLength) {
      validateSquareAtEnd(sq, boardLength);
    } else {
      validateSquareMiddle(key, sq);
    }
  }
}

/**
 * Derives board config from squares. Win position used only for topology validation (local).
 * Magic door and teleports (portals, returnTo187) are read from squares at runtime.
 */
function deriveBoardFromSquares(squares: Record<string, SquareData>): {
  squares: Record<string, SquareData>;
} {
  return { squares };
}

/**
 * Turns one habitat entry into segments. Values are **flat** `number | number[]` only (see ADR 0004).
 *
 * - `[lo, hi]` → one inclusive range.
 * - Several ranges: `[lo1, hi1, lo2, hi2, …]` (even length ≥ 4).
 * - Non-contiguous “islands”: use degenerate pairs, e.g. `[0, 0, 5, 5]`.
 */
function habitatDefinitionToSegments(name: string, raw: HabitatDefinition): HabitatSegment[] {
  if (typeof raw === "number") {
    return [raw];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid game config: habitat "${name}" must be a number or a flat number[]`);
  }
  if (raw.length === 0) {
    throw new Error(`Invalid game config: habitat "${name}" cannot be empty`);
  }
  if (raw.some((x) => Array.isArray(x))) {
    throw new Error(
      `Invalid game config: habitat "${name}" must not use nested arrays; use flat [lo, hi] or a number (see docs/adr/0004-game-config-habitat-flat.md)`,
    );
  }
  if (!raw.every((x) => typeof x === "number" && Number.isInteger(x))) {
    throw new Error(
      `Invalid game config: habitat "${name}" must be integers only, got ${JSON.stringify(raw)}`,
    );
  }
  const nums = raw as number[];
  if (nums.length === 1) {
    return [nums[0]];
  }
  if (nums.length === 2) {
    return [[nums[0], nums[1]]];
  }
  if (nums.length % 2 !== 0) {
    throw new Error(
      `Invalid game config: habitat "${name}" flat pair list must have even length (pairs lo,hi), got length ${String(nums.length)}`,
    );
  }
  const out: HabitatSegment[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    out.push([nums[i], nums[i + 1]]);
  }
  return out;
}

/**
 * Expands `config.habitat` into position → habitat name. Every index 0..winPosition must appear exactly once.
 */
export function expandHabitatConfig(
  habitat: Record<string, HabitatDefinition>,
  winPosition: number,
): Record<number, string> {
  const assignment: Record<number, string> = {};

  function assignIndex(pos: number, name: string): void {
    if (!Number.isInteger(pos)) {
      throw new Error(
        `Invalid game config: habitat "${name}" has non-integer index ${String(pos)}`,
      );
    }
    if (pos < 0 || pos > winPosition) {
      throw new Error(
        `Invalid game config: habitat "${name}" includes out-of-range index ${pos} (board 0..${String(winPosition)})`,
      );
    }
    const existing = assignment[pos];
    if (existing !== undefined) {
      throw new Error(
        `Invalid game config: square ${String(pos)} assigned to both "${existing}" and "${name}"`,
      );
    }
    assignment[pos] = name;
  }

  function expandSegment(seg: unknown, name: string): void {
    if (typeof seg === "number") {
      assignIndex(seg, name);
      return;
    }
    if (Array.isArray(seg)) {
      if (seg.length !== 2) {
        throw new Error(
          `Invalid game config: habitat "${name}" range must be [lo, hi] with two numbers, got ${JSON.stringify(seg)}`,
        );
      }
      const [lo, hi] = seg;
      if (typeof lo !== "number" || typeof hi !== "number") {
        throw new Error(
          `Invalid game config: habitat "${name}" has invalid range ${JSON.stringify(seg)}`,
        );
      }
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
        throw new Error(
          `Invalid game config: habitat "${name}" range endpoints must be integers ${JSON.stringify(seg)}`,
        );
      }
      if (lo > hi) {
        throw new Error(
          `Invalid game config: habitat "${name}" has reversed range [${String(lo)}, ${String(hi)}]`,
        );
      }
      for (let p = lo; p <= hi; p++) {
        assignIndex(p, name);
      }
      return;
    }
    throw new Error(
      `Invalid game config: habitat "${name}" segment must be a number or [lo,hi] array, got ${JSON.stringify(seg)}`,
    );
  }

  for (const [name, raw] of Object.entries(habitat)) {
    const segments = habitatDefinitionToSegments(name, raw);
    for (const seg of segments) {
      expandSegment(seg, name);
    }
  }

  const missing: number[] = [];
  for (let i = 0; i <= winPosition; i++) {
    if (assignment[i] === undefined) {
      missing.push(i);
    }
  }
  if (missing.length > 0) {
    const sample = missing.slice(0, 20).join(", ");
    const more = missing.length > 20 ? "…" : "";
    throw new Error(`Invalid game config: habitat map missing squares: ${sample}${more}`);
  }

  return assignment;
}

function applyHabitatToSquares(
  rawSquares: Record<string, SquareData>,
  winPosition: number,
  byPosition: Record<number, string>,
): Record<string, SquareData> {
  const squares: Record<string, SquareData> = {};
  for (let i = 0; i <= winPosition; i++) {
    const key = String(i);
    const sq = rawSquares[key];
    if (!sq) {
      throw new Error(`Cannot apply habitat: missing square ${key}`);
    }
    squares[key] = { ...sq, habitat: byPosition[i] };
  }
  return squares;
}

function assertNonEmptyString(value: unknown, errorMessage: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(errorMessage);
  }
}

function validateEncounterQuestionOptions(
  options: unknown,
  base: string,
  correctOption: unknown,
): void {
  if (!Array.isArray(options) || options.length !== 4) {
    throw new Error(`${base}.options must be an array with exactly 4 strings`);
  }
  for (let i = 0; i < options.length; i++) {
    assertNonEmptyString(options[i], `${base}.options[${String(i)}] must be a non-empty string`);
  }
  assertNonEmptyString(correctOption, `${base}.correctOption must be a non-empty string`);
  if (!options.includes(correctOption)) {
    throw new Error(`${base}.correctOption must match one of options`);
  }
}

function validateEncounterQuestion(
  animal: string,
  locale: "es-AR" | "en-US",
  index: number,
  question: EncounterQuestion,
): void {
  const base = `Invalid game config: encounterQuestions.${animal}.${locale}[${String(index)}]`;
  assertNonEmptyString(question.animal, `${base}.animal must be a non-empty string`);
  assertNonEmptyString(question.type, `${base}.type must be a non-empty string`);
  assertNonEmptyString(question.kali, `${base}.kali must be a non-empty string`);
  assertNonEmptyString(question.question, `${base}.question must be a non-empty string`);
  validateEncounterQuestionOptions(question.options, base, question.correctOption);
}

function validateEncounterQuestionBank(
  animal: string,
  locale: "es-AR" | "en-US",
  bank: EncounterQuestion[] | undefined,
): void {
  if (bank === undefined) {
    return;
  }
  if (!Array.isArray(bank)) {
    throw new Error(`Invalid game config: encounterQuestions.${animal}.${locale} must be an array`);
  }
  for (let i = 0; i < bank.length; i++) {
    validateEncounterQuestion(animal, locale, i, bank[i]);
  }
}

function validateEncounterQuestions(
  encounterQuestions: Record<string, EncounterQuestionBankByAnimal> | undefined,
): void {
  if (encounterQuestions === undefined) {
    return;
  }
  for (const [animal, localized] of Object.entries(encounterQuestions)) {
    if (typeof animal !== "string" || animal.trim() === "") {
      throw new Error(
        "Invalid game config: encounterQuestions keys must be non-empty animal names",
      );
    }
    if (localized == null || typeof localized !== "object" || Array.isArray(localized)) {
      throw new Error(
        `Invalid game config: encounterQuestions.${animal} must be an object with locale keys`,
      );
    }
    validateEncounterQuestionBank(animal, "es-AR", localized["es-AR"]);
    validateEncounterQuestionBank(animal, "en-US", localized["en-US"]);
  }
}

/**
 * Resolves initialState from config squares and metadata.
 * Exported for integration scenario runner which loads config from file.
 */
export function resolveInitialState(config: GameConfigInput): GameState {
  return buildInitialStateFromParts(config);
}

/**
 * Builds initialState from squares + metadata.
 */
function buildInitialStateFromParts(config: GameConfigInput): GameState {
  const { metadata, squares: rawSquares, stateDisplay, habitat: habitatConfig } = config;
  if (!rawSquares) {
    throw new Error("Cannot build initialState: config has no squares");
  }

  const winPosition = getWinPosition(rawSquares);
  const squaresComplete = mergeMissingSquareKeys(rawSquares, winPosition);
  validateBoardTopology(squaresComplete, winPosition);

  const squaresForBoard =
    habitatConfig != null && Object.keys(habitatConfig).length > 0
      ? applyHabitatToSquares(
          squaresComplete,
          winPosition,
          expandHabitatConfig(habitatConfig, winPosition),
        )
      : squaresComplete;

  const boardDerived = deriveBoardFromSquares(squaresForBoard);
  const board: BoardConfig = { ...boardDerived };

  const playerOrder = Array.from({ length: metadata.minPlayers }, (_, i) => `p${i + 1}`);
  const players: Record<string, Player> = {};
  for (let i = 0; i < metadata.minPlayers; i++) {
    const id = `p${i + 1}`;
    const name = `Player ${i + 1}`;
    players[id] =
      metadata.id === "kalimba"
        ? {
            id,
            name,
            position: 0,
            hearts: 0,
            items: [],
            instruments: [],
            bonusDiceNextTurn: false,
            activeChoices: {},
            skipTurns: 0,
            oceanForestPenaltyConsumed: false,
            /** After ocean–forest penalty: retreat Nd6 forward; backward teleports and prevOnLanding hops use this flag in traversal. */
            retreatEffectsReversed: false,
            /** Kalimba square 186: after a successful opening roll, next movement roll advances from the door. */
            magicDoorOpened: false,
          }
        : { id, name, position: 0 };
  }

  const game = {
    name: metadata.name.split(" - ")[0] ?? metadata.name,
    phase: GamePhase.SETUP,
    turn: "p1",
    playerOrder,
    winner: null,
    lastRoll: 0,
    pendingRoll: null,
    currentHabitat: metadata.initialHabitat ?? "Start",
    pending: null,
    encounterQuestions: config.encounterQuestions ?? {},
    encounterQuestionCursor: {} as Record<string, number>,
  };

  const state: GameState = { game, players, board };
  if (stateDisplay) {
    (state as Record<string, unknown>).stateDisplay = stateDisplay;
  }
  return state;
}

/**
 * Handles loading game modules from JSON files and their associated resources.
 */
export class GameLoader {
  constructor(private gamesPath: string) {}

  /**
   * Loads and validates a game module from the games directory.
   * @param gameId - The game identifier (filename without .json extension)
   * @returns The loaded and validated game module
   * @throws Error if the module fails to load or validation fails
   */
  async loadGame(gameId: string): Promise<GameModule> {
    const url = `${this.gamesPath}/${gameId}/config.json`;

    try {
      Logger.info(`Loading game module: ${gameId}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load game module: ${response.statusText}`);
      }

      const config = (await response.json()) as GameConfigInput;

      this.validateGameConfig(config);

      const initialState = resolveInitialState(config);

      const module: GameModule = {
        metadata: config.metadata,
        initialState,
        soundEffects: config.soundEffects,
        customActions: config.customActions,
        stateDisplay: config.stateDisplay,
      };

      Logger.info(`Game module loaded: ${module.metadata.name}`);
      return module;
    } catch (error) {
      Logger.error(`Error loading game module ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Loads all sound effects defined in the game module.
   * Failures to load individual sounds are logged but don't throw errors.
   * @param module - The game module containing sound effect definitions
   * @param speechService - Service to load the sounds into
   */
  async loadSoundEffects(module: GameModule, speechService: ISpeechService): Promise<void> {
    if (!module.soundEffects) {
      Logger.info("No sound effects to load");
      return;
    }

    Logger.info(`Loading ${Object.keys(module.soundEffects).length} sound effects...`);

    const loadPromises = Object.entries(module.soundEffects).map(async ([name, url]) => {
      try {
        await speechService.loadSound(name, url);
      } catch (error) {
        Logger.warn(`Failed to load sound ${name}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  private validateGameConfig(config: GameConfigInput): void {
    if (!config.metadata?.id || !config.metadata?.name) {
      throw new Error("Invalid game module: missing metadata");
    }

    if (!config.metadata?.objective) {
      throw new Error("Invalid game module: missing metadata.objective");
    }

    if (!config.squares || Object.keys(config.squares).length === 0) {
      throw new Error("Invalid game config: squares required");
    }
    validateEncounterQuestions(config.encounterQuestions);

    Logger.info("Game module validation passed");
  }
}
