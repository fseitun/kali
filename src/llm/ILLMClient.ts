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

  /**
   * Extracts a person's name from conversational text.
   * Handles phrases like "call me X", "my name is X", "llámame X", etc.
   * @param transcript - The transcribed user input
   * @returns The extracted name, or null if no valid name found
   */
  extractName(transcript: string): Promise<string | null>

  /**
   * Analyzes if a user's response is on-topic for the expected context.
   * Detects urgent or off-topic messages (injuries, emergencies, complaints).
   * @param transcript - The transcribed user input
   * @param expectedContext - Description of what response is expected
   * @returns Analysis result with on-topic flag and optional urgent message
   */
  analyzeResponse(transcript: string, expectedContext: string): Promise<{isOnTopic: boolean, urgentMessage?: string}>
}
