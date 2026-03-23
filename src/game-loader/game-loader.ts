import type { GameConfigInput, GameModule } from "./types";
import { getWinPosition } from "@/orchestrator/board-helpers";
import type { BoardConfig, GameState, Player, SquareData } from "@/orchestrator/types";
import { GamePhase } from "@/orchestrator/types";
import type { ISpeechService } from "@/services/speech-service";
import { Logger } from "@/utils/logger";

function validateSquareAtStart(sq: SquareData): void {
  const hasNext =
    sq.next !== undefined &&
    sq.next !== null &&
    (Array.isArray(sq.next) ? sq.next.length > 0 : Object.keys(sq.next as object).length > 0);
  if (!hasNext) {
    throw new Error(`Invalid game config: square 0 must have next`);
  }
  if (sq.prev && (sq.prev as unknown[]).length > 0) {
    throw new Error(`Invalid game config: square 0 must have empty prev`);
  }
}

function validateSquareAtEnd(sq: SquareData, boardLength: number): void {
  const hasNext =
    sq.next !== undefined &&
    sq.next !== null &&
    (Array.isArray(sq.next) ? sq.next.length > 0 : Object.keys(sq.next as object).length > 0);
  const hasPrev = Array.isArray(sq.prev) && sq.prev.length > 0;
  if (hasNext) {
    throw new Error(`Invalid game config: square ${boardLength} must have empty next`);
  }
  if (!hasPrev) {
    throw new Error(`Invalid game config: square ${boardLength} must have prev`);
  }
}

function validateSquareMiddle(key: string, sq: SquareData): void {
  const hasNext =
    sq.next !== undefined &&
    sq.next !== null &&
    (Array.isArray(sq.next) ? sq.next.length > 0 : Object.keys(sq.next as object).length > 0);
  const hasPrev = Array.isArray(sq.prev) && sq.prev.length > 0;
  if (!hasNext) {
    throw new Error(`Invalid game config: square ${key} must have next`);
  }
  if (!hasPrev) {
    throw new Error(`Invalid game config: square ${key} must have prev`);
  }
}

/**
 * Validates that board topology is complete. Throws if any square 0..boardLength is missing or lacks next/prev.
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
 * Resolves initialState from config squares and metadata.
 * Exported for e2e scenario runner which loads config from file.
 */
export function resolveInitialState(config: GameConfigInput): GameState {
  return buildInitialStateFromParts(config);
}

/**
 * Builds initialState from squares + metadata.
 */
function buildInitialStateFromParts(config: GameConfigInput): GameState {
  const { metadata, squares: rawSquares, stateDisplay } = config;
  if (!rawSquares) {
    throw new Error("Cannot build initialState: config has no squares");
  }

  const boardDerived = deriveBoardFromSquares(rawSquares);
  validateBoardTopology(rawSquares, getWinPosition(rawSquares));
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
            inverseMode: false,
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
    pendingAnimalEncounter: null,
    pendingDirectionalRoll: null,
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

    Logger.info("Game module validation passed");
  }
}
