# ADR 0005: Deterministic narration and transcript fast path before LLM

## Status

Accepted

## Context

Kali’s voice loop paid an LLM round-trip for work the orchestrator already knows how to do: fork prompts, most special-square landing copy, and rigid user replies (digits for pending rolls, option indices for riddles, pure-digit movement rolls, “help”-style queries). That added latency, cost, and variance without strengthening authority—the orchestrator still had to validate every primitive.

Animal encounters (riddle trivia generation and grading policy) remain interpreter-assisted for now; a follow-up is sketched in [`docs/plans/riddle-bank-llm-removal.md`](../plans/riddle-bank-llm-removal.md).

## Decision

1. **Orchestrator-owned narration (no nested LLM)** — Fork enforcement and **non-animal** square landings speak via `ISpeechService` and i18n (`DecisionPointEnforcer`, `BoardEffectsHandler`). Do not route those prompts through `processTranscript` / `getActions` as synthetic `[SYSTEM:…]` transcripts. Animal encounter landings may still invoke the interpreter for `ASK_RIDDLE` + `NARRATE` until the riddle-bank plan lands.

2. **Transcript fast path** — Before calling `getActions`, attempt pattern-based mapping to the same `PrimitiveAction[]` shape the model would return (`tryFastPathTranscript` in [`src/orchestrator/transcript-fast-path.ts`](../../src/orchestrator/transcript-fast-path.ts)). Fast-path output must run through the **same** validation and execution pipeline as LLM output—no duplicate game logic in the app layer.

3. **Tighter interpreter calls where the LLM remains** — Lower temperature and JSON-oriented response shaping for `getActions` where supported; add a single machine-owned **interpretation contract** line in state context when helpful so the model does not contradict the CPU’s expected primitive for the current pending phase.

## Consequences

- **Tests** should assert **TTS** and **game state** for deterministic paths, building expected strings from i18n (`t(…)`) where needed—not mock LLM narration strings. Counting `getActions` invocations is brittle when nested interpreter calls are removed; prefer behavioral assertions unless the test explicitly targets call budgeting.
- **Ambiguous digits** — Bare numbers (e.g. `"3"`) may be consumed by the fast path as a riddle index or encounter roll. Tests that require the LLM path (e.g. `lastBotUtterance` context) should use transcripts that do not match the fast path (e.g. spelled-out numbers in the relevant locale) or set pending state so the fast path does not apply.
- **Prompt size** — Extra contract/context lines can grow bundled prompt size; system-prompt size guards in tests may need occasional adjustment, or contract text can stay in dynamic context only if we want a stable `SYSTEM_PROMPT` cap.
- **Types** — Runtime predicates such as `isPendingRollKind` do not narrow TypeScript unions; after such checks, use an explicit pending-roll union type or cast when calling helpers like `getPendingRollSpec`.

## Links

- Rules: [`.cursor/rules/architecture.mdc`](../../.cursor/rules/architecture.mdc), [`.cursor/rules/state-axioms.mdc`](../../.cursor/rules/state-axioms.mdc), [ADR 0003](0003-always-prompt-next-player-action.md) (next-action voice UX)
- Plan (deferred): [`docs/plans/riddle-bank-llm-removal.md`](../plans/riddle-bank-llm-removal.md)
- Code: [`src/orchestrator/transcript-fast-path.ts`](../../src/orchestrator/transcript-fast-path.ts), [`src/orchestrator/decision-point-enforcer.ts`](../../src/orchestrator/decision-point-enforcer.ts), [`src/orchestrator/board-effects-handler.ts`](../../src/orchestrator/board-effects-handler.ts), [`src/llm/interpretation-contract.ts`](../../src/llm/interpretation-contract.ts), [`src/llm/state-context.ts`](../../src/llm/state-context.ts)
- Tests: [`src/orchestrator/transcript-fast-path.test.ts`](../../src/orchestrator/transcript-fast-path.test.ts), [`src/orchestrator/orchestrator.integration.test.ts`](../../src/orchestrator/orchestrator.integration.test.ts), [`src/orchestrator/orchestrator-authority.test.ts`](../../src/orchestrator/orchestrator-authority.test.ts)
