import { ILLMClient } from '../llm/ILLMClient'
import { StateManager } from '../state-manager'
import { SpeechService } from '../services/speech-service'
import { StatusIndicator } from '../components/status-indicator'
import { validateActions } from './validator'
import { PrimitiveAction, ExecutionContext, ActionHandler } from './types'
import { Logger } from '../utils/logger'
import { Profiler } from '../utils/profiler'

/**
 * Core orchestrator that processes voice transcripts through LLM,
 * validates generated actions, and executes them on game state.
 */
export class Orchestrator {
  private actionHandlers: Map<string, ActionHandler> = new Map()
  private isProcessing = false

  constructor(
    private llmClient: ILLMClient,
    private stateManager: StateManager,
    private speechService: SpeechService,
    private statusIndicator: StatusIndicator
  ) {}

  /**
   * Checks if the orchestrator is currently processing a request.
   * @returns true if processing, false otherwise
   */
  isLocked(): boolean {
    return this.isProcessing
  }

  /**
   * Registers a custom action handler for extending primitive actions.
   * @param actionType - The action type to handle (e.g., "CUSTOM_ACTION")
   * @param handler - Function to execute when action is encountered
   */
  registerActionHandler(actionType: string, handler: ActionHandler): void {
    this.actionHandlers.set(actionType, handler)
  }

  /**
   * Corrects common transcription errors from speech recognition.
   * @param transcript - The raw transcript from speech recognition
   * @returns Corrected transcript
   */
  private correctTranscriptionErrors(transcript: string): string {
    const corrections: Record<string, string> = {
      'i rode': 'i rolled',
      'I rode': 'I rolled',
      'i wrote': 'i rolled',
      'I wrote': 'I rolled',
      ' rode a ': ' rolled a ',
      ' rode an ': ' rolled an ',
      ' wrote a ': ' rolled a ',
      ' wrote an ': ' rolled an ',
      ' wrote than ': ' rolled an ',
      ' rode than ': ' rolled an ',
    }

    let corrected = transcript
    for (const [error, correction] of Object.entries(corrections)) {
      corrected = corrected.replace(new RegExp(error, 'g'), correction)
    }

    return corrected
  }

  /**
   * Processes a voice transcript by sending to LLM and executing returned actions.
   * This is the main entry point for handling user voice commands.
   * @param transcript - The transcribed user command
   */
  async handleTranscript(transcript: string): Promise<void> {
    if (this.isProcessing) {
      Logger.warn('⏸️ Orchestrator busy, ignoring new request')
      return
    }

    this.isProcessing = true
    this.statusIndicator.setState('processing')
    Profiler.start('orchestrator.total')

    try {
      const context: ExecutionContext = { depth: 0, maxDepth: 5 }
      await this.processTranscript(transcript, context)
    } finally {
      this.isProcessing = false
      Profiler.end('orchestrator.total')
      this.statusIndicator.setState('listening')
    }
  }

  private async processTranscript(
    transcript: string,
    context: ExecutionContext
  ): Promise<void> {
    try {
      const correctedTranscript = this.correctTranscriptionErrors(transcript)
      Logger.brain(`Orchestrator processing: ${correctedTranscript} (depth: ${context.depth})`)

      const state = await this.stateManager.getState()
      Logger.state('Current state:', state)

      Profiler.start('orchestrator.llm')
      const actions = await this.llmClient.getActions(correctedTranscript, state)
      Profiler.end('orchestrator.llm')

      Logger.robot('LLM returned actions:', actions)

      if (actions.length === 0) {
        Logger.warn('No actions returned from LLM')
        return
      }

      Profiler.start('orchestrator.validation')
      const validation = validateActions(actions, state, this.stateManager)
      Profiler.end('orchestrator.validation')

      if (!validation.valid) {
        Logger.error('Validation failed:', validation.error)
        return
      }

      Logger.info('Actions validated, executing...')
      Profiler.start('orchestrator.execution')
      await this.executeActions(actions, context)
      Profiler.end('orchestrator.execution')
      Logger.info('Actions executed successfully')

    } catch (error) {
      Logger.error('Orchestrator error:', error)
    }
  }

  private async executeActions(
    actions: PrimitiveAction[],
    context: ExecutionContext
  ): Promise<void> {
    if (context.depth >= context.maxDepth) {
      Logger.warn(`Max execution depth (${context.maxDepth}) reached, stopping`)
      return
    }

    for (const action of actions) {
      try {
        await this.executeAction(action, context)
      } catch (error) {
        Logger.error('Failed to execute action:', action, error)
      }
    }
  }

  private async executeAction(
    action: PrimitiveAction,
    context: ExecutionContext
  ): Promise<void> {
    const customHandler = this.actionHandlers.get(action.action)
    if (customHandler) {
      await customHandler(action, context)
      return
    }

    switch (action.action) {
      case 'SET_STATE': {
        Logger.write(`Setting state: ${action.path} = ${JSON.stringify(action.value)}`)
        await this.stateManager.set(action.path, action.value)
        const newState = await this.stateManager.getState()
        Logger.state('New state:', newState)
        break
      }

      case 'ADD_STATE': {
        const currentValue = await this.stateManager.get(action.path)
        if (typeof currentValue !== 'number') {
          throw new Error(`Cannot ADD_STATE: ${action.path} is not a number`)
        }
        const newValue = currentValue + action.value
        Logger.write(`Adding to state: ${action.path} (${currentValue} + ${action.value} = ${newValue})`)
        await this.stateManager.set(action.path, newValue)
        break
      }

      case 'SUBTRACT_STATE': {
        const currentValue = await this.stateManager.get(action.path)
        if (typeof currentValue !== 'number') {
          throw new Error(`Cannot SUBTRACT_STATE: ${action.path} is not a number`)
        }
        const newValue = currentValue - action.value
        Logger.write(`Subtracting from state: ${action.path} (${currentValue} - ${action.value} = ${newValue})`)
        await this.stateManager.set(action.path, newValue)
        break
      }

      case 'READ_STATE': {
        const value = await this.stateManager.get(action.path)
        Logger.read(`Reading state: ${action.path} = ${JSON.stringify(value)}`)
        break
      }

      case 'NARRATE': {
        Logger.narration(`Narrating: "${action.text}"`)
        this.statusIndicator.setState('speaking')
        if (action.soundEffect) {
          this.speechService.playSound(action.soundEffect)
        }
        await this.speechService.speak(action.text)
        break
      }

      case 'ROLL_DICE': {
        const roll = Math.floor(Math.random() * 6) + 1
        Logger.info(`Rolling ${action.die}: ${roll}`)

        this.speechService.speak(`You rolled a ${roll}`)

        await this.stateManager.set('game.lastRoll', roll)

        const newContext: ExecutionContext = {
          depth: context.depth + 1,
          maxDepth: context.maxDepth
        }

        await this.processTranscript(
          `The player rolled a ${roll}. What happens next?`,
          newContext
        )
        break
      }
    }
  }
}
