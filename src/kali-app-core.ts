import { WakeWordDetector } from './wake-word'
import { Orchestrator } from './orchestrator/orchestrator'
import { OllamaClient } from './llm/OllamaClient'
import { GeminiClient } from './llm/GeminiClient'
import { ILLMClient } from './llm/ILLMClient'
import { StateManager } from './state-manager'
import { IUIService } from './services/ui-service'
import { SpeechService } from './services/speech-service'
import { GameLoader, GameModule } from './game-loader'
import { NameCollector } from './orchestrator/name-collector'
import { GamePhase } from './orchestrator/types'
import { checkBrowserSupport } from './utils/browser-support'
import { CONFIG } from './config'

export class KaliAppCore {
  private wakeWordDetector: WakeWordDetector | null = null
  private orchestrator: Orchestrator | null = null
  private stateManager: StateManager | null = null
  private initialized = false
  private currentNameHandler: ((text: string) => void) | null = null

  constructor(
    private uiService: IUIService,
    private speechService: SpeechService
  ) {}

  async initialize(): Promise<void> {
    try {
      const indicator = this.uiService.getStatusIndicator()
      indicator.setState('processing')
      this.log('🚀 Initializing Kali...')

      checkBrowserSupport()
      await this.initializeOrchestrator()
      await this.initializeWakeWord()
      await this.runNameCollection()

      this.initialized = true
      this.uiService.hideButton()
      indicator.setState('listening')
      this.uiService.updateStatus(`Say "${CONFIG.WAKE_WORD.TEXT[0]}" to wake me up!`)
      this.log('✅ Kali is ready')

    } catch (error) {
      this.uiService.setButtonState('Start Kali', false)
      this.uiService.updateStatus('Initialization failed')
      this.log(`❌ Error: ${error}`)
      const indicator = this.uiService.getStatusIndicator()
      indicator.setState('idle')
    }
  }

  private async initializeOrchestrator(): Promise<void> {
    this.log('🧠 Initializing orchestrator...')

    this.log(`📦 Loading game module: ${CONFIG.GAME.DEFAULT_MODULE}...`)
    const gameLoader = new GameLoader(CONFIG.GAME.MODULES_PATH)
    const gameModule = await gameLoader.loadGame(CONFIG.GAME.DEFAULT_MODULE)
    this.log(`✅ Loaded: ${gameModule.metadata.name} v${gameModule.metadata.version}`)

    this.log('🎮 Initializing game state...')
    this.stateManager = new StateManager()
    await this.stateManager.init(gameModule.initialState)

    this.log('🔄 Resetting to fresh game state...')
    await this.stateManager.resetState(gameModule.initialState)

    this.log(`🤖 Configuring LLM (${CONFIG.LLM_PROVIDER}) with game rules...`)
    const llmClient = this.createLLMClient()
    llmClient.setGameRules(this.formatGameRules(gameModule))

    const indicator = this.uiService.getStatusIndicator()
    this.orchestrator = new Orchestrator(
      llmClient,
      this.stateManager,
      this.speechService,
      indicator
    )

    this.log('🔊 Loading sound effects...')
    await gameLoader.loadSoundEffects(gameModule, this.speechService)

    this.log('✅ Orchestrator ready')
  }

  private createLLMClient(): ILLMClient {
    switch (CONFIG.LLM_PROVIDER) {
      case 'gemini':
        return new GeminiClient()
      case 'ollama':
        return new OllamaClient()
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
    this.log('🎤 Initializing speech recognition...')
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

  private async runNameCollection(): Promise<void> {
    if (!this.stateManager || !this.wakeWordDetector) {
      throw new Error('Cannot run name collection: components not initialized')
    }

    try {
      const state = await this.stateManager.getState()
      const game = state.game as Record<string, unknown> | undefined

      this.log(`🎮 Name collection check - phase: ${game?.phase} (expected: ${GamePhase.SETUP})`)

      if (game?.phase !== GamePhase.SETUP) {
        this.log('⏭️ Skipping name collection - not in SETUP phase')
        return
      }

      this.log('👋 Starting name collection...')
      const gameName = (game.name as string) || 'the game'
      const nameCollector = new NameCollector(this.speechService, this.stateManager, gameName)

      this.wakeWordDetector.enableDirectTranscription()

      await nameCollector.collectNames((handler) => {
        this.currentNameHandler = handler
      })

      this.currentNameHandler = null
      this.wakeWordDetector.disableDirectTranscription()
      this.log('✅ Name collection complete')
    } catch (error) {
      this.log(`❌ Name collection failed: ${error}`)
      this.currentNameHandler = null
      if (this.wakeWordDetector) {
        this.wakeWordDetector.disableDirectTranscription()
      }
      throw error
    }
  }

  private handleWakeWord(): void {
    this.uiService.updateStatus('Listening for command...')
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('listening')
  }

  private async handleTranscription(text: string): Promise<void> {
    this.log(`You said: "${text}"`)

    if (this.currentNameHandler) {
      this.currentNameHandler(text)
      return
    }

    if (this.orchestrator) {
      await this.orchestrator.handleTranscript(text)
    }

    this.uiService.updateStatus(`Say "${CONFIG.WAKE_WORD.TEXT[0]}" to wake me up!`)
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('listening')
  }

  async dispose(): Promise<void> {
    if (this.wakeWordDetector) {
      await this.wakeWordDetector.destroy()
      this.wakeWordDetector = null
    }

    this.orchestrator = null
    this.stateManager = null

    this.initialized = false
    this.uiService.setButtonState('Start Kali', false)
    this.uiService.showButton()
    this.uiService.updateStatus('Click "Start Kali" to begin voice interaction')
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('idle')
    this.uiService.clearConsole()
  }

  isInitialized(): boolean {
    return this.initialized
  }

  private log(message: string): void {
    this.uiService.log(message)
  }
}
