export type GameState = Record<string, unknown>

export enum GamePhase {
  SETUP = 'SETUP',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED'
}

/**
 * Context for tracking execution depth to prevent infinite loops in agentic chains.
 */
export interface ExecutionContext {
  depth: number
  maxDepth: number
}

export type ActionHandler = (
  action: PrimitiveAction,
  context: ExecutionContext
) => Promise<void>

/**
 * Union type of all primitive actions that the orchestrator can execute.
 *
 * Design Philosophy:
 * - LLM is a thin interface that reports events, not calculates state
 * - Orchestrator owns all game logic and state calculations
 * - Primitives are deterministic and testable
 */
export type PrimitiveAction =
  | NarrateAction
  | ResetGameAction
  | SetStateAction
  | PlayerRolledAction
  | PlayerAnsweredAction

/**
 * Speaks text aloud via TTS and optionally plays a sound effect.
 * LLM's primary job: natural language generation.
 */
export interface NarrateAction {
  action: 'NARRATE'
  text: string
  soundEffect?: string
}

/**
 * Resets the game state to initial conditions.
 * Management action for starting new games.
 */
export interface ResetGameAction {
  action: 'RESET_GAME'
  keepPlayerNames: boolean
}

/**
 * Sets a value in game state using dot-notation path.
 * Used ONLY for user corrections/overrides (e.g., "we're both at position 50").
 * NOT for calculated state changes (those use event-based primitives like PLAYER_ROLLED).
 */
export interface SetStateAction {
  action: 'SET_STATE'
  path: string
  value: unknown
}

/**
 * Reports that a player rolled dice and the resulting value.
 * Orchestrator calculates position change (position += value).
 * playerId is inferred from game.turn (current player).
 */
export interface PlayerRolledAction {
  action: 'PLAYER_ROLLED'
  value: number
}

/**
 * Reports a player's answer to a question posed by orchestrator.
 * Context is maintained by orchestrator (single-threaded conversation).
 * Used for: path choices, fight/flee decisions, riddle answers, etc.
 */
export interface PlayerAnsweredAction {
  action: 'PLAYER_ANSWERED'
  answer: string
}
