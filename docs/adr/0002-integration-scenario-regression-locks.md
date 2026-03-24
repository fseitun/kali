# ADR 0002: Integration scenario tests as regression locks

## Status

Accepted

## Context

Board and orchestrator behavior spans many small changes; bugs often appear only after several commits. Full browser or LLM-driven tests would be slow and flaky.

## Decision

Use **deterministic JSON scenarios** under `integration/scenarios/` driven by Vitest: real orchestrator, mocked voice/LLM, assertions on state and outcomes. Treat new user-visible flows and board regressions as cues to add or extend a scenario.

## Consequences

- `npm run test` (and CI) includes these tests via Vitest `include` in `vite.config.ts`.
- `npm run test:integration` runs only the `integration/` suite for a fast focused loop during development.
- Fixing a scenario-discovered bug should prefer adding or tightening a scenario step or assertion first (TDD-style).

## Links

- Rules: [`.cursor/rules/testing-commands.mdc`](../../.cursor/rules/testing-commands.mdc)
- Tests: [`integration/scenarios.test.ts`](../../integration/scenarios.test.ts), `integration/scenarios/*.json`
- Code: [`integration/scenario-runner.ts`](../../integration/scenario-runner.ts)
