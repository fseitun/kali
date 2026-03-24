/** Maps validation errorCode to i18n key; fallback to errors.validationFailed for unknown/missing. */
export const VALIDATION_ERROR_I18N: Record<string, string> = {
  invalidDiceRoll: "errors.invalidDiceRoll",
  chooseForkFirst: "errors.chooseForkFirst",
  resolveSquareEffectFirst: "errors.resolveSquareEffectFirst",
  answerRiddleFirst: "errors.answerRiddleFirst",
  sayEncounterRollAsAnswer: "errors.sayEncounterRollAsAnswer",
  sayRollAsAnswer: "errors.sayEncounterRollAsAnswer",
  wrongPhaseForRoll: "errors.wrongPhaseForRoll",
  invalidAnswer: "errors.invalidAnswer",
  wrongTurn: "errors.wrongTurn",
  setStateForbidden: "errors.setStateForbidden",
  pathNotAllowed: "errors.pathNotAllowed",
  invalidActionFormat: "errors.validationFailed",
};
