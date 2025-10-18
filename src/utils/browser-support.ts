import { CONFIG } from '../config'

/**
 * Checks if all required browser APIs are available.
 * @throws Error if any required API is missing
 */
export function checkBrowserSupport(): void {
  const requiredAPIs = [
    {
      name: 'AudioContext',
      api: window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    },
    { name: 'MediaDevices', api: navigator.mediaDevices },
    { name: 'WebAssembly', api: window.WebAssembly },
    { name: 'IndexedDB', api: window.indexedDB },
  ]

  for (const { name, api } of requiredAPIs) {
    if (!api) {
      throw new Error(`${name} API not supported`)
    }
  }
}

/**
 * Detects if the current device is a mobile device based on user agent.
 * @returns True if mobile device detected
 */
export function isMobileDevice(): boolean {
  return CONFIG.MOBILE_DEVICE_PATTERN.test(navigator.userAgent)
}
