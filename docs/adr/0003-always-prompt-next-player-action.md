# ADR 0003: Always tell players the next expected action (voice)

## Status

Accepted

## Context

Kali is **voice-first**: players often cannot see the board or UI, and many players are children. We have repeatedly shipped gaps where the app spoke a **result** (e.g. “Pasaste.”, a riddle outcome, or a state change) but did not say **what to do next** (e.g. roll for movement, whose turn it is, or repeat the choices). That feels like the game is “stuck” and is indistinguishable from a hang.

The **gameplay voice-turn invariant** (at least one `speak()` per successful turn) is necessary but **not sufficient**: a minimal acknowledgment does not replace a clear instruction.

## Decision

Whenever gameplay resolves a step and returns to “waiting for the player,” **TTS must state the next expected action in kid-friendly terms**: name the active player when it helps, name the kind of input (roll, choose a path, answer, report a number), and prefer **deterministic i18n** from orchestrator or app follow-ups when the LLM might omit `NARRATE`.

Implementers should ask: _After this line, would someone who only hears audio know what to say or do?_

## Consequences

- New flows that clear `pending`, advance position, or end a sub-phase (power check, revenge, fork, etc.) must include an explicit prompt or reuse strings such as `turnAnnouncement`, `afterEncounterRollPrompt`, `forkChoiceResolvedRoll`, or targeted i18n—**not** only LLM narration unless prompts are guaranteed.
- Regressions are likely when `shouldAdvanceTurn` is false but the same player continues: the app may skip `checkAndAdvanceTurn`, so **orchestrator-owned or app-layer speech** must cover the nudge.
- Tests should assert `speak` content or order when adding encounter or turn-edge behavior.

### Implementation note (recorded regression, 2026-03)

Power-check or revenge **win** can chain **automatic** board moves (e.g. snake) and then nested square narration (e.g. a **no-choice portal**: SYSTEM text tells the LLM not to ask questions). In that case the model may speak only flavor; the player still holds the turn and needs a **movement roll**. Do **not** suppress deterministic `afterEncounterRollPrompt` just because the final square has board metadata (e.g. `nextOnLanding`): use **`game.pending`**, **`game.turn ===` mover**, and **`ExecutionContext.advanceTurnDespitePowerCheckSuppress`** (skip-turn style handoff) to decide whether to nudge. See [`src/orchestrator/riddle-power-check.ts`](../../src/orchestrator/riddle-power-check.ts) (`shouldSpeakAfterEncounterMovementNudge`). Regression test: `after power check win through snake to no-choice portal speaks afterEncounterRollPrompt` in [`src/orchestrator/orchestrator.integration.test.ts`](../../src/orchestrator/orchestrator.integration.test.ts).

When **`winJumpTo`** applies and the token **remains** on that jump square after chained moves, the encounter die has already resolved placement: suppress `afterEncounterRollPrompt` and rely on turn advance + app turn announcement instead (e.g. Giraffe → 162). Regression: `revenge win with winJumpTo when token stays on jump square skips afterEncounterRollPrompt` in the same integration file.

## Links

- Rule: [`.cursor/rules/development-guidelines.mdc`](../../.cursor/rules/development-guidelines.mdc) (Voice-Only UX — next-action clarity)
- Code: [`src/orchestrator/riddle-power-check.ts`](../../src/orchestrator/riddle-power-check.ts) (`afterEncounterRollPrompt`), [`src/kali-app-core.ts`](../../src/kali-app-core.ts) (`checkAndAdvanceTurn`, `announceCurrentTurnIfPending`), [`src/voice/gameplay-voice-policy.ts`](../../src/voice/gameplay-voice-policy.ts) (`VoiceOutcomeHints`)
- Tests: [`src/orchestrator/orchestrator.integration.test.ts`](../../src/orchestrator/orchestrator.integration.test.ts) (power-check win speech order; portal/snake chain + `afterEncounterRollPrompt`)
