export type GameState = Record<string, unknown>

export type PrimitiveAction =
  | WriteStateAction
  | ReadStateAction
  | NarrateAction

export interface WriteStateAction {
  action: 'WRITE_STATE'
  path: string
  value: unknown
}

export interface ReadStateAction {
  action: 'READ_STATE'
  path: string
}

export interface NarrateAction {
  action: 'NARRATE'
  text: string
}
