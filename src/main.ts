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
    // Handle hot reload - dispose of existing instance
    if (KaliApp.instance) {
      KaliApp.instance.dispose()
    }
    KaliApp.instance = this

    this.statusElement = document.getElementById('status')!
    this.consoleElement = document.getElementById('console')!
    this.startButton = document.getElementById('start-button')! as HTMLButtonElement

    this.setupStartButton()

    this.log(`🔄 [${new Date().toISOString()}] KaliApp instance created`)
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
      const initTime = new Date().toISOString()
      this.log(`🚀 [${initTime}] Initializing Kali...`)

      // Check for required APIs
      await this.checkBrowserSupport()

      // Initialize wake word detector (includes audio context)
      await this.initializeWakeWord()

      this.initialized = true
      this.startButton.style.display = 'none'
      this.updateStatus('Say "Kali" to wake me up!')
      this.log(`✅ [${new Date().toISOString()}] Core initialization complete`)

    } catch (error) {
      this.startButton.disabled = false
      this.startButton.textContent = 'Start Kali'
      this.updateStatus('Initialization failed')
      const errorTime = new Date().toISOString()
      this.log(`❌ [${errorTime}] Error: ${error}`)
      console.error('Kali initialization error:', error)
    }
  }

  private async checkBrowserSupport() {
    const checkTime = new Date().toISOString()
    this.log(`🔍 [${checkTime}] Checking browser support...`)

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

    this.log(`✅ [${new Date().toISOString()}] All required APIs available`)
  }


  private async initializeWakeWord() {
    const wakeTime = new Date().toISOString()
    this.log(`🎤 [${wakeTime}] Initializing wake word detector...`)

    this.wakeWordDetector = new WakeWordDetector(() => {
      this.handleWakeWord()
    })

    await this.wakeWordDetector.initialize()
    await this.wakeWordDetector.startListening()

    this.log(`✅ [${new Date().toISOString()}] Wake word detector initialized and listening`)
  }

  private handleWakeWord() {
    const timestamp = new Date().toISOString()
    this.log(`🔥 [${timestamp}] Wake word detected! Ready for voice command...`)
    this.updateStatus('Listening for command...')

    // Debug: Show that wake word handler is triggered
    console.log(`🚨 [${timestamp}] WAKE WORD HANDLER CALLED`)

    // TODO: Start VAD and STT pipeline here
    // For now, just reset status after a delay
    setTimeout(() => {
      this.updateStatus('Say "Kali" to wake me up!')
      console.log(`⏰ [${new Date().toISOString()}] Wake word timeout - returning to listening state`)
    }, 3000)
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
    this.log(`🔄 [${new Date().toISOString()}] Disposing KaliApp instance for hot reload...`)

    // Clean up wake word detector
    if (this.wakeWordDetector) {
      await this.wakeWordDetector.destroy()
      this.wakeWordDetector = null
    }

    // Reset UI state
    this.initialized = false
    this.startButton.disabled = false
    this.startButton.textContent = 'Start Kali'
    this.updateStatus('Click "Start Kali" to begin voice interaction')

    // Clear console logs
    this.consoleElement.innerHTML = ''

    this.log(`✅ [${new Date().toISOString()}] KaliApp instance disposed`)
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

// Hot Module Replacement (HMR) support
if (import.meta.hot) {
  // Handle disposal on module invalidation
  import.meta.hot.dispose(async () => {
    const instance = KaliApp.getInstance()
    if (instance) {
      await instance.disposeForHmr()
    }
  })
}
