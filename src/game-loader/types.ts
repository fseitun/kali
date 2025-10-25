import type { GameState } from "../orchestrator/types";

/**
 * Metadata about a game module.
 */
export interface GameMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  minPlayers: number;
  maxPlayers: number;
}

/**
 * Game rules and structure information for LLM context.
 */
export interface GameRules {
  objective: string;
  mechanics: string;
  turnStructure: string;
  boardLayout: string;
  examples: string[];
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
