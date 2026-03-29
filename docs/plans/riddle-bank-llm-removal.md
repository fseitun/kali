# Riddle bank (future): remove LLM from animal encounter generation

## Goal

Today, landing on an animal square triggers a nested `getActions` call with a `[SYSTEM: ...]` transcript. The LLM must emit `ASK_RIDDLE` + `NARRATE` in one JSON array. Failures include empty actions, wrong option counts, and answer leakage.

Replacing that with a **static riddle bank** makes the encounter pipeline fully deterministic: the CPU picks a riddle, speaks templated intro + question, and only uses the LLM for **fuzzy answer grading** (`validateRiddleAnswer`) when strict match fails.

## Shape of the data

- New file e.g. `public/games/kalimba/riddles.json` keyed by animal / square identifier (or `squareIndex` + `name`).
- Each entry: `{ "text": "...", "options": ["...", "...", "...", "..."], "correctOption": "...", "correctOptionSynonyms": [] }`.
- Target ~3–5 riddles per animal encounter square (~47 animals in Kalimba) → on the order of 150–200 entries. Content can be authored or batch-generated offline, then reviewed.

## Code changes (when you implement)

1. **Loader**: extend `GameLoader` (or a small `RiddleBank` module) to load `riddles.json` with the game module.
2. **`BoardEffectsHandler`**: for `isAnimalEncounterKind`, instead of `processTranscriptFn`:
   - Set `game.pending` as today.
   - Pick random riddle for `(position, squareData.name)`.
   - Store `riddlePrompt`, `riddleOptions`, `correctOption` on pending (same shape as after `ASK_RIDDLE`).
   - Speak via i18n: encounter intro + read options (or one combined string).
   - Optionally play `animal_collect` or existing encounter SFX.
3. **Remove** `handleEmptyActionsWithRetry` riddle auto-retry in [`orchestrator.ts`](../../src/orchestrator/orchestrator.ts) once riddles are always present from the bank.
4. **Tests**: integration tests for “land on animal → pending has structured riddle → no nested `getActions`” (mock LLM call count).

## Relation to completed work

Phases 1A (fork speak), 1B (non-animal deterministic landing speech), 2 (fast path), and 3 (tighter `getActions`) are independent of the riddle bank. After the bank exists, **animal** squares become the last nested-LLM landing path to delete.
