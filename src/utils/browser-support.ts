import { CONFIG } from '../config'

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

export function isMobileDevice(): boolean {
  return CONFIG.MOBILE_DEVICE_PATTERN.test(navigator.userAgent)
}
