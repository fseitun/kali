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
      getState: vi.fn(async () => testState),
      get: vi.fn(async (path: string) => {
        if (path === 'players.p1.position') return 5
        if (path === 'game.lastRoll') return 0
        return undefined
      }),
      set: vi.fn(async (_path: string, _value: unknown) => {
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
})
