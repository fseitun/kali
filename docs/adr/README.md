# Architecture Decision Records (ADRs)

Short, durable notes about **why** Kali behaves a certain way at the system level. They complement [`.cursor/rules/architecture-decisions.mdc`](../../.cursor/rules/architecture-decisions.mdc), which is tuned for agent context on specific globs—ADRs are for **humans and PRs**: stable filenames, light history, easy to link.

## When to add an ADR

- Cross-cutting behavior that could look like a bug without context.
- Orchestrator authority, validation boundaries, or voice/gameplay invariants.
- A choice that future refactors might “simplify away” incorrectly.

## When not to

- Trivial refactors, renames, or dependency bumps.
- Details already fully captured in tests with obvious names—link the tests instead.

## Workflow

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` (next number in this folder).
2. Keep it short: context, decision, consequences, links to rules/tests/code.
3. Reference the ADR from the PR description when the change is non-obvious.

## Optional agent / review pass

For large orchestrator refactors, run a **readonly second pass** (human or sub-agent) asking only: does this violate [state axioms](../../.cursor/rules/state-axioms.mdc)? Are tests and `integration/scenarios/` updated where behavior changed?

## Index

| ADR                                                                                                                  | Summary                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [0001-orchestrator-authority.md](0001-orchestrator-authority.md)                                                     | Orchestrator is sole mutator; enforcement via rules and tests                              |
| [0002-integration-scenario-regression-locks.md](0002-integration-scenario-regression-locks.md)                       | JSON scenario tests as fast regression locks                                               |
| [0003-always-prompt-next-player-action.md](0003-always-prompt-next-player-action.md)                                 | Voice UX: always say what the player should do next                                        |
| [0004-no-riddle-resolved-primitive.md](0004-no-riddle-resolved-primitive.md)                                         | Riddle outcomes only via `PLAYER_ANSWERED`; no `RIDDLE_RESOLVED` primitive                 |
| [0005-deterministic-narration-and-transcript-fast-path.md](0005-deterministic-narration-and-transcript-fast-path.md) | Fork / non-animal landings: TTS+i18n; fast path before LLM; same validate/execute pipeline |
