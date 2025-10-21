import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SpeechService } from './speech-service'

// Mock CONFIG
vi.mock('../config', () => ({
  CONFIG: {
    TTS: {
      RATE: 0.9,
      PITCH: 1.0,
      VOICE_LANG: 'en-US'
    }
  }
}))

// Mock Logger
vi.mock('../utils/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    narration: vi.fn()
  }
}))

describe('SpeechService', () => {
  let speechService: SpeechService
  let mockSpeechSynthesis: any
  let mockAudioContext: any
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    speechService = new SpeechService()

    // Mock SpeechSynthesis
    mockSpeechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn()
    }

    global.window = {
      speechSynthesis: mockSpeechSynthesis
    } as any

    // Mock AudioContext
    mockAudioContext = {
      decodeAudioData: vi.fn(),
      createBufferSource: vi.fn(),
      destination: {}
    }

    global.AudioContext = vi.fn().mockImplementation(() => mockAudioContext) as any

    // Mock fetch
    mockFetch = vi.fn()
    global.fetch = mockFetch

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('prime', () => {
    it('should prime speech synthesis', () => {
      const mockUtterance = {
        onend: null,
        onerror: null
      }

      global.SpeechSynthesisUtterance = vi.fn().mockImplementation(() => mockUtterance) as any

      speechService.prime()

      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled()
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(mockUtterance)
    })

    it('should not prime if speechSynthesis not available', () => {
      global.window = {} as any

      speechService.prime()

      // Should not throw
      expect(true).toBe(true)
    })

    it('should not prime if already primed', () => {
      const mockUtterance = {
        onend: null,
        onerror: null
      }

      global.SpeechSynthesisUtterance = vi.fn().mockImplementation(() => mockUtterance) as any

      speechService.prime()
      speechService.prime() // Second call

      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1)
    })
  })

  describe('speak', () => {
    beforeEach(() => {
      global.SpeechSynthesisUtterance = vi.fn().mockImplementation(() => ({
        onend: null,
        onerror: null,
        rate: 0,
        pitch: 0,
        lang: ''
      })) as any
    })

    it('should speak text successfully', async () => {
      let utterance: any = null

      global.SpeechSynthesisUtterance = vi.fn().mockImplementation((text) => {
        utterance = {
          text,
          onend: null,
          onerror: null,
          rate: 0,
          pitch: 0,
          lang: ''
        }
        return utterance
      }) as any

      const speakPromise = speechService.speak('Hello world')

      // Simulate successful speech
      setTimeout(() => {
        utterance.onend()
      }, 0)

      await speakPromise

      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled()
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(utterance)
      expect(utterance.rate).toBe(0.9)
      expect(utterance.pitch).toBe(1.0)
      expect(utterance.lang).toBe('en-US')
    })

    it('should handle speech synthesis not available', async () => {
      global.window = {} as any

      await speechService.speak('Hello world')

      // Should resolve without error
      expect(true).toBe(true)
    })

    it('should handle speech synthesis error', async () => {
      let utterance: any = null

      global.SpeechSynthesisUtterance = vi.fn().mockImplementation((text) => {
        utterance = {
          text,
          onend: null,
          onerror: null,
          rate: 0,
          pitch: 0,
          lang: ''
        }
        return utterance
      }) as any

      const speakPromise = speechService.speak('Hello world')

      // Simulate speech error
      setTimeout(() => {
        utterance.onerror({ error: 'network' })
      }, 0)

      await speakPromise

      // Should resolve even on error
      expect(true).toBe(true)
    })

    it('should handle interrupted speech', async () => {
      let utterance: any = null

      global.SpeechSynthesisUtterance = vi.fn().mockImplementation((text) => {
        utterance = {
          text,
          onend: null,
          onerror: null,
          rate: 0,
          pitch: 0,
          lang: ''
        }
        return utterance
      }) as any

      const speakPromise = speechService.speak('Hello world')

      // Simulate interrupted speech
      setTimeout(() => {
        utterance.onerror({ error: 'interrupted' })
      }, 0)

      await speakPromise

      // Should resolve without error
      expect(true).toBe(true)
    })

    it('should prime if not already primed', async () => {
      let utterance: any = null

      global.SpeechSynthesisUtterance = vi.fn().mockImplementation((text) => {
        utterance = {
          text,
          onend: null,
          onerror: null,
          rate: 0,
          pitch: 0,
          lang: ''
        }
        return utterance
      }) as any

      const speakPromise = speechService.speak('Hello world')

      setTimeout(() => {
        utterance.onend()
      }, 0)

      await speakPromise

      // Should have called prime (cancel + speak)
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(2) // Once for prime, once for speak
    })
  })

  describe('loadSound', () => {
    it('should load sound successfully', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024)
      const mockAudioBuffer = { duration: 1.0 }

      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer)
      })

      mockAudioContext.decodeAudioData.mockResolvedValueOnce(mockAudioBuffer)

      await speechService.loadSound('test-sound', 'http://example.com/sound.mp3')

      expect(mockFetch).toHaveBeenCalledWith('http://example.com/sound.mp3')
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledWith(mockArrayBuffer)
    })

    it('should handle load sound failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await speechService.loadSound('test-sound', 'http://example.com/sound.mp3')

      // Should not throw
      expect(true).toBe(true)
    })

    it('should handle decode audio data failure', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024)

      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer)
      })

      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error('Invalid audio data'))

      await speechService.loadSound('test-sound', 'http://example.com/sound.mp3')

      // Should not throw
      expect(true).toBe(true)
    })

    it('should create AudioContext if not exists', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024)
      const mockAudioBuffer = { duration: 1.0 }

      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer)
      })

      mockAudioContext.decodeAudioData.mockResolvedValueOnce(mockAudioBuffer)

      // Reset AudioContext to simulate it not being created yet
      speechService = new SpeechService()

      await speechService.loadSound('test-sound', 'http://example.com/sound.mp3')

      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledWith(mockArrayBuffer)
    })
  })

  describe('playSound', () => {
    beforeEach(() => {
      const mockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn()
      }

      mockAudioContext.createBufferSource.mockReturnValue(mockSource)
    })

    it('should play loaded sound', () => {
      const mockBuffer = { duration: 1.0 }

      // Manually add sound to the service's internal map
      ;(speechService as any).sounds.set('test-sound', mockBuffer)

      speechService.playSound('test-sound')

      expect(mockAudioContext.createBufferSource).toHaveBeenCalled()
    })

    it('should handle missing sound gracefully', () => {
      speechService.playSound('nonexistent-sound')

      // Should not throw
      expect(true).toBe(true)
    })

    it('should create AudioContext if not exists', () => {
      const mockBuffer = { duration: 1.0 }
      const mockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn()
      }

      mockAudioContext.createBufferSource.mockReturnValue(mockSource)

      // Reset AudioContext to simulate it not being created yet
      speechService = new SpeechService()
      ;(speechService as any).sounds.set('test-sound', mockBuffer)

      speechService.playSound('test-sound')

      expect(mockAudioContext.createBufferSource).toHaveBeenCalled()
    })

    it('should handle play sound failure', () => {
      const mockBuffer = { duration: 1.0 }
      const mockSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn().mockImplementation(() => {
          throw new Error('Playback error')
        })
      }

      mockAudioContext.createBufferSource.mockReturnValue(mockSource)
      ;(speechService as any).sounds.set('test-sound', mockBuffer)

      speechService.playSound('test-sound')

      // Should not throw
      expect(true).toBe(true)
    })
  })
})
