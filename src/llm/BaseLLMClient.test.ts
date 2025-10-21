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

  describe('LLM Client is Pure Interface - No Game Logic', () => {
    it('extractActions only parses JSON, does no validation', () => {
      const invalidAction = '[{"action":"INVALID_TYPE","data":"something"}]'
      const actions = client.testExtractActions(invalidAction)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'INVALID_TYPE', data: 'something'})
    })

    it('extractActions accepts malformed action structure', () => {
      const weirdAction = '[{"notAnAction":true,"randomStuff":123}]'
      const actions = client.testExtractActions(weirdAction)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({notAnAction: true, randomStuff: 123})
    })

    it('getActions passes state context without interpreting it', async () => {
      (mockState.game as Record<string, unknown>).phase = 'FINISHED';
      (mockState.game as Record<string, unknown>).winner = 'p1'

      client.responseQueue = ['[{"action":"NARRATE","text":"Hi"}]']

      const actions = await client.getActions('test', mockState)

      expect(actions).toHaveLength(1)
      expect(client.callCount).toBe(1)
    })

    it('retry logic uses same state (no mutation)', async () => {
      const originalState = {...mockState}

      client.responseQueue = [
        'invalid',
        '[{"action":"NARRATE","text":"Retry"}]'
      ]

      await client.getActions('test', mockState)

      expect(mockState).toEqual(originalState)
    })

    it('deduplication is string-based only, no logic', async () => {
      client.responseQueue = [
        '[{"action":"NARRATE","text":"First"}]',
        '[{"action":"NARRATE","text":"Second"}]'
      ]

      await client.getActions('same command', mockState)
      await client.getActions('same command', mockState)

      expect(client.callCount).toBe(1)
    })

    it('does not validate turn ownership (orchestrator job)', async () => {
      (mockState.game as Record<string, unknown>).turn = 'p1'

      client.responseQueue = ['[{"action":"SET_STATE","path":"players.p2.position","value":99}]']

      const actions = await client.getActions('modify wrong player', mockState)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'SET_STATE', path: 'players.p2.position', value: 99})
    })

    it('does not validate paths (orchestrator job)', async () => {
      client.responseQueue = ['[{"action":"SET_STATE","path":"nonexistent.path","value":1}]']

      const actions = await client.getActions('invalid path', mockState)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'SET_STATE', path: 'nonexistent.path', value: 1})
    })

    it('does not validate action field types (orchestrator job)', async () => {
      client.responseQueue = ['[{"action":"PLAYER_ROLLED","value":"not a number"}]']

      const actions = await client.getActions('invalid type', mockState)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'PLAYER_ROLLED', value: 'not a number'})
    })

    it('does not validate required fields (orchestrator job)', async () => {
      client.responseQueue = ['[{"action":"NARRATE"}]']

      const actions = await client.getActions('missing field', mockState)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'NARRATE'})
    })

    it('propagates parsing errors for orchestrator to handle', async () => {
      client.responseQueue = [
        'not valid json at all',
        'still not valid json'
      ]

      const actions = await client.getActions('bad json', mockState)

      expect(actions).toHaveLength(0)
      expect(client.callCount).toBe(2)
    })
  })

  describe('LLM Response Format Handling', () => {
    it('successfully parses all valid primitive action types', () => {
      const json = `[
        {"action":"NARRATE","text":"Hi"},
        {"action":"SET_STATE","path":"game.phase","value":"PLAYING"},
        {"action":"PLAYER_ROLLED","value":6},
        {"action":"PLAYER_ANSWERED","answer":"A"},
        {"action":"RESET_GAME","keepPlayerNames":true}
      ]`

      const actions = client.testExtractActions(json)

      expect(actions).toHaveLength(5)
      expect(actions[0].action).toBe('NARRATE')
      expect(actions[1].action).toBe('SET_STATE')
      expect(actions[2].action).toBe('PLAYER_ROLLED')
      expect(actions[3].action).toBe('PLAYER_ANSWERED')
      expect(actions[4].action).toBe('RESET_GAME')
    })

    it('parses actions with optional fields', () => {
      const json = '[{"action":"NARRATE","text":"Hi","soundEffect":"chime.mp3"}]'
      const actions = client.testExtractActions(json)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({action: 'NARRATE', text: 'Hi', soundEffect: 'chime.mp3'})
    })

    it('parses actions with complex value types', () => {
      const json = '[{"action":"SET_STATE","path":"players.p1.inventory","value":{"gold":100,"items":["sword","shield"]}}]'
      const actions = client.testExtractActions(json)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        action: 'SET_STATE',
        path: 'players.p1.inventory',
        value: {gold: 100, items: ['sword', 'shield']}
      })
    })

    it('rejects markdown code blocks (must be pure JSON)', () => {
      const markdown = '```json\n[{"action":"NARRATE","text":"Hi"}]\n```'

      expect(() => client.testExtractActions(markdown)).toThrow('Invalid JSON')
    })

    it('rejects explanatory text before JSON', () => {
      const withText = 'Here are the actions:\n[{"action":"NARRATE","text":"Hi"}]'

      expect(() => client.testExtractActions(withText)).toThrow('Invalid JSON')
    })

    it('rejects explanatory text after JSON', () => {
      const withText = '[{"action":"NARRATE","text":"Hi"}]\nThose are the actions'

      expect(() => client.testExtractActions(withText)).toThrow('Invalid JSON')
    })
  })
})
