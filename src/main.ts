import './style.css'
import { WakeWordDetector } from './wake-word'
import { Orchestrator } from './orchestrator/orchestrator'
import { OllamaClient } from './llm/OllamaClient'
import { StateManager } from './state-manager'
import { UIService } from './services/ui-service'
import { SpeechService } from './services/speech-service'
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

    this.stateManager = new StateManager()
    await this.stateManager.init()

    const llmClient = new OllamaClient()
    this.orchestrator = new Orchestrator(
      llmClient,
      this.stateManager,
      (text) => this.speechService.speak(text)
    )

    this.uiService.log('✅ Orchestrator ready')
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
