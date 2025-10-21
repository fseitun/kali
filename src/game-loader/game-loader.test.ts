import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameLoader } from './game-loader'
import { GameModule } from './types'

// Mock SpeechService
const mockSpeechService = {
  loadSound: vi.fn()
}

vi.mock('../services/speech-service', () => ({
  SpeechService: vi.fn().mockImplementation(() => mockSpeechService)
}))

// Mock Logger
vi.mock('../utils/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('GameLoader', () => {
  let gameLoader: GameLoader
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    gameLoader = new GameLoader('/test/games')
    mockFetch = vi.fn()
    global.fetch = mockFetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadGame', () => {
    it('should load valid game module', async () => {
      const mockGameModule: GameModule = {
        metadata: {
          id: 'test-game',
          name: 'Test Game',
          version: '1.0.0',
          minPlayers: 2,
          maxPlayers: 4
        },
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        },
        initialState: {
          players: [],
          currentPlayer: 0,
          phase: 'SETUP'
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGameModule)
      })

      const result = await gameLoader.loadGame('test-game')

      expect(mockFetch).toHaveBeenCalledWith('/test/games/test-game/config.json')
      expect(result).toEqual(mockGameModule)
    })

    it('should throw error for failed fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      })

      await expect(gameLoader.loadGame('nonexistent')).rejects.toThrow(
        'Failed to load game module: Not Found'
      )
    })

    it('should throw error for network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(gameLoader.loadGame('test-game')).rejects.toThrow('Network error')
    })

    it('should validate game module metadata', async () => {
      const invalidModule = {
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        },
        initialState: {
          players: []
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule)
      })

      await expect(gameLoader.loadGame('invalid')).rejects.toThrow(
        'Invalid game module: missing metadata'
      )
    })

    it('should validate game module rules', async () => {
      const invalidModule = {
        metadata: {
          id: 'test-game',
          name: 'Test Game'
        },
        initialState: {
          players: []
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule)
      })

      await expect(gameLoader.loadGame('invalid')).rejects.toThrow(
        'Invalid game module: missing rules'
      )
    })

    it('should validate game module initialState', async () => {
      const invalidModule = {
        metadata: {
          id: 'test-game',
          name: 'Test Game'
        },
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule)
      })

      await expect(gameLoader.loadGame('invalid')).rejects.toThrow(
        'Invalid game module: missing initialState'
      )
    })

    it('should validate metadata id and name', async () => {
      const invalidModule = {
        metadata: {
          version: '1.0.0'
        },
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        },
        initialState: {
          players: []
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule)
      })

      await expect(gameLoader.loadGame('invalid')).rejects.toThrow(
        'Invalid game module: missing metadata'
      )
    })
  })

  describe('loadSoundEffects', () => {
    it('should load all sound effects successfully', async () => {
      const gameModule: GameModule = {
        metadata: {
          id: 'test-game',
          name: 'Test Game',
          version: '1.0.0',
          minPlayers: 2,
          maxPlayers: 4
        },
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        },
        initialState: {
          players: []
        },
        soundEffects: {
          'ladder_up': '/sounds/ladder.mp3',
          'snake_down': '/sounds/snake.mp3',
          'dice_roll': '/sounds/dice.mp3'
        }
      }

      mockSpeechService.loadSound.mockResolvedValue(undefined)

      await gameLoader.loadSoundEffects(gameModule, mockSpeechService as any)

      expect(mockSpeechService.loadSound).toHaveBeenCalledTimes(3)
      expect(mockSpeechService.loadSound).toHaveBeenCalledWith('ladder_up', '/sounds/ladder.mp3')
      expect(mockSpeechService.loadSound).toHaveBeenCalledWith('snake_down', '/sounds/snake.mp3')
      expect(mockSpeechService.loadSound).toHaveBeenCalledWith('dice_roll', '/sounds/dice.mp3')
    })

    it('should handle missing sound effects', async () => {
      const gameModule: GameModule = {
        metadata: {
          id: 'test-game',
          name: 'Test Game',
          version: '1.0.0',
          minPlayers: 2,
          maxPlayers: 4
        },
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        },
        initialState: {
          players: []
        }
      }

      await gameLoader.loadSoundEffects(gameModule, mockSpeechService as any)

      expect(mockSpeechService.loadSound).not.toHaveBeenCalled()
    })

    it('should handle sound loading failures gracefully', async () => {
      const gameModule: GameModule = {
        metadata: {
          id: 'test-game',
          name: 'Test Game',
          version: '1.0.0',
          minPlayers: 2,
          maxPlayers: 4
        },
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        },
        initialState: {
          players: []
        },
        soundEffects: {
          'good_sound': '/sounds/good.mp3',
          'bad_sound': '/sounds/bad.mp3'
        }
      }

      mockSpeechService.loadSound
        .mockResolvedValueOnce(undefined) // Good sound loads successfully
        .mockRejectedValueOnce(new Error('Failed to load')) // Bad sound fails

      // Should not throw even if some sounds fail
      await expect(gameLoader.loadSoundEffects(gameModule, mockSpeechService as any))
        .resolves.not.toThrow()

      expect(mockSpeechService.loadSound).toHaveBeenCalledTimes(2)
    })

    it('should handle empty sound effects object', async () => {
      const gameModule: GameModule = {
        metadata: {
          id: 'test-game',
          name: 'Test Game',
          version: '1.0.0',
          minPlayers: 2,
          maxPlayers: 4
        },
        rules: {
          objective: 'Test objective',
          mechanics: 'Test mechanics'
        },
        initialState: {
          players: []
        },
        soundEffects: {}
      }

      await gameLoader.loadSoundEffects(gameModule, mockSpeechService as any)

      expect(mockSpeechService.loadSound).not.toHaveBeenCalled()
    })
  })
})
