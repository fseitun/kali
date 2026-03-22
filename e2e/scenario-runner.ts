import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { StatusIndicator } from "../src/components/status-indicator";
import { resolveInitialState } from "../src/game-loader/game-loader";
import type { GameConfigInput } from "../src/game-loader/types";
import { MockLLMClient } from "../src/llm/MockLLMClient";
import { Orchestrator } from "../src/orchestrator/orchestrator";
import { GamePhase } from "../src/orchestrator/types";
import type { GameState, PrimitiveAction } from "../src/orchestrator/types";
import type { SpeechService } from "../src/services/speech-service";
import { StateManager } from "../src/state-manager";
import type { Scenario, ScenarioStep } from "./scenario-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

/**
 * Loads a game config from public/games/{gameId}/config.json.
 */
function loadGameConfig(gameId: string): GameConfigInput {
  const configPath = path.join(PROJECT_ROOT, "public", "games", gameId, "config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as GameConfigInput;
}

/**
 * Builds initial state by merging scenario overrides onto the game's base state.
 * Base state comes from resolveInitialState (built from config.squares).
 * Nested objects (game, players, board) are merged so partial overrides work.
 * decisionPoints are derived from board.squares at runtime by consumers.
 */
function buildInitialState(game: GameConfigInput, scenario: Scenario): GameState {
  const base = resolveInitialState(game) as Record<string, unknown>;
  const overrides = (scenario.initialState ?? {}) as Record<string, unknown>;

  const merged: Record<string, unknown> = { ...base };

  const hasGameOverride = overrides.game && typeof overrides.game === "object";
  if (hasGameOverride) {
    merged.game = { ...(base.game as object), ...overrides.game };
  }

  const hasPlayersOverride = overrides.players !== undefined;
  if (hasPlayersOverride) merged.players = overrides.players;

  const hasBoardOverride = overrides.board !== undefined;
  if (hasBoardOverride) merged.board = overrides.board;

  if (game.stateDisplay) merged.stateDisplay = game.stateDisplay;

  return merged as GameState;
}

/**
 * Expands a scenario step to primitive actions.
 * Supports `roll` shorthand and explicit `actions`.
 */
function expandStep(step: ScenarioStep): PrimitiveAction[] {
  if (step.actions && step.actions.length > 0) {
    return step.actions;
  }
  if (typeof step.roll === "number") {
    return [
      { action: "PLAYER_ROLLED", value: step.roll },
      { action: "NARRATE", text: `Rolled ${step.roll}` },
    ];
  }
  throw new Error("Scenario step must have 'actions' or 'roll'");
}

/**
 * Asserts expected values against current state.
 * @throws if any assertion fails
 */
function assertExpectations(
  stateManager: StateManager,
  expect: Record<string, unknown>,
  stepIndex: number,
): void {
  for (const [path, expected] of Object.entries(expect)) {
    const actual = stateManager.get(path);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `E2E assertion failed at step ${stepIndex}, path "${path}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }
}

/**
 * Runs an e2e scenario against the real orchestrator.
 * No browser, no LLM, no TTS. Pure state-machine verification.
 *
 * @param scenario - Scenario definition
 * @throws on assertion failure or execution error
 */
export async function runScenario(scenario: Scenario): Promise<void> {
  const game = loadGameConfig(scenario.game);
  const initialState = buildInitialState(game, scenario);

  const stateManager = new StateManager();
  stateManager.init(initialState);

  const mockSpeech: SpeechService = {
    speak: vi.fn().mockResolvedValue(undefined),
    playSound: vi.fn(),
    loadSound: vi.fn().mockResolvedValue(undefined),
    prime: vi.fn(),
  } as unknown as SpeechService;

  const mockIndicator: StatusIndicator = {
    setState: vi.fn(),
  } as unknown as StatusIndicator;

  const llmScript = scenario.steps.some((s) => (s.llmResponses?.length ?? 0) > 0)
    ? scenario.steps.flatMap((s) => s.llmResponses ?? [])
    : (scenario.llmScript ?? []);
  const mockLLM = new MockLLMClient("scripted", llmScript);

  const orchestrator = new Orchestrator(
    mockLLM,
    stateManager,
    mockSpeech,
    mockIndicator,
    initialState,
    { allowScenarioOnlyStatePaths: true },
  );

  if (scenario.players !== undefined) {
    const names = Array.from({ length: scenario.players }, (_, i) => `Player ${i + 1}`);
    orchestrator.setupPlayers(names);
  }
  orchestrator.transitionPhase(GamePhase.PLAYING);

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const actions = expandStep(step);

    let result = await orchestrator.testExecuteActions(actions);
    if (!result.success) {
      throw new Error(`E2E step ${i} failed: testExecuteActions returned success=false`);
    }

    // When step has llmResponses, execute the first batch (e.g. square-effect outcome) before advancing turn,
    // so SET_STATE on the current player (e.g. players.p2.points) is valid.
    if (step.llmResponses?.[0]?.length) {
      const effectResult = await orchestrator.testExecuteActions(step.llmResponses[0]);
      if (!effectResult.success) {
        throw new Error(
          `E2E step ${i} failed: testExecuteActions (llmResponses) returned success=false`,
        );
      }
      if (effectResult.shouldAdvanceTurn) result = effectResult;
    }

    if (result.shouldAdvanceTurn) {
      await orchestrator.advanceTurn();
    }

    if (step.expect && Object.keys(step.expect).length > 0) {
      assertExpectations(stateManager, step.expect, i);
    }
  }
}
