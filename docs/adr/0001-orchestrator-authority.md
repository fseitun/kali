# ADR 0001: Orchestrator authority for game state

## Status

Accepted

## Context

Kali splits the **LLM** (untrusted interpreter) from the **orchestrator** (deterministic CPU). Without a single authority for mutations, voice flows and debug UI could diverge or corrupt state.

## Decision

**The orchestrator is the sole authority for all gameplay state mutations.** Phase transitions, turn advancement, and primitive execution live in orchestrator-owned code; the app coordinates and speaks results but does not implement game rules or bypass the orchestrator for state.

## Consequences

- New features that change state must go through orchestrator paths and validators.
- UI and LLM layers return data or primitives; they do not call `StateManager.set()` for gameplay.
- Regressions in this boundary are caught with orchestrator-focused unit and integration tests.

## Links

- Rules: [`.cursor/rules/state-axioms.mdc`](../../.cursor/rules/state-axioms.mdc), [`.cursor/rules/architecture.mdc`](../../.cursor/rules/architecture.mdc)
- Tests: `src/orchestrator/**/*.test.ts`, especially `orchestrator-authority.test.ts`, `orchestrator.integration.test.ts`
- Code: `src/orchestrator/`, `src/orchestrator/validator/`
