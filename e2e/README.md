# E2E Scenario Tests

End-to-end scenarios run the **real orchestrator** with a scripted mock LLM and mock speech. No browser, no real LLM, no TTS. Pure state-machine verification.

- **Scenarios:** `e2e/scenarios/*.json`
- **Runner:** `e2e/scenario-runner.ts`
- **Test entry:** `e2e/scenarios.test.ts` (e.g. `npm run test` or `npm run test:e2e`)

## Scenario format

Each JSON file defines:

- `game` – Game id (e.g. `snakes-and-ladders`, `kalimba`)
- `players` – Number of players (optional; names are generated)
- `initialState` – Optional overrides merged onto the game’s `initialState`
- `llmScript` – Optional array of scripted LLM responses (one array per LLM call, in order)
- `steps` – Array of steps: each has `roll` or `actions`, and optional `expect` (path → expected value)

When a step uses `roll`, it is expanded to `PLAYER_ROLLED` + `NARRATE`. The runner executes the actions via `orchestrator.testExecuteActions()`, advances turn when indicated, and asserts `expect` against the state.

---

## Agent directive

When adding or editing E2E scenarios (or when using these files to guide agents):

1. **E2E JSON scenarios are the single source of truth for orchestrator state transitions.** They document how state changes in response to actions.

2. **Do not use `SET_STATE` in `llmScript` to implement game rules, points, or other calculated state.** State for game rules (points, hearts, skipTurns, items, instruments, and other deterministic square effects) is applied by the **orchestrator** (`BoardEffectsHandler` / `TurnManager`). The LLM is only asked to narrate after the orchestrator has applied those effects.

3. **`llmScript` should contain mostly `NARRATE` and `PLAYER_ANSWERED`.** Use `NARRATE` for square-effect narration and general feedback. Use `PLAYER_ANSWERED` for decision points (e.g. path choice). Use `SET_STATE` only when the game design explicitly leaves a non-deterministic outcome to the LLM (e.g. bonus dice after a riddle, or clearing an instrument after use).

This keeps the “guided LLM” architecture intact: the orchestrator owns all authoritative state; the LLM reports events and narrates.
