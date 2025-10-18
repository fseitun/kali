export class Logger {
  static info(message: string, ...args: unknown[]): void {
    console.log(`✅ ${message}`, ...args)
  }

  static warn(message: string, ...args: unknown[]): void {
    console.warn(`⚠️ ${message}`, ...args)
  }

  static error(message: string, ...args: unknown[]): void {
    console.error(`❌ ${message}`, ...args)
  }

  static debug(message: string, ...args: unknown[]): void {
    console.log(`🔍 ${message}`, ...args)
  }

  static listening(message: string): void {
    console.log(`👂 ${message}`)
  }

  static transcription(message: string): void {
    console.log(`📝 ${message}`)
  }

  static narration(message: string): void {
    console.log(`🔊 ${message}`)
  }

  static wakeWord(message: string): void {
    console.log(`🔥 ${message}`)
  }

  static brain(message: string): void {
    console.log(`🧠 ${message}`)
  }

  static download(message: string): void {
    console.log(`📥 ${message}`)
  }

  static mic(message: string): void {
    console.log(`🎤 ${message}`)
  }

  static headphones(message: string): void {
    console.log(`🎧 ${message}`)
  }

  static stop(message: string): void {
    console.log(`🛑 ${message}`)
  }

  static timeout(message: string): void {
    console.log(`⏱️ ${message}`)
  }

  static state(message: string, ...args: unknown[]): void {
    console.log(`📊 ${message}`, ...args)
  }

  static write(message: string): void {
    console.log(`✏️ ${message}`)
  }

  static read(message: string): void {
    console.log(`👁️ ${message}`)
  }

  static robot(message: string, ...args: unknown[]): void {
    console.log(`🤖 ${message}`, ...args)
  }
}
