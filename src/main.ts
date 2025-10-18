import './style.css'
import { WakeWordDetector } from './wake-word'
import { Orchestrator } from './orchestrator/orchestrator'
import { OllamaClient } from './llm/OllamaClient'
import { GeminiClient } from './llm/GeminiClient'
import { ILLMClient } from './llm/ILLMClient'
import { StateManager } from './state-manager'
import { ProductionUIService } from './services/production-ui-service'
import { SpeechService } from './services/speech-service'
import { GameLoader, GameModule } from './game-loader'
import { NameCollector } from './orchestrator/name-collector'
import { GamePhase } from './orchestrator/types'
import { checkBrowserSupport } from './utils/browser-support'
import { CONFIG } from './config'

class KaliApp {
  private uiService: ProductionUIService
  private speechService: SpeechService
  private wakeWordDetector: WakeWordDetector | null = null
  private orchestrator: Orchestrator | null = null
  private stateManager: StateManager | null = null
  private initialized = false
  private static instance: KaliApp | null = null
  private currentNameHandler: ((text: string) => void) | null = null

  constructor() {
    if (KaliApp.instance) {
      KaliApp.instance.dispose()
    }
    KaliApp.instance = this

    const startButton = document.getElementById('start-button') as HTMLButtonElement

    this.uiService = new ProductionUIService(startButton)
    this.speechService = new SpeechService()

    this.setupStartButton(startButton)
  }

  private setupStartButton(startButton: HTMLButtonElement) {
    startButton.addEventListener('click', async () => {
      if (this.initialized) return

      this.speechService.prime()
      this.uiService.setButtonState('Initializing...', true)
      await this.initialize()
    })
  }

  private async initialize() {
    try {
      const indicator = this.uiService.getStatusIndicator()
      indicator.setState('processing')

      checkBrowserSupport()
      await this.initializeOrchestrator()
      await this.initializeWakeWord()
      await this.runNameCollection()

      this.initialized = true
      this.uiService.hideButton()
      indicator.setState('listening')

    } catch (error) {
      this.uiService.setButtonState('Start Kali', false)
      const indicator = this.uiService.getStatusIndicator()
      indicator.setState('idle')
      console.error('Initialization failed:', error)
    }
  }


  private async initializeOrchestrator() {
    const gameLoader = new GameLoader(CONFIG.GAME.MODULES_PATH)
    const gameModule = await gameLoader.loadGame(CONFIG.GAME.DEFAULT_MODULE)

    this.stateManager = new StateManager()
    await this.stateManager.init(gameModule.initialState)

    await this.stateManager.resetState(gameModule.initialState)

    const llmClient = this.createLLMClient()
    llmClient.setGameRules(this.formatGameRules(gameModule))

    const indicator = this.uiService.getStatusIndicator()
    this.orchestrator = new Orchestrator(
      llmClient,
      this.stateManager,
      this.speechService,
      indicator
    )

    await gameLoader.loadSoundEffects(gameModule, this.speechService)
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

  private async initializeWakeWord() {
    const indicator = this.uiService.getStatusIndicator()

    this.wakeWordDetector = new WakeWordDetector(
      () => this.handleWakeWord(),
      (text) => this.handleTranscription(text),
      (raw, processed, wakeWordDetected) => this.uiService.addTranscription(raw, processed, wakeWordDetected)
    )

    await this.wakeWordDetector.initialize()
    await this.wakeWordDetector.startListening()
    indicator.setState('listening')
  }

  private async runNameCollection() {
    if (!this.stateManager || !this.wakeWordDetector) {
      throw new Error('Cannot run name collection: components not initialized')
    }

    try {
      const state = await this.stateManager.getState()
      const game = state.game as Record<string, unknown> | undefined

      console.log('🎮 Name collection check - phase:', game?.phase, 'expected:', GamePhase.SETUP)

      if (game?.phase !== GamePhase.SETUP) {
        console.log('⏭️ Skipping name collection - not in SETUP phase')
        return
      }

      console.log('👋 Starting name collection...')
      const gameName = (game.name as string) || 'the game'
      const nameCollector = new NameCollector(this.speechService, this.stateManager, gameName)

      this.wakeWordDetector.enableDirectTranscription()

      await nameCollector.collectNames((handler) => {
        this.currentNameHandler = handler
      })

      this.currentNameHandler = null
      this.wakeWordDetector.disableDirectTranscription()
      console.log('✅ Name collection complete')
    } catch (error) {
      console.error('❌ Name collection failed:', error)
      this.currentNameHandler = null
      if (this.wakeWordDetector) {
        this.wakeWordDetector.disableDirectTranscription()
      }
      throw error
    }
  }

  private handleWakeWord() {
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('listening')
  }

  private async handleTranscription(text: string) {
    if (this.currentNameHandler) {
      this.currentNameHandler(text)
      return
    }

    if (this.orchestrator) {
      await this.orchestrator.handleTranscript(text)
    }

    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('listening')
  }

  private async dispose() {
    if (this.wakeWordDetector) {
      await this.wakeWordDetector.destroy()
      this.wakeWordDetector = null
    }

    this.orchestrator = null
    this.stateManager = null

    this.initialized = false
    this.uiService.setButtonState('Start Kali', false)
    this.uiService.showButton()
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('idle')
    this.uiService.clearConsole()
  }

  // Public methods for HMR access
  public static getInstance(): KaliApp | null {
    return KaliApp.instance
  }

  public async disposeForHmr(): Promise<void> {
    await this.dispose()
    KaliApp.instance = null
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new KaliApp()
})

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    const instance = KaliApp.getInstance()
    if (instance) {
      await instance.disposeForHmr()
    }
  })
}
