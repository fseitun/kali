# ADR 0006: Remove the ASK_RIDDLE primitive

## Status

Accepted. Amends [ADR 0005](0005-deterministic-narration-and-transcript-fast-path.md).

## Context

`ASK_RIDDLE` let the interpreter author an animal-encounter riddle — question, four options, `correctOption` — and the orchestrator stored it on `game.pending`. [ADR 0005](0005-deterministic-narration-and-transcript-fast-path.md) kept that one nested-LLM landing path alive explicitly "until the riddle-bank plan lands".

It has landed. `BoardEffectsHandler.openPendingForLanding` now calls `getEncounterQuestion` / `pickEncounterQuestionFromBank`, which walk a per-animal cursor through the localized bank in `game.encounterQuestions` and **throw** when an animal has no entry. Every animal landing therefore opens `pending: riddle` already carrying `riddlePrompt`, `riddleOptions` and `correctOption`, and speaks that exact question deterministically.

That leaves `ASK_RIDDLE` with no reachable use, and one reachable abuse: the model emitting it mid-encounter (e.g. on "repetime la pregunta") and overwriting the bank riddle the player was already asked — a thin-LLM violation that can produce an unanswerable encounter.

## Decision

Delete the primitive: the `AskRiddleAction` variant, `validator/riddle.ts` and its dispatch entry, its mock-state handler, `RiddlePowerCheckHandler.handleAskRiddle` and its helpers, the orchestrator dispatch case, and the Kalimba prompt example. An `ASK_RIDDLE` action from the model is now an unknown action type and is rejected as `invalidActionFormat`.

Riddles come from the bank; outcomes come from `PLAYER_ANSWERED` grading ([ADR 0004](0004-no-riddle-resolved-primitive.md)). The interpreter's only job during an encounter is to relay what the player said.

## Consequences

- Adding an animal square **requires** bank entries for it; a missing entry throws at landing rather than quietly asking the model for a riddle. That is the intended failure mode — a fabricated riddle is worse than a loud error.
- Riddle content is reviewable and reproducible; encounter landings cost no LLM round-trip.
- Tests that exercised `ASK_RIDDLE` acceptance are gone; the ones that mattered — the model must not replace a pending riddle — now assert rejection instead.

## Links

- Rules: [`CLAUDE.md`](../../CLAUDE.md) (primitives, thin-LLM principle), [ADR 0004](0004-no-riddle-resolved-primitive.md), [ADR 0005](0005-deterministic-narration-and-transcript-fast-path.md)
- Plan (landed): [`docs/plans/riddle-bank-llm-removal.md`](../plans/riddle-bank-llm-removal.md)
- Code: [`src/orchestrator/board-effects-handler.ts`](../../src/orchestrator/board-effects-handler.ts) (`getEncounterQuestion`, `setPendingAnimalEncounter`), [`src/orchestrator/riddle-power-check.ts`](../../src/orchestrator/riddle-power-check.ts), [`src/orchestrator/types.ts`](../../src/orchestrator/types.ts)
- Tests: [`src/orchestrator/validator.test.ts`](../../src/orchestrator/validator.test.ts) ("Interpreter tries to ask its own riddle"), [`src/orchestrator/orchestrator.test.ts`](../../src/orchestrator/orchestrator.test.ts) ("Interpreter tries to invent a riddle")
