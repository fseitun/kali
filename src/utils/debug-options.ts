/**
 * Debug-only options. Used by debug UI to control logging behavior.
 * Default: log state disabled (avoids huge board/state dumps in console).
 */
let logStateEnabled = false;

export function setLogStateEnabled(enabled: boolean): void {
  logStateEnabled = enabled;
}

export function isLogStateEnabled(): boolean {
  return logStateEnabled;
}
