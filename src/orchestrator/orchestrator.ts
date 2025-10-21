import { LLMClient } from '../llm/LLMClient'
import { StateManager } from '../state-manager'
import { SpeechService } from '../services/speech-service'
import { StatusIndicator } from '../components/status-indicator'
import { validateActions } from './validator'
import { PrimitiveAction, ExecutionContext, ActionHandler, GameState, GamePhase } from './types'
import { Logger } from '../utils/logger'
import { Profiler } from '../utils/profiler'
import { formatStateContext } from '../llm/system-prompt'
import { t } from '../i18n'
import { deepClone } from '../utils/deep-clone'
import { TurnManager } from './turn-manager'
import { BoardEffectsHandler } from './board-effects-handler'
import { DecisionPointEnforcer } from './decision-point-enforcer'

/**
 * Core orchestrator that processes voice transcripts through LLM,
 * validates generated actions, and executes them on game state.
 *
 * AUTHORITY: The orchestrator owns all game state transitions including:
 * - Turn advancement
 * - Phase transitions
 * - Player setup
 * - Board mechanics
 */
export class Orchestrator {
  private turnManager: TurnManager
  private boardEffectsHandler: BoardEffectsHandler
  private decisionPointEnforcer: DecisionPointEnforcer
  private actionHandlers: Map<string, ActionHandler> = new Map()
  private isProcessing = false
  private initialState: GameState

  constructor(
    private llmClient: LLMClient,
    private stateManager: StateManager,
    private speechService: SpeechService,
    private statusIndicator: StatusIndicator,
    initialState: GameState
  ) {
    this.initialState = initialState

    // Instantiate subsystems
    this.turnManager = new TurnManager(stateManager)
    this.boardEffectsHandler = new BoardEffectsHandler(
      stateManager,
      this.processTranscript.bind(this)
    )
    this.decisionPointEnforcer = new DecisionPointEnforcer(
      stateManager,
      this.processTranscript.bind(this)
    )
  }

  /**
   * Checks if the orchestrator is currently processing a request.
   * @returns true if processing, false otherwise
   */
  isLocked(): boolean {
    return this.isProcessing
  }

  /**
   * Checks if the orchestrator is currently processing a square effect.
   * Used by validator to block inappropriate actions during effect resolution.
   * @returns true if processing square effect, false otherwise
   */
  isProcessingEffect(): boolean {
    return this.boardEffectsHandler.isProcessingEffect()
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
   * Processes a voice transcript by sending to LLM and executing returned actions.
   * This is the main entry point for handling user voice commands.
   * @param transcript - The transcribed user command
   * @returns true if execution succeeded, false otherwise
   */
  async handleTranscript(transcript: string): Promise<boolean> {
    if (this.isProcessing) {
      Logger.warn('⏸️ Orchestrator busy, ignoring new request')
      return false
    }

    this.isProcessing = true
    this.statusIndicator.setState('processing')
    Profiler.start('orchestrator.total')

    let executionSucceeded = false

    try {
      const context: ExecutionContext = { depth: 0, maxDepth: 5 }
      executionSucceeded = await this.processTranscript(transcript, context)
      return executionSucceeded
    } finally {
      this.isProcessing = false
      Profiler.end('orchestrator.total')
      this.statusIndicator.setState('listening')
    }
  }

  /**
   * Test-only: Execute actions directly without LLM interpretation.
   * Bypasses LLM for testing orchestrator validation and execution logic.
   * @param actions - Array of primitive actions to validate and execute
   * @returns true if execution succeeded, false otherwise
   */
  async testExecuteActions(actions: PrimitiveAction[]): Promise<boolean> {
    if (this.isProcessing) {
      Logger.warn('⏸️ Orchestrator busy, ignoring test request')
      return false
    }

    this.isProcessing = true
    this.statusIndicator.setState('processing')
    Profiler.start('orchestrator.test')

    try {
      Logger.info('🧪 Test mode: Executing actions directly')
      const state = this.stateManager.getState()
      Logger.state('Current state:\n' + formatStateContext(state))

      Profiler.start('orchestrator.test.validation')
      const validation = validateActions(actions, state, this.stateManager, this)
      Profiler.end('orchestrator.test.validation')

      if (!validation.valid) {
        Logger.error('❌ Test validation failed:', validation.error)
        await this.speechService.speak('Invalid actions')
        return false
      }

      Logger.info('✅ Test validation passed, executing...')
      const context: ExecutionContext = { depth: 0, maxDepth: 5 }
      Profiler.start('orchestrator.test.execution')
      await this.executeActions(actions, context)
      Profiler.end('orchestrator.test.execution')
      Logger.info('✅ Test actions executed successfully')

      return true
    } catch (error) {
      Logger.error('❌ Test execution error:', error)
      return false
    } finally {
      this.isProcessing = false
      Profiler.end('orchestrator.test')
      this.statusIndicator.setState('listening')
    }
  }

  /**
   * Sets up players in game state from name collection data.
   * AUTHORITY: Only the orchestrator can initialize player state.
   * @param playerNames - Array of player names in turn order
   */
  setupPlayers(playerNames: string[]): void {
    const currentState = this.stateManager.getState()
    const playersArray = Object.values(currentState.players as Record<string, Record<string, unknown>>)
    const playerTemplate = playersArray[0]

    const players: Record<string, Record<string, unknown>> = {}
    const playerOrder: string[] = []

    playerNames.forEach((name, index) => {
      const playerId = `p${index + 1}`
      const player = deepClone(playerTemplate)
      player.id = playerId
      player.name = name
      player.position = 0
      players[playerId] = player
      playerOrder.push(playerId)
    })

    this.stateManager.set('players', players)
    this.stateManager.set('game.playerOrder', playerOrder)

    // Set first player's turn
    if (playerOrder.length > 0) {
      this.stateManager.set('game.turn', playerOrder[0])
    }

    Logger.info('Players created:', players)
    Logger.info('Player order:', playerOrder)
  }

  /**
   * Transitions the game to a new phase.
   * AUTHORITY: Only the orchestrator can change game phase.
   * @param phase - The phase to transition to
   */
  transitionPhase(phase: GamePhase): void {
    Logger.info(`🎮 Phase transition: ${this.stateManager.get('game.phase')} → ${phase}`)
    this.stateManager.set('game.phase', phase)
  }

  /**
   * Checks if the current player has pending decisions that must be resolved.
   * @returns true if there are unresolved decisions, false otherwise
   */
  hasPendingDecisions(): boolean {
    return this.turnManager.hasPendingDecisions()
  }

  /**
   * Advances to the next player's turn.
   * AUTHORITY: Only the orchestrator can advance turns.
   * @returns The next player's ID and details, or null if unable to advance
   */
  async advanceTurn(): Promise<{ playerId: string; name: string; position: number } | null> {
    return await this.turnManager.advanceTurn(this.boardEffectsHandler.isProcessingEffect())
  }

  private async processTranscript(
    transcript: string,
    context: ExecutionContext
  ): Promise<boolean> {
    try {
      Logger.brain(`Orchestrator processing: ${transcript} (depth: ${context.depth})`)

      const state = this.stateManager.getState()
      Logger.state('Current state:\n' + formatStateContext(state))

      Profiler.start(`orchestrator.llm.${context.depth}`)
      const actions = await this.llmClient.getActions(transcript, state)
      Profiler.end(`orchestrator.llm.${context.depth}`)

      Logger.robot('LLM returned actions:', actions)

      if (actions.length === 0) {
        Logger.warn('No actions returned from LLM')
        await this.speechService.speak(t('llm.allRetriesFailed'))
        return false
      }

      Profiler.start(`orchestrator.validation.${context.depth}`)
      const validation = validateActions(actions, state, this.stateManager, this)
      Profiler.end(`orchestrator.validation.${context.depth}`)

      if (!validation.valid) {
        Logger.error('Validation failed:', validation.error)
        await this.speechService.speak(t('errors.validationFailed'))
        return false
      }

      Logger.info('Actions validated, executing...')
      Profiler.start(`orchestrator.execution.${context.depth}`)
      await this.executeActions(actions, context)
      Profiler.end(`orchestrator.execution.${context.depth}`)
      if (context.depth === 0) {
        Logger.info('Actions executed successfully')
      }

      await this.decisionPointEnforcer.enforceDecisionPoints(context)

      return true
    } catch (error) {
      Logger.error('Orchestrator error:', error)
      return false
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
    primitive: PrimitiveAction,
    context: ExecutionContext
  ): Promise<void> {
    const customHandler = this.actionHandlers.get(primitive.action)
    if (customHandler) {
      await customHandler(primitive, context)
      return
    }

    switch (primitive.action) {
      case 'NARRATE': {
        this.statusIndicator.setState('speaking')
        if (primitive.soundEffect) {
          this.speechService.playSound(primitive.soundEffect)
        }
        await this.speechService.speak(primitive.text)
        break
      }

      case 'SET_STATE': {
        await this.turnManager.assertPlayerTurnOwnership(primitive.path)
        Logger.write(`Setting state: ${primitive.path} = ${JSON.stringify(primitive.value)}`)
        this.stateManager.set(primitive.path, primitive.value)
        await this.boardEffectsHandler.checkAndApplyBoardMoves(primitive.path)
        await this.boardEffectsHandler.checkAndApplySquareEffects(primitive.path, context)
        break
      }

      case 'PLAYER_ROLLED': {
        const state = this.stateManager.getState()
        const game = state.game as Record<string, unknown> | undefined
        const currentTurn = game?.turn as string | undefined

        if (!currentTurn) {
          throw new Error('Cannot process PLAYER_ROLLED: No current turn set')
        }

        const path = `players.${currentTurn}.position`
        const currentPosition = this.stateManager.get(path) as number

        if (typeof currentPosition !== 'number') {
          throw new Error(`Cannot process PLAYER_ROLLED: ${path} is not a number`)
        }

        const newPosition = currentPosition + primitive.value
        Logger.write(`Player rolled ${primitive.value}: ${path} (${currentPosition} + ${primitive.value} = ${newPosition})`)

        this.stateManager.set(path, newPosition)
        this.stateManager.set('game.lastRoll', primitive.value)
        await this.boardEffectsHandler.checkAndApplyBoardMoves(path)
        await this.boardEffectsHandler.checkAndApplySquareEffects(path, context)
        break
      }

      case 'PLAYER_ANSWERED': {
        Logger.info(`Player answered: "${primitive.answer}"`)
        // Store answer in temporary state for orchestrator to process
        this.stateManager.set('game.lastAnswer', primitive.answer)
        break
      }

      case 'RESET_GAME': {
        Logger.info(`🔄 Resetting game state (keepPlayerNames: ${primitive.keepPlayerNames})`)

        const playerNames: Map<string, string> = new Map()
        if (primitive.keepPlayerNames) {
          const currentState = this.stateManager.getState()
          const players = currentState.players as Record<string, { name: string }> | undefined
          if (players) {
            for (const [id, player] of Object.entries(players)) {
              playerNames.set(id, player.name)
            }
            Logger.info(`Extracted ${playerNames.size} player names: [${Array.from(playerNames.values()).join(', ')}]`)
          } else {
            Logger.warn('keepPlayerNames=true but no players found in current state')
          }
        }

        this.stateManager.resetState(this.initialState)
        Logger.info('State reset to initial state')

        if (primitive.keepPlayerNames && playerNames.size > 0) {
          const state = this.stateManager.getState()
          const game = state.game as Record<string, unknown> | undefined
          const playerOrder = game?.playerOrder as string[] | undefined

          if (playerOrder && playerOrder.length > 0) {
            Logger.info(`Restoring ${playerNames.size} player names`)
            for (const playerId of playerOrder) {
              const savedName = playerNames.get(playerId)
              if (savedName) {
                this.stateManager.set(`players.${playerId}.name`, savedName)
                Logger.info(`Restored player ${playerId}: "${savedName}"`)
              }
            }
          } else {
            Logger.warn('keepPlayerNames=true but no playerOrder found after reset')
          }
        }

        Logger.info('Game state reset complete')
        break
      }
    }
  }
}
