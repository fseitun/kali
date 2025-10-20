import { WakeWordDetector } from './wake-word'
import { Orchestrator } from './orchestrator/orchestrator'
import { OllamaClient } from './llm/OllamaClient'
import { GeminiClient } from './llm/GeminiClient'
import { MockLLMClient } from './llm/MockLLMClient'
import { LLMClient } from './llm/LLMClient'
import { StateManager } from './state-manager'
import { IUIService } from './services/ui-service'
import { SpeechService } from './services/speech-service'
import { GameLoader, GameModule } from './game-loader'
import { NameCollector } from './orchestrator/name-collector'
import { GamePhase, PrimitiveAction } from './orchestrator/types'
import { checkBrowserSupport } from './utils/browser-support'
import { validateConfig } from './utils/config-validator'
import { CONFIG } from './config'
import { Logger } from './utils/logger'
import { t } from './i18n'

export class KaliAppCore {
  private wakeWordDetector: WakeWordDetector | null = null
  private orchestrator: Orchestrator | null = null
  private stateManager: StateManager | null = null
  private llmClient: LLMClient | null = null
  private gameModule: GameModule | null = null
  private initialized = false
  private currentNameHandler: ((text: string) => void) | null = null

  constructor(
    private uiService: IUIService,
    private speechService: SpeechService
  ) {}

  async initialize(): Promise<void> {
    try {
      validateConfig()

      const indicator = this.uiService.getStatusIndicator()
      indicator.setState('processing')
      Logger.info('🚀 Initializing Kali...')

      checkBrowserSupport()
      await this.initializeOrchestrator()
      await this.initializeWakeWord()

      const shouldStartGame = await this.handleSavedGameOrSetup()

      this.initialized = true
      this.uiService.hideButton()
      indicator.setState('listening')

      if (shouldStartGame) {
        this.uiService.updateStatus(t('ui.wakeWordReady', { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }))
        Logger.info('Kali is ready')
        await this.proactiveGameStart()
      } else {
        if (this.stateManager) {
          const state = await this.stateManager.getState()
          const game = state.game as Record<string, unknown> | undefined
          if (game?.phase === GamePhase.PLAYING) {
            const message = t('ui.savedGameDetected', { wakeWord: CONFIG.WAKE_WORD.TEXT[0] })
            this.uiService.updateStatus(message)
            await this.speechService.speak(message)
          } else {
            this.uiService.updateStatus(t('ui.wakeWordReady', { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }))
          }
        } else {
          this.uiService.updateStatus(t('ui.wakeWordReady', { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }))
        }
        Logger.info('Kali is ready')
      }

    } catch (error) {
      this.uiService.setButtonState(t('ui.startKali'), false)
      this.uiService.updateStatus(t('ui.initializationFailed'))
      Logger.error(`Error: ${error}`)
      const indicator = this.uiService.getStatusIndicator()
      indicator.setState('idle')
    }
  }

  private async initializeOrchestrator(): Promise<void> {
    Logger.brain('Initializing orchestrator...')

    Logger.info(`📦 Loading game module: ${CONFIG.GAME.DEFAULT_MODULE}...`)
    const gameLoader = new GameLoader(CONFIG.GAME.MODULES_PATH)
    this.gameModule = await gameLoader.loadGame(CONFIG.GAME.DEFAULT_MODULE)

    Logger.info('🎮 Initializing game state...')
    this.stateManager = new StateManager()
    await this.stateManager.init(this.gameModule.initialState)

    if (this.gameModule.stateDisplay) {
      await this.stateManager.set('stateDisplay', this.gameModule.stateDisplay)
    }

    Logger.robot(`Configuring LLM (${CONFIG.LLM_PROVIDER}) with game rules...`)
    this.llmClient = this.createLLMClient()
    this.llmClient.setGameRules(this.formatGameRules(this.gameModule))

    const indicator = this.uiService.getStatusIndicator()
    this.orchestrator = new Orchestrator(
      this.llmClient,
      this.stateManager,
      this.speechService,
      indicator,
      this.gameModule.initialState
    )

    Logger.info('🔊 Loading sound effects...')
    await gameLoader.loadSoundEffects(this.gameModule, this.speechService)

    Logger.info('Orchestrator ready')
  }

  private createLLMClient(): LLMClient {
    switch (CONFIG.LLM_PROVIDER) {
      case 'gemini':
        return new GeminiClient()
      case 'ollama':
        return new OllamaClient()
      case 'mock':
        return new MockLLMClient(CONFIG.MOCK_SCENARIO)
      default:
        throw new Error(`Unknown LLM provider: ${CONFIG.LLM_PROVIDER}`)
    }
  }

  private formatGameRules(gameModule: GameModule): string {
    const { rules, metadata } = gameModule

    return `
## ${metadata.name} Rules

You are moderating a game of ${metadata.name}.

**Objective:** ${rules.objective}

**Mechanics:** ${rules.mechanics}

**Turn Structure:**
${rules.turnStructure}

**Board Layout:**
${rules.boardLayout}

**Example Sequences:**
${rules.examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}
`
  }

  private async initializeWakeWord(): Promise<void> {
    Logger.mic('Initializing speech recognition...')
    const indicator = this.uiService.getStatusIndicator()

    this.wakeWordDetector = new WakeWordDetector(
      () => this.handleWakeWord(),
      (text) => this.handleTranscription(text),
      (raw, processed, wakeWordDetected) => this.uiService.addTranscription(raw, processed, wakeWordDetected)
    )

    await this.wakeWordDetector.initialize((percent) => {
      this.uiService.updateStatus(`Downloading model... ${percent}%`)
    })

    await this.wakeWordDetector.startListening()
    indicator.setState('listening')
  }

  private async handleSavedGameOrSetup(): Promise<boolean> {
    if (!this.stateManager || !this.gameModule || !this.orchestrator) {
      throw new Error('Cannot handle saved game: components not initialized')
    }

    try {
      const state = await this.stateManager.getState()
      const game = state.game as Record<string, unknown> | undefined

      Logger.info(`🎮 Startup phase check - phase: ${game?.phase}`)

      if (game?.phase === GamePhase.PLAYING) {
        Logger.info('📂 Saved game detected - waiting for user command')
        return false
      } else if (game?.phase === GamePhase.SETUP) {
        Logger.info('👋 Starting name collection...')
        await this.runNameCollection()
        return true
      }

      Logger.info('⏭️ No action needed')
      return false
    } catch (error) {
      Logger.error(`Error handling saved game: ${error}. Starting fresh.`)
      await this.stateManager.resetState(this.gameModule.initialState)
      await this.runNameCollection()
      return true
    }
  }

  private async proactiveGameStart(): Promise<void> {
    if (!this.orchestrator) {
      Logger.error('Cannot start game proactively: orchestrator not initialized')
      return
    }

    Logger.info('🎮 Starting game proactively')
    await this.orchestrator.handleTranscript('Start the game and explain the current situation')
  }

  private async runNameCollection(): Promise<void> {
    if (!this.stateManager || !this.wakeWordDetector || !this.gameModule) {
      throw new Error('Cannot run name collection: components not initialized')
    }

    try {
      const state = await this.stateManager.getState()
      const game = state.game as Record<string, unknown> | undefined

      Logger.info(`🎮 Name collection check - phase: ${game?.phase} (expected: ${GamePhase.SETUP})`)

      if (game?.phase !== GamePhase.SETUP) {
        Logger.info('⏭️ Skipping name collection - not in SETUP phase')
        return
      }

      this.uiService.updateStatus(t('ui.wakeWordInstruction', { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }))
      const gameName = (game.name as string) || 'the game'
      const nameCollector = new NameCollector(
        this.speechService,
        this.stateManager,
        gameName,
        () => this.wakeWordDetector!.enableDirectTranscription(),
        this.llmClient!,
        this.gameModule.metadata
      )

      await nameCollector.collectNames((handler) => {
        this.currentNameHandler = handler
      })

      this.currentNameHandler = null
      this.wakeWordDetector.disableDirectTranscription()
      Logger.info('Name collection complete')
    } catch (error) {
      Logger.error(`Name collection failed: ${error}`)
      this.currentNameHandler = null
      if (this.wakeWordDetector) {
        this.wakeWordDetector.disableDirectTranscription()
      }
      throw error
    }
  }

  private handleWakeWord(): void {
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('active')

    if (this.currentNameHandler) {
      this.uiService.updateStatus(t('ui.wakeWordInstruction', { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }))
    } else {
      this.uiService.updateStatus(t('ui.listeningForCommand'))
    }
  }

  private async handleTranscription(text: string): Promise<void> {
    Logger.info(`You said: "${text}"`)

    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('listening')

    if (this.currentNameHandler) {
      this.currentNameHandler(text)
      return
    }

    if (this.orchestrator) {
      await this.orchestrator.handleTranscript(text)

      if (this.stateManager) {
        const state = await this.stateManager.getState()
        const game = state.game as Record<string, unknown> | undefined

        if (game?.phase === GamePhase.SETUP) {
          const players = state.players as Array<{ name: string }> | undefined
          const hasNames = players && players.length > 0 && players.every(p => p.name && p.name.trim() !== '')

          if (hasNames) {
            Logger.info('🔄 Phase is SETUP but players have names, transitioning to PLAYING')
            await this.stateManager.set('game.phase', GamePhase.PLAYING)
          } else {
            Logger.info('🔄 Phase is SETUP after command, triggering name collection')
            await this.runNameCollection()
            return
          }
        }
      }
    }

    this.uiService.updateStatus(t('ui.wakeWordReady', { wakeWord: CONFIG.WAKE_WORD.TEXT[0] }))
  }

  async dispose(): Promise<void> {
    if (this.wakeWordDetector) {
      await this.wakeWordDetector.destroy()
      this.wakeWordDetector = null
    }

    this.orchestrator = null
    this.stateManager = null

    this.initialized = false
    this.uiService.setButtonState(t('ui.startKali'), false)
    this.uiService.showButton()
    this.uiService.updateStatus(t('ui.clickToStart'))
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('idle')
    this.uiService.clearConsole()
  }

  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Test-only: Execute actions directly without LLM interpretation.
   * Only available when orchestrator is initialized.
   * @param actions - Array of primitive actions to validate and execute
   * @returns true if execution succeeded, false otherwise
   */
  async testExecuteActions(actions: PrimitiveAction[]): Promise<boolean> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized')
    }
    return await this.orchestrator.testExecuteActions(actions)
  }

  /**
   * Debug-only: Skip name collection and force game to PLAYING phase with default players.
   * Useful for testing without waiting through name collection timeouts.
   */
  async skipToPlaying(): Promise<void> {
    if (!this.stateManager || !this.gameModule) {
      throw new Error('Cannot skip to playing: core components not initialized')
    }

    Logger.info('🚀 Skipping to PLAYING phase with default players')

    // Create default players
    const defaultPlayers = {
      p1: {
        id: 'p1',
        name: 'Player 1',
        position: 0,
        hearts: 0,
        points: 0,
        items: [],
        instruments: [],
        bonusDiceNextTurn: false,
        pathChoice: null,
        skipTurns: 0,
        inverseMode: false
      },
      p2: {
        id: 'p2',
        name: 'Player 2',
        position: 0,
        hearts: 0,
        points: 0,
        items: [],
        instruments: [],
        bonusDiceNextTurn: false,
        pathChoice: null,
        skipTurns: 0,
        inverseMode: false
      }
    }

    await this.stateManager.set('players', defaultPlayers)
    await this.stateManager.set('game.playerOrder', ['p1', 'p2'])
    await this.stateManager.set('game.turn', 'p1')
    await this.stateManager.set('game.phase', GamePhase.PLAYING)

    Logger.info('✅ Skipped to PLAYING phase')
    await this.speechService.speak('Ready to play!')
  }
}
