import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { runScenario } from "./scenario-runner";
import type { Scenario } from "./scenario-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(__dirname, "scenarios");

/**
 * Orchestrator integration scenario tests
 *
 * These tests run full game flows against the real orchestrator with mock services.
 * No browser, no LLM, no TTS. Pure state-machine verification.
 *
 * TDD: Add a new JSON file under integration/scenarios/ to add regression coverage.
 * Run: npm run test:integration
 */
describe("Product scenario: Integration scenarios", () => {
  const scenarioFiles = fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of scenarioFiles) {
    const scenarioPath = path.join(SCENARIOS_DIR, file);
    const scenario: Scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf-8")) as Scenario;

    it(`Expected outcome: Runs scenario ${file}`, async () => {
      await expect(runScenario(scenario)).resolves.not.toThrow();
    });
  }
});
