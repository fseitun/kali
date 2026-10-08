# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` imports this file, so edit here.

Kali is a voice-first moderator for the board game **Kalimba**, played by kids with no screen to look at: a browser PWA (Vite, strict TypeScript, no UI framework, no runtime dependencies) using Deepgram streaming STT, a DeepInfra-hosted LLM interpreter, and browser `speechSynthesis` for TTS.

## Setup and commands

Node 24.x and npm 11.x (`engine-strict=true`). Tests and checks need no `.env` — only `npm run dev` does (`cp .env.example .env`, two keys). In a fresh worktree, `npm install` first.

```bash
npm run dev                  # dev server: / (orb UI), /debug (console UI)
npm run full-check           # lint:fix + type-check + test + format — run after ANY code change
npm run lint                 # the strict lint CI runs — full-check does not cover it (see below)
npm run test                 # all Vitest tests (src/ + integration/); the whole suite takes seconds
npm run test:src             # unit + colocated *.integration.test.ts only
npm run test:integration     # JSON orchestrator scenarios only
npx vitest run src/orchestrator/turn-manager.test.ts          # single file
npx vitest run src/orchestrator/turn-manager.test.ts -t "Should return true"  # single case
npm run build                # rollup + PWA precache
npm run knip                 # unused files, exports, types, dependencies
```

`npm run full-check` must pass before a task is done. It rewrites files (`eslint --fix`, `prettier --write`), so review and include what it changed. If failures are clearly pre-existing in code you did not touch, report them instead of iterating.

`full-check` never runs rollup and never touches static assets. Deleting a module or a `public/` file therefore passes it and dies at build time, so run `npm run build` too after that kind of change, and `npm run knip` after deleting exports — neither is part of `full-check` or CI.

`npm run type-check` covers both projects: the app (`tsconfig.json`) and `worker/` (`worker/tsconfig.json`). CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `type-check`, `test`. The husky pre-commit hook runs lint-staged, `type-check`, and the full test suite, so a commit fails on a red suite.

**A green `full-check` can still fail CI.** `full-check` and the hook lint with `eslint --fix`, which exits 0 on warnings; CI's `npm run lint` adds `--max-warnings 0` and `--report-unused-disable-directives`. Run `npm run lint` before pushing.

## Architecture

**The LLM interprets; the orchestrator decides.** The LLM is creative but _untrusted_: it turns speech into primitive actions and knows the rules only from prompt context. The orchestrator is deterministic and the sole authority over state. It is a Kalimba orchestrator, not a generic engine — square kinds, encounters, and effects (`square-types.ts`, `board-effects-handler.ts`) are compiled in on purpose.

Flow: Deepgram transcript → `KaliAppCore` queue → `routeTranscript` (`src/voice/intent-router.ts`: deterministic first, `analyzeResponse` LLM fallback when ambiguous) → `orchestrator.handleTranscript` → `transcript-fast-path.ts` (help, riddle answers, pending rolls, fork answers, movement rolls — no model call; ADR 0005), otherwise the LLM → `validator.ts` gates every action → executors run sequentially → board effects auto-apply after position changes → decision points enforced → turn auto-advances.

Primitives (`src/orchestrator/types.ts`): `NARRATE`, `RESET_GAME`, `SET_STATE`, `PLAYER_ROLLED`, `PLAYER_ANSWERED`. Encounter riddles come from the deterministic bank, never from the model (ADR 0005, ADR 0006). The bank is _data_: authored per animal and locale under the top-level `encounterQuestions` key of the game config, copied to `game.encounterQuestions` at load, and read by `board-effects-handler.ts` (`getEncounterQuestion`). Grading is orchestrator-side off `PLAYER_ANSWERED` — there is deliberately no `ASK_RIDDLE` or `RIDDLE_RESOLVED` primitive (ADR 0004). `RESET_GAME` either rebuilds the kept roster and resumes play or drops to SETUP; either way the result carries `gameReset` so `KaliAppCore` finishes the restart out loud.

Orchestrator subsystems — work in the right module, not in `orchestrator.ts`: `turn-manager.ts` (advancement, ownership, pending decisions), `board-effects-handler.ts` (teleports, square effects), `decision-point-enforcer.ts` (forks), `validator/` (per-primitive validation), `action-executors/` (per-primitive execution).

An `isProcessing` lock serializes orchestrator work. A call that arrives while it is held returns a failed result instead of waiting, which is why `KaliAppCore` queues transcripts. Synthetic `[SYSTEM: ...]` transcripts are history: no code path injects one any more — deterministic i18n narration covers those events instead (ADR 0003, ADR 0005).

### State axioms (violations are critical bugs)

1. Only the orchestrator mutates state. App/UI layers never call `stateManager.set()`.
2. Phase transitions (SETUP → PLAYING → FINISHED) are orchestrator-only, never LLM-requested.
3. Turn advancement is orchestrator-only. `SET_STATE` on `game.turn` is blocked by the validator during `PLAYING` — it is deliberately allowed in `SETUP`, where the orchestrator seeds the roster.
4. Collectors and UI components return data (`NameCollector.collectNames()` → `string[]`); the caller hands it to the orchestrator (`setupPlayers`). They take no `stateManager` dependency.
5. `KaliAppCore` is pure coordination — wiring, TTS announcements, input routing. No game logic.
6. `StateManager` is infrastructure (path-based get/set), not policy.

### Recurring bug classes

A full review pass found these shapes repeatedly. Check them before writing:

1. **`game.pending` is one global slot.** Cross-turn revenge deliberately survives opponents' turns, so every reader must scope by `pending.playerId === game.turn` before acting on `pending.kind` (`hasPendingForCurrentTurn`, `isPendingRiddleForCurrentTurn` in `pending-types.ts`), and every _writer_ must not clobber a pending that is not its own. Unscoped access bit four separate call sites.
2. **Denylists over LLM-supplied paths must be prefix-matched, not exact.** An exact-match forbidden list is bypassed by the parent (`SET_STATE {path:"game", value:{phase,turn}}`) and by a deeper path (`game.pending.riddleCorrect`). `SET_STATE` is an allowlist for this reason: `players.<id>.<field>` plus `game.lastRoll` and `game.lastAnswer`.
3. **Shape validation is not authority validation.** Every primitive needs a phase gate (`PHASE_GATE` in `validator.ts`) as well as a field check — and every rejection needs a spoken way out, or you have traded a wrong move for a dead end.
4. **Degenerate fixtures hide production bugs.** The bank ships 10 questions per animal; fixtures had 1 — which hid a double cursor advance that graded every riddle against a question the child never heard. Any fixture for a cursor, index, or rotation needs ≥2 entries.
5. **State derived from `pending` must read `pending.direction`**, never assume forward.
6. **Read and write state through the same accessor.** A bracket read paired with a dot-path write diverges on awkward keys.
7. **`try/catch` that logs and continues turns a crash into silent corruption** — a thrown executor must fail its batch, not let the turn advance with the player stranded.

### Voice UX invariants

Production is voice-only; users cannot see errors, so every condition needs audible output.

- **Every successful gameplay utterance must produce ≥1 `speak()`.** `MeteredSpeechService` counts calls per turn. `applySilentSuccessFallback` (`src/voice/gameplay-voice-policy.ts`) is a narrow backstop, not a general safety net: `VoiceOutcomeHints` carries exactly one case today (`forkChoiceResolvedWithoutNarrate`). Anything else that goes silent goes silent for real — do not assume the fallback covers you. Sound effects do not count.
- **Always say what to do next** (roll, pick left/right, answer). Recurring bug class at edges where `shouldAdvanceTurn` is false but play continues — no automatic turn announcement fires there. Prefer deterministic i18n over hoping the model prompts (ADR 0003).
- **Everything said _to Kali_ must get an audible response, including when it is dropped.** Enumerate the drop sites when you touch this area: intent routing, the transcript queue, the `isProcessing` busy lock, name-collection serialization. Exactly two drops are silent on purpose: chatter not addressed to her (no wake word and no answer owed — `SOCIAL_CHAT_OR_NOISE`) and a repeat of a transcript still queued. Any other drop with only a `Logger.*` call is a bug — production has no visible log. Kali's own voice is not a drop site: the mic is gated while she speaks (ADR 0007), so every transcript that arrives was said by a person.
- **Never `speak("")`.** Empty text still increments the metered count, so the fallback believes the turn was narrated. Every early `return` in a speech-delivery path needs an audible branch or a loud throw.

### Games and board topology

`public/games/<name>/config.json` declares `metadata` and `squares` (an object keyed by square index), plus optional `stateDisplay`, `habitats`, and `encounterQuestions`; board, players, and state are _derived_ at load by `resolveInitialState` (`src/game-loader/game-loader.ts`). Decision points are inferred from squares whose `next` has multiple targets. `rules.md` beside it is a human reference — nothing loads it.

`validateBoardTopology` runs first: every square `0..winPosition` must exist, and every authored `next` / `prev` / `nextOnLanding` / `prevOnLanding` target — including every fork-object key — must be an integer in `0..winPosition` that is not the square itself.

Sparse edges default to the linear spine — a **missing** key differs from an explicit `[]`:

- missing `prev` → `[i - 1]`; missing `next` → `[i + 1]` while below the win square.
- Square `0` must author `next` explicitly (the default `[1]` would break forks) and must not author a non-empty `prev`.
- The `effect: "win"` square must author `"next": []`.
- Omit a square key entirely when it has no mechanics and no non-default edges.

Square mechanics are inferred by first match: `kind` → `effect` → portal → `item` → `name`+`power` (animal) → topology-only. The portal step (`isPortalSquare`, `square-types.ts`) matches a numeric `destination` **or** a non-empty `nextOnLanding` — so authoring `nextOnLanding` on a square makes it a portal, ahead of any `item` or animal reading.

### LLM providers and prompt text

Only `deepinfra` and `mock` exist (`CONFIG.LLM_PROVIDER`, `src/llm/llm-client-factory.ts`). `DeepInfraClient` extends `BaseLLMClient`; `MockLLMClient` implements `LLMClient` directly.

Everything the model sees comes from these places. Before editing any of them, read `.claude/skills/prompt-engineering/SKILL.md`:

- `src/llm/system-prompt.ts` — stable: role, primitive contract, JSON-only rules.
- `src/llm/state-context.ts` — volatile per-turn `<game_state>`, with its labels in `src/i18n/llm-state-context*.ts` and its `interpreter_contract` line from `src/llm/interpretation-contract.ts`.
- `src/llm/BaseLLMClient.ts` — the user-turn envelope and the inline `extractName` / `extractPlayerCount` / `analyzeResponse` prompts.
- `KaliAppCore.formatGameRules` — appends the game's `metadata` name, summary, and few-shot examples (`metadata.llmExamples`, else `src/game-loader/examples/kalimba.ts`).

### Adding a primitive

1. Add the variant to `src/orchestrator/types.ts`.
2. Validate in `src/orchestrator/validator.ts`, including its `PHASE_GATE` entry (or a focused module under `validator/` if the rules are substantial).
3. Execute in `src/orchestrator/action-executors/execute-<name>.ts`, export it from the `action-executors.ts` barrel, and dispatch it in `orchestrator.ts`.
4. Teach the interpreter when to emit it in `src/llm/system-prompt.ts`.
5. Add unit tests for validation and execution.
6. Add an `integration/scenarios/` scenario when the flow is gameplay-visible.

## Conventions

- **No backward compatibility.** Unreleased project: no deprecation shims, dual code paths, or legacy fallbacks. Pick one shape, update all call sites and tests, record non-obvious choices in `docs/adr/` (copy `template.md`, add the row to the index in `docs/adr/README.md`).
- **i18n everything user-facing.** Use `t(key)` and add the key to _both_ `src/i18n/locales/en-US.ts` and `es-AR.ts`. Default locale is `es-AR` (Rioplatense/vos); no hardcoded copy in HTML or TS. The two locales must flatten to identical key sets _and_ identical placeholder sets per key. Only one direction is checked for you: a key missing from `en-US` fails `type-check`. A key missing from `es-AR` passes every check, and nothing compares placeholders — a placeholder no call site passes gets read aloud literally as `{squareName}`.
- **Strict TypeScript** (ES2022), no `any` in production code — prefer `unknown` plus a type guard, and `interface` over `type` for object shapes.
- **Lint rules that bite.** Errors, which fail `full-check`: cyclomatic `complexity` ≤ 10 per function (extract helpers — nothing in the tree disables it), braces on every branch, no `!` non-null assertions, `??` over `||`, `import type` for type-only imports, alphabetized imports with no blank lines between groups, no parameter reassignment, no floating promises. Warnings, which only CI's `npm run lint` rejects: a missing explicit return type, `console.log` (use `Logger`), and an `eslint-disable` that no longer suppresses anything.
- **State paths** go through `GAME_PATH` and `playerStatePath()` (`src/state-paths.ts`), not string literals.
- **Tests** read as specs: `describe("Product scenario: …")` and `it("Expected outcome: …")`. They are otherwise pragmatic — `eslint-disable` and `@ts-nocheck` are fine there.
- Regressions: add the failing test or scenario step first, then fix (ADR 0002).

## Testing notes

- `vite.config.ts` forces `VITE_LLM_PROVIDER=mock` when `VITEST=true`; `@` aliases to `src`.
- JSON scenarios (`integration/scenarios/*.json`) run the real orchestrator with mock services — no browser, LLM, or TTS. A step is `{ "roll": n }` (expands to `PLAYER_ROLLED` + `NARRATE`) or `{ "actions": [...] }`, with optional `expect` of state paths. Format details are in `integration/README.md`.
- Scenarios drive `orchestrator.testExecuteActions` directly — never `handleTranscript` — so no scenario exercises routing, the fast path, or the LLM round-trip. Scripted model output goes in a step's `llmResponses` (a top-level `llmScript` is only a fallback, and no shipped scenario uses one). Cover the transcript path with colocated `*.integration.test.ts` instead.

## Entry points and build

`index.html` → `src/main.ts` (production orb) and `debug/index.html` → `src/debug.ts` (console + logs); a dev middleware rewrites `/debug`. VitePWA generates the only web app manifest (`/manifest.webmanifest`) and injects the link into both pages.

One `manualChunks` rule emits a `debug` chunk — the largest asset by far (~185 kB, 56 kB gzip) and, despite the name, modulepreloaded by the production entry too, since it holds the shared orchestrator/i18n/LLM code. Because of that, the precache `manifestTransforms` filter in `vite.config.ts` matches nothing today: `debug/index.html` and both `debug-*` assets are precached.

STT and the LLM are network-only, and every `VITE_*` key is inlined into the bundle at build time. `worker/` is the fix — a Cloudflare key broker that mints short-lived Deepgram tokens and proxies DeepInfra — but nothing in `src/` calls it yet.

## Deeper references

- `docs/adr/` — durable per-decision rationale; read the relevant one before changing behavior it covers.
- `docs/turn-and-pending-flow.md` — a turn end to end: what `game.pending` means and when `game.turn` changes.
- `docs/kali-architecture.md` — the Guided LLM pattern: thin-LLM principle, Primitive Box contract. Its synthetic-transcript passages are historical, and where its game-agnostic framing disagrees with the README (Kalimba-only, on purpose), the README wins.
- `integration/README.md` — scenario format and authoring rules.
- `.claude/skills/prompt-engineering/SKILL.md` — where prompt text lives and how to change it.
- `discussions/` — planning notes, not current state; `prioritized-roadmap.md` lists planned work.
