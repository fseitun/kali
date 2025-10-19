# Kali Architecture: The Guided LLM Pattern

## Core Philosophy

**Kali is a Guided LLM, not a Free-Range LLM.**

The system is built on a clear separation of concerns between deterministic control flow (Orchestrator) and flexible natural language interpretation (LLM).

## The CPU and the Interpreter

### Orchestrator = CPU (Deterministic)
**Role:** Controls WHEN things happen
- Enforces game flow constraints
- Validates state transitions
- Ensures required decisions are made
- Guarantees data integrity
- Blocks invalid actions

**Mindset:** "I don't care WHAT the user said. Just tell me: A or B?"

The orchestrator doesn't interpret language. It enforces rules:
- "Player must choose `pathChoice` before moving"
- "Can't modify Player 2's state when it's Player 1's turn"
- "Can't advance turn to a player with unfulfilled decisions"

### LLM = Interpreter (Flexible)
**Role:** Interprets WHAT the user means
- Translates messy human language into clean state updates
- Handles context, intent, and variations
- Maps "quiero el más largo que tiene más aventura" → `pathChoice = "B"`
- Understands game rules and player intent

**Mindset:** "User said they want the longer path. That means B."

The LLM doesn't enforce - it interprets. The orchestrator validates its output.

### LLM Is Not an Oracle

The LLM is smart, but it's not psychic. When something is ambiguous or unclear:

**Always ask rather than guess.**

Examples:
- User says "tiré dos tres" with single die → Ask: "¿Tiraste un 2 o un 3?"
- User mentions choosing but already chose → Ask: "Ya elegiste [X], ¿querés cambiar?"
- Unclear which player speaking → Ask: "¿Quién está hablando?"
- Ambiguous action → Ask for clarification

**No harm in asking.** Quick clarification keeps game accurate and builds trust. Wrong assumptions break immersion.

The orchestrator blocks invalid actions, but the LLM should prevent ambiguity before validation.

## Decision Point System

A perfect example of this separation:

### Game Config Declares Checkpoints
```json
"decisionPoints": [
  {
    "position": 0,
    "requiredField": "pathChoice",
    "prompt": "¿Querés ir por el A o el B?"
  }
]
```

### Orchestrator Enforces
- Detects when player lands on position 0
- Checks if `pathChoice` is null
- **Blocks turn advancement** if choice not made
- Validation fails with clear error message

### LLM Interprets
- Receives state context with decision warnings
- Hears user say "quiero el más largo"
- Returns: `SET_STATE players.X.pathChoice = "B"`
- Orchestrator validates and applies

### Result: Deterministic Flow + Natural Language

The orchestrator guarantees Santiago MUST choose before his turn advances. The LLM figures out whether his words mean "A" or "B".

## Why This Matters

### Prevents the "Gigantic If-Else" Problem
We could hard-code every game rule in TypeScript. But that defeats the purpose - Kali is meant to be game-agnostic and extensible.

### Prevents the "Trust the LLM Completely" Problem
We could let the LLM do everything. But LLMs are probabilistic and can skip steps, especially under token pressure or context drift.

### The Balance: Guided LLM
- **Structure:** Orchestrator provides rails (constraints, validation, flow control)
- **Flexibility:** LLM provides interpretation (intent, context, natural language)
- **Trust:** We trust the LLM for interpretation, not for enforcement

## Implementation Patterns

### Pattern 1: Validator Constraints
Enforces pre-conditions before actions execute:
```typescript
// In validator.ts
if (action.path === 'game.turn') {
  // Check if next player has unfulfilled decisions
  // Block turn change if requirements not met
}
```

### Pattern 2: State Context Injection
Warns LLM about constraints without relying on it to enforce:
```typescript
// In system-prompt.ts
⚠️ DECISION REQUIRED for Santiago (p2):
  Field: pathChoice (currently null)
  You CANNOT advance turn to this player until they make this choice.
```

### Pattern 3: Config-Driven Behavior
Game-specific rules live in JSON, not code:
```json
"decisionPoints": [...],
"moves": {...},
"squares": {...}
```

### Pattern 4: Synthetic Transcript Injection
The orchestrator enforces critical steps by injecting synthetic transcripts back to the LLM:

```typescript
// After detecting player landed on special square
await this.processTranscript(
  `[SYSTEM: Player landed on square 5: Cobra (power 4). Process encounter.]`,
  newContext
)
```

**How it works:**
1. User announces action (e.g., "rolled a 2")
2. LLM processes: ADD_STATE position, advance turn, NARRATE
3. Orchestrator detects position change, checks board.squares
4. If square has content, orchestrator injects synthetic transcript
5. LLM processes encounter (power check, riddle, rewards)

**Why synthetic transcripts:**
- Guarantees critical steps happen (LLM cannot skip)
- Maintains natural language interpretation (LLM handles "what")
- Preserves deterministic flow (orchestrator controls "when")
- No game-specific code in orchestrator (stays generic)

**Pattern applies to:**
- Square effects after position changes
- Decision point requirements (pathChoice, etc.)
- Any rule that MUST be enforced

This is the mechanism that makes the orchestrator truly authoritative while keeping the LLM flexible.

## North Star Principle

> **The orchestrator controls the WHEN (deterministic flow).**
> **The LLM interprets the WHAT (natural language).**
> **Synthetic transcripts bridge the gap.**

When in doubt:
- Need to enforce a rule? → Orchestrator injects synthetic transcript
- Need to understand user intent? → LLM interprets and acts
- Need game-specific data? → Config JSON
- Need to guarantee something happens? → Synthetic transcript

This keeps Kali maintainable, reliable, and game-agnostic.
