import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkBrowserSupport, isMobileDevice } from './browser-support'

// Mock CONFIG
vi.mock('../config', () => ({
  CONFIG: {
    MOBILE_DEVICE_PATTERN: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
  }
}))

describe('browser-support', () => {
  describe('checkBrowserSupport', () => {
    let originalWindow: typeof window
    let originalNavigator: typeof navigator

    beforeEach(() => {
      originalWindow = globalThis.window
      originalNavigator = globalThis.navigator
    })

    afterEach(() => {
      globalThis.window = originalWindow
      globalThis.navigator = originalNavigator
    })

    it('should pass when all APIs are available', () => {
      globalThis.window = {
        AudioContext: vi.fn(),
        webkitAudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {}
      } as unknown as Window & typeof globalThis

      globalThis.navigator = {
        mediaDevices: {}
      } as unknown as Navigator

      expect(() => checkBrowserSupport()).not.toThrow()
    })

    it('should throw error when AudioContext is missing', () => {
      globalThis.window = {
        WebAssembly: {},
        indexedDB: {}
      } as unknown as Window & typeof globalThis

      globalThis.navigator = {
        mediaDevices: {}
      } as unknown as Navigator

      expect(() => checkBrowserSupport()).toThrow('AudioContext API not supported')
    })

    it('should pass when webkitAudioContext is available', () => {
      globalThis.window = {
        webkitAudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {}
      } as unknown as Window & typeof globalThis

      globalThis.navigator = {
        mediaDevices: {}
      } as unknown as Navigator

      expect(() => checkBrowserSupport()).not.toThrow()
    })

    it('should throw error when MediaDevices is missing', () => {
      globalThis.window = {
        AudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {}
      } as unknown as Window & typeof globalThis

      globalThis.navigator = {} as unknown as Navigator

      expect(() => checkBrowserSupport()).toThrow('MediaDevices API not supported')
    })

    it('should throw error when WebAssembly is missing', () => {
      globalThis.window = {
        AudioContext: vi.fn(),
        indexedDB: {}
      } as unknown as Window & typeof globalThis

      globalThis.navigator = {
        mediaDevices: {}
      } as unknown as Navigator

      expect(() => checkBrowserSupport()).toThrow('WebAssembly API not supported')
    })

    it('should throw error when IndexedDB is missing', () => {
      globalThis.window = {
        AudioContext: vi.fn(),
        WebAssembly: {}
      } as unknown as Window & typeof globalThis

      globalThis.navigator = {
        mediaDevices: {}
      } as unknown as Navigator

      expect(() => checkBrowserSupport()).toThrow('IndexedDB API not supported')
    })

    it('should throw error for first missing API', () => {
      globalThis.window = {} as unknown as Window & typeof globalThis
      globalThis.navigator = {} as unknown as Navigator

      expect(() => checkBrowserSupport()).toThrow('AudioContext API not supported')
    })
  })

  describe('isMobileDevice', () => {
    let originalNavigator: typeof navigator

    beforeEach(() => {
      originalNavigator = globalThis.navigator
    })

    afterEach(() => {
      globalThis.navigator = originalNavigator
    })

    it('should detect Android devices', () => {
      globalThis.navigator = {
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect iPhone', () => {
      globalThis.navigator = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect iPad', () => {
      globalThis.navigator = {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect BlackBerry', () => {
      globalThis.navigator = {
        userAgent: 'Mozilla/5.0 (BlackBerry; U; BlackBerry 9800; en) AppleWebKit/534.1+'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect Opera Mini', () => {
      globalThis.navigator = {
        userAgent: 'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(true)
    })

    it('should not detect desktop browsers', () => {
      globalThis.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(false)
    })

    it('should not detect macOS browsers', () => {
      globalThis.navigator = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(false)
    })

    it('should not detect Linux browsers', () => {
      globalThis.navigator = {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(false)
    })

    it('should handle empty user agent', () => {
      globalThis.navigator = {
        userAgent: ''
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(false)
    })

    it('should be case insensitive', () => {
      globalThis.navigator = {
        userAgent: 'mozilla/5.0 (android 10; sm-g975f) applewebkit/537.36'
      } as unknown as Navigator

      expect(isMobileDevice()).toBe(true)
    })
  })
})
