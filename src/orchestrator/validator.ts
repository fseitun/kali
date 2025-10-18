import { GameState, PrimitiveAction } from './types'
import { StateManager } from '../state-manager'

export interface ValidationResult {
  valid: boolean
  error?: string
}

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
    case 'WRITE_STATE':
      return validateWriteState(action, state, stateManager, index)
    case 'READ_STATE':
      return validateReadState(action, state, stateManager, index)
    case 'NARRATE':
      return validateNarrate(action, index)
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

function validateWriteState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>
  const pathValidation = validateField(actionRecord, 'path', 'string', 'WRITE_STATE', index)
  if (!pathValidation.valid) return pathValidation

  if (!('value' in action)) {
    return {
      valid: false,
      error: `WRITE_STATE at index ${index} missing 'value' field`
    }
  }

  if ('path' in action && typeof action.path === 'string') {
    if (!stateManager.pathExists(state, action.path)) {
      return {
        valid: false,
        error: `WRITE_STATE at index ${index} references non-existent path: ${action.path}`
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
  return validateField(actionRecord, 'text', 'string', 'NARRATE', index)
}
