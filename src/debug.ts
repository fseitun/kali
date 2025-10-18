import './style.css'
import './components/debug-ui.css'
import { WakeWordDetector } from './wake-word'
import { Orchestrator } from './orchestrator/orchestrator'
import { OllamaClient } from './llm/OllamaClient'
import { GeminiClient } from './llm/GeminiClient'
import { ILLMClient } from './llm/ILLMClient'
import { StateManager } from './state-manager'
import { DebugUIService } from './services/debug-ui-service'
import { SpeechService } from './services/speech-service'
import { GameLoader, GameModule } from './game-loader'
import { NameCollector } from './orchestrator/name-collector'
import { GamePhase } from './orchestrator/types'
import { checkBrowserSupport } from './utils/browser-support'
import { CONFIG } from './config'

class KaliDebugApp {
  private uiService: DebugUIService
  private speechService: SpeechService
  private wakeWordDetector: WakeWordDetector | null = null
  private orchestrator: Orchestrator | null = null
  private stateManager: StateManager | null = null
  private initialized = false
  private static instance: KaliDebugApp | null = null
  private currentNameHandler: ((text: string) => void) | null = null

  constructor() {
    if (KaliDebugApp.instance) {
      KaliDebugApp.instance.dispose()
    }
    KaliDebugApp.instance = this

    const statusElement = document.getElementById('status') as HTMLElement
    const consoleElement = document.getElementById('console') as HTMLElement
    const startButton = document.getElementById('start-button') as HTMLButtonElement
    const transcriptionElement = document.getElementById('transcription') as HTMLElement

    this.uiService = new DebugUIService(statusElement, consoleElement, transcriptionElement, startButton)
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
      this.uiService.log('🚀 Initializing Kali...')

      checkBrowserSupport()
      await this.initializeOrchestrator()
      await this.initializeWakeWord()
      await this.runNameCollection()

      this.initialized = true
      this.uiService.hideButton()
      indicator.setState('listening')
      this.uiService.updateStatus(`Say "${CONFIG.WAKE_WORD.TEXT[0]}" to wake me up!`)
      this.uiService.log('✅ Kali is ready')

    } catch (error) {
      this.uiService.setButtonState('Start Kali', false)
      this.uiService.updateStatus('Initialization failed')
      this.uiService.log(`❌ Error: ${error}`)
      const indicator = this.uiService.getStatusIndicator()
      indicator.setState('idle')
    }
  }

  private async initializeOrchestrator() {
    this.uiService.log('🧠 Initializing orchestrator...')

    this.uiService.log(`📦 Loading game module: ${CONFIG.GAME.DEFAULT_MODULE}...`)
    const gameLoader = new GameLoader(CONFIG.GAME.MODULES_PATH)
    const gameModule = await gameLoader.loadGame(CONFIG.GAME.DEFAULT_MODULE)
    this.uiService.log(`✅ Loaded: ${gameModule.metadata.name} v${gameModule.metadata.version}`)

    this.uiService.log('🎮 Initializing game state...')
    this.stateManager = new StateManager()
    await this.stateManager.init(gameModule.initialState)

    this.uiService.log('🔄 Resetting to fresh game state...')
    await this.stateManager.resetState(gameModule.initialState)

    this.uiService.log(`🤖 Configuring LLM (${CONFIG.LLM_PROVIDER}) with game rules...`)
    const llmClient = this.createLLMClient()
    llmClient.setGameRules(this.formatGameRules(gameModule))

    const indicator = this.uiService.getStatusIndicator()
    this.orchestrator = new Orchestrator(
      llmClient,
      this.stateManager,
      this.speechService,
      indicator
    )

    this.uiService.log('🔊 Loading sound effects...')
    await gameLoader.loadSoundEffects(gameModule, this.speechService)

    this.uiService.log('✅ Orchestrator ready')
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
    this.uiService.log('🎤 Initializing speech recognition...')
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

  private async runNameCollection() {
    if (!this.stateManager || !this.wakeWordDetector) {
      throw new Error('Cannot run name collection: components not initialized')
    }

    try {
      const state = await this.stateManager.getState()
      const game = state.game as Record<string, unknown> | undefined

      this.uiService.log(`🎮 Name collection check - phase: ${game?.phase} (expected: ${GamePhase.SETUP})`)

      if (game?.phase !== GamePhase.SETUP) {
        this.uiService.log('⏭️ Skipping name collection - not in SETUP phase')
        return
      }

      this.uiService.log('👋 Starting name collection...')
      const gameName = (game.name as string) || 'the game'
      const nameCollector = new NameCollector(this.speechService, this.stateManager, gameName)

      this.wakeWordDetector.enableDirectTranscription()

      await nameCollector.collectNames((handler) => {
        this.currentNameHandler = handler
      })

      this.currentNameHandler = null
      this.wakeWordDetector.disableDirectTranscription()
      this.uiService.log('✅ Name collection complete')
    } catch (error) {
      this.uiService.log(`❌ Name collection failed: ${error}`)
      this.currentNameHandler = null
      if (this.wakeWordDetector) {
        this.wakeWordDetector.disableDirectTranscription()
      }
      throw error
    }
  }

  private handleWakeWord() {
    this.uiService.updateStatus('Listening for command...')
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('listening')
  }

  private async handleTranscription(text: string) {
    this.uiService.log(`You said: "${text}"`)

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
    this.uiService.updateStatus('Click "Start Kali" to begin voice interaction')
    const indicator = this.uiService.getStatusIndicator()
    indicator.setState('idle')
    this.uiService.clearConsole()
  }

  public static getInstance(): KaliDebugApp | null {
    return KaliDebugApp.instance
  }

  public async disposeForHmr(): Promise<void> {
    await this.dispose()
    KaliDebugApp.instance = null
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new KaliDebugApp()
})

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    const instance = KaliDebugApp.getInstance()
    if (instance) {
      await instance.disposeForHmr()
    }
  })
}
