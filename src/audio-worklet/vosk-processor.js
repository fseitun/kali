// AudioWorklet processor for Vosk speech recognition
class VoskAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = []
    this.isRecording = false
    this.sampleCount = 0
    this.resampleRatio = sampleRate / 16000 // Calculate resample ratio for target 16kHz
    this.resampleCounter = 0

    // Log AudioWorklet sample rate and resample ratio
    console.log(`🎛️ AudioWorklet sample rate: ${sampleRate}Hz, resample ratio: ${this.resampleRatio.toFixed(2)}x`)

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        this.isRecording = true
        this.buffer = []
        this.sampleCount = 0
        this.resampleCounter = 0
      } else if (event.data.type === 'stop') {
        this.isRecording = false
        // Send any remaining buffer
        if (this.buffer.length > 0) {
          this.port.postMessage({
            type: 'audioData',
            data: new Int16Array(this.buffer)
          })
          this.buffer = []
        }
      }
    }
  }

  process(inputs, outputs) {
    // Note: outputs parameter is required by AudioWorkletProcessor interface but not used in this implementation
    void outputs

    if (!this.isRecording) return true

    const input = inputs[0]
    if (!input || !input[0]) return true

    const channelData = input[0]

    // Resample audio from current sample rate to 16kHz for Vosk
    // Use linear interpolation for resampling
    for (let i = 0; i < channelData.length; i++) {
      this.resampleCounter += 1

      // Only keep samples that align with 16kHz target rate
      if (this.resampleCounter >= this.resampleRatio) {
        this.resampleCounter -= this.resampleRatio

        // Convert float32 to int16
        const sample = Math.max(-32768, Math.min(32767, channelData[i] * 32768))
        this.buffer.push(sample)
      }
    }

    // Send buffer in chunks to avoid memory issues (maintain ~2048 samples at 16kHz for better responsiveness)
    if (this.buffer.length >= 2048) {
      this.sampleCount += this.buffer.length

      // Debug: Check audio levels (less frequent logging)
      let maxLevel = 0
      for (let i = 0; i < this.buffer.length; i++) {
        maxLevel = Math.max(maxLevel, Math.abs(this.buffer[i]))
      }

      // Log every ~10 seconds worth of audio (160k samples at 16kHz)
      if (this.sampleCount % 160000 < 2048) {
        console.log(`🎙️ AudioWorklet: Processed ${this.sampleCount} total samples at 16kHz, current chunk max level: ${maxLevel}`)
      }

      this.port.postMessage({
        type: 'audioData',
        data: new Int16Array(this.buffer)
      })
      this.buffer = []
    }

    return true
  }
}

registerProcessor('vosk-audio-processor', VoskAudioProcessor)
