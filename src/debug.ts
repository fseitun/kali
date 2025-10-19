import './styles/shared.css'
import './styles/debug.css'
import './i18n'
import { t } from './i18n'
import { KaliAppCore } from './kali-app-core'
import { DebugUIService } from './services/debug-ui-service'
import { SpeechService } from './services/speech-service'
import { Logger } from './utils/logger'

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

    this.uiService = new DebugUIService(statusElement, consoleElement, startButton)
    this.speechService = new SpeechService()

    Logger.setUIService(this.uiService)

    this.core = new KaliAppCore(this.uiService, this.speechService)

    statusElement.textContent = t('ui.clickToStart')
    this.setupStartButton(startButton)
  }

  private setupStartButton(startButton: HTMLButtonElement) {
    startButton.textContent = t('ui.startKali')

    startButton.addEventListener('click', async () => {
      if (this.core.isInitialized()) return

      this.speechService.prime()
      this.uiService.setButtonState(t('ui.status.initializing'), true)
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
