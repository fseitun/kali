import { ILLMClient } from '../llm/ILLMClient'
import { StateManager } from '../state-manager'
import { validateActions } from './validator'
import { PrimitiveAction } from './types'

export class Orchestrator {
  constructor(
    private llmClient: ILLMClient,
    private stateManager: StateManager,
    private speakFn: (text: string) => void
  ) {}

  async handleTranscript(transcript: string): Promise<void> {
    try {
      console.log('🧠 Orchestrator processing:', transcript)

      const state = await this.stateManager.getState()
      console.log('📊 Current state:', state)

      const actions = await this.llmClient.getActions(transcript, state)
      console.log('🤖 LLM returned actions:', actions)

      if (actions.length === 0) {
        console.warn('⚠️ No actions returned from LLM')
        return
      }

      const validation = validateActions(actions, state, this.stateManager)

      if (!validation.valid) {
        console.error('❌ Validation failed:', validation.error)
        return
      }

      console.log('✅ Actions validated, executing...')
      await this.executeActions(actions)
      console.log('✅ Actions executed successfully')

    } catch (error) {
      console.error('❌ Orchestrator error:', error)
    }
  }

  private async executeActions(actions: PrimitiveAction[]): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action)
      } catch (error) {
        console.error('❌ Failed to execute action:', action, error)
      }
    }
  }

  private async executeAction(action: PrimitiveAction): Promise<void> {
    switch (action.action) {
      case 'WRITE_STATE': {
        console.log(`✏️ Writing state: ${action.path} = ${JSON.stringify(action.value)}`)
        await this.stateManager.set(action.path, action.value)
        const newState = await this.stateManager.getState()
        console.log('📊 New state:', newState)
        break
      }

      case 'READ_STATE': {
        const value = await this.stateManager.get(action.path)
        console.log(`👁️ Reading state: ${action.path} = ${JSON.stringify(value)}`)
        break
      }

      case 'NARRATE': {
        console.log(`🔊 Narrating: "${action.text}"`)
        this.speakFn(action.text)
        break
      }
    }
  }
}
