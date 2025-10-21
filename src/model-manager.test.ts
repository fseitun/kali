/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ModelManager } from './model-manager'

// Mock CONFIG
vi.mock('./config', () => ({
  CONFIG: {
    MODEL: {
      URL: '/vosk-model-small-es-0.42.zip',
      VERSION: '0.42',
      CACHE_NAME: 'kali-models-v1'
    }
  }
}))

// Mock Logger
vi.mock('../utils/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('ModelManager', () => {
  let modelManager: ModelManager
  let mockCaches: any
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    modelManager = ModelManager.getInstance()

    // Mock Cache API
    mockCaches = {
      open: vi.fn(),
      match: vi.fn(),
      delete: vi.fn(),
      put: vi.fn()
    }

    globalThis.caches = {
      open: vi.fn().mockResolvedValue(mockCaches)
    } as unknown as CacheStorage

    // Mock fetch
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch

    // Mock URL.createObjectURL
    globalThis.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url')
    } as unknown as typeof URL

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ModelManager.getInstance()
      const instance2 = ModelManager.getInstance()

      expect(instance1).toBe(instance2)
    })
  })

  describe('getModel', () => {
    it('should return cached model if available', async () => {
      const mockBlob = new Blob(['mock data'])
      const mockResponse = {
        headers: {
          get: vi.fn().mockReturnValue('0.42') // Correct version
        },
        blob: vi.fn().mockResolvedValue(mockBlob)
      }

      mockCaches.match.mockResolvedValueOnce(mockResponse)

      const result = await modelManager.getModel()

      expect(mockCaches.match).toHaveBeenCalledWith('/vosk-model-small-es-0.42.zip')
      expect(result).toBe('blob:mock-url')
      expect(mockFetch).not.toHaveBeenCalled() // Should not download
    })

    it('should download model if not cached', async () => {
      mockCaches.match.mockResolvedValueOnce(null)

      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('1024')
        },
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await modelManager.getModel()

      expect(mockFetch).toHaveBeenCalledWith('/vosk-model-small-es-0.42.zip')
      expect(result).toBe('blob:mock-url')
    })

    it('should download model if version mismatch', async () => {
      const mockBlob = new Blob(['mock data'])
      const mockResponse = {
        headers: {
          get: vi.fn().mockReturnValue('0.9.0') // Different version
        },
        blob: vi.fn().mockResolvedValue(mockBlob)
      }

      mockCaches.match.mockResolvedValueOnce(mockResponse)
      mockCaches.delete.mockResolvedValueOnce(undefined)

      const downloadResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('1024')
        },
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      }

      mockFetch.mockResolvedValueOnce(downloadResponse)

      const result = await modelManager.getModel()

      expect(mockCaches.delete).toHaveBeenCalledWith('/vosk-model-small-es-0.42.zip')
      expect(mockFetch).toHaveBeenCalledWith('/vosk-model-small-es-0.42.zip')
      expect(result).toBe('blob:mock-url')
    })

    it('should handle cache retrieval error', async () => {
      mockCaches.match.mockRejectedValueOnce(new Error('Cache error'))

      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('1024')
        },
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await modelManager.getModel()

      expect(result).toBe('blob:mock-url')
    })

    it('should handle download failure', async () => {
      mockCaches.match.mockResolvedValueOnce(null)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      })

      await expect(modelManager.getModel()).rejects.toThrow('Failed to download model: Not Found')
    })

    it('should handle network error during download', async () => {
      mockCaches.match.mockResolvedValueOnce(null)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(modelManager.getModel()).rejects.toThrow('Network error')
    })

    it('should handle missing content length', async () => {
      mockCaches.match.mockResolvedValueOnce(null)

      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue(null) // No content length
        },
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await modelManager.getModel()

      expect(result).toBe('blob:mock-url')
    })

    it('should handle unreadable response body', async () => {
      mockCaches.match.mockResolvedValueOnce(null)

      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('1024')
        },
        body: null // No body
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(modelManager.getModel()).rejects.toThrow('Response body is not readable')
    })

    it('should call progress callback during download', async () => {
      mockCaches.match.mockResolvedValueOnce(null)

      const progressCallback = vi.fn()

      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('6') // Total length
        },
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      await modelManager.getModel(progressCallback)

      expect(progressCallback).toHaveBeenCalledWith(50) // 3/6 * 100 = 50%
    })

    it('should handle blob creation error', async () => {
      mockCaches.match.mockResolvedValueOnce(null)

      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('1024')
        },
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      // Mock Blob constructor to throw error
      globalThis.Blob = vi.fn().mockImplementation(() => {
        throw new Error('Blob creation failed')
      }) as unknown as typeof Blob

      await expect(modelManager.getModel()).rejects.toThrow('Blob creation failed')
    })
  })
})
