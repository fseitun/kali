import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiClient } from './GeminiClient'

// Mock CONFIG
vi.mock('../config', () => ({
  CONFIG: {
    GEMINI: {
      API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      API_KEY: 'test-api-key'
    }
  }
}))

describe('GeminiClient', () => {
  let client: GeminiClient
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new GeminiClient()
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('makeApiCall', () => {
    it('should make successful API call', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: 'Test response from Gemini'
            }]
          }
        }]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.makeApiCall('Test prompt', {
        temperature: 0.7,
        maxTokens: 1000
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': 'test-api-key',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: 'Test prompt'
              }]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            }
          })
        }
      )

      expect(result).toEqual({ content: 'Test response from Gemini' })
    })

    it('should use default temperature and maxTokens', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: 'Default response'
            }]
          }
        }]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      await client.makeApiCall('Test prompt', {})

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: 'Test prompt'
              }]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
            }
          })
        })
      )
    })

    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid API key')
      })

      await expect(client.makeApiCall('Test prompt', {}))
        .rejects.toThrow('Gemini API error: 400 Bad Request\nInvalid API key')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(client.makeApiCall('Test prompt', {}))
        .rejects.toThrow('Network error')
    })

    it('should handle empty response content', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: ''
            }]
          }
        }]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.makeApiCall('Test prompt', {})

      expect(result).toEqual({ content: '' })
    })

    it('should handle missing candidates', async () => {
      const mockResponse = {}

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.makeApiCall('Test prompt', {})

      expect(result).toEqual({ content: '' })
    })

    it('should handle missing content in candidates', async () => {
      const mockResponse = {
        candidates: [{}]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.makeApiCall('Test prompt', {})

      expect(result).toEqual({ content: '' })
    })

    it('should handle missing parts in content', async () => {
      const mockResponse = {
        candidates: [{
          content: {}
        }]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.makeApiCall('Test prompt', {})

      expect(result).toEqual({ content: '' })
    })

    it('should handle missing text in parts', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{}]
          }
        }]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.makeApiCall('Test prompt', {})

      expect(result).toEqual({ content: '' })
    })

    it('should handle multiple candidates and use first one', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{
                text: 'First response'
              }]
            }
          },
          {
            content: {
              parts: [{
                text: 'Second response'
              }]
            }
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.makeApiCall('Test prompt', {})

      expect(result).toEqual({ content: 'First response' })
    })

    it('should handle custom temperature and maxTokens', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: 'Custom response'
            }]
          }
        }]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      await client.makeApiCall('Test prompt', {
        temperature: 0.9,
        maxTokens: 2048
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: 'Test prompt'
              }]
            }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 2048,
            }
          })
        })
      )
    })
  })
})
