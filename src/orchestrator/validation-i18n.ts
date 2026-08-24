/** Maps validation errorCode to i18n key; fallback to errors.validationFailed for unknown/missing. */
export const VALIDATION_ERROR_I18N: Record<string, string> = {
  invalidDiceRoll: "errors.invalidDiceRoll",
  chooseForkFirst: "errors.chooseForkFirst",
  answerRiddleFirst: "errors.answerRiddleFirst",
  sayEncounterRollAsAnswer: "errors.sayEncounterRollAsAnswer",
  sayRollAsAnswer: "errors.sayEncounterRollAsAnswer",
  sayRollNumber: "errors.sayRollNumber",
  finishForkMoveFirst: "errors.finishForkMoveFirst",
  wrongPhaseForRoll: "errors.wrongPhaseForRoll",
  setupNotFinished: "errors.setupNotFinished",
  invalidAnswer: "errors.invalidAnswer",
  wrongTurn: "errors.wrongTurn",
  setStateForbidden: "errors.setStateForbidden",
  pathNotAllowed: "errors.pathNotAllowed",
  invalidActionFormat: "errors.validationFailed",
};
