# ADR 0004: No RIDDLE_RESOLVED primitive

## Status

Accepted

## Context

The interpreter contract previously included `RIDDLE_RESOLVED` as a way for the LLM to report whether a riddle answer was correct. In practice, riddle resolution is deterministic orchestrator work: strict option/synonym match first, then optional LLM grading via `validateRiddleAnswer`. Keeping a second primitive duplicated that flow and conflicted with [`.cursor/rules/no-legacy-deprecation.mdc`](../../.cursor/rules/no-legacy-deprecation.mdc) (no parallel “old” and “new” shapes).

## Decision

Remove `RIDDLE_RESOLVED` from `PrimitiveAction` and from validation/execution. The only interpreter-visible path for riddle answers remains `PLAYER_ANSWERED`; `RiddlePowerCheckHandler.tryHandleRiddleAnswer` transitions `pending` from `riddle` to `powerCheck` internally.

## Consequences

- Interpreters that still emit `RIDDLE_RESOLVED` receive validation errors (`invalid action type`).
- Docs and system prompts list six primitives, not seven.
- Single source of truth for riddle outcome aligns with orchestrator authority.

## Links

- Rules: [`.cursor/rules/no-legacy-deprecation.mdc`](../../.cursor/rules/no-legacy-deprecation.mdc), [`.cursor/rules/state-axioms.mdc`](../../.cursor/rules/state-axioms.mdc)
- Code: [`src/orchestrator/types.ts`](../../src/orchestrator/types.ts), [`src/orchestrator/riddle-power-check.ts`](../../src/orchestrator/riddle-power-check.ts), [`src/llm/system-prompt.ts`](../../src/llm/system-prompt.ts)
- Tests: [`src/orchestrator/validator.test.ts`](../../src/orchestrator/validator.test.ts), orchestrator integration tests
