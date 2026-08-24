# Riddle bank: remove LLM from animal encounter generation

> **Status: landed.** The bank is live and `ASK_RIDDLE` is gone ([ADR 0006](../adr/0006-remove-ask-riddle-primitive.md)). Kept as the reference for the on-disk data shape. Riddles live under `encounterQuestions` in the game config and are read by `getEncounterQuestion` / `pickEncounterQuestionFromBank` in [`board-effects-handler.ts`](../../src/orchestrator/board-effects-handler.ts).

## Goal

Landing on an animal square used to trigger a nested `getActions` call with a `[SYSTEM: ...]` transcript; the LLM had to emit `ASK_RIDDLE` + `NARRATE` in one JSON array. Failures included empty actions, wrong option counts, and answer leakage.

The **static riddle bank** replaced that and made the encounter pipeline deterministic: the CPU picks a riddle, speaks templated intro + question, and only uses the LLM for **fuzzy answer grading** (`validateRiddleAnswer`) when strict match fails.

## Shape of the data (as shipped)

`encounterQuestions` in `public/games/<game>/config.json`, keyed by **square name**, then by locale (44 animals in Kalimba):

```json
"encounterQuestions": {
  "Baboon": {
    "es-AR": [
      {
        "kali": "spoken intro line",
        "question": "…?",
        "options": ["…", "…", "…", "…"],
        "correctOption": "…"
      }
    ],
    "en-US": []
  }
}
```

`getEncounterQuestionBank` falls back to the other locale when one is missing; `pickEncounterQuestionFromBank` walks `game.encounterQuestionCursor.<squareName>` so repeat visits get a different question. A square with no entries **throws** at landing rather than falling back to the model.

## Code changes (as implemented)

1. **Loader**: `encounterQuestions` rides along with the game config into state.
2. **`BoardEffectsHandler`**: `openPendingForLanding` picks the question (`getEncounterQuestion`), stores it on pending (`setPendingAnimalEncounter`), and speaks intro + question + options deterministically — no `processTranscriptFn` call.
3. **Removed**: the nested-LLM landing call and its empty-actions riddle retry in [`orchestrator.ts`](../../src/orchestrator/orchestrator.ts).
4. **Removed**: the `ASK_RIDDLE` primitive itself ([ADR 0006](../adr/0006-remove-ask-riddle-primitive.md)).

## Relation to completed work

Phases 1A (fork speak), 1B (non-animal deterministic landing speech), 2 (fast path), and 3 (tighter `getActions`) were independent of the riddle bank. With the bank in place, **animal** squares were the last nested-LLM landing path, and it is deleted.
