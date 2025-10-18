import { GameState, PrimitiveAction } from '../orchestrator/types'

export interface ILLMClient {
  getActions(transcript: string, state: GameState): Promise<PrimitiveAction[]>
}
