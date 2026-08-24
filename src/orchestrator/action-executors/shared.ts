import type { BoardEffectsHandler } from "../board-effects-handler";
import type { RiddlePowerCheckHandler } from "../riddle-power-check";
import type { TurnManager } from "../turn-manager";
import type { DomainEventPayload, ExecutionContext, GamePhase, GameState } from "../types";
import type { IStatusIndicator } from "@/components/status-indicator";
import type { ISpeechService } from "@/services/speech-service";
import type { StateManager } from "@/state-manager";
import { STATE_PLAYERS_PREFIX } from "@/state-paths";

export interface ActionExecutorContext {
  stateManager: StateManager;
  speechService: ISpeechService;
  statusIndicator: IStatusIndicator;
  turnManager: TurnManager;
  boardEffectsHandler: BoardEffectsHandler;
  riddlePowerCheckHandler: RiddlePowerCheckHandler;
  initialState: GameState;
  /** Orchestrator-owned roster rebuild; RESET_GAME reuses it to restore the kept players. */
  setupPlayers: (playerNames: string[]) => void;
  /** Orchestrator-owned phase authority (axiom 2); RESET_GAME decides SETUP vs PLAYING. */
  transitionPhase: (phase: GamePhase) => void;
  setLastNarration: (text: string) => void;
  checkAndApplyWinCondition: (positionPath: string) => void;
}

export function isPlayerPositionPath(path: string): boolean {
  return path.startsWith(STATE_PLAYERS_PREFIX) && path.endsWith(".position");
}

export function playerDisplayName(name: unknown, fallbackId: string): string {
  if (typeof name === "string" && name.trim() !== "") {
    return name.trim();
  }
  return fallbackId;
}

export function getCurrentTurn(state: Readonly<GameState>): string | undefined {
  return state.game.turn ?? undefined;
}

/**
 * Appends a deterministic domain event to the current execution context.
 */
export function recordDomainEvent(context: ExecutionContext, event: DomainEventPayload): void {
  const eventId = (context.nextDomainEventId ?? 0) + 1;
  context.nextDomainEventId = eventId;
  const withId = { eventId, ...event };
  context.domainEvents = context.domainEvents ?? [];
  context.domainEvents.push(withId);
  context.domainEventHistory = context.domainEventHistory ?? [];
  context.domainEventHistory.push(withId);
}
