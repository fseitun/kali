import { GameState, PrimitiveAction } from '../orchestrator/types'

/**
 * Interface for LLM clients that translate voice commands into primitive actions.
 */
export interface ILLMClient {
  /**
   * Sets the game rules that will be included in the LLM system prompt.
   * @param rules - The game rules as formatted text
   */
  setGameRules(rules: string): void

  /**
   * Sends a transcript and current state to the LLM and returns primitive actions.
   * @param transcript - The user's voice command
   * @param state - The current game state
   * @returns Array of primitive actions to execute
   */
  getActions(transcript: string, state: GameState): Promise<PrimitiveAction[]>
}
