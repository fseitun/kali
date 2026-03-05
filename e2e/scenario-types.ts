import type { PrimitiveAction } from "../src/orchestrator/types";

/**
 * Single step in an e2e scenario.
 * Actions are executed via orchestrator.testExecuteActions().
 * Expectations assert state via dot-notation paths.
 */
export interface ScenarioStep {
  /** Full primitive actions to execute. Use this for explicit control. */
  actions?: PrimitiveAction[];

  /**
   * Shorthand: roll N for current player. Expands to PLAYER_ROLLED + NARRATE.
   * Use for concise multi-turn scenarios.
   */
  roll?: number;

  /** Path -> expected value assertions. Omitted paths are not checked. */
  expect?: Record<string, unknown>;
}

/**
 * E2E scenario definition.
 * Scenarios run the real orchestrator with mock services (no LLM, no TTS).
 */
export interface Scenario {
  /** Game ID (folder name under public/games/) */
  game: string;

  /** Optional: merge over game's initialState. Use for PLAYING phase, custom players, etc. */
  initialState?: Record<string, unknown>;

  /** Number of players. Used to call setupPlayers() with default names if initialState doesn't define them. */
  players?: number;

  /** Sequence of steps. Order matters. */
  steps: ScenarioStep[];
}
