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
 */
export type PrimitiveAction =
  | SetStateAction
  | AddStateAction
  | SubtractStateAction
  | ReadStateAction
  | NarrateAction
  | RollDiceAction

/**
 * Sets a value in game state using dot-notation path.
 */
export interface SetStateAction {
  action: 'SET_STATE'
  path: string
  value: unknown
}

/**
 * Adds a numeric value to an existing number in state.
 */
export interface AddStateAction {
  action: 'ADD_STATE'
  path: string
  value: number
}

/**
 * Subtracts a numeric value from an existing number in state.
 */
export interface SubtractStateAction {
  action: 'SUBTRACT_STATE'
  path: string
  value: number
}

/**
 * Reads a value from state (for LLM context, rarely needed).
 */
export interface ReadStateAction {
  action: 'READ_STATE'
  path: string
}

/**
 * Speaks text aloud via TTS and optionally plays a sound effect.
 */
export interface NarrateAction {
  action: 'NARRATE'
  text: string
  soundEffect?: string
}

/**
 * Rolls dice and triggers an agentic chain to process the result.
 */
export interface RollDiceAction {
  action: 'ROLL_DICE'
  die: string
}
