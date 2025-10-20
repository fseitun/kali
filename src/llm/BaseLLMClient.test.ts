import { describe, it, expect, beforeEach } from 'vitest'
import { BaseLLMClient } from './BaseLLMClient'
import { GameState } from '../orchestrator/types'

class TestLLMClient extends BaseLLMClient {
  public responseQueue: string[] = []
  public callCount = 0

  async makeApiCall(_prompt: string) {
    this.callCount++
    const response = this.responseQueue.shift() || '[]'
    return { content: response }
  }

  // Expose protected method for testing
  public testExtractActions(content: string) {
    return this.extractActions(content)
  }
}

describe('LLM - Pure JSON Parsing', () => {
  let client: TestLLMClient
  let mockState: GameState

  beforeEach(() => {
    client = new TestLLMClient()
    client.setGameRules('Test game rules')

    mockState = {
      game: { turn: 'p1', phase: 'PLAYING' },
      players: { p1: { position: 0 } }
    }
  })

  describe('extractActions', () => {
    it('parses valid JSON array', () => {
      const json = '[{"action":"NARRATE","text":"Hello"}]'
      const actions = client.testExtractActions(json)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'NARRATE', text: 'Hello'})
    })

    it('handles empty array', () => {
      const json = '[]'
      const actions = client.testExtractActions(json)

      expect(actions).toHaveLength(0)
    })

    it('parses multiple actions', () => {
      const json = '[{"action":"PLAYER_ROLLED","value":5},{"action":"NARRATE","text":"Moved!"}]'
      const actions = client.testExtractActions(json)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual({action: 'PLAYER_ROLLED', value: 5})
      expect(actions[1]).toEqual({action: 'NARRATE', text: 'Moved!'})
    })

    it('rejects markdown-wrapped JSON', () => {
      const markdown = '```json\n[{"action":"NARRATE","text":"Hi"}]\n```'

      expect(() => client.testExtractActions(markdown)).toThrow('Invalid JSON')
    })

    it('rejects malformed JSON', () => {
      const invalid = '[{"action":"NARRATE","text":"Hi}]'

      expect(() => client.testExtractActions(invalid)).toThrow('Invalid JSON')
    })

    it('rejects non-array response', () => {
      const notArray = '{"action":"NARRATE","text":"Hi"}'

      expect(() => client.testExtractActions(notArray)).toThrow('not an array')
    })
  })

  describe('getActions with retry', () => {
    it('returns actions on first successful parse', async () => {
      client.responseQueue = ['[{"action":"NARRATE","text":"Hi"}]']

      const actions = await client.getActions('test', mockState)

      expect(client.callCount).toBe(1)
      expect(actions).toHaveLength(1)
    })

    it('retries once on parse error', async () => {
      client.responseQueue = [
        'invalid json{',
        '[{"action":"NARRATE","text":"Retry success"}]'
      ]

      const actions = await client.getActions('test', mockState)

      expect(client.callCount).toBe(2)
      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'NARRATE', text: 'Retry success'})
    })

    it('returns empty array after retry failure', async () => {
      client.responseQueue = [
        'invalid json{',
        'still invalid{'
      ]

      const actions = await client.getActions('test', mockState)

      expect(client.callCount).toBe(2)
      expect(actions).toHaveLength(0)
    })

    it('handles empty response from LLM', async () => {
      client.responseQueue = ['[]']

      const actions = await client.getActions('test', mockState)

      expect(client.callCount).toBe(1)
      expect(actions).toHaveLength(0)
    })
  })
})
