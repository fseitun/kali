import { Logger } from '../utils/logger'
import { CONFIG } from '../config'

export class SpeechService {
  speak(text: string): void {
    if (!window.speechSynthesis) {
      Logger.error('TTS not supported')
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = CONFIG.TTS.RATE
    utterance.pitch = CONFIG.TTS.PITCH
    window.speechSynthesis.speak(utterance)
    Logger.narration(`Kali: "${text}"`)
  }
}
