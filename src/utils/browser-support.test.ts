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
      originalWindow = global.window
      originalNavigator = global.navigator
    })

    afterEach(() => {
      global.window = originalWindow
      global.navigator = originalNavigator
    })

    it('should pass when all APIs are available', () => {
      global.window = {
        AudioContext: vi.fn(),
        webkitAudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {}
      } as any

      global.navigator = {
        mediaDevices: {}
      } as any

      expect(() => checkBrowserSupport()).not.toThrow()
    })

    it('should throw error when AudioContext is missing', () => {
      global.window = {
        WebAssembly: {},
        indexedDB: {}
      } as any

      global.navigator = {
        mediaDevices: {}
      } as any

      expect(() => checkBrowserSupport()).toThrow('AudioContext API not supported')
    })

    it('should pass when webkitAudioContext is available', () => {
      global.window = {
        webkitAudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {}
      } as any

      global.navigator = {
        mediaDevices: {}
      } as any

      expect(() => checkBrowserSupport()).not.toThrow()
    })

    it('should throw error when MediaDevices is missing', () => {
      global.window = {
        AudioContext: vi.fn(),
        WebAssembly: {},
        indexedDB: {}
      } as any

      global.navigator = {} as any

      expect(() => checkBrowserSupport()).toThrow('MediaDevices API not supported')
    })

    it('should throw error when WebAssembly is missing', () => {
      global.window = {
        AudioContext: vi.fn(),
        indexedDB: {}
      } as any

      global.navigator = {
        mediaDevices: {}
      } as any

      expect(() => checkBrowserSupport()).toThrow('WebAssembly API not supported')
    })

    it('should throw error when IndexedDB is missing', () => {
      global.window = {
        AudioContext: vi.fn(),
        WebAssembly: {}
      } as any

      global.navigator = {
        mediaDevices: {}
      } as any

      expect(() => checkBrowserSupport()).toThrow('IndexedDB API not supported')
    })

    it('should throw error for first missing API', () => {
      global.window = {} as any
      global.navigator = {} as any

      expect(() => checkBrowserSupport()).toThrow('AudioContext API not supported')
    })
  })

  describe('isMobileDevice', () => {
    let originalNavigator: typeof navigator

    beforeEach(() => {
      originalNavigator = global.navigator
    })

    afterEach(() => {
      global.navigator = originalNavigator
    })

    it('should detect Android devices', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36'
      } as any

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect iPhone', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
      } as any

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect iPad', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
      } as any

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect BlackBerry', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (BlackBerry; U; BlackBerry 9800; en) AppleWebKit/534.1+'
      } as any

      expect(isMobileDevice()).toBe(true)
    })

    it('should detect Opera Mini', () => {
      global.navigator = {
        userAgent: 'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54'
      } as any

      expect(isMobileDevice()).toBe(true)
    })

    it('should not detect desktop browsers', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      } as any

      expect(isMobileDevice()).toBe(false)
    })

    it('should not detect macOS browsers', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      } as any

      expect(isMobileDevice()).toBe(false)
    })

    it('should not detect Linux browsers', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      } as any

      expect(isMobileDevice()).toBe(false)
    })

    it('should handle empty user agent', () => {
      global.navigator = {
        userAgent: ''
      } as any

      expect(isMobileDevice()).toBe(false)
    })

    it('should be case insensitive', () => {
      global.navigator = {
        userAgent: 'mozilla/5.0 (android 10; sm-g975f) applewebkit/537.36'
      } as any

      expect(isMobileDevice()).toBe(true)
    })
  })
})
