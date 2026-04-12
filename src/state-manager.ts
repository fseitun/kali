import type { GameState } from "./orchestrator/types";
import { Logger } from "./utils/logger";

function summarizePlayersForLog(
  players: GameState["players"] | undefined,
): Record<string, { id: string; name: string }> {
  const summary: Record<string, { id: string; name: string }> = {};
  for (const [id, p] of Object.entries(players ?? {})) {
    summary[id] = { id: p.id, name: p.name };
  }
  return summary;
}

function boardSummaryForLog(board: GameState["board"]): { squaresCount: number } {
  const squares = board?.squares;
  const squareCount =
    squares && typeof squares === "object" ? Object.keys(squares as object).length : 0;
  return { squaresCount: squareCount };
}

/**
 * Compact summary for init logs (avoids dumping full board.squares graph).
 */
function summarizeInitialStateForLog(state: GameState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    game: state.game,
    players: summarizePlayersForLog(state.players),
  };
  if (state.board) {
    out.board = boardSummaryForLog(state.board);
  }
  const skip = new Set(["game", "players", "board"]);
  for (const key of Object.keys(state)) {
    if (!skip.has(key)) {
      out[key] = state[key as keyof GameState];
    }
  }
  return out;
}

/**
 * Manages game state in memory with dot-notation path access.
 *
 * ARCHITECTURE NOTE: This class is intentionally simple and permissive.
 * Access control is enforced at the ORCHESTRATOR level, not here.
 *
 * AUTHORITY MODEL:
 * - Orchestrator OWNS all state mutations during gameplay
 * - App layer (KaliAppCore) should NOT mutate state directly
 * - NameCollector and other UI components should NOT mutate state directly
 * - State mutations should only happen via orchestrator methods or primitives
 *
 * Exceptions (initialization only):
 * - Initial state loading during app startup
 * - Orchestrator's internal methods (setupPlayers, transitionPhase, advanceTurn)
 */
export class StateManager {
  private state: GameState = {} as GameState;

  /**
   * Initializes the state manager with initial state.
   * @param initialState - Initial state to use
   * @throws Error if no initial state provided
   */
  init(initialState: GameState): void {
    this.state = structuredClone(initialState);
    Logger.init("Initialized game state:", summarizeInitialStateForLog(initialState));
  }

  /**
   * Retrieves the current game state.
   * Must not be mutated; all state mutations go through the orchestrator (set, setState, resetState).
   * @returns The complete game state object (read-only view)
   */
  getState(): Readonly<GameState> {
    return this.state;
  }

  /**
   * Replaces the entire game state.
   * @param state - The new state
   */
  setState(state: GameState): void {
    this.state = structuredClone(state);
  }

  /**
   * Resets the game state to the provided initial state.
   * @param initialState - The state to reset to
   */
  resetState(initialState: GameState): void {
    this.state = structuredClone(initialState);
    Logger.info("Game state reset");
  }

  /**
   * Gets a value from state using dot-notation path.
   * @param path - Path to the value (e.g., "players.0.position")
   * @returns The value at the specified path
   */
  get(path: string): unknown {
    return this.getByPath(this.state, path);
  }

  /**
   * Sets a value in state using dot-notation path.
   * @param path - Path to the value (e.g., "players.0.position")
   * @param value - The value to set
   */
  set(path: string, value: unknown): void {
    this.state = this.setByPath(this.state, path, value);
  }

  /**
   * Checks if a path exists in the given state.
   * @param state - The state object to check
   * @param path - Path to verify (e.g., "players.0.position")
   * @returns True if path exists and value is not undefined
   */
  pathExists(state: GameState, path: string): boolean {
    try {
      const value = this.getByPath(state, path);
      return value !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves a value from an object using dot-notation path.
   * @param obj - The object to traverse
   * @param path - Path to the value (e.g., "players.0.position")
   * @returns The value at the path, or undefined if not found
   */
  getByPath(obj: GameState, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private setByPath(obj: GameState, path: string, value: unknown): GameState {
    const parts = path.split(".");
    const newState: Record<string, unknown> = { ...(obj as Record<string, unknown>) };

    let currentNew: Record<string, unknown> = newState;
    let currentOld: Record<string, unknown> = obj as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const oldValue = currentOld[part];
      let nextNode: Record<string, unknown>;

      if (oldValue && typeof oldValue === "object") {
        nextNode = Array.isArray(oldValue)
          ? ([...oldValue] as unknown as Record<string, unknown>)
          : { ...(oldValue as Record<string, unknown>) };
      } else {
        nextNode = {};
      }

      currentNew[part] = nextNode;
      currentNew = nextNode;
      currentOld =
        oldValue && typeof oldValue === "object" ? (oldValue as Record<string, unknown>) : {};
    }

    currentNew[parts[parts.length - 1]] = value;

    return newState as GameState;
  }
}
