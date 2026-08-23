# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # dev server: / (orb UI), /debug (console UI)
npm run full-check           # lint:fix + type-check + test + format — run after ANY code change
npm run test                 # all Vitest tests (src/ + integration/)
npm run test:src             # unit + colocated *.integration.test.ts only
npm run test:integration     # JSON orchestrator scenarios only
npx vitest run src/orchestrator/turn-manager.test.ts          # single file
npx vitest run src/orchestrator/turn-manager.test.ts -t "Should return true"  # single case
```

`npm run full-check` must pass before a task is done. If failures are clearly pre-existing in code you did not touch, report them instead of iterating.

## Architecture

**The LLM interprets; the orchestrator decides.** The LLM is creative but _untrusted_: it turns speech into primitive actions and knows game rules only from prompt context. The orchestrator is deterministic, knows no game rules, and is the sole authority over state.

Flow: transcript → LLM → `validator.ts` gates every action → `orchestrator.ts` executes sequentially → board effects auto-apply after position changes → decision points enforced → turn auto-advances.

Primitives (`src/orchestrator/types.ts`): `NARRATE`, `RESET_GAME`, `SET_STATE`, `PLAYER_ROLLED`, `PLAYER_ANSWERED`, `ASK_RIDDLE`. Riddle grading is orchestrator-side off `PLAYER_ANSWERED` — there is deliberately no `RIDDLE_RESOLVED` primitive (ADR 0004).

Orchestrator subsystems — work in the right module, not in `orchestrator.ts`: `turn-manager.ts` (advancement, ownership, pending decisions), `board-effects-handler.ts` (teleports, square effects), `decision-point-enforcer.ts` (forks), `validator/` (per-primitive validation).

An `isProcessing` lock serializes LLM requests; concurrent voice commands would otherwise corrupt state. The orchestrator also injects _synthetic_ transcripts (`[SYSTEM: ...]`) to force the LLM to handle events rather than trusting it to remember.

### State axioms (violations are critical bugs)

1. Only the orchestrator mutates state. App/UI layers never call `stateManager.set()`.
2. Phase transitions (SETUP → PLAYING → FINISHED) are orchestrator-only, never LLM-requested.
3. Turn advancement is orchestrator-only. `SET_STATE` on `game.turn` is blocked by the validator.
4. UI components collect and return data (`nameCollector.collectNames()` → `string[]`); the caller hands it to the orchestrator. No `stateManager` dependency in UI components.
5. `KaliAppCore` is pure coordination — wiring, TTS announcements, input routing. No game logic.
6. `StateManager` is infrastructure (path-based get/set), not policy.

### Voice UX invariants

Production is voice-only; users cannot see errors, so every condition needs audible output.

- **Every successful gameplay utterance must produce ≥1 `speak()`.** `MeteredSpeechService` counts calls per turn; `applySilentSuccessFallback` (`src/voice/gameplay-voice-policy.ts`) backfills deterministic i18n lines in `KaliAppCore` when the orchestrator and `NARRATE` were both silent. Sound effects do not count.
- **Always say what to do next** (roll, pick left/right, answer). Recurring bug class at edges where `shouldAdvanceTurn` is false but play continues — no automatic turn announcement fires there. Prefer deterministic i18n over hoping the model prompts (ADR 0003).

### Games and board topology

`public/games/<name>/config.json` declares `metadata` + `squares`; board, players, and state are _derived_ at load (`deriveBoardFromSquares`, `validateBoardTopology` in `src/game-loader/game-loader.ts`). Decision points are inferred from squares whose `next` has multiple targets.

Sparse edges default to the linear spine — a **missing** key differs from an explicit `[]`:

- missing `prev` → `[i - 1]`; missing `next` → `[i + 1]` while below the win square.
- Square `0` must author `next` explicitly (the default `[1]` would break forks).
- The `effect: "win"` square must author `"next": []`.
- Omit a square key entirely when it has no mechanics and no non-default edges.

Square mechanics are inferred by first match: `kind` → `effect` → `destination` (portal) → `item` → `name`+`power` (animal) → topology-only.

### LLM providers

Only `deepinfra` and `mock` exist (`CONFIG.LLM_PROVIDER`, `src/llm/llm-client-factory.ts`). Clients extend `BaseLLMClient` and implement `LLMClient`. Prompts live in `system-prompt.ts` (stable: role, primitive contract, JSON-only rules), `state-context.ts` (volatile per-turn `<game_state>`), and `BaseLLMClient.ts` (inline `extractName` / `analyzeResponse`). When editing anything the model sees, use the `prompt-engineering` skill (`.claude/skills/prompt-engineering/SKILL.md`).

### Adding a primitive

1. Add the variant to `src/orchestrator/types.ts`.
2. Validate in `src/orchestrator/validator.ts` (or a focused module under `validator/` if the rules are substantial).
3. Execute in `src/orchestrator/action-executors.ts`, wiring through `orchestrator.ts` if needed.
4. Teach the interpreter when to emit it in `src/llm/system-prompt.ts`.
5. Add unit tests for validation and execution.
6. Add an `integration/scenarios/` scenario when the flow is gameplay-visible.

## Conventions

- **No backward compatibility.** Unreleased project: no deprecation shims, dual code paths, or legacy fallbacks. Pick one shape, update all call sites and tests, record non-obvious choices in `docs/adr/`.
- **i18n everything user-facing.** Use `t(key)` and add the key to _both_ `src/i18n/locales/en-US.ts` and `es-AR.ts`. Default locale is `es-AR` (Rioplatense/vos); no hardcoded copy in HTML or TS.
- **Strict TypeScript** (ES2022), no `any` in production code — prefer `unknown` plus a type guard, and `interface` over `type` for object shapes. Test files are pragmatic — `any`, `@ts-nocheck`, and `eslint-disable` are fine there.
- Regressions: add the failing test or scenario step first, then fix (ADR 0002).

## Testing notes

- `vite.config.ts` forces `VITE_LLM_PROVIDER=mock` when `VITEST=true`; `@` aliases to `src`.
- JSON scenarios (`integration/scenarios/*.json`) run the real orchestrator with mock services — no browser, LLM, or TTS. A step is `{ "roll": n }` (expands to `PLAYER_ROLLED` + `NARRATE`) or `{ "actions": [...] }`, with optional `expect` of state paths.
- **A scenario needs `llmScript`** whenever a step lands on a square with an effect or triggers a decision point — those paths call the LLM via injected transcripts, consumed in order.

## Entry points and build

`index.html` → `src/main.ts` (production orb) and `debug/index.html` → `src/debug.ts` (console + logs); a dev middleware rewrites `/debug`. Rollup splits `vosk` (~6 MB, dynamically imported only when voice starts) and `debug` chunks, and the PWA precache manifest deliberately excludes debug assets. API keys are client-exposed by design (personal/offline-first); a backend proxy would be needed for public deployment.

## In flight (uncommitted)

The working tree adds a Deepgram post-wake STT path (`src/voice-recognition/deepgram-*.ts`, `transcription-provider.ts`) and an intent router (`src/voice/intent-router.ts`), moving Vosk toward wake-word-only. None of it is committed — check `git status` before assuming it is the current design.

## Deeper references

- `docs/kali-architecture.md` — the Guided LLM pattern: thin-LLM principle, Primitive Box contract, synthetic transcripts.
- `docs/adr/` — durable per-decision rationale.
- `.claude/skills/prompt-engineering/SKILL.md` — where prompt text lives and how to change it.
- `.claude/commands/` — `/fc` (full-check loop) and `/fix` (log → clarifying questions → fix plan).
- `discussions/prioritized-roadmap.md` — planned work.

Worktree setup, if you use one: `npm install` and copy `.env` from the root worktree.
