import { ILLMClient } from '../llm/ILLMClient'
import { StateManager } from '../state-manager'
import { validateActions } from './validator'
import { PrimitiveAction } from './types'
import { Logger } from '../utils/logger'

export class Orchestrator {
  constructor(
    private llmClient: ILLMClient,
    private stateManager: StateManager,
    private speakFn: (text: string) => void
  ) {}

  async handleTranscript(transcript: string): Promise<void> {
    try {
      Logger.brain(`Orchestrator processing: ${transcript}`)

      const state = await this.stateManager.getState()
      Logger.state('Current state:', state)

      const actions = await this.llmClient.getActions(transcript, state)
      Logger.robot('LLM returned actions:', actions)

      if (actions.length === 0) {
        Logger.warn('No actions returned from LLM')
        return
      }

      const validation = validateActions(actions, state, this.stateManager)

      if (!validation.valid) {
        Logger.error('Validation failed:', validation.error)
        return
      }

      Logger.info('Actions validated, executing...')
      await this.executeActions(actions)
      Logger.info('Actions executed successfully')

    } catch (error) {
      Logger.error('Orchestrator error:', error)
    }
  }

  private async executeActions(actions: PrimitiveAction[]): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action)
      } catch (error) {
        Logger.error('Failed to execute action:', action, error)
      }
    }
  }

  private async executeAction(action: PrimitiveAction): Promise<void> {
    switch (action.action) {
      case 'WRITE_STATE': {
        Logger.write(`Writing state: ${action.path} = ${JSON.stringify(action.value)}`)
        await this.stateManager.set(action.path, action.value)
        const newState = await this.stateManager.getState()
        Logger.state('New state:', newState)
        break
      }

      case 'READ_STATE': {
        const value = await this.stateManager.get(action.path)
        Logger.read(`Reading state: ${action.path} = ${JSON.stringify(value)}`)
        break
      }

      case 'NARRATE': {
        Logger.narration(`Narrating: "${action.text}"`)
        this.speakFn(action.text)
        break
      }
    }
  }
}
