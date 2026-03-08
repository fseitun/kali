# E2E Scenario Tests

End-to-end scenarios run the **real orchestrator** with a scripted mock LLM and mock speech. No browser, no real LLM, no TTS. Pure state-machine verification.

- **Scenarios:** `e2e/scenarios/*.json`
- **Runner:** `e2e/scenario-runner.ts`
- **Test entry:** `e2e/scenarios.test.ts` (e.g. `npm run test` or `npm run test:e2e`)

## Scenario format

Each JSON file defines:

- `game` – Game id (e.g. `kalimba`)
- `players` – Number of players (optional; names are generated)
- `initialState` – Optional overrides merged onto the game's `initialState`
- `llmScript` – Optional **top-level** array of scripted LLM responses (one array per LLM call, in order). Use only when not using per-step `llmResponses`.
- `steps` – Array of steps. Each step has `roll` or `actions`, optional `expect`, optional `llmResponses` (scripted LLM response(s) for this step), and optional `description` (ignored by runner; for readability).

When a step uses `roll`, it is expanded to `PLAYER_ROLLED` + `NARRATE`. The runner executes the actions via `orchestrator.testExecuteActions()`, advances turn when indicated, and asserts `expect` against the state.

### Preferred: colocate LLM responses with the step that triggers them

Put scripted LLM response(s) on the step that triggers the call (e.g. landing on a square effect), so the scenario reads as a storyboard instead of two parallel lists.

**Before (action-at-a-distance):**

```json
{
  "llmScript": [[{ "action": "NARRATE", "text": "Halcón encounter! +3 points." }]],
  "steps": [{ "roll": 2, "expect": { "players.p1.position": 2, "players.p1.points": 3 } }]
}
```

**After (readable storyboard):**

```json
{
  "steps": [
    {
      "description": "p1 rolls 2, lands on Halcón square (+3 points)",
      "roll": 2,
      "llmResponses": [[{ "action": "NARRATE", "text": "Halcón encounter! +3 points." }]],
      "expect": { "players.p1.position": 2, "players.p1.points": 3 }
    }
  ]
}
```

If any step has `llmResponses`, the runner builds the mock script from steps in order and ignores top-level `llmScript`. Existing scenarios that only use top-level `llmScript` continue to work.

---

## Agent directive

When adding or editing E2E scenarios (or when using these files to guide agents):

**Source of truth.** E2E JSON scenarios are the single source of truth for orchestrator state transitions. They document how state changes in response to actions. When in doubt, E2E JSON scenarios override other descriptions of orchestrator behavior. For global state authority rules, see [.cursor/rules/state-axioms.mdc](../.cursor/rules/state-axioms.mdc).

**Guided LLM pattern.** The orchestrator owns all authoritative state (position, points, hearts, skipTurns, items, instruments, phase, turn, winner). The LLM is only asked to narrate after the orchestrator has applied effects, or to capture explicit user decisions. Do not encode or script the LLM as the authority for game-rule state.

### Banned

Do not use `SET_STATE` in `llmScript` for: game mechanics, points, hearts, skipTurns, items, instruments, position math, phase, turn, or winner. State for game rules and deterministic square effects is applied by the orchestrator (`BoardEffectsHandler` / `TurnManager`); the LLM is only asked to narrate after those effects are applied.

### Allowed

- Use **`NARRATE`** for square-effect narration and general feedback.
- Use **`PLAYER_ANSWERED`** or **`SET_STATE`** only for explicit user choices (e.g. path choice) or game-designed non-deterministic outcomes (e.g. bonus dice after a riddle, clearing an instrument after use).
