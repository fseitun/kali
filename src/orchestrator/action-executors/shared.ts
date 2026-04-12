import type { BoardEffectsHandler } from "../board-effects-handler";
import type { RiddlePowerCheckHandler } from "../riddle-power-check";
import type { TurnManager } from "../turn-manager";
import type { GameState } from "../types";
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

export function getPlayerNameById(
  state: Readonly<GameState>,
  playerId: string,
  fallback = "",
): string {
  return playerDisplayName(state.players[playerId]?.name, fallback);
}
