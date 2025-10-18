import { createModel, VoskModel, VoskRecognizer, VoskResultMessage, VoskPartialResultMessage, RecognitionResult } from 'vosk-browser'
import { ModelManager } from './model-manager'
import { CONFIG } from './config'
import { Logger } from './utils/logger'
import { isMobileDevice } from './utils/browser-support'

interface ExtendedMediaTrackConstraints extends MediaTrackConstraints {
  sampleRate?: number
}

enum DetectorState {
  LISTENING_FOR_WAKE_WORD = 'LISTENING_FOR_WAKE_WORD',
  TRANSCRIBING = 'TRANSCRIBING'
}

export class WakeWordDetector {
  private model: VoskModel | null = null
  private recognizer: VoskRecognizer | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private workletNode: AudioWorkletNode | null = null
  private isListening = false
  private isMobile: boolean
  private state: DetectorState = DetectorState.LISTENING_FOR_WAKE_WORD
  private transcriptionTimeout: number | null = null

  constructor(
    private onWakeWord: () => void,
    private onTranscription: (text: string) => void,
    private onRawTranscription?: (raw: string, processed: string, wakeWordDetected: boolean) => void
  ) {
    this.isMobile = isMobileDevice()
  }

  async initialize(onProgress?: (percent: number) => void) {
    try {
      Logger.mic('Initializing Vosk speech recognition...')

      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioContext = new AudioContextClass()

      await this.audioContext.audioWorklet.addModule(
        new URL('./audio-worklet/vosk-processor.js', import.meta.url)
      )

      Logger.download('Loading Vosk model...')
      const modelManager = ModelManager.getInstance()
      const modelUrl = await modelManager.getModel(onProgress)

      this.model = await createModel(modelUrl)
      Logger.info('Vosk model loaded')

      this.recognizer = new this.model.KaldiRecognizer(CONFIG.AUDIO.SAMPLE_RATE)
      this.recognizer.setWords(true)

      this.recognizer.on('result', (message: VoskResultMessage) => {
        this.handleResult(message.result, false)
      })

      this.recognizer.on('partialresult', (message: VoskPartialResultMessage) => {
        this.handleResult(message.result, true)
      })

      this.recognizer.on('error', (error: Error) => {
        Logger.error('Recognition error:', error)
      })

      Logger.info('Wake word detector ready')

    } catch (error) {
      Logger.error('Failed to initialize wake word detector:', error)
      throw error
    }
  }

  async startListening() {
    if (!this.model || !this.recognizer || !this.audioContext) {
      throw new Error('Wake word detector not initialized')
    }

    try {
      Logger.headphones('Starting microphone...')

      const audioConstraints: ExtendedMediaTrackConstraints = {
        channelCount: CONFIG.AUDIO.CHANNEL_COUNT,
        echoCancellation: CONFIG.AUDIO.ECHO_CANCELLATION,
        noiseSuppression: CONFIG.AUDIO.NOISE_SUPPRESSION
      }

      if (this.isMobile) {
        audioConstraints.sampleRate = CONFIG.AUDIO.SAMPLE_RATE
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })

      this.workletNode = new AudioWorkletNode(this.audioContext, CONFIG.AUDIO.WORKLET_PROCESSOR_NAME)

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audioData') {
          this.processAudioData(event.data.data)
        }
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      source.connect(this.workletNode)

      this.workletNode.port.postMessage({ type: 'start' })

      this.isListening = true
      this.state = DetectorState.LISTENING_FOR_WAKE_WORD
      Logger.listening(`Listening for wake word "${CONFIG.WAKE_WORD.TEXT[0]}"`)

    } catch (error) {
      Logger.error('Failed to start listening:', error)
      throw error
    }
  }

  private processAudioData(pcm16: Int16Array) {
    if (!this.recognizer || !this.isListening) return

    if (!pcm16 || pcm16.length === 0) return

    let hasNonZeroSamples = false
    for (let i = 0; i < pcm16.length; i++) {
      if (pcm16[i] !== 0) {
        hasNonZeroSamples = true
        break
      }
    }

    if (!hasNonZeroSamples) return

    try {
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0
      }

      this.recognizer.acceptWaveformFloat(float32, CONFIG.AUDIO.SAMPLE_RATE)
    } catch (error) {
      Logger.error('Error processing audio:', error)
    }
  }

  private handleResult(result: RecognitionResult, isPartial: boolean) {
    const text = result.text || result.partial || ''
    if (!text.trim()) return

    const lowerText = text.toLowerCase()

    if (this.state === DetectorState.LISTENING_FOR_WAKE_WORD) {
      const wakeWordDetected = CONFIG.WAKE_WORD.TEXT.some(word => lowerText.includes(word))

      if (this.onRawTranscription) {
        this.onRawTranscription(text, wakeWordDetected ? text : '...', wakeWordDetected)
      }

      if (wakeWordDetected) {
        Logger.wakeWord('Wake word detected!')
        this.state = DetectorState.TRANSCRIBING
        this.onWakeWord()
        this.startTranscriptionTimeout()
      }
    } else if (this.state === DetectorState.TRANSCRIBING) {
      if (!isPartial && text.trim()) {
        Logger.transcription(`Transcription: "${text}"`)
        if (this.onRawTranscription) {
          this.onRawTranscription(text, text, true)
        }
        this.onTranscription(text)
        this.resetToWakeWordMode()
      }
    }
  }

  private startTranscriptionTimeout() {
    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout)
    }

    this.transcriptionTimeout = window.setTimeout(() => {
      Logger.timeout('Transcription timeout')
      this.resetToWakeWordMode()
    }, CONFIG.WAKE_WORD.TRANSCRIPTION_TIMEOUT_MS)
  }

  private resetToWakeWordMode() {
    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout)
      this.transcriptionTimeout = null
    }
    this.state = DetectorState.LISTENING_FOR_WAKE_WORD
    Logger.listening(`Listening for wake word "${CONFIG.WAKE_WORD.TEXT[0]}"...`)
  }

  async stopListening() {
    try {
      if (this.transcriptionTimeout) {
        clearTimeout(this.transcriptionTimeout)
        this.transcriptionTimeout = null
      }

      if (this.workletNode) {
        this.workletNode.port.postMessage({ type: 'stop' })
        this.workletNode.disconnect()
        this.workletNode = null
      }

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop())
        this.mediaStream = null
      }

      this.isListening = false
      Logger.stop('Stopped listening')

    } catch (error) {
      Logger.error('Failed to stop listening:', error)
    }
  }

  isActive(): boolean {
    return this.isListening
  }

  async destroy() {
    await this.stopListening()

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    if (this.recognizer) {
      this.recognizer.remove()
      this.recognizer = null
    }

    if (this.model) {
      this.model.terminate()
      this.model = null
    }
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {})
}
