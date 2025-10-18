import { Logger } from '../utils/logger'
import { CONFIG } from '../config'

/**
 * Manages text-to-speech narration and sound effect playback for voice-only interaction.
 */
export class SpeechService {
  private audioContext?: AudioContext
  private sounds: Map<string, AudioBuffer> = new Map()
  private primed = false

  /**
   * Primes the speech synthesis API for immediate use.
   * Required on some browsers to avoid delays on first TTS call.
   */
  prime(): void {
    if (!window.speechSynthesis || this.primed) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance('')
    window.speechSynthesis.speak(utterance)
    this.primed = true
    Logger.info('Speech synthesis primed')
  }

  /**
   * Speaks the provided text using browser TTS.
   * Cancels any currently playing speech before speaking.
   * @param text - The text to speak aloud
   * @returns Promise that resolves when speech finishes
   */
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        Logger.error('TTS not supported')
        resolve()
        return
      }

      if (!this.primed) {
        this.prime()
      }

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = CONFIG.TTS.RATE
      utterance.pitch = CONFIG.TTS.PITCH

      utterance.onend = () => {
        resolve()
      }

      utterance.onerror = (event) => {
        Logger.error('Speech synthesis error:', event)
        resolve()
      }

      window.speechSynthesis.speak(utterance)
      Logger.narration(`Kali: "${text}"`)
    })
  }

  /**
   * Loads a sound effect from URL and caches it in memory.
   * @param name - Identifier for the sound (e.g., "ladder_up")
   * @param url - URL to fetch the sound file from
   */
  async loadSound(name: string, url: string): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }

    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      this.sounds.set(name, audioBuffer)
      Logger.info(`Loaded sound: ${name}`)
    } catch (error) {
      Logger.warn(`Failed to load sound ${name} from ${url}:`, error)
    }
  }

  /**
   * Plays a previously loaded sound effect.
   * Gracefully handles missing sounds by logging a warning.
   * @param name - Identifier of the sound to play
   */
  playSound(name: string): void {
    if (!this.sounds.has(name)) {
      Logger.warn(`Sound effect "${name}" not found, continuing without sound`)
      return
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }

    try {
      const buffer = this.sounds.get(name)!
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext.destination)
      source.start(0)
      Logger.info(`Playing sound: ${name}`)
    } catch (error) {
      Logger.warn(`Failed to play sound ${name}:`, error)
    }
  }
}
