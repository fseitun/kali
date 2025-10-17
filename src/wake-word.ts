import { createModel, VoskModel, VoskRecognizer, VoskResultMessage, VoskPartialResultMessage, RecognitionResult } from 'vosk-browser'
import { ModelManager } from './model-manager'

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
  private isMobile = false
  private state: DetectorState = DetectorState.LISTENING_FOR_WAKE_WORD
  private transcriptionTimeout: number | null = null
  private readonly TRANSCRIPTION_TIMEOUT_MS = 5000

  constructor(
    private onWakeWord: () => void,
    private onTranscription: (text: string) => void,
    private onRawTranscription?: (raw: string, processed: string, wakeWordDetected: boolean) => void
  ) {
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  async initialize(onProgress?: (percent: number) => void) {
    try {
      console.log('🎤 Initializing Vosk speech recognition...')

      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioContext = new AudioContextClass()

      await this.audioContext.audioWorklet.addModule(
        new URL('./audio-worklet/vosk-processor.js', import.meta.url)
      )

      console.log('📥 Loading Vosk model...')
      const modelManager = ModelManager.getInstance()
      const modelUrl = await modelManager.getModel(onProgress)

      this.model = await createModel(modelUrl)
      console.log('✅ Vosk model loaded')

      this.recognizer = new this.model.KaldiRecognizer(16000)
      this.recognizer.setWords(true)

      this.recognizer.on('result', (message: VoskResultMessage) => {
        this.handleResult(message.result, false)
      })

      this.recognizer.on('partialresult', (message: VoskPartialResultMessage) => {
        this.handleResult(message.result, true)
      })

      this.recognizer.on('error', (error: Error) => {
        console.error('Recognition error:', error)
      })

      console.log('✅ Wake word detector ready')

    } catch (error) {
      console.error('Failed to initialize wake word detector:', error)
      throw error
    }
  }

  async startListening() {
    if (!this.model || !this.recognizer || !this.audioContext) {
      throw new Error('Wake word detector not initialized')
    }

    try {
      console.log('🎧 Starting microphone...')

      const audioConstraints: ExtendedMediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }

      if (this.isMobile) {
        audioConstraints.sampleRate = 16000
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })

      this.workletNode = new AudioWorkletNode(this.audioContext, 'vosk-audio-processor')

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
      console.log('✅ Listening for wake word "zookeeper"')

    } catch (error) {
      console.error('Failed to start listening:', error)
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

      this.recognizer.acceptWaveformFloat(float32, 16000)
    } catch (error) {
      console.error('Error processing audio:', error)
    }
  }

  private handleResult(result: RecognitionResult, isPartial: boolean) {
    const text = result.text || result.partial || ''
    if (!text.trim()) return

    const lowerText = text.toLowerCase()

    if (this.state === DetectorState.LISTENING_FOR_WAKE_WORD) {
      const wakeWordDetected = lowerText.includes('zookeeper') || lowerText.includes('zoo keeper')

      if (this.onRawTranscription) {
        this.onRawTranscription(text, wakeWordDetected ? text : '...', wakeWordDetected)
      }

      if (wakeWordDetected) {
        console.log('🔥 Wake word detected!')
        this.state = DetectorState.TRANSCRIBING
        this.onWakeWord()
        this.startTranscriptionTimeout()
      }
    } else if (this.state === DetectorState.TRANSCRIBING) {
      if (!isPartial && text.trim()) {
        console.log(`📝 Transcription: "${text}"`)
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
      console.log('⏱️ Transcription timeout')
      this.resetToWakeWordMode()
    }, this.TRANSCRIPTION_TIMEOUT_MS)
  }

  private resetToWakeWordMode() {
    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout)
      this.transcriptionTimeout = null
    }
    this.state = DetectorState.LISTENING_FOR_WAKE_WORD
    console.log('👂 Listening for wake word "zookeeper"...')
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
      console.log('🛑 Stopped listening')

    } catch (error) {
      console.error('Failed to stop listening:', error)
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
