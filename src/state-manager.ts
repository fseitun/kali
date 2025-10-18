import { GameState } from './orchestrator/types'

export class StateManager {
  private readonly dbName = 'kali-db'
  private readonly storeName = 'gameState'
  private readonly stateKey = 'current'
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        this.initializeState().then(resolve).catch(reject)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
    })
  }

  private async initializeState(): Promise<void> {
    const existingState = await this.getState()
    if (!existingState || Object.keys(existingState).length === 0) {
      const initialState: GameState = {
        game: {
          counter: 0
        }
      }
      await this.setState(initialState)
      console.log('✅ Initialized game state:', initialState)
    }
  }

  async getState(): Promise<GameState> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(this.stateKey)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || {})
    })
  }

  async setState(state: GameState): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put(state, this.stateKey)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async get(path: string): Promise<unknown> {
    const state = await this.getState()
    return this.getByPath(state, path)
  }

  async set(path: string, value: unknown): Promise<void> {
    const state = await this.getState()
    const newState = this.setByPath(state, path, value)
    await this.setState(newState)
  }

  pathExists(state: GameState, path: string): boolean {
    try {
      const value = this.getByPath(state, path)
      return value !== undefined
    } catch {
      return false
    }
  }

  private getByPath(obj: GameState, path: string): unknown {
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
    const newState = JSON.parse(JSON.stringify(obj))

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
