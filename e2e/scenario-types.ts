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

  /**
   * Scripted LLM response(s) for this step. When this step triggers an LLM call
   * (e.g. landing on a square effect or decision point), the mock returns these
   * in order. Prefer this over top-level llmScript so cause and effect stay
   * colocated. One array entry per LLM call this step may trigger.
   */
  llmResponses?: PrimitiveAction[][];

  /** Path -> expected value assertions. Omitted paths are not checked. */
  expect?: Record<string, unknown>;

  /**
   * Human-readable description of the step (e.g. "p1 lands on Halcón").
   * Ignored by the runner; use for documentation and AI-agent readability.
   */
  description?: string;
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

  /**
   * Scripted LLM responses (one array per call). Used when no step has llmResponses.
   * Prefer per-step llmResponses so the mock response is colocated with the step that triggers it.
   */
  llmScript?: PrimitiveAction[][];

  /** Sequence of steps. Order matters. */
  steps: ScenarioStep[];
}
