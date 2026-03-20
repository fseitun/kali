import type { GameState, PrimitiveAction } from "../types";
import { validateField } from "./common";
import type { ValidationResult } from "./types";

export function validatePlayerAnswered(
  action: PrimitiveAction,
  state: GameState,
  index: number,
): ValidationResult {
  const actionRecord = action as unknown as Record<string, unknown>;
  const answerValidation = validateField(
    actionRecord,
    "answer",
    "string",
    "PLAYER_ANSWERED",
    index,
  );
  if (!answerValidation.valid) return answerValidation;

  // Answer cannot be empty
  if ("answer" in action && typeof action.answer === "string") {
    if (action.answer.trim() === "") {
      return {
        valid: false,
        error: `PLAYER_ANSWERED at index ${index} requires non-empty answer`,
        errorCode: "invalidAnswer",
      };
    }
  }

  const answer = ((action as { answer?: string }).answer ?? "").trim();
  const game = state.game as Record<string, unknown> | undefined;
  const currentTurn = game?.turn as string | undefined;
  const currentPlayer = (state.players as Record<string, Record<string, unknown>> | undefined)?.[
    currentTurn ?? ""
  ];
  const decisionPoints = state.decisionPoints as
    | Array<{ position: number; positionOptions?: Record<string, number> }>
    | undefined;

  if (!currentTurn || !currentPlayer) return { valid: true };

  // Riddle phase with structured options: accept any non-empty answer; orchestrator does strict match then LLM
  const pending = game?.pendingAnimalEncounter as
    | { phase?: string; playerId?: string; correctOption?: string; riddleOptions?: string[] }
    | null
    | undefined;
  if (pending?.phase === "riddle" && pending.playerId === currentTurn && pending.correctOption) {
    if (!answer) {
      return {
        valid: false,
        error: `PLAYER_ANSWERED at index ${index}: requires non-empty answer`,
        errorCode: "invalidAnswer",
      };
    }
    return { valid: true };
  }

  // Power check / revenge: numeric roll; range depends on dice (2d6 vs 1d6). Reject impossible values.
  const pendingWithRiddle = pending as
    | { phase?: string; playerId?: string; riddleCorrect?: boolean }
    | null
    | undefined;
  if (
    (pendingWithRiddle?.phase === "powerCheck" || pendingWithRiddle?.phase === "revenge") &&
    pendingWithRiddle.playerId === currentTurn
  ) {
    const rollStr = answer.trim().replace(/\D/g, "") || answer.trim();
    const roll = parseInt(rollStr, 10);
    if (Number.isNaN(roll)) return { valid: true }; // non-numeric falls through to other rules
    const is2d6 =
      pendingWithRiddle.phase === "powerCheck" && pendingWithRiddle.riddleCorrect === true;
    const minRoll = is2d6 ? 2 : 1;
    const maxRoll = is2d6 ? 12 : 6;
    if (roll >= minRoll && roll <= maxRoll) {
      return { valid: true };
    }
    return {
      valid: false,
      error: `PLAYER_ANSWERED at index ${index}: Roll must be ${minRoll}-${maxRoll} (${is2d6 ? "2d6" : "1d6"}), got ${roll}.`,
      errorCode: "invalidDiceRoll",
    };
  }

  const position = currentPlayer.position as number | undefined;
  const choices = currentPlayer.activeChoices as Record<string, number> | undefined;
  const hasChoiceAt = (pos: number): boolean => choices?.[String(pos)] !== undefined;

  // Path choice (A/B) can only be applied when at position 0 with pending fork choice
  const firstChar = answer.charAt(0).toUpperCase();
  if (firstChar === "A" || firstChar === "B") {
    const pathChoiceDp = decisionPoints?.find((dp) => dp.position === 0);
    if (!pathChoiceDp) return { valid: true };
    const atDecisionSquare = typeof position === "number" && position === 0;
    const hasPendingPathChoice = atDecisionSquare && !hasChoiceAt(0);
    if (!hasPendingPathChoice) {
      return {
        valid: false,
        error: `PLAYER_ANSWERED at index ${index}: Path choice (A/B) can only be applied when the current turn player is at position 0 with no fork choice. Current player has no pending path choice.`,
        errorCode: "invalidAnswer",
      };
    }
    return { valid: true };
  }

  // positionOptions answers (e.g. "1", "15", "97", "99") can only be applied when at that fork with pending choice.
  // Only validate when we're actually at a decision point; otherwise "1" at position 1 would wrongly match position 0's option "1".
  if (!decisionPoints?.length) return { valid: true };
  const numMatch = answer.match(/\d+/);
  for (const dp of decisionPoints) {
    const atFork = typeof position === "number" && position === dp.position;
    const hasPending = atFork && !hasChoiceAt(dp.position);
    if (!atFork || !hasPending) continue;

    const options = dp.positionOptions;
    if (!options) continue;
    const matchesOption = Object.keys(options).some(
      (key) => answer === key || numMatch?.[0] === key,
    );
    if (matchesOption) return { valid: true };
  }

  return { valid: true };
}
