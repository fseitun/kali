/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { createPlayingStateFixture } from "../test-fixtures";
import { GamePhase, type GameState, type Player } from "../types";
import { VALIDATION_ERROR_I18N } from "../validation-i18n";
import { validateActions, type ValidationResult } from "../validator";
import { setLocale, t } from "@/i18n/translations";
import type { StateManager } from "@/state-manager";

const stateManager = {
  pathExists: (state: GameState, path: string) => {
    let current: any = state;
    for (const part of path.split(".")) {
      if (current == null || !(part in current)) {
        return false;
      }
      current = current[part];
    }
    return true;
  },
  getByPath: (state: GameState, path: string) => {
    let current: any = state;
    for (const part of path.split(".")) {
      current = current?.[part];
    }
    return current;
  },
} as unknown as StateManager;

const run = (actions: unknown[], state: GameState): ValidationResult =>
  validateActions(actions, state, stateManager, {});

const players = (): Record<string, Player> => ({
  p1: { id: "p1", name: "Beni", position: 16, hearts: 0 },
  p2: { id: "p2", name: "Sofi", position: 3, hearts: 0 },
});

const powerCheckState = (): GameState =>
  createPlayingStateFixture({
    players: players(),
    squares: { "16": { name: "Cobra", power: 4 } },
    pending: { kind: "powerCheck", playerId: "p1", position: 16, power: 4, riddleCorrect: true },
  });

describe("Product scenario: Answer owed for an encounter roll", () => {
  it("Expected outcome: Rejects an answer with no number so the child is told what to say", () => {
    const result = run([{ action: "PLAYER_ANSWERED", answer: "no sé" }], powerCheckState());

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("sayRollNumber");
  });

  it("Expected outcome: Rejects a spelled out number, which nothing downstream can read", () => {
    expect(run([{ action: "PLAYER_ANSWERED", answer: "cuatro" }], powerCheckState()).valid).toBe(
      false,
    );
  });

  it("Expected outcome: Still accepts a single number in range", () => {
    expect(run([{ action: "PLAYER_ANSWERED", answer: "tiré un 7" }], powerCheckState()).valid).toBe(
      true,
    );
  });

  it("Expected outcome: Speaks a specific instruction instead of the generic fallback", () => {
    const key = VALIDATION_ERROR_I18N["sayRollNumber"];
    expect(key).toBeDefined();
    expect(key).not.toBe("errors.validationFailed");
    for (const locale of ["es-AR", "en-US"]) {
      setLocale(locale);
      expect(t(key)).not.toBe(key);
    }
    setLocale("es-AR");
  });
});

describe("Product scenario: Utterance arrives in the wrong phase", () => {
  const inPhase = (actions: unknown[], phase: GamePhase): ValidationResult => {
    const state = powerCheckState();
    (state.game as Record<string, unknown>).phase = phase;
    (state.game as Record<string, unknown>).pending = null;
    return run(actions, state);
  };

  it("Expected outcome: A roll during setup is refused with a setup specific code", () => {
    const result = inPhase([{ action: "PLAYER_ROLLED", value: 4 }], GamePhase.SETUP);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("setupNotFinished");
  });

  it("Expected outcome: An answer during setup is refused with a setup specific code", () => {
    expect(inPhase([{ action: "PLAYER_ANSWERED", answer: "4" }], GamePhase.SETUP).errorCode).toBe(
      "setupNotFinished",
    );
  });

  it("Expected outcome: The post win refusal names how to start a new game", () => {
    const result = inPhase([{ action: "PLAYER_ROLLED", value: 4 }], GamePhase.FINISHED);
    expect(result.valid).toBe(false);

    setLocale("es-AR");
    expect(t(VALIDATION_ERROR_I18N[result.errorCode as string])).toContain("juego nuevo");
    setLocale("en-US");
    expect(t(VALIDATION_ERROR_I18N[result.errorCode as string])).toContain("new game");
    setLocale("es-AR");
  });

  it("Expected outcome: The setup refusal points back at the setup question", () => {
    const result = inPhase([{ action: "PLAYER_ROLLED", value: 4 }], GamePhase.SETUP);
    for (const locale of ["es-AR", "en-US"]) {
      setLocale(locale);
      const key = VALIDATION_ERROR_I18N[result.errorCode as string];
      expect(t(key)).not.toBe(key);
    }
    setLocale("es-AR");
  });
});

describe("Product scenario: Asking for a new game after somebody won", () => {
  const finished = (): GameState => {
    const state = createPlayingStateFixture({ players: players(), squares: {} });
    (state.game as Record<string, unknown>).phase = GamePhase.FINISHED;
    (state.game as Record<string, unknown>).winner = "p1";
    return state;
  };

  it("Expected outcome: A restart keeping the roster is allowed after the win", () => {
    expect(run([{ action: "RESET_GAME", keepPlayerNames: true }], finished()).valid).toBe(true);
  });

  it("Expected outcome: A restart is allowed even when the roster question is left open", () => {
    expect(run([{ action: "RESET_GAME" }], finished()).valid).toBe(true);
  });
});

describe("Product scenario: Restart inside a multi action batch", () => {
  it("Expected outcome: A later action is gated against the turn the restart really leaves behind", () => {
    const state = createPlayingStateFixture({ players: players(), squares: {} });

    const result = run(
      [
        { action: "RESET_GAME", keepPlayerNames: false },
        { action: "SET_STATE", path: "players.p2.name", value: "Sofi" },
      ],
      state,
    );

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("wrongTurn");
  });
});
