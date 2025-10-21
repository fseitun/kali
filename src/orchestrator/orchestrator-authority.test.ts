/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Orchestrator } from './orchestrator'
import { StateManager } from '../state-manager'
import { LLMClient } from '../llm/LLMClient'
import { SpeechService } from '../services/speech-service'
import { StatusIndicator } from '../components/status-indicator'
import { GameState, PrimitiveAction } from './types'

describe('Orchestrator Authority - LLM Adversarial Tests', () => {
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
        lastRoll: 0,
        playerOrder: ['p1', 'p2']
      },
      players: {
        p1: {
          id: 'p1',
          name: 'Alice',
          position: 10,
          hearts: 3
        },
        p2: {
          id: 'p2',
          name: 'Bob',
          position: 5,
          hearts: 2
        }
      },
      board: {
        winPosition: 100,
        moves: {
          '15': 30,
          '25': 10
        },
        squares: {
          '20': {
            type: 'challenge',
            name: 'Dragon',
            description: 'Fight or flee'
          }
        }
      },
      decisionPoints: []
    }

    mockStateManager = {
      getState: vi.fn(() => testState),
      get: vi.fn((path: string) => {
        const parts = path.split('.')
        let current: unknown = testState
        for (const part of parts) {
          current = (current as Record<string, unknown>)[part]
        }
        return current
      }),
      set: vi.fn(async (_path: string, _value: unknown) => {}),
      pathExists: (state: GameState, path: string) => {
        const parts = path.split('.')
        let current: Record<string, unknown> = state
        for (const part of parts) {
          if (!(part in current)) return false
          current = current[part] as Record<string, unknown>
        }
        return true
      },
      getByPath: (state: GameState, path: string) => {
        const parts = path.split('.')
        let current: Record<string, unknown> | unknown = state
        for (const part of parts) {
          current = (current as Record<string, unknown>)[part]
        }
        return current
      }
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

  describe('LLM Tries to Cheat - Validation Blocks', () => {
    it('blocks LLM from modifying wrong player data', async () => {
      mockLLM.getActions = vi.fn(async () => [
        {action: 'SET_STATE', path: 'players.p2.hearts', value: 999}
      ])

      await orchestrator.handleTranscript('give Bob all the hearts')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
      expect(mockStateManager.set).not.toHaveBeenCalledWith('players.p2.hearts', 999)
    })

    it('blocks LLM from changing game.turn directly', async () => {
      mockLLM.getActions = vi.fn(async () => [
        {action: 'SET_STATE', path: 'game.turn', value: 'p2'}
      ])

      await orchestrator.handleTranscript('skip to next player')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
      expect(mockStateManager.set).not.toHaveBeenCalledWith('game.turn', 'p2')
    })

    it('blocks LLM from using non-existent paths', async () => {
      mockLLM.getActions = vi.fn(async () => [
        {action: 'SET_STATE', path: 'players.p1.superPower', value: 'invincibility'}
      ])

      await orchestrator.handleTranscript('give me super powers')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
    })

    it('blocks LLM from returning malformed actions', async () => {
      mockLLM.getActions = vi.fn(async () => [
        {action: 'NARRATE'} as unknown as PrimitiveAction
      ])

      await orchestrator.handleTranscript('say something')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
    })

    it('blocks LLM from returning non-array response', async () => {
      mockLLM.getActions = vi.fn(async () => {
        return {action: 'NARRATE', text: 'Hi'} as unknown as PrimitiveAction[]
      })

      await orchestrator.handleTranscript('say hi')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
    })

    it('blocks invalid action types from LLM', async () => {
      mockLLM.getActions = vi.fn(async () => [
        {action: 'HACK_THE_GAME', payload: 'exploit'} as unknown as PrimitiveAction
      ])

      await orchestrator.handleTranscript('hack the game')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
    })
  })

  describe('LLM Cannot Skip Orchestrator Logic', () => {
    it('allows SET_STATE for position but orchestrator still applies board moves', async () => {
      let currentPosition = 10
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return currentPosition
        return undefined
      })
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          currentPosition = value as number
        }
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 15}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(currentPosition).toBe(30)
    })

    it('orchestrator triggers square effects even if LLM uses SET_STATE', async () => {
      let effectTriggered = false
      testState.players.p1.position = 15

      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return testState.players.p1.position
        return undefined
      })
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          testState.players.p1.position = value as number
        }
      })

      mockLLM.getActions = vi.fn(async (transcript: string) => {
        if (transcript.includes('square 20')) {
          effectTriggered = true
        }
        return [{action: 'NARRATE', text: 'Square effect!'}]
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 20}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(effectTriggered).toBe(true)
    })

    it('LLM cannot bypass decision points', async () => {
      testState.decisionPoints = [
        {
          position: 10,
          requiredField: 'pathChoice',
          prompt: 'Choose A or B'
        }
      ]
      testState.players.p1.pathChoice = null

      mockLLM.getActions = vi.fn(async () => [
        {action: 'SET_STATE', path: 'players.p1.position', value: 15}
      ])

      await orchestrator.handleTranscript('move forward')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
      expect(mockStateManager.set).not.toHaveBeenCalledWith('players.p1.position', 15)
    })

    it('orchestrator applies board moves after PLAYER_ROLLED', async () => {
      let currentPosition = 10
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return currentPosition
        return undefined
      })
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          currentPosition = value as number
        }
      })

      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 5}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(currentPosition).toBe(30)
    })
  })

  describe('State Consistency - Validation Matches Execution', () => {
    it('validates sequential state changes correctly', async () => {
      testState.decisionPoints = [
        {
          position: 10,
          requiredField: 'pathChoice',
          prompt: 'Choose A or B'
        }
      ]
      testState.players.p1.pathChoice = null

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.pathChoice', value: 'A'},
        {action: 'PLAYER_ROLLED', value: 5}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(true)
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.pathChoice', 'A')
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.position', 15)
    })

    it('stateful validation simulates state changes', async () => {
      testState.players.p1.hearts = 0

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.hearts', value: 5},
        {action: 'SET_STATE', path: 'players.p1.hearts', value: 3}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(true)
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.hearts', 5)
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.hearts', 3)
    })

    it('execution applies changes in same order as validation', async () => {
      const setCallOrder: string[] = []
      mockStateManager.set = vi.fn(async (path: string) => {
        setCallOrder.push(path)
      })

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.hearts', value: 2},
        {action: 'SET_STATE', path: 'players.p1.position', value: 20}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(setCallOrder[0]).toBe('players.p1.hearts')
      expect(setCallOrder[1]).toBe('players.p1.position')
    })
  })

  describe('Malicious Action Sequences', () => {
    it('allows large action arrays (performance test)', async () => {
      const actions: PrimitiveAction[] = Array(100).fill(null).map((_, i) => ({
        action: 'SET_STATE',
        path: 'players.p1.hearts',
        value: i
      }))

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(true)
      expect(mockStateManager.set).toHaveBeenCalled()
      expect((mockStateManager.set as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(100)
    })

    it('catches validation errors in deeply nested action sequences', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.hearts', value: 1},
        {action: 'SET_STATE', path: 'players.p1.hearts', value: 2},
        {action: 'SET_STATE', path: 'players.p2.hearts', value: 3},
        {action: 'SET_STATE', path: 'players.p1.hearts', value: 4}
      ]

      mockLLM.getActions = vi.fn(async () => actions)

      await orchestrator.handleTranscript('complex sequence')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
      expect(mockStateManager.set).not.toHaveBeenCalledWith('players.p2.hearts', 3)
    })

    it('fails on first invalid action in alternating sequence', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'NARRATE', text: 'Valid 1'},
        {action: 'SET_STATE', path: 'players.p2.position', value: 99},
        {action: 'NARRATE', text: 'Valid 2'}
      ]

      mockLLM.getActions = vi.fn(async () => actions)

      await orchestrator.handleTranscript('alternating actions')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
    })

    it('rejects actions with invalid primitive structure', async () => {
      const actions = [
        {wrongField: 'NARRATE', msg: 'Hi'}
      ] as unknown as PrimitiveAction[]

      mockLLM.getActions = vi.fn(async () => actions)

      await orchestrator.handleTranscript('malformed action')

      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
    })
  })

  describe('Orchestrator Does Not Manage Turn Flow', () => {
    it('executes actions without advancing turn (controller job)', async () => {
      testState.game.playerOrder = ['p1', 'p2']

      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 3}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.position', 13)
      expect(mockStateManager.set).not.toHaveBeenCalledWith('game.turn', 'p2')
    })

    it('does not check decision points for turn advancement', async () => {
      testState.decisionPoints = [
        {
          position: 10,
          requiredField: 'pathChoice',
          prompt: 'Choose A or B'
        }
      ]
      testState.players.p1.pathChoice = null

      const actions: PrimitiveAction[] = [
        {action: 'NARRATE', text: 'Done'}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(true)
      expect(mockStateManager.set).not.toHaveBeenCalledWith('game.turn', 'p2')
    })

    it('does not check game winner for turn advancement', async () => {
      testState.game.winner = 'p1'

      const actions: PrimitiveAction[] = [
        {action: 'NARRATE', text: 'Done'}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(true)
      expect(mockStateManager.set).not.toHaveBeenCalledWith('game.turn', 'p2')
    })
  })

  describe('Square Effect Context - PLAYER_ROLLED Blocking', () => {
    it('blocks PLAYER_ROLLED during square effect processing', async () => {
      testState.board.squares = {
        '5': {
          type: 'animal',
          name: 'Cobra',
          power: 4
        }
      }
      testState.game.turn = 'p1'
      testState.players.p1.position = 0

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

      let squareEffectCallCount = 0
      mockLLM.getActions = vi.fn(async (transcript: string) => {
        if (transcript.includes('[SYSTEM: Current player just landed')) {
          squareEffectCallCount++
          return [{action: 'PLAYER_ROLLED', value: 3}]
        }
        return []
      })

      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 5}
      ]

      await orchestrator.testExecuteActions(actions)

      expect(squareEffectCallCount).toBe(1)
      expect(testState.players.p1.position).toBe(5)
      expect(mockSpeech.speak).toHaveBeenCalledWith("I couldn't process that.")
    })

    it('allows NARRATE during square effect processing', async () => {
      testState.board.squares = {
        '10': {
          type: 'hazard',
          name: 'Trap',
          effect: 'skipTurn'
        }
      }
      testState.game.turn = 'p1'
      testState.players.p1.position = 5

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

      mockLLM.getActions = vi.fn(async (transcript: string) => {
        if (transcript.includes('[SYSTEM: Current player just landed')) {
          return [{action: 'NARRATE', text: 'You fell into a trap!'}]
        }
        return []
      })

      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 5}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(true)
      expect(mockSpeech.speak).toHaveBeenCalledWith('You fell into a trap!')
    })

    it('allows SET_STATE during square effect processing', async () => {
      testState.board.squares = {
        '8': {
          type: 'animal',
          name: 'Wolf',
          power: 3,
          points: 3
        }
      }
      testState.game.turn = 'p1'
      testState.players.p1.position = 5
      testState.players.p1.points = 0

      mockStateManager.getState = vi.fn(() => testState)
      mockStateManager.get = vi.fn((path: string) => {
        if (path === 'players.p1.position') return testState.players.p1.position
        if (path === 'players.p1.points') return testState.players.p1.points
        return undefined
      })
      mockStateManager.set = vi.fn(async (path: string, value: unknown) => {
        if (path === 'players.p1.position') {
          testState.players.p1.position = value as number
        }
        if (path === 'players.p1.points') {
          testState.players.p1.points = value as number
        }
      })

      mockLLM.getActions = vi.fn(async (transcript: string) => {
        if (transcript.includes('[SYSTEM: Current player just landed')) {
          return [{action: 'SET_STATE', path: 'players.p1.points', value: 3}]
        }
        return []
      })

      const actions: PrimitiveAction[] = [
        {action: 'PLAYER_ROLLED', value: 3}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(true)
      expect(mockStateManager.set).toHaveBeenCalledWith('players.p1.points', 3)
    })
  })

  describe('Defense in Depth - Validation and Execution', () => {
    it('validation catches turn violation first', async () => {
      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p2.hearts', value: 10}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(false)
      expect(mockStateManager.set).not.toHaveBeenCalledWith('players.p2.hearts', 10)
    })

    it('execution has secondary turn ownership check', async () => {
      mockStateManager.pathExists = () => true

      const actions = [
        {action: 'SET_STATE', path: 'players.p2.position', value: 50}
      ] as PrimitiveAction[]

      mockLLM.getActions = vi.fn(async () => actions)

      await orchestrator.handleTranscript('bypass validation')

      expect(mockSpeech.speak).toHaveBeenCalled()
    })

    it('orchestrator validates before and enforces during execution', async () => {
      testState.decisionPoints = [
        {
          position: 10,
          requiredField: 'pathChoice',
          prompt: 'Choose A or B'
        }
      ]
      testState.players.p1.pathChoice = null

      const actions: PrimitiveAction[] = [
        {action: 'SET_STATE', path: 'players.p1.position', value: 20}
      ]

      const success = await orchestrator.testExecuteActions(actions)

      expect(success).toBe(false)
    })
  })
})
