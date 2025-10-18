import { SpeechService } from '../services/speech-service'
import { StateManager } from '../state-manager'
import { GamePhase } from './types'
import { validateName, findNameConflicts, generateNickname, areNamesSimilar } from '../utils/name-helper'
import { Logger } from '../utils/logger'

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

      await this.speechService.speak(`Welcome to ${this.gameName}! Let's get started.`)

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

      await this.speechService.speak(`Perfect! Let's begin. ${this.collectedNames[0]}, you go first.`)

      await this.stateManager.set('game.phase', GamePhase.PLAYING)

      Logger.info('Name collection complete')

    } catch (error) {
      Logger.error('Name collection error:', error)
      throw error
    }
  }

  private async askPlayerCount(onTranscript: (handler: (text: string) => void) => void): Promise<number> {
    await this.speechService.speak('How many players? Say a number from 2 to 4.')

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
          await this.speechService.speak('Please say a number from 2 to 4.')
          this.setupTimeout(() => resolve(2), 10000)
        }
      }

      onTranscript(handler)
      this.setupTimeout(async () => {
        Logger.info('Player count timeout - no response received')
        await this.speechService.speak('No response. Defaulting to 2 players.')
        resolve(2)
      }, 10000)
    })
  }

  private async askPlayerName(playerNumber: number, onTranscript: (handler: (text: string) => void) => void): Promise<string> {
    await this.speechService.speak(`Player ${playerNumber}, what's your name?`)

    return new Promise<string>((resolve) => {
      let attempts = 0

      const handler = async (text: string) => {
        Logger.info(`Name handler for player ${playerNumber} received: "${text}"`)
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle)
          this.timeoutHandle = null
        }

        const cleaned = text.replace(/zookeeper/gi, '').replace(/zoo keeper/gi, '').trim()
        const validation = validateName(cleaned)

        if (validation.valid) {
          await this.confirmName(validation.cleaned, onTranscript, playerNumber, resolve)
        } else {
          attempts++
          if (attempts < 2) {
            await this.speechService.speak('Sorry, I didn\'t catch that. What\'s your name?')
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
    await this.speechService.speak(`${name}, is that correct?`)

    const confirmHandler = async (text: string) => {
      Logger.info(`Confirmation handler received: "${text}"`)
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }

      const lower = text.toLowerCase().trim()

      if (lower.includes('yes') || lower.includes('yeah') || lower.includes('correct') || lower.includes('right')) {
        await this.speechService.speak(`Great, ${name}!`)
        resolve(name)
      } else if (lower.includes('no') || lower.includes('nope')) {
        await this.speechService.speak('Okay, what should I call you?')
        this.retryNameCollection(onTranscript, playerNumber, resolve)
      } else {
        await this.speechService.speak(`Great, ${name}!`)
        resolve(name)
      }
    }

    onTranscript(confirmHandler)
    this.setupTimeout(async () => {
      Logger.info('Confirmation timeout - assuming yes')
      await this.speechService.speak(`Great, ${name}!`)
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

      const cleaned = text.replace(/zookeeper/gi, '').replace(/zoo keeper/gi, '').trim()
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
    await this.speechService.speak(`No problem! I'll call you ${kindName}.`)
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
          `We already have a ${baseName}. How about ${suggestion} for you?`
        )

        const response = await this.waitForConfirmation(onTranscript, suggestion, baseName)
        this.collectedNames[index] = response
      }
    }

    const allNames = this.collectedNames.join(', ').replace(/, ([^,]*)$/, ' and $1')
    await this.speechService.speak(`Excellent! We have ${allNames}. Ready to play?`)

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

        if (lower.includes('yes') || lower.includes('yeah') || lower.includes('sure') || lower.includes('okay') || lower.includes('ok')) {
          await this.speechService.speak('Perfect!')
          resolve(suggestion)
        } else if (lower.includes('no') || lower.includes('nope')) {
          await this.speechService.speak(`What would you like to be called instead?`)
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

      const cleaned = text.replace(/zookeeper/gi, '').replace(/zoo keeper/gi, '').trim()
      const validation = validateName(cleaned)

      if (validation.valid && !this.collectedNames.includes(validation.cleaned)) {
        await this.speechService.speak(`Great, ${validation.cleaned}!`)
        resolve(validation.cleaned)
      } else {
        const kindName = generateNickname(fallback, this.collectedNames)
        await this.speechService.speak(`Let's go with ${kindName}.`)
        resolve(kindName)
      }
    }

    onTranscript(handler)
    this.setupTimeout(async () => {
      Logger.info('Alternative name timeout - using fallback')
      const kindName = generateNickname(fallback, this.collectedNames)
      await this.speechService.speak(`Let's go with ${kindName}.`)
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
