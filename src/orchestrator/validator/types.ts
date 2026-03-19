export interface ValidationResult {
  valid: boolean;
  error?: string;
  /** When set, orchestrator may speak a dedicated i18n message (e.g. errors.invalidDiceRoll). */
  errorCode?: string;
}
