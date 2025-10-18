import { GameState } from '../orchestrator/types'

/**
 * Metadata about a game module.
 */
export interface GameMetadata {
  id: string
  name: string
  description: string
  version: string
  minPlayers: number
  maxPlayers: number
}

/**
 * Game rules and structure information for LLM context.
 */
export interface GameRules {
  objective: string
  mechanics: string
  turnStructure: string
  boardLayout: string
  examples: string[]
}

/**
 * Complete game module definition loaded from JSON.
 */
export interface GameModule {
  metadata: GameMetadata
  initialState: GameState
  rules: GameRules
  soundEffects?: Record<string, string>
  customActions?: string[]
}
