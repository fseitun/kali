import { GameModule } from './types'
import { SpeechService } from '../services/speech-service'
import { Logger } from '../utils/logger'

/**
 * Handles loading game modules from JSON files and their associated resources.
 */
export class GameLoader {
  constructor(private gamesPath: string) {}

  /**
   * Loads and validates a game module from the games directory.
   * @param gameId - The game identifier (filename without .json extension)
   * @returns The loaded and validated game module
   * @throws Error if the module fails to load or validation fails
   */
  async loadGame(gameId: string): Promise<GameModule> {
    const url = `${this.gamesPath}/${gameId}/config.json`

    try {
      Logger.info(`Loading game module: ${gameId}`)
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to load game module: ${response.statusText}`)
      }

      const module = await response.json() as GameModule

      this.validateGameModule(module)

      Logger.info(`Game module loaded: ${module.metadata.name} v${module.metadata.version}`)
      return module

    } catch (error) {
      Logger.error(`Error loading game module ${gameId}:`, error)
      throw error
    }
  }

  /**
   * Loads all sound effects defined in the game module.
   * Failures to load individual sounds are logged but don't throw errors.
   * @param module - The game module containing sound effect definitions
   * @param speechService - Service to load the sounds into
   */
  async loadSoundEffects(
    module: GameModule,
    speechService: SpeechService
  ): Promise<void> {
    if (!module.soundEffects) {
      Logger.info('No sound effects to load')
      return
    }

    Logger.info(`Loading ${Object.keys(module.soundEffects).length} sound effects...`)

    const loadPromises = Object.entries(module.soundEffects).map(
      async ([name, url]) => {
        try {
          await speechService.loadSound(name, url)
        } catch (error) {
          Logger.warn(`Failed to load sound ${name}:`, error)
        }
      }
    )

    await Promise.all(loadPromises)
  }

  private validateGameModule(module: GameModule): void {
    if (!module.metadata?.id || !module.metadata?.name) {
      throw new Error('Invalid game module: missing metadata')
    }

    if (!module.initialState) {
      throw new Error('Invalid game module: missing initialState')
    }

    if (!module.rules?.objective || !module.rules?.mechanics) {
      throw new Error('Invalid game module: missing rules')
    }

    Logger.info('Game module validation passed')
  }
}
