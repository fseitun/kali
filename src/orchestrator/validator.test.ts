import { describe, it, expect, beforeEach } from 'vitest'
import { validateActions } from './validator'
import { StateManager } from '../state-manager'
import { GameState } from './types'

describe('Validator - New Primitives', () => {
  let mockState: GameState
  let mockStateManager: StateManager

  beforeEach(() => {
    mockState = {
      game: {
        turn: 'p1',
        phase: 'PLAYING'
      },
      players: {
        p1: {
          id: 'p1',
          name: 'Player 1',
          position: 5,
          hearts: 0
        },
        p2: {
          id: 'p2',
          name: 'Player 2',
          position: 10,
          hearts: 2
        }
      }
    }

    mockStateManager = {
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
    } as StateManager
  })

  describe('PLAYER_ROLLED', () => {
    it('validates with positive value', () => {
      const actions = [{action: 'PLAYER_ROLLED', value: 5}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(true)
    })

    it('rejects zero value', () => {
      const actions = [{action: 'PLAYER_ROLLED', value: 0}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('positive value')
    })

    it('rejects negative value', () => {
      const actions = [{action: 'PLAYER_ROLLED', value: -3}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('positive value')
    })

    it('rejects missing value field', () => {
      const actions = [{action: 'PLAYER_ROLLED'}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing')
    })

    it('rejects non-number value', () => {
      const actions = [{action: 'PLAYER_ROLLED', value: 'five'}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('type')
    })
  })

  describe('PLAYER_ANSWERED', () => {
    it('validates with non-empty answer', () => {
      const actions = [{action: 'PLAYER_ANSWERED', answer: 'A'}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(true)
    })

    it('rejects empty answer', () => {
      const actions = [{action: 'PLAYER_ANSWERED', answer: ''}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('non-empty')
    })

    it('rejects missing answer field', () => {
      const actions = [{action: 'PLAYER_ANSWERED'}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing')
    })
  })

  describe('Old Primitives Rejection', () => {
    it('rejects ADD_STATE', () => {
      const actions = [{action: 'ADD_STATE', path: 'players.p1.position', value: 5}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid action type')
    })

    it('rejects SUBTRACT_STATE', () => {
      const actions = [{action: 'SUBTRACT_STATE', path: 'players.p1.hearts', value: 1}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid action type')
    })

    it('rejects READ_STATE', () => {
      const actions = [{action: 'READ_STATE', path: 'game.turn'}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid action type')
    })

    it('rejects ROLL_DICE', () => {
      const actions = [{action: 'ROLL_DICE', die: 'd6'}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid action type')
    })
  })

  describe('SET_STATE', () => {
    it('validates path and value', () => {
      const actions = [{action: 'SET_STATE', path: 'players.p1.hearts', value: 5}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(true)
    })

    it('rejects wrong player turn', () => {
      const actions = [{action: 'SET_STATE', path: 'players.p2.position', value: 1}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("Cannot modify players.p2 when it's p1's turn")
    })

    it('validates game-level path', () => {
      const actions = [{action: 'SET_STATE', path: 'game.phase', value: 'FINISHED'}]
      const result = validateActions(actions, mockState, mockStateManager)
      expect(result.valid).toBe(true)
    })
  })
})
