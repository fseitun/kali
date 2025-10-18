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

function validateWriteState(
  action: PrimitiveAction,
  state: GameState,
  stateManager: StateManager,
  index: number
): ValidationResult {
  if (!('path' in action) || typeof action.path !== 'string') {
    return {
      valid: false,
      error: `WRITE_STATE at index ${index} missing or invalid 'path' field`
    }
  }

  if (!('value' in action)) {
    return {
      valid: false,
      error: `WRITE_STATE at index ${index} missing 'value' field`
    }
  }

  if (!stateManager.pathExists(state, action.path)) {
    return {
      valid: false,
      error: `WRITE_STATE at index ${index} references non-existent path: ${action.path}`
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
  if (!('path' in action) || typeof action.path !== 'string') {
    return {
      valid: false,
      error: `READ_STATE at index ${index} missing or invalid 'path' field`
    }
  }

  if (!stateManager.pathExists(state, action.path)) {
    return {
      valid: false,
      error: `READ_STATE at index ${index} references non-existent path: ${action.path}`
    }
  }

  return { valid: true }
}

function validateNarrate(
  action: PrimitiveAction,
  index: number
): ValidationResult {
  if (!('text' in action) || typeof action.text !== 'string') {
    return {
      valid: false,
      error: `NARRATE at index ${index} missing or invalid 'text' field`
    }
  }

  return { valid: true }
}
