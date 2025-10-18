import './style.css'
import { WakeWordDetector } from './wake-word'
import { Orchestrator } from './orchestrator/orchestrator'
import { OllamaClient } from './llm/OllamaClient'
import { StateManager } from './state-manager'
import { UIService } from './services/ui-service'
import { SpeechService } from './services/speech-service'
import { GameLoader, GameModule } from './game-loader'
import { checkBrowserSupport } from './utils/browser-support'
import { CONFIG } from './config'

class KaliApp {
  private uiService: UIService
  private speechService: SpeechService
  private wakeWordDetector: WakeWordDetector | null = null
  private orchestrator: Orchestrator | null = null
  private stateManager: StateManager | null = null
  private initialized = false
  private static instance: KaliApp | null = null

  constructor() {
    if (KaliApp.instance) {
      KaliApp.instance.dispose()
    }
    KaliApp.instance = this

    const statusElement = document.getElementById('status') as HTMLElement
    const consoleElement = document.getElementById('console') as HTMLElement
    const startButton = document.getElementById('start-button') as HTMLButtonElement
    const transcriptionElement = document.getElementById('transcription') as HTMLElement

    this.uiService = new UIService(statusElement, consoleElement, transcriptionElement, startButton)
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
      this.uiService.log('🚀 Initializing Kali...')

      checkBrowserSupport()
      await this.initializeOrchestrator()
      await this.initializeWakeWord()

      this.initialized = true
      this.uiService.hideButton()
      this.uiService.updateStatus(`Say "${CONFIG.WAKE_WORD.TEXT[0]}" to wake me up!`)
      this.uiService.log('✅ Kali is ready')

    } catch (error) {
      this.uiService.setButtonState('Start Kali', false)
      this.uiService.updateStatus('Initialization failed')
      this.uiService.log(`❌ Error: ${error}`)
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

    const currentState = await this.stateManager.getState()
    if (!this.isValidGameState(currentState, gameModule)) {
      this.uiService.log('⚠️ State schema mismatch detected, resetting state...')
      await this.stateManager.resetState(gameModule.initialState)
    }

    this.uiService.log('🤖 Configuring LLM with game rules...')
    const llmClient = new OllamaClient()
    llmClient.setGameRules(this.formatGameRules(gameModule))

    this.orchestrator = new Orchestrator(
      llmClient,
      this.stateManager,
      this.speechService
    )

    this.uiService.log('🔊 Loading sound effects...')
    await gameLoader.loadSoundEffects(gameModule, this.speechService)

    this.uiService.log('✅ Orchestrator ready')
  }

  private isValidGameState(state: Record<string, unknown>, gameModule: GameModule): boolean {
    const expectedGameName = gameModule.initialState.game as Record<string, unknown>
    const currentGame = state.game as Record<string, unknown> | undefined

    if (!currentGame) return false

    return currentGame.name === expectedGameName.name
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

    this.wakeWordDetector = new WakeWordDetector(
      () => this.handleWakeWord(),
      (text) => this.handleTranscription(text),
      (raw, processed, wakeWordDetected) => this.uiService.addTranscription(raw, processed, wakeWordDetected)
    )

    await this.wakeWordDetector.initialize((percent) => {
      this.uiService.updateStatus(`Downloading model... ${percent}%`)
    })

    await this.wakeWordDetector.startListening()
  }

  private handleWakeWord() {
    this.uiService.updateStatus('Listening for command...')
  }

  private async handleTranscription(text: string) {
    this.uiService.log(`You said: "${text}"`)

    if (this.orchestrator) {
      await this.orchestrator.handleTranscript(text)
    }

    this.uiService.updateStatus(`Say "${CONFIG.WAKE_WORD.TEXT[0]}" to wake me up!`)
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
