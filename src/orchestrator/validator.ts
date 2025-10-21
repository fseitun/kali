import { GameState, PrimitiveAction } from './types'
import { StateManager } from '../state-manager'
import { deepClone } from '../utils/deep-clone'
import type { Orchestrator } from './orchestrator'

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Simulates the effect of an action on mock state for stateful validation.
 * Only simulates state-changing actions (SET_STATE, PLAYER_ROLLED).
 * @param state - Mock state to apply action to
 * @param primitive - Action to simulate
 * @param stateManager - State manager for path operations
 * @returns Updated mock state
 */
function applyActionToMockState(
  state: GameState,
  primitive: PrimitiveAction,
): GameState {
  const mockState = deepClone(state)

  try {
    if (primitive.action === 'SET_STATE' && 'path' in primitive && 'value' in primitive) {
      const parts = primitive.path.split('.')
      let current: Record<string, unknown> = mockState

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]
        if (!(part in current)) {
          return state
        }
        current = current[part] as Record<string, unknown>
      }

      const lastPart = parts[parts.length - 1]
      current[lastPart] = primitive.value
    } else if (primitive.action === 'PLAYER_ROLLED' && 'value' in primitive) {
      // Simulate position change for current player
      const game = mockState.game as Record<string, unknown> | undefined
      const currentTurn = game?.turn as string | undefined

      if (currentTurn) {
        const players = mockState.players as Record<string, Record<string, unknown>> | undefined
        const player = players?.[currentTurn]

        if (player && typeof player.position === 'number') {
          player.position += primitive.value
        }
      }
    }
  } catch {
    return state
  }

  return mockState
}

/**
 * Validates an array of primitive actions against current game state.
 * Uses stateful validation - simulates each action's effect before validating the next.
 * This allows sequential commands like "choose path A and roll 5" to work correctly.
 * @param actions - The actions array to validate
 * @param state - Current game state for path validation
 * @param stateManager - State manager for path operations
 * @param orchestrator - Orchestrator instance for context checking (optional for backward compatibility)
 * @returns Validation result with error message if invalid
 */
export function validateActions(
  actions: unknown,
  state: GameState,
  stateManager: StateManager,
  orchestrator?: Orchestrator
): ValidationResult {
  if (!Array.isArray(actions)) {
    return {
      valid: false,
      error: 'Actions must be an array'
    }
  }

  let mockState = deepClone(state)

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i] as PrimitiveAction
    const result = validateAction(action, mockState, stateManager, i, orchestrator)
    if (!result.valid) {
      return result
    }

    mockState = applyActionToMockState(mockState, action)
  }

  return { valid: true }
}

function validateAction(
  primitive: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number,
  orchestrator?: Orchestrator
): ValidationResult {
  if (!primitive || typeof primitive !== 'object') {
    return {
      valid: false,
      error: `Action at index ${index} is not an object`
    }
  }

  if (!('action' in primitive)) {
    return {
      valid: false,
      error: `Action at index ${index} missing 'action' field`
    }
  }

  switch (primitive.action) {
    case 'NARRATE':
      return validateNarrate(primitive, index)
    case 'RESET_GAME':
      return validateResetGame(primitive, index)
    case 'SET_STATE':
      return validateSetState(primitive, state, stateManager, index)
    case 'PLAYER_ROLLED':
      return validatePlayerRolled(primitive, index, orchestrator)
    case 'PLAYER_ANSWERED':
      return validatePlayerAnswered(primitive, index)
    default:
      return {
        valid: false,
        error: `Action at index ${index} has invalid action type: ${(primitive as { action: string }).action}`
      }
  }
}

function validateField(
  action: Record<string, unknown>,
  fieldName: string,
  fieldType: string,
  actionType: string,
  index: number,
  required = true
): ValidationResult {
  if (!(fieldName in action)) {
    if (required) {
      return {
        valid: false,
        error: `${actionType} at index ${index} missing '${fieldName}' field`
      }
    }
    return { valid: true }
  }

  if (typeof action[fieldName] !== fieldType) {
    return {
      valid: false,
      error: `${actionType} at index ${index} has invalid '${fieldName}' field type`
    }
  }

  return { valid: true }
}

function validateTurnOwnership(
  path: string,
  state: GameState,
  actionType: string,
  index: number
): ValidationResult {
  if (!path.startsWith('players.')) {
    return { valid: true }
  }

  if (path === 'game.turn') {
    return { valid: true }
  }

  const parts = path.split('.')
  if (parts.length < 2) {
    return { valid: true }
  }

  const playerId = parts[1]
  const game = state.game as Record<string, unknown> | undefined
  const currentTurn = game?.turn as string | undefined

  if (!currentTurn) {
    return { valid: true }
  }

  if (playerId !== currentTurn) {
    return {
      valid: false,
      error: `${actionType} at index ${index}: Cannot modify players.${playerId} when it's ${currentTurn}'s turn. Modify players.${currentTurn} instead.`
    }
  }

  return { valid: true }
}

function validateDecisionBeforeMove(
  path: string,
  state: GameState,
  actionType: string,
  index: number
): ValidationResult {
  if (!path.endsWith('.position') || !path.startsWith('players.')) {
    return { valid: true }
  }

  const parts = path.split('.')
  if (parts.length !== 3) {
    return { valid: true }
  }

  const playerId = parts[1]
  const players = state.players as Record<string, Record<string, unknown>> | undefined
  const player = players?.[playerId]

  if (!player) {
    return { valid: true }
  }

  const currentPosition = player.position as number | undefined

  if (typeof currentPosition !== 'number') {
    return { valid: true }
  }

  const decisionPoints = state.decisionPoints as Array<{
    position: number
    requiredField: string
    prompt: string
  }> | undefined

  if (!decisionPoints || decisionPoints.length === 0) {
    return { valid: true }
  }

  const decisionPoint = decisionPoints.find(dp => dp.position === currentPosition)

  if (!decisionPoint) {
    return { valid: true }
  }

  const fieldValue = player[decisionPoint.requiredField]

  if (fieldValue === null || fieldValue === undefined) {
    return {
      valid: false,
      error: `${actionType} at index ${index}: Cannot move from position ${currentPosition}. Player must choose '${decisionPoint.requiredField}' first. ${decisionPoint.prompt}`
    }
  }

  return { valid: true }
}

function validateSetState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const pathValidation = validateField(actionRecord, 'path', 'string', 'SET_STATE', index)
  if (!pathValidation.valid) return pathValidation

  if (!('value' in action)) {
    return {
      valid: false,
      error: `SET_STATE at index ${index} missing 'value' field`
    }
  }

  if ('path' in action && typeof action.path === 'string') {
    if (action.path === 'game.turn') {
      const game = state.game as Record<string, unknown> | undefined
      const currentPhase = game?.phase as string | undefined

      if (currentPhase !== 'SETUP') {
        return {
          valid: false,
          error: `SET_STATE at index ${index}: Cannot manually change game.turn. The orchestrator automatically advances turns when all effects are complete. Remove this action and let the orchestrator handle turn advancement.`
        }
      }
    }

    const turnValidation = validateTurnOwnership(action.path, state, 'SET_STATE', index)
    if (!turnValidation.valid) return turnValidation

    const decisionMoveValidation = validateDecisionBeforeMove(action.path, state, 'SET_STATE', index)
    if (!decisionMoveValidation.valid) return decisionMoveValidation

    if (!stateManager.pathExists(state, action.path)) {
      return {
        valid: false,
        error: `SET_STATE at index ${index} references non-existent path: ${action.path}`
      }
    }
  }

  return { valid: true }
}

function validatePlayerRolled(
  action: PrimitiveAction,
  index: number,
  orchestrator?: Orchestrator
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const valueValidation = validateField(actionRecord, 'value', 'number', 'PLAYER_ROLLED', index)
  if (!valueValidation.valid) return valueValidation

  // Value must be positive
  if ('value' in actionRecord && typeof actionRecord.value === 'number') {
    if (actionRecord.value <= 0) {
      return {
        valid: false,
        error: `PLAYER_ROLLED at index ${index} requires positive value, got ${actionRecord.value}`
      }
    }
  }

  if (orchestrator?.isProcessingEffect()) {
    return {
      valid: false,
      error: `PLAYER_ROLLED at index ${index}: Cannot roll dice during square effect processing. The square effect must be resolved first (fight/flee decision, etc.).`
    }
  }

  return { valid: true }
}

function validatePlayerAnswered(
  action: PrimitiveAction,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const answerValidation = validateField(actionRecord, 'answer', 'string', 'PLAYER_ANSWERED', index)
  if (!answerValidation.valid) return answerValidation

  // Answer cannot be empty
  if ('answer' in actionRecord && typeof actionRecord.answer === 'string') {
    if (actionRecord.answer.trim() === '') {
      return {
        valid: false,
        error: `PLAYER_ANSWERED at index ${index} requires non-empty answer`
      }
    }
  }

  return { valid: true }
}

function validateNarrate(
  action: PrimitiveAction,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const textValidation = validateField(actionRecord, 'text', 'string', 'NARRATE', index)
  if (!textValidation.valid) return textValidation

  if ('soundEffect' in actionRecord && actionRecord.soundEffect !== null && actionRecord.soundEffect !== undefined) {
    return validateField(actionRecord, 'soundEffect', 'string', 'NARRATE', index, false)
  }

  return { valid: true }
}

function validateResetGame(
  action: PrimitiveAction,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  return validateField(actionRecord, 'keepPlayerNames', 'boolean', 'RESET_GAME', index)
}
