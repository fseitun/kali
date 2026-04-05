import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  POSSESSIVE_SCORE_PHRASE_EN,
  POSSESSIVE_SCORE_PHRASE_ES,
} from "./kalimba-encounter-phrases";

const _dir = dirname(fileURLToPath(import.meta.url));
const kalimbaConfigPath = join(_dir, "../../public/games/kalimba/config.json");

describe("Product scenario: Kalimba encounter phrases", () => {
  it("Expected outcome: Maps every Kalimba square with power (es AR and en US)", () => {
    const raw = readFileSync(kalimbaConfigPath, "utf-8");
    const config = JSON.parse(raw) as {
      squares?: Record<string, { name?: string; power?: number }>;
    };
    const squares = config.squares ?? {};
    const names = new Set<string>();
    for (const sq of Object.values(squares)) {
      if (typeof sq.power === "number" && typeof sq.name === "string") {
        names.add(sq.name);
      }
    }
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect(
        POSSESSIVE_SCORE_PHRASE_ES[name],
        `missing es-AR possessive for encounter "${name}"`,
      ).toBeDefined();
      expect(
        POSSESSIVE_SCORE_PHRASE_EN[name],
        `missing en-US possessive for encounter "${name}"`,
      ).toBeDefined();
    }
  });
});
