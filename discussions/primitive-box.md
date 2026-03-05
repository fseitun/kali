### Primitive Box Contract

**Canonical definitions:** `src/orchestrator/types.ts`

Kali treats the LLM (and any future interpreter) as a **swappable box** whose only job is to translate inputs into **primitive actions** that the orchestrator can validate and execute.

At the core of this seam is the `PrimitiveAction[]` contract defined in `src/orchestrator/types.ts`. Any interpreter – LLM clients, debug tools, or future non-LLM paths – must:

- Produce only the allowed primitive actions: `NARRATE`, `RESET_GAME`, `SET_STATE`, `PLAYER_ROLLED`, `PLAYER_ANSWERED`.
- Treat those primitives as **reports of events or corrections**, not as direct state mutations or turn/phase control.
- Rely on the orchestrator and its subsystems to:
  - Own all state changes via `StateManager`.
  - Manage game phase and turn advancement.
  - Enforce decision points and board effects.

The orchestrator exposes a single conceptual entry point for this contract: **“given a list of primitive actions, validate them and apply them to game state”**. Today this is implemented by the validator in `src/orchestrator/validator.ts` plus the execution logic in `src/orchestrator/orchestrator.ts`.

When adding new features, treat this primitive box boundary as the north star:

- If a behavior can be expressed as a composition of existing primitives, prefer that over adding new ones.
- If a truly new kind of event is needed, introduce it as a new primitive type, with:
  - Validation rules in `validator.ts`.
  - A handler in `orchestrator.ts`.
  - Updated guidance in the LLM system prompt.

This keeps the interpreter thin and swappable, and the orchestrator authoritative and testable.
