import type { GameState, SquareData } from "@/orchestrator/types";

/**
 * Metadata about a game module.
 */
export interface GameMetadata {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** Initial habitat label for game.currentHabitat. Default "Inicio". */
  initialHabitat?: string;
}

/**
 * Game rules and structure information for LLM context.
 */
export interface GameRules {
  objective: string;
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
 * Raw config input. Supports legacy (initialState) or new (squares-only) format.
 */
export interface GameConfigInput {
  metadata: GameMetadata;
  rules: GameRules;
  soundEffects?: Record<string, string>;
  customActions?: string[];
  stateDisplay?: StateDisplayMetadata;
  /** Legacy: full initial state. If present, used as-is. */
  initialState?: GameState;
  /** New format: squares only. Board, game, players derived at load. */
  squares?: Record<string, SquareData>;
}

/**
 * Complete game module definition loaded from JSON.
 */
export interface GameModule {
  metadata: GameMetadata;
  initialState: GameState;
  rules: GameRules;
  soundEffects?: Record<string, string>;
  customActions?: string[];
  stateDisplay?: StateDisplayMetadata;
}
