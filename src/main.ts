import './style.css'
import { WakeWordDetector } from './wake-word'

class KaliApp {
  private statusElement: HTMLElement
  private consoleElement: HTMLElement
  private startButton: HTMLButtonElement
  private wakeWordDetector: WakeWordDetector | null = null
  private initialized = false
  private static instance: KaliApp | null = null

  constructor() {
    if (KaliApp.instance) {
      KaliApp.instance.dispose()
    }
    KaliApp.instance = this

    this.statusElement = document.getElementById('status')!
    this.consoleElement = document.getElementById('console')!
    this.startButton = document.getElementById('start-button')! as HTMLButtonElement

    this.setupStartButton()
  }

  private setupStartButton() {
    this.startButton.addEventListener('click', async () => {
      if (this.initialized) return

      this.startButton.disabled = true
      this.startButton.textContent = 'Initializing...'
      await this.initialize()
    })
  }

  private async initialize() {
    try {
      this.log('🚀 Initializing Kali...')

      await this.checkBrowserSupport()
      await this.initializeWakeWord()

      this.initialized = true
      this.startButton.style.display = 'none'
      this.updateStatus('Say "Kali" to wake me up!')
      this.log('✅ Kali is ready')

    } catch (error) {
      this.startButton.disabled = false
      this.startButton.textContent = 'Start Kali'
      this.updateStatus('Initialization failed')
      this.log(`❌ Error: ${error}`)
      console.error('Kali initialization error:', error)
    }
  }

  private async checkBrowserSupport() {
    const requiredAPIs = [
      { name: 'AudioContext', api: window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext },
      { name: 'MediaDevices', api: navigator.mediaDevices },
      { name: 'WebAssembly', api: window.WebAssembly },
      { name: 'IndexedDB', api: window.indexedDB }
    ]

    for (const { name, api } of requiredAPIs) {
      if (!api) {
        throw new Error(`${name} API not supported`)
      }
    }
  }


  private async initializeWakeWord() {
    this.log('🎤 Initializing speech recognition...')

    this.wakeWordDetector = new WakeWordDetector(
      () => this.handleWakeWord(),
      (text) => this.handleTranscription(text)
    )

    await this.wakeWordDetector.initialize((percent) => {
      this.updateStatus(`Downloading model... ${percent}%`)
    })

    await this.wakeWordDetector.startListening()
  }

  private handleWakeWord() {
    this.updateStatus('Listening for command...')
  }

  private handleTranscription(text: string) {
    this.log(`You said: "${text}"`)
    this.updateStatus('Say "Kali" to wake me up!')
  }

  private updateStatus(status: string) {
    this.statusElement.textContent = status
  }

  private log(message: string) {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = document.createElement('div')
    logEntry.textContent = `[${timestamp}] ${message}`
    this.consoleElement.appendChild(logEntry)
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight
  }

  private async dispose() {
    if (this.wakeWordDetector) {
      await this.wakeWordDetector.destroy()
      this.wakeWordDetector = null
    }

    this.initialized = false
    this.startButton.disabled = false
    this.startButton.textContent = 'Start Kali'
    this.updateStatus('Click "Start Kali" to begin voice interaction')
    this.consoleElement.innerHTML = ''
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
