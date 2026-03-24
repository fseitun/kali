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

## Links

- Rule: [`.cursor/rules/development-guidelines.mdc`](../../.cursor/rules/development-guidelines.mdc) (Voice-Only UX — next-action clarity)
- Code: [`src/orchestrator/riddle-power-check.ts`](../../src/orchestrator/riddle-power-check.ts) (`afterEncounterRollPrompt`), [`src/kali-app-core.ts`](../../src/kali-app-core.ts) (`checkAndAdvanceTurn`, `announceCurrentTurnIfPending`), [`src/voice/gameplay-voice-policy.ts`](../../src/voice/gameplay-voice-policy.ts) (`VoiceOutcomeHints`)
- Tests: `src/orchestrator/orchestrator.integration.test.ts` (power-check win speech order)
