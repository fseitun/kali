import type { GameState, SquareData } from "@/orchestrator/types";

/**
 * Metadata about a game module.
 */
export interface GameMetadata {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** Win condition / objective for LLM context. */
  objective: string;
  /** Initial habitat label for game.currentHabitat. Default "Inicio". */
  initialHabitat?: string;
  /** Optional short summary for NARRATE explanations (2-3 sentences). Not sent as full rules. */
  summary?: string;
}

/**
 * Display configuration for state formatting.
 */
export interface StateDisplayConfig {
  primary?: string[];
  secondary?: string[];
  hidden?: string[];
}

/**
 * State display metadata for controlling what gets shown in logs.
 */
export interface StateDisplayMetadata {
  game?: StateDisplayConfig;
  players?: StateDisplayConfig;
  board?: StateDisplayConfig;
}

/**
 * Raw config input. Squares-only format; board, game, and players are derived at load.
 */
export interface GameConfigInput {
  metadata: GameMetadata;
  soundEffects?: Record<string, string>;
  customActions?: string[];
  stateDisplay?: StateDisplayMetadata;
  /** Squares 0..boardLength with explicit next/prev. Board, game, players derived from this. */
  squares?: Record<string, SquareData>;
}

/**
 * Complete game module definition loaded from JSON.
 */
export interface GameModule {
  metadata: GameMetadata;
  initialState: GameState;
  soundEffects?: Record<string, string>;
  customActions?: string[];
  stateDisplay?: StateDisplayMetadata;
}
