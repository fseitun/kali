/**
 * Context passed to validators instead of Orchestrator. Decouples validation from orchestrator type.
 */
export interface ValidatorContext {
  isProcessingEffect: boolean;
  allowScenarioOnlyStatePaths?: boolean;
  /** When true, SET_STATE on players.*.position is allowed even when a fork choice is pending (debug teleport only). */
  allowBypassPositionDecisionGate?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  /** When set, orchestrator may speak a dedicated i18n message (e.g. errors.invalidDiceRoll). */
  errorCode?: string;
}
