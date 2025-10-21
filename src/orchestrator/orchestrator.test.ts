/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Orchestrator } from './orchestrator'
import { StateManager } from '../state-manager'
import { LLMClient } from '../llm/LLMClient'
import { SpeechService } from '../services/speech-service'
import { StatusIndicator } from '../components/status-indicator'
import { GameState, PrimitiveAction } from './types'

describe('Orchestrator - New Action Handlers', () => {
  let orchestrator: Orchestrator
  let mockLLM: LLMClient
  let mockStateManager: StateManager
  let mockSpeech: SpeechService
  let mockIndicator: StatusIndicator
  let testState: GameState

  beforeEach(() => {
    testState = {
      game: {
        turn: 'p1',
        phase: 'PLAYING',
        lastRoll: 0
      },
      players: {
        p1: {
          id: 'p1',
          name: 'Player 1',
          position: 5,
          hearts: 0
        }
      },
      board: {
        winPosition: 100,
        moves: {},
        squares: {}
      }
    }

    mockStateManager = {
      getState: vi.fn(() => testState),
      get: vi.fn((path: string) => {
        if (path === 'players.p1.position') return 5
        if (path === 'game.lastRoll') return 0
        return undefined
      }),
      set: vi.fn((_path: string, _value: unknown) => {
        // Mock implementation
      })
    } as unknown as StateManager

    mockSpeech = {
      speak: vi.fn(async () => {}),
      playSound: vi.fn()
    } as unknown as SpeechService

    mockIndicator = {
      setState: vi.fn()
    } as unknown as StatusIndicator

    mockLLM = {
      getActions: vi.fn(async () => []),
      setGameRules: vi.fn()
    } as unknown as LLMClient

    orchestrator = new Orchestrator(
      mockLLM,
      mockStateManager,
      mockSpeech,
      mockIndicator,
      testState
    )
  })

  describe('PLAYER_ROLLED', () => {
    it('infers playerId from game.turn', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 3}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.position', 8)
      expect(mockStateManager.set).toHaveBeenCalledWith('game.lastRoll', 3)
    })

    it('calculates new position correctly', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 10}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.position', 15)
    })
  })

  describe('PLAYER_ANSWERED', () => {
    it('stores answer in game.lastAnswer', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ANSWERED', answer: 'A'}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.set).toHaveBeenCalledWith('game.lastAnswer', 'A')
    })

    it('handles multi-word answers', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ANSWERED', answer: 'fight the dragon'}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.set).toHaveBeenCalledWith('game.lastAnswer', 'fight the dragon')
    })
  })

  describe('Board Mechanics - Orchestrator Control', () => {
    it.skip('auto-applies ladder after position change', async () => {
      testState.board = {
        winPosition: 100,
        moves: { '10': 25 },
        squares: {}
      }
      testState.players.p1.position = 5

      mockStateManager.getState = vi.fn(() => testState)
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return testState.players.p1.position
        return undefined
      })
      let setCallsForPosition = 0
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          setCallsForPosition++
          testState.players.p1.position = value as number
        }
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 10}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(setCallsForPosition).toBeGreaterThanOrEqual(2)
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.position', 25)
    })

    it.skip('auto-applies snake after position change', async () => {
      testState.board = {
        winPosition: 100,
        moves: { '15': 5 },
        squares: {}
      }
      testState.players.p1.position = 10

      mockStateManager.getState = vi.fn(() => testState)
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return testState.players.p1.position
        return undefined
      })
      let setCallsForPosition = 0
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          setCallsForPosition++
          testState.players.p1.position = value as number
        }
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 15}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(setCallsForPosition).toBeGreaterThanOrEqual(2)
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.position', 5)
    })

    it('applies board moves after PLAYER_ROLLED', async () => {
      testState.board = {
        winPosition: 100,
        moves: { '10': 25 },
        squares: {}
      }
      testState.players.p1.position = 8

      mockStateManager.getState = vi.fn(() => testState)
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return testState.players.p1.position
        return undefined
      })
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          testState.players.p1.position = value as number
        }
      })

      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 2}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(testState.players.p1.position).toBe(25)
    })

    it.skip('LLM cannot bypass board moves (orchestrator always applies)', async () => {
      testState.board = {
        winPosition: 100,
        moves: { '10': 25 },
        squares: {}
      }
      testState.players.p1.position = 5

      mockStateManager.getState = vi.fn(() => testState)
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return testState.players.p1.position
        return undefined
      })
      let setCallsForPosition = 0
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          setCallsForPosition++
          testState.players.p1.position = value as number
        }
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 10}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(setCallsForPosition).toBeGreaterThanOrEqual(2)
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.position', 25)
    })
  })

  describe('Square Effects - Orchestrator Triggers', () => {
    it.skip('triggers LLM call when landing on special square', async () => {
      testState.board = {
        winPosition: 100,
        moves: {},
        squares: {
          '20': {
            type: 'challenge',
            name: 'Dragon Square',
            description: 'Fight or flee'
          }
        }
      }
      testState.players.p1.position = 15

      mockStateManager.getState = vi.fn(() => testState)
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return testState.players.p1.position
        return undefined
      })
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          testState.players.p1.position = value as number
        }
      })

      let llmCallCount = 0
      mockLLM.getActions = vi.fn(async () => {
        llmCallCount++
        return [{action: 'NARRATE', text: 'Square effect!'}]
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 20}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(llmCallCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('handleTranscript - Return Value and Separation of Concerns', () => {
    it('returns true when transcript processed successfully', async () => {
      mockLLM.getActions = vi.fn(async () => [
        {action: 'NARRATE', text: 'Hello'}
      ])

      const success = await orchestrator.handleTranscript('test command')

      expect(success).toBe(true)
    })

    it('returns false when transcript processing fails', async () => {
      mockLLM.getActions = vi.fn(async () => {
        throw new Error('LLM error')
      })

      const success = await orchestrator.handleTranscript('test command')

      expect(success).toBe(false)
    })

    it('returns false when validation fails', async () => {
      mockLLM.getActions = vi.fn(async () => [
        {action: 'SET_STATE', path: 'players.p2.position', value: 99}
      ])

      const success = await orchestrator.handleTranscript('cheat command')

      expect(success).toBe(false)
    })

    it('does not advance turn (no longer its responsibility)', async () => {
      testState.game.turn = 'p1'
      testState.game.playerOrder = ['p1', 'p2']

      mockLLM.getActions = vi.fn(async () => [
        {action: 'PLAYER_ROLLED', value: 5}
      ])

      await orchestrator.handleTranscript('I rolled 5')

      expect(mockStateManager.set).not.toHaveBeenCalledWith('game.turn', 'p2')
    })

    it('testExecuteActions does not advance turn', async () => {
      testState.game.turn = 'p1'
      testState.game.playerOrder = ['p1', 'p2']

      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 3}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.set).not.toHaveBeenCalledWith('game.turn', 'p2')
    })
  })

  describe('Processing Lock - Concurrency Protection', () => {
    it('isLocked returns false when idle', () => {
      expect(orchestrator.isLocked()).toBe(false)
    })

    it('isLocked returns true while processing', async () => {
      mockLLM.getActions = vi.fn(async () => {
        expect(orchestrator.isLocked()).toBe(true)
        return []
      })

      await orchestrator.handleTranscript('test')
    })

    it('rejects concurrent handleTranscript calls', async () => {
      let firstCallResolved = false
      mockLLM.getActions = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        firstCallResolved = true
        return []
      })

      const promise1 = orchestrator.handleTranscript('first')
      const promise2 = orchestrator.handleTranscript('second')

      await Promise.all([promise1, promise2])

      expect(firstCallResolved).toBe(true)
      expect(mockLLM.getActions).toHaveBeenCalledTimes(1)
    })

    it('rejects concurrent testExecuteActions calls', async () => {
      let callCount = 0

      mockSpeech.speak = vi.fn(async () => {
        callCount++
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      const actions: PrimitiveAction[] = [{action: 'NARRATE', text: 'test'}]

      const promise1 = orchestrator.testExecuteActions(actions)
      await new Promise(resolve => setTimeout(resolve, 10))
      const promise2 = orchestrator.testExecuteActions(actions)

      const results = await Promise.all([promise1, promise2])

      expect(callCount).toBe(1)
      expect(results[0]).toBe(true)
      expect(results[1]).toBe(false)
    })

    it('releases lock after successful execution', async () => {
      mockLLM.getActions = vi.fn(async () => [])

      await orchestrator.handleTranscript('test')

      expect(orchestrator.isLocked()).toBe(false)
    })

    it('releases lock after failed execution', async () => {
      mockLLM.getActions = vi.fn(async () => {
        throw new Error('LLM error')
      })

      await orchestrator.handleTranscript('test')

      expect(orchestrator.isLocked()).toBe(false)
    })

    it('releases lock after exception', async () => {
      mockStateManager.set = vi.fn(async () => {
        throw new Error('State error')
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 10}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(orchestrator.isLocked()).toBe(false)
    })
  })

  describe('RESET_GAME', () => {
    beforeEach(() => {
      testState.players = {
        p1: { id: 'p1', name: 'Alice', position: 50, hearts: 3 },
        p2: { id: 'p2', name: 'Bob', position: 30, hearts: 1 }
      }
      testState.game.playerOrder = ['p1', 'p2']

      mockStateManager.getState = vi.fn(() => testState)
      mockStateManager.resetState = vi.fn((initialState: GameState) => {
        testState = {...initialState}
        testState.players = {
          p1: { id: 'p1', name: 'Player 1', position: 0, hearts: 0 },
          p2: { id: 'p2', name: 'Player 2', position: 0, hearts: 0 }
        }
      })
    })

    it('resets with keepPlayerNames true', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'RESET_GAME', keepPlayerNames: true}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.resetState).toHaveBeenCalled()
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.name', 'Alice')
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p2.name', 'Bob')
    })

    it('resets with keepPlayerNames false', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'RESET_GAME', keepPlayerNames: false}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.resetState).toHaveBeenCalled()
      expect(mockStateManager.set).not.toHaveBeenCalledWith('players.p1.name', 'Alice')
      expect(mockStateManager.set).not.toHaveBeenCalledWith('players.p2.name', 'Bob')
    })
  })
})
