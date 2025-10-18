import { GameState, PrimitiveAction } from './types'
import { StateManager } from '../state-manager'

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validates an array of primitive actions against current game state.
 * Ensures actions are well-formed and reference valid state paths.
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

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i] as PrimitiveAction
    const result = validateAction(action, state, stateManager, i)
    if (!result.valid) {
      return result
    }
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
