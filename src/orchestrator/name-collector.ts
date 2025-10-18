import { SpeechService } from '../services/speech-service'
import { StateManager } from '../state-manager'
import { GamePhase } from './types'
import { validateName, findNameConflicts, generateNickname, areNamesSimilar } from '../utils/name-helper'
import { Logger } from '../utils/logger'
import { t } from '../i18n'
import { CONFIG } from '../config'

interface Player {
  id: string
  name: string
  position: number
}

/**
 * Handles the voice-based player name collection phase at game start.
 */
export class NameCollector {
  private collectedNames: string[] = []
  private playerCount = 0
  private timeoutHandle: number | null = null

  constructor(
    private speechService: SpeechService,
    private stateManager: StateManager,
    private gameName: string,
    private enableDirectTranscription: () => void
  ) {}

  /**
   * Runs the complete name collection flow.
   * @param onTranscript - Callback to receive transcriptions from speech recognition
   * @returns Promise that resolves when setup is complete
   */
  async collectNames(onTranscript: (handler: (text: string) => void) => void): Promise<void> {
    try {
      Logger.info('Starting name collection phase')

      await this.speechService.speak(t('setup.welcome', { game: this.gameName }))

      this.playerCount = await this.askPlayerCount(onTranscript)
      Logger.info(`Collecting names for ${this.playerCount} players`)

      for (let i = 0; i < this.playerCount; i++) {
        if (i === 0) {
          this.enableDirectTranscription()
          Logger.info('Direct transcription enabled for name collection')
        }
        const name = await this.askPlayerName(i + 1, onTranscript)
        this.collectedNames.push(name)
        Logger.info(`Collected name for player ${i + 1}: ${name}`)
      }

      await this.resolveConflicts(onTranscript)

      await this.createPlayers()

      await this.speechService.speak(t('setup.ready', { name: this.collectedNames[0] }))

      await this.stateManager.set('game.phase', GamePhase.PLAYING)

      Logger.info('Name collection complete')

    } catch (error) {
      Logger.error('Name collection error:', error)
      throw error
    }
  }

  private async askPlayerCount(onTranscript: (handler: (text: string) => void) => void): Promise<number> {
    await this.speechService.speak(t('setup.playerCount'))

    return new Promise<number>((resolve) => {
      const handler = async (text: string) => {
        Logger.info(`Player count handler received: "${text}"`)
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle)
          this.timeoutHandle = null
        }

        const lower = text.toLowerCase().trim()
        let count = 0

        if (lower.includes('two') || lower.includes('2') || lower.includes('to') || lower.includes('too')) {
          count = 2
        } else if (lower.includes('three') || lower.includes('3')) {
          count = 3
        } else if (lower.includes('four') || lower.includes('4') || lower.includes('for')) {
          count = 4
        }

        if (count >= 2 && count <= 4) {
          resolve(count)
        } else {
          await this.speechService.speak(t('setup.playerCountInvalid'))
          this.setupTimeout(() => resolve(2), 10000)
        }
      }

      onTranscript(handler)
      this.setupTimeout(async () => {
        Logger.info('Player count timeout - no response received')
        await this.speechService.speak(t('setup.playerCountTimeout'))
        resolve(2)
      }, 10000)
    })
  }

  private async askPlayerName(playerNumber: number, onTranscript: (handler: (text: string) => void) => void): Promise<string> {
    await this.speechService.speak(t('setup.playerName', { number: playerNumber }))

    return new Promise<string>((resolve) => {
      let attempts = 0

      const handler = async (text: string) => {
        Logger.info(`Name handler for player ${playerNumber} received: "${text}"`)
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle)
          this.timeoutHandle = null
        }

        let cleaned = text.trim()
        CONFIG.WAKE_WORD.TEXT.forEach(wakeWord => {
          const regex = new RegExp(wakeWord, 'gi')
          cleaned = cleaned.replace(regex, '')
        })
        cleaned = cleaned.trim()
        const validation = validateName(cleaned)

        if (validation.valid) {
          await this.confirmName(validation.cleaned, onTranscript, playerNumber, resolve)
        } else {
          attempts++
          if (attempts < 2) {
            await this.speechService.speak(t('setup.nameInvalid'))
            this.setupTimeout(() => this.handleNameTimeout(playerNumber, resolve), 10000)
          } else {
            await this.handleNameTimeout(playerNumber, resolve)
          }
        }
      }

      onTranscript(handler)
      this.setupTimeout(async () => {
        Logger.info(`Name timeout for player ${playerNumber} - no valid response`)
        await this.handleNameTimeout(playerNumber, resolve)
      }, 10000)
    })
  }

  private async confirmName(
    name: string,
    onTranscript: (handler: (text: string) => void) => void,
    playerNumber: number,
    resolve: (value: string) => void
  ): Promise<void> {
    await this.speechService.speak(t('setup.nameConfirm', { name }))

    const confirmHandler = async (text: string) => {
      Logger.info(`Confirmation handler received: "${text}"`)
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }

      const lower = text.toLowerCase().trim()

      if (lower.includes('yes') || lower.includes('yeah') || lower.includes('sí') || lower.includes('si') || lower.includes('correct') || lower.includes('right') || lower.includes('correcto')) {
        await this.speechService.speak(t('setup.nameConfirmYes', { name }))
        resolve(name)
      } else if (lower.includes('no') || lower.includes('nope')) {
        await this.speechService.speak(t('setup.nameConfirmRetry'))
        this.retryNameCollection(onTranscript, playerNumber, resolve)
      } else {
        await this.speechService.speak(t('setup.nameConfirmYes', { name }))
        resolve(name)
      }
    }

    onTranscript(confirmHandler)
    this.setupTimeout(async () => {
      Logger.info('Confirmation timeout - assuming yes')
      await this.speechService.speak(t('setup.nameConfirmYes', { name }))
      resolve(name)
    }, 10000)
  }

  private async retryNameCollection(
    onTranscript: (handler: (text: string) => void) => void,
    playerNumber: number,
    resolve: (value: string) => void
  ): Promise<void> {
    const handler = async (text: string) => {
      Logger.info(`Retry name handler received: "${text}"`)
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }

      let cleaned = text.trim()
      CONFIG.WAKE_WORD.TEXT.forEach(wakeWord => {
        const regex = new RegExp(wakeWord, 'gi')
        cleaned = cleaned.replace(regex, '')
      })
      cleaned = cleaned.trim()
      const validation = validateName(cleaned)

      if (validation.valid) {
        await this.confirmName(validation.cleaned, onTranscript, playerNumber, resolve)
      } else {
        await this.handleNameTimeout(playerNumber, resolve)
      }
    }

    onTranscript(handler)
    this.setupTimeout(async () => {
      Logger.info('Retry timeout - using fallback name')
      await this.handleNameTimeout(playerNumber, resolve)
    }, 10000)
  }

  private async handleNameTimeout(playerNumber: number, resolve: (value: string) => void): Promise<void> {
    const kindName = generateNickname(`Player${playerNumber}`, this.collectedNames)
    await this.speechService.speak(t('setup.nameTimeout', { name: kindName }))
    resolve(kindName)
  }

  private async resolveConflicts(onTranscript: (handler: (text: string) => void) => void): Promise<void> {
    const conflictIndices = findNameConflicts(this.collectedNames)

    if (conflictIndices.length === 0) {
      return
    }

    Logger.info('Resolving name conflicts:', conflictIndices)

    for (const index of conflictIndices) {
      if (index > 0 && areNamesSimilar(this.collectedNames[index], this.collectedNames[index - 1])) {
        const baseName = this.collectedNames[index]
        const usedNames = this.collectedNames.slice(0, index)
        const suggestion = generateNickname(baseName, usedNames)

        await this.speechService.speak(
          t('setup.nameConflict', { name: baseName, suggestion })
        )

        const response = await this.waitForConfirmation(onTranscript, suggestion, baseName)
        this.collectedNames[index] = response
      }
    }

    const allNames = this.collectedNames.join(', ').replace(/, ([^,]*)$/, ' y $1')
    await this.speechService.speak(t('setup.allNamesReady', { names: allNames }))

    await new Promise<void>((resolve) => {
      const handler = () => {
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle)
        }
        resolve()
      }

      onTranscript(handler)
      this.setupTimeout(() => resolve(), 3000)
    })
  }

  private async waitForConfirmation(
    onTranscript: (handler: (text: string) => void) => void,
    suggestion: string,
    original: string
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      const handler = async (text: string) => {
        Logger.info(`Conflict resolution handler received: "${text}"`)
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle)
          this.timeoutHandle = null
        }

        const lower = text.toLowerCase().trim()

        if (lower.includes('yes') || lower.includes('yeah') || lower.includes('sí') || lower.includes('si') || lower.includes('sure') || lower.includes('okay') || lower.includes('ok') || lower.includes('dale') || lower.includes('bueno')) {
          await this.speechService.speak(t('setup.nameConflictPerfect'))
          resolve(suggestion)
        } else if (lower.includes('no') || lower.includes('nope')) {
          await this.speechService.speak(t('setup.nameConflictAlternative'))
          await this.resolveAlternativeName(onTranscript, original, resolve)
        } else {
          resolve(suggestion)
        }
      }

      onTranscript(handler)
      this.setupTimeout(() => {
        Logger.info('Conflict resolution timeout - using suggestion')
        resolve(suggestion)
      }, 10000)
    })
  }

  private async resolveAlternativeName(
    onTranscript: (handler: (text: string) => void) => void,
    fallback: string,
    resolve: (value: string) => void
  ): Promise<void> {
    const handler = async (text: string) => {
      Logger.info(`Alternative name handler received: "${text}"`)
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }

      let cleaned = text.trim()
      CONFIG.WAKE_WORD.TEXT.forEach(wakeWord => {
        const regex = new RegExp(wakeWord, 'gi')
        cleaned = cleaned.replace(regex, '')
      })
      cleaned = cleaned.trim()
      const validation = validateName(cleaned)

      if (validation.valid && !this.collectedNames.includes(validation.cleaned)) {
        await this.speechService.speak(t('setup.nameConfirmYes', { name: validation.cleaned }))
        resolve(validation.cleaned)
      } else {
        const kindName = generateNickname(fallback, this.collectedNames)
        await this.speechService.speak(t('setup.nameConflictFallback', { name: kindName }))
        resolve(kindName)
      }
    }

    onTranscript(handler)
    this.setupTimeout(async () => {
      Logger.info('Alternative name timeout - using fallback')
      const kindName = generateNickname(fallback, this.collectedNames)
      await this.speechService.speak(t('setup.nameConflictFallback', { name: kindName }))
      resolve(kindName)
    }, 10000)
  }

  private async createPlayers(): Promise<void> {
    const players: Player[] = this.collectedNames.map((name, index) => ({
      id: `p${index + 1}`,
      name,
      position: 0
    }))

    await this.stateManager.set('players', players)
    Logger.info('Players created:', players)
  }

  private setupTimeout(callback: () => void, ms: number): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
    }
    this.timeoutHandle = window.setTimeout(callback, ms)
  }
}
