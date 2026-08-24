/**
 * Checks if all required browser APIs are available.
 * @throws Error if any required API is missing
 */
export function checkBrowserSupport(): void {
  const requiredAPIs = [
    {
      name: "AudioContext",

      api:
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
    },
    { name: "MediaDevices", api: navigator.mediaDevices },
    { name: "AudioWorklet", api: window.AudioWorklet },
    { name: "WebSocket", api: window.WebSocket },
  ];

  for (const { name, api } of requiredAPIs) {
    if (!api) {
      throw new Error(`${name} API not supported`);
    }
  }
}
