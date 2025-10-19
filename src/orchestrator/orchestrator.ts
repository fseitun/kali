import { LLMClient } from '../llm/LLMClient'
import { StateManager } from '../state-manager'
import { SpeechService } from '../services/speech-service'
import { StatusIndicator } from '../components/status-indicator'
import { validateActions } from './validator'
import { PrimitiveAction, ExecutionContext, ActionHandler, GameState } from './types'
import { Logger } from '../utils/logger'
import { Profiler } from '../utils/profiler'
import { formatStateContext } from '../llm/system-prompt'
import { t } from '../i18n'

/**
 * Core orchestrator that processes voice transcripts through LLM,
 * validates generated actions, and executes them on game state.
 */
export class Orchestrator {
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
  }

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
   * Checks if the current player has pending decisions that must be made before turn can advance.
   * @param state - Current game state
   * @returns true if player has pending decisions, false otherwise
   */
  private hasPendingDecisions(state: GameState): boolean {
    const game = state.game as Record<string, unknown> | undefined
    const currentTurn = game?.turn as string | undefined

    if (!currentTurn) {
      return false
    }

    const decisionPoints = state.decisionPoints as Array<{
      position: number
      requiredField: string
      prompt: string
    }> | undefined

    if (!decisionPoints || decisionPoints.length === 0) {
      return false
    }

    try {
      const players = state.players as Record<string, Record<string, unknown>> | undefined
      const currentPlayer = players?.[currentTurn]

      if (!currentPlayer) {
        return false
      }

      const position = currentPlayer.position as number | undefined

      if (typeof position !== 'number') {
        return false
      }

      const decisionPoint = decisionPoints.find(dp => dp.position === position)
      if (!decisionPoint) {
        return false
      }

      const fieldValue = currentPlayer[decisionPoint.requiredField]
      return fieldValue === null || fieldValue === undefined
    } catch (error) {
      Logger.error('Error checking pending decisions:', error)
      return false
    }
  }

  /**
   * Automatically advances turn to next player when all effects are complete.
   * Only advances if: game is not finished, no pending decision points for current player.
   */
  private async autoAdvanceTurn(): Promise<void> {
    const state = await this.stateManager.getState()
    const game = state.game as Record<string, unknown> | undefined
    const players = state.players as Record<string, Record<string, unknown>> | undefined

    if (!game || !players) {
      return
    }

    const currentTurn = game.turn as string | undefined
    const winner = game.winner as string | undefined
    const phase = game.phase as string | undefined
    const playerOrder = game.playerOrder as string[] | undefined

    if (phase !== 'PLAYING') {
      return
    }

    if (winner) {
      Logger.info('Game has winner, not advancing turn')
      return
    }

    if (!currentTurn) {
      Logger.warn('No current turn set, cannot advance')
      return
    }

    if (!playerOrder || playerOrder.length === 0) {
      Logger.warn('No playerOrder set, cannot advance')
      return
    }

    if (this.hasPendingDecisions(state)) {
      Logger.info('⏸️ Turn advancement blocked: current player has pending decisions')
      return
    }

    try {
      const currentIndex = playerOrder.indexOf(currentTurn)
      const nextIndex = (currentIndex + 1) % playerOrder.length
      const nextPlayerId = playerOrder[nextIndex]
      const nextPlayer = players[nextPlayerId]

      Logger.info(`🔄 Auto-advancing turn: ${currentTurn} → ${nextPlayerId}`)
      await this.stateManager.set('game.turn', nextPlayerId)

      const nextPlayerName = nextPlayer?.name as string || nextPlayerId
      await this.speechService.speak(`${nextPlayerName}, es tu turno.`)
    } catch (error) {
      Logger.error('Failed to auto-advance turn:', error)
    }
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

    let executionSucceeded = false

    try {
      const context: ExecutionContext = { depth: 0, maxDepth: 5 }
      executionSucceeded = await this.processTranscript(transcript, context)

      if (context.depth === 0 && executionSucceeded) {
        await this.autoAdvanceTurn()
      }
    } finally {
      this.isProcessing = false
      Profiler.end('orchestrator.total')
      this.statusIndicator.setState('listening')
    }
  }

  private async processTranscript(
    transcript: string,
    context: ExecutionContext
  ): Promise<boolean> {
    try {
      Logger.brain(`Orchestrator processing: ${transcript} (depth: ${context.depth})`)

      const state = await this.stateManager.getState()
      Logger.state('Current state:\n' + formatStateContext(state))

      Profiler.start('orchestrator.llm')
      const actions = await this.llmClient.getActions(transcript, state)
      Profiler.end('orchestrator.llm')

      Logger.robot('LLM returned actions:', actions)

      if (actions.length === 0) {
        Logger.warn('No actions returned from LLM')
        await this.speechService.speak(t('llm.allRetriesFailed'))
        return false
      }

      Profiler.start('orchestrator.validation')
      const validation = validateActions(actions, state, this.stateManager)
      Profiler.end('orchestrator.validation')

      if (!validation.valid) {
        Logger.error('Validation failed:', validation.error)
        await this.speechService.speak(t('errors.validationFailed'))
        return false
      }

      Logger.info('Actions validated, executing...')
      Profiler.start('orchestrator.execution')
      await this.executeActions(actions, context)
      Profiler.end('orchestrator.execution')
      Logger.info('Actions executed successfully')

      await this.enforceDecisionPoints(context)

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

  private async checkAndApplyBoardMoves(path: string): Promise<void> {
    const playerPositionMatch = path.match(/^players\.(\d+)\.position$/)
    if (!playerPositionMatch) {
      return
    }

    const position = await this.stateManager.get(path) as number

    if (typeof position !== 'number') {
      return
    }

    const state = await this.stateManager.getState()
    const board = state.board as Record<string, unknown> | undefined
    const moves = board?.moves as Record<string, number> | undefined

    if (!moves) {
      return
    }

    const destination = moves[position.toString()]
    if (destination !== undefined && destination !== position) {
      const isLadder = destination > position
      const moveType = isLadder ? 'ladder' : 'snake'
      Logger.info(`🎲 Auto-applying ${moveType}: position ${position} → ${destination}`)
      await this.stateManager.set(path, destination)
    }
  }

  private async checkAndApplySquareEffects(path: string, context: ExecutionContext): Promise<void> {
    const playerPositionMatch = path.match(/^players\.(\d+)\.position$/)
    if (!playerPositionMatch) {
      return
    }

    if (context.depth >= context.maxDepth - 1) {
      Logger.warn('Skipping square effect check: max depth approaching')
      return
    }

    const position = await this.stateManager.get(path) as number

    if (typeof position !== 'number') {
      return
    }

    const state = await this.stateManager.getState()
    const board = state.board as Record<string, unknown> | undefined
    const squares = board?.squares as Record<string, Record<string, unknown>> | undefined

    if (!squares) {
      return
    }

    const squareData = squares[position.toString()]
    if (squareData && Object.keys(squareData).length > 0) {
      const squareType = squareData.type as string
      const squareName = squareData.name as string || 'unknown'

      Logger.info(`🎯 Orchestrator enforcing square effect at position ${position}: ${squareType} (${squareName})`)

      const newContext: ExecutionContext = {
        depth: context.depth + 1,
        maxDepth: context.maxDepth
      }

      const squareInfo = JSON.stringify(squareData)
      await this.processTranscript(
        `[SYSTEM: Current player just landed on square ${position}. Square data: ${squareInfo}. You MUST process this square's effect now according to game rules.]`,
        newContext
      )
    }
  }

  private async enforceDecisionPoints(context: ExecutionContext): Promise<void> {
    if (context.depth >= context.maxDepth - 1) {
      Logger.warn('Skipping decision point check: max depth approaching')
      return
    }

    const state = await this.stateManager.getState()
    const game = state.game as Record<string, unknown> | undefined
    const currentTurn = game?.turn as string | undefined

    if (!currentTurn) {
      return
    }

    const decisionPoints = state.decisionPoints as Array<{
      position: number
      requiredField: string
      prompt: string
    }> | undefined

    if (!decisionPoints || decisionPoints.length === 0) {
      return
    }

    try {
      const players = state.players as Record<string, Record<string, unknown>> | undefined
      const currentPlayer = players?.[currentTurn]

      if (!currentPlayer) {
        return
      }

      const playerName = currentPlayer.name as string || currentTurn
      const position = currentPlayer.position as number | undefined

      if (typeof position !== 'number') {
        return
      }

      const decisionPoint = decisionPoints.find(dp => dp.position === position)
      if (!decisionPoint) {
        return
      }

      const fieldValue = currentPlayer[decisionPoint.requiredField]
      if (fieldValue === null || fieldValue === undefined) {
        Logger.info(`⚠️ Orchestrator enforcing decision point for ${playerName} at position ${position}: ${decisionPoint.requiredField}`)

        const newContext: ExecutionContext = {
          depth: context.depth + 1,
          maxDepth: context.maxDepth
        }

        await this.processTranscript(
          `[SYSTEM: ${playerName} (${currentTurn}) is at position ${position} and MUST choose '${decisionPoint.requiredField}' before proceeding. Ask them: "${decisionPoint.prompt}"]`,
          newContext
        )
      }
    } catch (error) {
      Logger.error('Error enforcing decision points:', error)
    }
  }

  private async assertPlayerTurnOwnership(path: string): Promise<void> {
    const playerPathMatch = path.match(/^players\.(p\d+)\./)
    if (!playerPathMatch) {
      return
    }

    const playerId = playerPathMatch[1]
    const state = await this.stateManager.getState()
    const game = state.game as Record<string, unknown> | undefined
    const currentTurn = game?.turn as string | undefined

    if (!currentTurn) {
      return
    }

    if (playerId !== currentTurn) {
      throw new Error(
        `Turn ownership violation: Cannot modify players.${playerId} when it's ${currentTurn}'s turn. ` +
        `This should have been caught by the validator - indicates a bug in validation logic.`
      )
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
        await this.assertPlayerTurnOwnership(action.path)
        Logger.write(`Setting state: ${action.path} = ${JSON.stringify(action.value)}`)
        await this.stateManager.set(action.path, action.value)
        await this.checkAndApplyBoardMoves(action.path)
        await this.checkAndApplySquareEffects(action.path, context)
        break
      }

      case 'ADD_STATE': {
        await this.assertPlayerTurnOwnership(action.path)
        const currentValue = await this.stateManager.get(action.path)
        if (typeof currentValue !== 'number') {
          throw new Error(`Cannot ADD_STATE: ${action.path} is not a number`)
        }
        const newValue = currentValue + action.value
        Logger.write(`Adding to state: ${action.path} (${currentValue} + ${action.value} = ${newValue})`)
        await this.stateManager.set(action.path, newValue)
        await this.checkAndApplyBoardMoves(action.path)
        await this.checkAndApplySquareEffects(action.path, context)
        break
      }

      case 'SUBTRACT_STATE': {
        await this.assertPlayerTurnOwnership(action.path)
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

      case 'RESET_GAME': {
        Logger.info(`🔄 Resetting game state (keepPlayerNames: ${action.keepPlayerNames})`)

        const playerNames: Map<string, string> = new Map()
        if (action.keepPlayerNames) {
          const currentState = await this.stateManager.getState()
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

        await this.stateManager.resetState(this.initialState)
        Logger.info('State reset to initial state')

        if (action.keepPlayerNames && playerNames.size > 0) {
          const state = await this.stateManager.getState()
          const game = state.game as Record<string, unknown> | undefined
          const playerOrder = game?.playerOrder as string[] | undefined

          if (playerOrder && playerOrder.length > 0) {
            Logger.info(`Restoring ${playerNames.size} player names`)
            for (const playerId of playerOrder) {
              const savedName = playerNames.get(playerId)
              if (savedName) {
                await this.stateManager.set(`players.${playerId}.name`, savedName)
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
