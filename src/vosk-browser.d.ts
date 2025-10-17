declare module 'vosk-browser' {
  export interface RecognitionResult {
    text?: string
    partial?: string
    confidence?: number
  }

  export interface VoskResultMessage {
    result: RecognitionResult
  }

  export interface VoskPartialResultMessage {
    result: RecognitionResult
  }

  export interface VoskRecognizer {
    setWords(enable: boolean): void
    on(event: 'result', callback: (message: VoskResultMessage) => void): void
    on(event: 'partialresult', callback: (message: VoskPartialResultMessage) => void): void
    on(event: 'error', callback: (error: Error) => void): void
    acceptWaveformFloat(data: Float32Array, sampleRate: number): void
    remove(): void
  }

  export interface VoskModel {
    KaldiRecognizer: new (sampleRate: number) => VoskRecognizer
    terminate(): void
  }

  export function createModel(modelUrl: string): Promise<VoskModel>
}
