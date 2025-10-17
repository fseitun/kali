import { createModel, VoskModel, VoskRecognizer, VoskResultMessage, VoskPartialResultMessage, RecognitionResult } from 'vosk-browser'

interface ExtendedMediaTrackConstraints extends MediaTrackConstraints {
  sampleRate?: number
}

export class WakeWordDetector {
  private model: VoskModel | null = null
  private recognizer: VoskRecognizer | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private workletNode: AudioWorkletNode | null = null
  private isListening = false
  private isMobile = false

  constructor(private onWakeWord: () => void) {
    // Detect mobile devices for performance optimizations
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (this.isMobile) {
      console.log('📱 Mobile device detected - applying performance optimizations')
    }
  }

  async initialize() {
    const initStart = performance.now()
    try {
      console.log('🎤 Initializing Vosk wake word detector...')

      // Create AudioContext (AudioWorklet will handle 16kHz resampling for Vosk)
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioContext = new AudioContextClass()

      console.log(`🎵 AudioContext created with sample rate: ${this.audioContext.sampleRate}Hz`)

      // Load the AudioWorklet processor
      await this.audioContext.audioWorklet.addModule(
        new URL('./audio-worklet/vosk-processor.js', import.meta.url)
      )

      // Load Vosk model (using smaller English model for better performance)
      console.log('📥 Loading Vosk model (small English model for performance)...')

      const modelLoadStart = performance.now()
      this.model = await createModel('/vosk-model-small-en-us-0.15.zip')
      const modelLoadTime = performance.now() - modelLoadStart
      console.log(`✅ Small Vosk model loaded successfully in ${modelLoadTime.toFixed(1)}ms`)

      // Create recognizer with keyword spotting enabled
      console.log('🔧 Creating KaldiRecognizer...')
      this.recognizer = new this.model.KaldiRecognizer(16000)
      this.recognizer.setWords(true)
      console.log('✅ KaldiRecognizer created and configured')

      // Set up event listeners for results (vosk-browser uses event-driven approach)
      this.recognizer.on('result', (message: VoskResultMessage) => {
        console.log('📝 Result event received:', message)
        this.checkWakeWordResult(message.result, false)
      })

      this.recognizer.on('partialresult', (message: VoskPartialResultMessage) => {
        console.log('📝 Partial result event received:', message)
        this.checkWakeWordResult(message.result, true)
      })

      this.recognizer.on('error', (error: Error) => {
        console.error('Vosk recognition error:', error)
      })

      console.log('🎧 Event listeners registered')

      const initTime = performance.now() - initStart
      console.log(`✅ Vosk wake word detector ready (${initTime.toFixed(1)}ms total)`)

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
      const sessionStartTime = new Date().toISOString()
      console.log(`🎧 [${sessionStartTime}] Starting wake word listening session...`)

      // Get microphone access with mobile optimizations
      const audioConstraints: ExtendedMediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }

      // On mobile, try to use lower sample rate for better performance
      if (this.isMobile) {
        audioConstraints.sampleRate = 16000
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })

      // Validate audio track settings
      const audioTrack = this.mediaStream.getAudioTracks()[0]
      if (!audioTrack) {
        throw new Error('No audio track available from microphone')
      }

      const settings = audioTrack.getSettings()
      console.log(`🎙️ Audio track settings:`, {
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression
      })

      // Note: AudioWorklet will resample to 16kHz for Vosk compatibility
      if (settings.sampleRate && settings.sampleRate !== 16000) {
        console.log(`ℹ️ Microphone sample rate: ${settings.sampleRate}Hz (will be resampled to 16kHz for Vosk)`)
      }

      // Create AudioWorkletNode
      this.workletNode = new AudioWorkletNode(this.audioContext, 'vosk-audio-processor')

      // Handle messages from the AudioWorklet
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audioData') {
          this.processAudioData(event.data.data)
        }
      }

      // Connect audio source to worklet
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      source.connect(this.workletNode)

      // Start recording
      this.workletNode.port.postMessage({ type: 'start' })

      this.isListening = true
      console.log(`✅ [${sessionStartTime}] Microphone active - listening for wake word "kali"`)

    } catch (error) {
      console.error('Failed to start listening:', error)
      throw error
    }
  }

  private processAudioData(pcm16: Int16Array) {
    if (!this.recognizer || !this.isListening) return

    // Audio format validation
    if (!pcm16 || pcm16.length === 0) {
      console.warn('⚠️ Received empty or invalid audio data')
      return
    }

    // Check for valid Int16 range and data integrity
    let hasInvalidSamples = false
    let hasNonZeroSamples = false
    let maxAmplitude = 0
    let minAmplitude = 0

    for (let i = 0; i < pcm16.length; i++) {
      const sample = pcm16[i]
      if (sample < -32768 || sample > 32767) {
        hasInvalidSamples = true
        break
      }
      if (sample !== 0) {
        hasNonZeroSamples = true
      }
      maxAmplitude = Math.max(maxAmplitude, Math.abs(sample))
      minAmplitude = Math.min(minAmplitude, sample)
    }

    if (hasInvalidSamples) {
      console.error('❌ Audio data contains out-of-range samples')
      return
    }

    if (!hasNonZeroSamples) {
      // Silent audio - skip processing but don't warn
      return
    }

    // Debug: Check if we're getting audio data (only log significant audio)
    if (maxAmplitude > 1000) {
      console.log(`🎵 [${new Date().toISOString()}] Audio chunk received - samples: ${pcm16.length}, max amplitude: ${maxAmplitude}`)
    }

    try {
      // Convert Int16Array to Float32Array for Vosk (should be in range [-1, 1])
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0 // Convert from int16 range to float32 range [-1, 1]
      }

      // Validate float32 conversion
      let floatMax = 0
      let floatMin = 0
      for (let i = 0; i < float32.length; i++) {
        floatMax = Math.max(floatMax, float32[i])
        floatMin = Math.min(floatMin, float32[i])
      }

      // Debug: Log first few samples to verify conversion (rarely, with significant audio)
      // Reduce logging frequency on mobile for performance
      const logProbability = this.isMobile ? 0.001 : 0.005 // 0.1% vs 0.5% on mobile
      if (maxAmplitude > 1000 && Math.random() < logProbability) {
        console.log(`🔊 Sample validation - Int16 range: [${minAmplitude}, ${maxAmplitude}], Float32 range: [${floatMin.toFixed(4)}, ${floatMax.toFixed(4)}]`)
        console.log(`🔊 First 8 float samples: [${Array.from(float32.slice(0, 8)).map(x => x.toFixed(4)).join(', ')}]`)
      }

      // Process with Vosk (vosk-browser uses event-driven approach)
      this.recognizer.acceptWaveformFloat(float32, 16000)

      // Debug: Check if recognizer is still active (very infrequent, less on mobile)
      const statusLogProbability = this.isMobile ? 0.0001 : 0.001 // Even less frequent on mobile
      if (Math.random() < statusLogProbability) {
        console.log('🔄 Recognizer still processing...')
      }
    } catch (error) {
      console.error('❌ Error processing audio data:', error)
      console.error('❌ Audio data details:', {
        length: pcm16.length,
        type: pcm16.constructor.name,
        sampleRange: [minAmplitude, maxAmplitude]
      })
      // Continue processing - don't let one bad chunk stop everything
    }
  }

  private checkWakeWordResult(result: RecognitionResult, isPartial: boolean) {
    const timestamp = new Date().toISOString()
    const text = result.text || result.partial || ''

    if (!text.trim()) return

    if (isPartial) {
      console.log(`🎤 [${timestamp}] PARTIAL: "${text}"`)
    } else {
      console.log(`🎤 [${timestamp}] RESULT: "${text}"`)
    }

    // Check for wake word "kali" with variations
    const lowerText = text.toLowerCase()
    if (lowerText.includes('kali') || lowerText.includes('calli') || lowerText.includes('cally')) {
      console.log(`🔥 [${timestamp}] WAKE WORD DETECTED in: "${text}"`)
      this.onWakeWord()
    }
  }

  async stopListening() {
    try {
      const sessionEndTime = new Date().toISOString()
      console.log(`🛑 [${sessionEndTime}] Stopping wake word listening session...`)

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
      console.log(`✅ [${sessionEndTime}] Wake word listening session ended`)

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

    // Properly clean up Vosk resources (vosk-browser API)
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

// Hot Module Replacement (HMR) support for WakeWordDetector
if (import.meta.hot) {
  // Handle disposal on module invalidation
  import.meta.hot.dispose(async () => {
    // The main app will handle cleanup of instances
  })
}
