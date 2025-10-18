import { GameState } from './orchestrator/types'
import { CONFIG } from './config'
import { deepClone } from './utils/deep-clone'
import { Logger } from './utils/logger'

/**
 * Manages persistent game state in IndexedDB with dot-notation path access.
 */
export class StateManager {
  private db: IDBDatabase | null = null

  /**
   * Initializes the IndexedDB connection and ensures state exists.
   * @param initialState - Default state to use if no saved state exists
   * @throws Error if database connection fails or no initial state provided when needed
   */
  async init(initialState?: GameState): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.STATE.DB_NAME, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        this.initializeState(initialState).then(resolve).catch(reject)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(CONFIG.STATE.STORE_NAME)) {
          db.createObjectStore(CONFIG.STATE.STORE_NAME)
        }
      }
    })
  }

  private async initializeState(initialState?: GameState): Promise<void> {
    const existingState = await this.getState()
    if (!existingState || Object.keys(existingState).length === 0) {
      if (!initialState) {
        throw new Error('No initial state provided and no existing state found')
      }
      await this.setState(initialState)
      Logger.info('Initialized game state:', initialState)
    }
  }

  /**
   * Retrieves the current game state from IndexedDB.
   * @returns The complete game state object
   * @throws Error if database not initialized
   */
  async getState(): Promise<GameState> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CONFIG.STATE.STORE_NAME], 'readonly')
      const store = transaction.objectStore(CONFIG.STATE.STORE_NAME)
      const request = store.get(CONFIG.STATE.STATE_KEY)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || {})
    })
  }

  /**
   * Replaces the entire game state in IndexedDB.
   * @param state - The new state to persist
   * @throws Error if database not initialized
   */
  async setState(state: GameState): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CONFIG.STATE.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(CONFIG.STATE.STORE_NAME)
      const request = store.put(state, CONFIG.STATE.STATE_KEY)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Resets the game state to the provided initial state.
   * @param initialState - The state to reset to
   * @throws Error if database not initialized
   */
  async resetState(initialState: GameState): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    await this.setState(initialState)
    Logger.info('Game state reset:', initialState)
  }

  /**
   * Gets a value from state using dot-notation path.
   * @param path - Path to the value (e.g., "players.0.position")
   * @returns The value at the specified path
   */
  async get(path: string): Promise<unknown> {
    const state = await this.getState()
    return this.getByPath(state, path)
  }

  /**
   * Sets a value in state using dot-notation path.
   * @param path - Path to the value (e.g., "players.0.position")
   * @param value - The value to set
   */
  async set(path: string, value: unknown): Promise<void> {
    const state = await this.getState()
    const newState = this.setByPath(state, path, value)
    await this.setState(newState)
  }

  /**
   * Checks if a path exists in the given state.
   * @param state - The state object to check
   * @param path - Path to verify (e.g., "players.0.position")
   * @returns True if path exists and value is not undefined
   */
  pathExists(state: GameState, path: string): boolean {
    try {
      const value = this.getByPath(state, path)
      return value !== undefined
    } catch {
      return false
    }
  }

  /**
   * Retrieves a value from an object using dot-notation path.
   * @param obj - The object to traverse
   * @param path - Path to the value (e.g., "players.0.position")
   * @returns The value at the path, or undefined if not found
   */
  getByPath(obj: GameState, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      if (typeof current !== 'object') {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  private setByPath(obj: GameState, path: string, value: unknown): GameState {
    const parts = path.split('.')
    const newState = deepClone(obj)

    let current: Record<string, unknown> = newState

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }

    current[parts[parts.length - 1]] = value

    return newState
  }
}
