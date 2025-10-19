import { GameState, PrimitiveAction } from './types'
import { StateManager } from '../state-manager'
import { deepClone } from '../utils/deep-clone'

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Simulates the effect of an action on mock state for stateful validation.
 * Only simulates state-changing actions (SET_STATE, ADD_STATE, SUBTRACT_STATE).
 * @param state - Mock state to apply action to
 * @param action - Action to simulate
 * @param stateManager - State manager for path operations
 * @returns Updated mock state
 */
function applyActionToMockState(
  state: GameState,
  action: PrimitiveAction,
  stateManager: StateManager
): GameState {
  const mockState = deepClone(state)

  try {
    if (action.action === 'SET_STATE' && 'path' in action && 'value' in action) {
      const parts = action.path.split('.')
      let current: Record<string, unknown> = mockState

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]
        if (!(part in current)) {
          return state
        }
        current = current[part] as Record<string, unknown>
      }

      const lastPart = parts[parts.length - 1]
      current[lastPart] = action.value
    } else if (action.action === 'ADD_STATE' && 'path' in action && 'value' in action) {
      const currentValue = stateManager.getByPath(mockState, action.path)
      if (typeof currentValue === 'number') {
        const parts = action.path.split('.')
        let current: Record<string, unknown> = mockState

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]
          current = current[part] as Record<string, unknown>
        }

        const lastPart = parts[parts.length - 1]
        current[lastPart] = currentValue + action.value
      }
    } else if (action.action === 'SUBTRACT_STATE' && 'path' in action && 'value' in action) {
      const currentValue = stateManager.getByPath(mockState, action.path)
      if (typeof currentValue === 'number') {
        const parts = action.path.split('.')
        let current: Record<string, unknown> = mockState

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]
          current = current[part] as Record<string, unknown>
        }

        const lastPart = parts[parts.length - 1]
        current[lastPart] = currentValue - action.value
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
 * @returns Validation result with error message if invalid
 */
export function validateActions(
  actions: unknown,
  state: GameState,
  stateManager: StateManager
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
    const result = validateAction(action, mockState, stateManager, i)
    if (!result.valid) {
      return result
    }

    mockState = applyActionToMockState(mockState, action, stateManager)
  }

  return { valid: true }
}

function validateAction(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number
): ValidationResult {
  if (!action || typeof action !== 'object') {
    return {
      valid: false,
      error: `Action at index ${index} is not an object`
    }
  }

  if (!('action' in action)) {
    return {
      valid: false,
      error: `Action at index ${index} missing 'action' field`
    }
  }

  switch (action.action) {
    case 'SET_STATE':
      return validateSetState(action, state, stateManager, index)
    case 'ADD_STATE':
      return validateAddState(action, state, stateManager, index)
    case 'SUBTRACT_STATE':
      return validateSubtractState(action, state, stateManager, index)
    case 'READ_STATE':
      return validateReadState(action, state, stateManager, index)
    case 'NARRATE':
      return validateNarrate(action, index)
    case 'ROLL_DICE':
      return validateRollDice(action, index)
    case 'RESET_GAME':
      return validateResetGame(action, index)
    default:
      return {
        valid: false,
        error: `Action at index ${index} has invalid action type: ${(action as { action: string }).action}`
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
  const playerPathMatch = path.match(/^players\.(p\d+)\./)
  if (!playerPathMatch) {
    return { valid: true }
  }

  if (path === 'game.turn') {
    return { valid: true }
  }

  const playerId = playerPathMatch[1]
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
  const playerPathMatch = path.match(/^players\.(p\d+)\.position$/)
  if (!playerPathMatch) {
    return { valid: true }
  }

  const playerId = playerPathMatch[1]
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

function validateAddState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const pathValidation = validateField(actionRecord, 'path', 'string', 'ADD_STATE', index)
  if (!pathValidation.valid) return pathValidation

  const valueValidation = validateField(actionRecord, 'value', 'number', 'ADD_STATE', index)
  if (!valueValidation.valid) return valueValidation

  if ('path' in action && typeof action.path === 'string') {
    const turnValidation = validateTurnOwnership(action.path, state, 'ADD_STATE', index)
    if (!turnValidation.valid) return turnValidation

    const decisionMoveValidation = validateDecisionBeforeMove(action.path, state, 'ADD_STATE', index)
    if (!decisionMoveValidation.valid) return decisionMoveValidation

    if (!stateManager.pathExists(state, action.path)) {
      return {
        valid: false,
        error: `ADD_STATE at index ${index} references non-existent path: ${action.path}`
      }
    }

    const currentValue = stateManager.getByPath(state, action.path)
    if (typeof currentValue !== 'number') {
      return {
        valid: false,
        error: `ADD_STATE at index ${index} requires numeric value at path ${action.path}, got ${typeof currentValue}`
      }
    }
  }

  return { valid: true }
}

function validateSubtractState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const pathValidation = validateField(actionRecord, 'path', 'string', 'SUBTRACT_STATE', index)
  if (!pathValidation.valid) return pathValidation

  const valueValidation = validateField(actionRecord, 'value', 'number', 'SUBTRACT_STATE', index)
  if (!valueValidation.valid) return valueValidation

  if ('path' in action && typeof action.path === 'string') {
    const turnValidation = validateTurnOwnership(action.path, state, 'SUBTRACT_STATE', index)
    if (!turnValidation.valid) return turnValidation

    if (!stateManager.pathExists(state, action.path)) {
      return {
        valid: false,
        error: `SUBTRACT_STATE at index ${index} references non-existent path: ${action.path}`
      }
    }

    const currentValue = stateManager.getByPath(state, action.path)
    if (typeof currentValue !== 'number') {
      return {
        valid: false,
        error: `SUBTRACT_STATE at index ${index} requires numeric value at path ${action.path}, got ${typeof currentValue}`
      }
    }
  }

  return { valid: true }
}

function validateReadState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const pathValidation = validateField(actionRecord, 'path', 'string', 'READ_STATE', index)
  if (!pathValidation.valid) return pathValidation

  if ('path' in action && typeof action.path === 'string') {
    if (!stateManager.pathExists(state, action.path)) {
      return {
        valid: false,
        error: `READ_STATE at index ${index} references non-existent path: ${action.path}`
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

function validateRollDice(
  action: PrimitiveAction,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  return validateField(actionRecord, 'die', 'string', 'ROLL_DICE', index)
}

function validateResetGame(
  action: PrimitiveAction,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  return validateField(actionRecord, 'keepPlayerNames', 'boolean', 'RESET_GAME', index)
}
