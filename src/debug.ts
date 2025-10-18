import './style.css'
import './components/debug-ui.css'
import { KaliAppCore } from './kali-app-core'
import { DebugUIService } from './services/debug-ui-service'
import { SpeechService } from './services/speech-service'

class KaliDebugApp {
  private core: KaliAppCore
  private uiService: DebugUIService
  private speechService: SpeechService
  private static instance: KaliDebugApp | null = null

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

    this.core = new KaliAppCore(this.uiService, this.speechService)

    this.setupStartButton(startButton)
  }

  private setupStartButton(startButton: HTMLButtonElement) {
    startButton.addEventListener('click', async () => {
      if (this.core.isInitialized()) return

      this.speechService.prime()
      this.uiService.setButtonState('Initializing...', true)
      await this.core.initialize()
    })
  }

  private async dispose() {
    await this.core.dispose()
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
