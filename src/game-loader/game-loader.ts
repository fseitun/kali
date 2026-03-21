import { createDefaultPlayer } from "./player-factory";
import type { GameConfigInput, GameModule } from "./types";
import type { BoardConfig, GameState, Player, SquareData } from "@/orchestrator/types";
import { GamePhase } from "@/orchestrator/types";
import type { ISpeechService } from "@/services/speech-service";
import { Logger } from "@/utils/logger";

/**
 * Fills in default next/prev for board squares. Only defines topology for indices
 * 0..boardLength; explicit squares keep their data but get defaults for missing next/prev.
 * Used for sparse config: define only forks, merges, jumps; hydration fills the rest.
 */
function hydrateBoardTopology(
  squares: Record<string, SquareData>,
  boardLength: number = 196,
): Record<string, SquareData> {
  const result: Record<string, SquareData> = {};

  for (let i = 0; i <= boardLength; i++) {
    const key = String(i);
    const existing = squares[key];
    if (!existing) {
      result[key] = {
        type: "empty",
        next: i < boardLength ? [i + 1] : [],
        prev: i > 0 ? [i - 1] : [],
      };
    } else {
      const sq = { ...existing };
      const needsDefaultNext =
        sq.next === undefined ||
        sq.next === null ||
        (Array.isArray(sq.next) && sq.next.length === 0);
      if (needsDefaultNext && i < boardLength) sq.next = [i + 1];
      if (!sq.prev && i > 0) sq.prev = [i - 1];
      result[key] = sq;
    }
  }
  return result;
}

/**
 * Derives board config from squares. winPosition from effect=win, magicDoor from effect=magicDoorCheck, moves from portals.
 */
function deriveBoardFromSquares(
  squares: Record<string, SquareData>,
): Omit<BoardConfig, "squares"> & { squares: Record<string, SquareData> } {
  let winPosition = 196;
  let magicDoorPosition: number | undefined;
  let magicDoorTarget = 6;
  const moves: Record<string, number> = {};

  for (const [key, sq] of Object.entries(squares)) {
    const pos = parseInt(key, 10);
    if (Number.isNaN(pos)) continue;
    const effect = sq.effect;
    const dest = sq.destination;

    if (effect === "win") winPosition = pos;
    if (effect === "magicDoorCheck") {
      magicDoorPosition = pos;
      const target = (sq as { target?: number }).target;
      if (typeof target === "number") magicDoorTarget = target;
    }
    if (sq.type === "portal" && typeof dest === "number") {
      moves[key] = dest;
    }
  }

  const result: BoardConfig & { squares: Record<string, SquareData> } = {
    winPosition,
    squares,
  };
  if (magicDoorPosition !== undefined) {
    result.magicDoorPosition = magicDoorPosition;
    result.magicDoorTarget = magicDoorTarget;
  }
  if (Object.keys(moves).length > 0) result.moves = moves;
  return result;
}

/**
 * Resolves initialState from config. Use when config may have legacy initialState or new squares-only format.
 * Exported for e2e scenario runner which loads config from file.
 */
export function resolveInitialState(config: GameConfigInput): GameState {
  if (config.initialState) {
    return config.initialState;
  }
  return buildInitialStateFromParts(config);
}

/**
 * Builds initialState from squares + metadata. Used when config has squares but no initialState.
 */
function buildInitialStateFromParts(config: GameConfigInput): GameState {
  const { metadata, squares: rawSquares, stateDisplay } = config;
  if (!rawSquares) {
    throw new Error("Cannot build initialState: config has no squares");
  }

  const boardDerived = deriveBoardFromSquares(rawSquares);
  const boardLength = typeof boardDerived.winPosition === "number" ? boardDerived.winPosition : 196;
  const hydratedSquares = hydrateBoardTopology(rawSquares, boardLength);
  const board: BoardConfig = { ...boardDerived, squares: hydratedSquares };

  const playerOrder = Array.from({ length: metadata.minPlayers }, (_, i) => `p${i + 1}`);
  const players: Record<string, Player> = {};
  for (let i = 0; i < metadata.minPlayers; i++) {
    const id = `p${i + 1}`;
    const name = `Player ${i + 1}`;
    players[id] = createDefaultPlayer(metadata.id, id, name);
  }

  const game = {
    name: metadata.name.split(" - ")[0] ?? metadata.name,
    phase: GamePhase.SETUP,
    turn: "p1",
    playerOrder,
    winner: null,
    lastRoll: 0,
    pendingRoll: null,
    currentHabitat: metadata.initialHabitat ?? "Inicio",
    pendingAnimalEncounter: null,
  };

  const state: GameState = { game, players, board };
  if (stateDisplay) (state as Record<string, unknown>).stateDisplay = stateDisplay;
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
      if (initialState.board?.squares) {
        const board = initialState.board as Record<string, unknown>;
        const boardLength = typeof board.winPosition === "number" ? board.winPosition : 196;
        const hydrated = hydrateBoardTopology(
          board.squares as Record<string, SquareData>,
          boardLength,
        );
        board.squares = hydrated;
      }

      const module: GameModule = {
        metadata: config.metadata,
        initialState,
        rules: config.rules,
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

    if (!config.rules?.objective) {
      throw new Error("Invalid game module: missing rules");
    }

    if (config.initialState) {
      // Legacy format: initialState present
    } else if (config.squares && Object.keys(config.squares).length > 0) {
      // New format: squares only
    } else {
      throw new Error("Invalid game config: need initialState or squares");
    }

    Logger.info("Game module validation passed");
  }
}
