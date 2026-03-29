# Log vs expected output — clarify, then plan

**Invocation:** User ran the **`/fix`** command (this file). Follow the workflow below.

When the user supplies **(1) a log** and **(2) expected output/behavior**, do **not** jump straight to code changes. First close gaps in context, then produce a **fix plan** they can approve or refine.

## Language

Write **everything** produced in this workflow in **English**: the gap summary (Step 1), clarifying questions and decisions (Step 2), and the full fix plan (Step 3). Quote log lines or user text in their original language when needed; explain and plan in English.

## Inputs to treat as authoritative

- **Log**: Pasted text, an `@`-attached file, or a readable **absolute path** — build output, test failures, stack traces, runtime logs, network traces, LLM/tool transcripts, browser console, **Kali exported JSON logs** (see [Kali JSON export logs](#kali-specific-hints-when-reading-logs)), etc.
- **Expected**: What should have happened (correct message, status, state, UI, API response, test pass, voice line, etc.).

If either piece is missing, ask for it before planning.

### Reporter checklist (what to send)

- **Log**: Paste, attach with `@path`, or paste an absolute path the agent can read. For Kali, exported logs are **JSON** files named **`kali-logs-<timestamp>.json`** (ISO timestamp with `:` / `.` normalized for the filename). **Convention:** the bug evidence is often **near the bottom** of the file (newest entries last), but that is **not mandatory** — scan the whole export when needed.
- **Expected vs actual**: Prefer explicit labels, for example:
  - `Expected:` …
  - `Actual (heard / saw / in log):` …
- **Agent rule**: If the user sends only **one** quoted string and it is unclear whether it is ground truth or what happened, **ask one short question** before planning (is this expected or observed?).

## Step 1 — Summarize the gap (brief)

In a few sentences:

- What the log shows (key lines or error type).
- How that differs from the expected outcome.
- Whether the failure is **deterministic** from the log alone or **ambiguous** (multiple plausible causes).

## Step 2 — Clarifying questions and decisions (ask only what you need)

Ask **targeted** questions; skip categories already answered by the log or the user’s message. Group questions so the user can answer in one reply.

### How to ask (so the user can decide)

Every question that needs a **human call** must carry enough context that someone who did not run the repro can answer correctly:

1. **Anchor** — One sentence: what you observed (log snippet, symptom, or missing piece) and **why** it leaves a gap (e.g. “stack points at `foo.ts` but two code paths could set that state”).
2. **The fork** — State **explicit options** when it is a product or design choice (A vs B), not a hidden default. Use bullets or “Option A / Option B” so “yes” is unambiguous.
3. **Recommendation (optional)** — If you have a leaning, say so **after** presenting options, with one line of reasoning; do not bury the choice in prose.
4. **Default if silent** — If the user might skip the question, say what you will assume and proceed with (or that you will block until they answer), in one short line.

**Bad:** “Should we change the orchestrator or the app?”  
**Better:** “The log shows `PLAYER_ANSWERED` applied but no `NARRATE`. **Observed:** … **Gap:** Either (A) orchestrator should emit a hint for deterministic TTS here, or (B) app should treat this branch like other silent-success paths. **Which behavior do you want for voice-only players?** If no preference, I will assume (A) to match ADR 0003.”

**Bad:** “Is this expected?”  
**Better:** “You quoted: `…`. **Question:** Is that what the player **should** hear (expected), or what they **did** hear (actual)? The log only shows …”

Use this checklist as a menu — pick what applies:

| Gap                        | Example questions                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Environment**            | OS, Node version, branch/commit, `npm run` target, env vars (names only, no secrets).                                                                                                     |
| **Reproduction**           | Exact command or voice/debug UI steps; frequency (always vs flaky); minimal repro.                                                                                                        |
| **Scope**                  | Which layer (see Kali hints below); dev vs CI; browser vs headless if relevant.                                                                                                           |
| **Timing**                 | First failure vs regression; related dependency or prompt change.                                                                                                                         |
| **Expected precision**     | Exact string vs semantic equivalence; ordering; allowed side effects.                                                                                                                     |
| **Constraints**            | Deadline, voice-only UX, or “no new primitives” if relevant.                                                                                                                              |
| **Artifacts**              | Related files, configs, or smaller log snippets if the paste was truncated.                                                                                                               |
| **Ambiguous quote / i18n** | Is the quoted text **expected** or **observed**? Does **locale** (e.g. `es-AR`) matter? Skip if the log already shows both sides (e.g. `NARRATE` text vs TTS / user-reported heard line). |

**Rules:**

- If the log is **self-contained** (e.g. clear stack trace + file:line), you may ask **zero** questions and state assumptions explicitly.
- If something is **guessed**, label it **Assumption** in the plan.
- Never ask for passwords, API keys, or PII; ask for redacted shapes or “whether X is set.”
- **Ambiguous quoted text** (e.g. a single voice line in another language): use the **Anchor / fork** pattern — quote the text, say what the log does or does not show, then ask whether it is **expected** or **observed**, and whether **locale** matters — unless the log already settles it.
- **Decisions with tradeoffs** (behavior, scope, breaking vs compatible): always list options and the user-visible impact; avoid “fix it the right way” without naming what “right” means in this repo.

## Kali-specific hints (when reading logs)

Use these to route hypotheses and verification; do not override workspace rules.

- **Kali JSON export logs**: The artifact is **JSON**, saved as **`kali-logs-<timestamp>.json`**. Exports are typically a **JSON array** of objects with fields such as `level`, `category`, `message`, optional `context` (e.g. LLM `fullPrompt` / `fullResponse`, state snapshots). **Ordering:** it is **expected** (but **not required**) that the relevant failure or surprising behavior appears **toward the bottom** of the file — treat that as a hint, not a rule; use `iso` timestamps and categories to find the repro window anywhere in the array. For voice/LLM issues, search entries by `category` (e.g. `llm`, `brain`) and orchestrator-related lines, and any logs of **TTS**, **speak**, or **NARRATE**.
- **Subsystems**: orchestrator (primitives, validation), `KaliAppCore` (coordination, turn announcement, voice policy), voice/STT/Vosk pipeline, LLM client + prompts, game content/loaders, Vitest/integration tests. If the gap looks like **prompt quality, structure, or systematic misinterpretation** (not validation bugs), read the project skill **`prompt-engineering`** (`.cursor/skills/prompt-engineering/SKILL.md`).
- **State**: Orchestrator owns mutations and phase/turn logic; app and UI must not bypass it (see `.cursor/rules/state-axioms.mdc`). If the “expected” outcome implies direct `stateManager.set` from UI, the plan should correct the architecture instead.
- **Voice / TTS**: Silent success, missing “what to do next,” or invariant failures often touch `MeteredSpeechService`, `gameplay-voice-policy`, orchestrator `VoiceOutcomeHints`, and i18n strings; see `docs/adr/0003-always-prompt-next-player-action.md` when the gap is “player heard X but not Y.”
- **After any code fix in this repo**: Verification must include **`npm run full-check`** unless the user explicitly scoped a narrower check and the workspace rules allow it.

## Step 3 — Fix plan (after questions or stated assumptions)

Produce a plan the user can execute or hand to an implementer. **The plan body must be in English** (per [Language](#language) above). Use this structure:

```markdown
## Understanding

[One paragraph: root cause hypothesis or competing hypotheses ranked by likelihood]

## Assumptions (if any)

- ...

## Proposed fix

1. [Concrete step — file/area, what to change]
2. ...

## Verification

- [How to confirm: command, test, manual / voice check]
- [What log/output should look like after the fix]
- [For Kali code changes: `npm run full-check`]

## Risks / follow-ups

- [Regressions, edge cases, optional hardening]
```

**Do not** implement the fix inside this workflow unless the user explicitly asks to proceed after the plan.

## When the user wants implementation next

After they approve the plan (or say “go ahead”), switch to normal agent mode: make changes, run **`npm run full-check`** after substantive edits (per workspace rules), and tie results back to the expected output.

## Anti-patterns

- Planning a fix without acknowledging missing context (silent guesses).
- Vague plans (“fix the bug in auth”) without files, steps, or verification.
- Asking long questionnaires when the log already pins the issue.
- **Vague or context-free questions** (“what do you want?”, “is this OK?”) without anchoring to the log, naming options, or stating what happens if unanswered.
- Suggesting state/phase/turn changes outside the orchestrator for Kali gameplay.
