import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./translations";
import { getDecisionPointApplyState } from "@/orchestrator/decision-helpers";
import { getDecisionPoints } from "@/orchestrator/decision-point-inference";
import { GamePhase, type DecisionPoint, type GameState } from "@/orchestrator/types";

const _dir = dirname(fileURLToPath(import.meta.url));
const kalimbaConfigPath = join(_dir, "../../public/games/kalimba/config.json");

type ForkDirection = "forward" | "backward";

function kalimbaSquares(): Record<string, unknown> {
  const raw = readFileSync(kalimbaConfigPath, "utf-8");
  return (JSON.parse(raw) as { squares: Record<string, unknown> }).squares;
}

function kalimbaDecisionPoints(): DecisionPoint[] {
  return getDecisionPoints({ board: { squares: kalimbaSquares() } } as unknown as GameState);
}

/** A player standing on `position`, mid-retreat when the fork is a backward one. */
function stateAtFork(position: number, direction: ForkDirection): GameState {
  return {
    game: {
      name: "Kalimba",
      phase: GamePhase.PLAYING,
      turn: "p1",
      playerOrder: ["p1"],
      winner: null,
      lastRoll: null,
      pending:
        direction === "backward"
          ? { kind: "completeRollMovement", playerId: "p1", remainingSteps: 1, direction }
          : null,
    },
    players: { p1: { id: "p1", name: "Fico", position, activeChoices: {} } },
    board: { squares: kalimbaSquares() },
  } as unknown as GameState;
}

/** The square a spoken answer picks, through the same matcher gameplay uses. */
function answerPicks(position: number, direction: ForkDirection, said: string): number | null {
  const applied = getDecisionPointApplyState(stateAtFork(position, direction), said);
  return applied === null ? null : Number(applied.value);
}

describe("Product scenario: Kalimba fork keywords answer the prompt Kali speaks", () => {
  afterEach(() => {
    setLocale("es-AR");
  });

  it("Expected outcome: Each fork prompt's own words resolve to its own branches (es AR)", () => {
    setLocale("es-AR");
    const decisionPoints = kalimbaDecisionPoints();
    expect(decisionPoints.length).toBeGreaterThan(0);

    for (const dp of decisionPoints) {
      const direction = dp.direction ?? "forward";
      const targets = Object.values(dp.positionOptions ?? {}).sort((a, b) => a - b);
      // "… izquierda o … derecha" / "… al 97 o al 99": each half is what a child echoes back.
      const halves = dp.prompt.split(/\s+o\s+(?:al\s+)?/);
      expect([dp.position, dp.prompt, halves.length]).toEqual([dp.position, dp.prompt, 2]);
      halves.forEach((half, i) => {
        expect([dp.position, half, answerPicks(dp.position, direction, half)]).toEqual([
          dp.position,
          half,
          targets[i],
        ]);
      });
    }
  });

  it("Expected outcome: Resolves what a child actually says at each fork (es AR)", () => {
    setLocale("es-AR");
    const cases: Array<[number, ForkDirection, string, number]> = [
      [0, "forward", "por la izquierda", 1],
      [0, "forward", "el camino corto", 1],
      [0, "forward", "a la derecha", 15],
      [0, "forward", "el largo", 15],
      // Nothing converts spoken number words before a fork answer is matched.
      [0, "forward", "el uno", 1],
      [0, "forward", "quince", 15],
      [96, "forward", "el pingüino", 97],
      [96, "forward", "pinguino", 97], // Deepgram routinely drops the diéresis
      [96, "forward", "para arriba", 99],
      [96, "forward", "el narval", 99],
      [101, "forward", "abajo", 102],
      [101, "forward", "el oso polar", 105],
      [101, "backward", "para abajo", 98],
      [101, "backward", "arriba", 100],
      [106, "backward", "abajo", 104],
      [106, "backward", "el oso polar", 105],
    ];

    for (const [position, direction, said, expected] of cases) {
      expect([position, direction, said, answerPicks(position, direction, said)]).toEqual([
        position,
        direction,
        said,
        expected,
      ]);
    }
  });

  it("Expected outcome: Keeps the English words working for an en US table", () => {
    setLocale("en-US");
    expect(answerPicks(0, "forward", "left")).toBe(1);
    expect(answerPicks(0, "forward", "the short path")).toBe(1);
    expect(answerPicks(0, "forward", "right")).toBe(15);
    expect(answerPicks(96, "forward", "the penguin")).toBe(97);
  });
});
