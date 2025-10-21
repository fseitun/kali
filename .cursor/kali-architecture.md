# Kali Architecture: The Guided LLM Pattern

> **Note:** This document details the Guided LLM Pattern philosophy and implementation patterns.
> For general architecture overview, see [.cursor/rules/architecture.mdc](.cursor/rules/architecture.mdc).
> For architectural decisions and rationale, see [.cursor/rules/architecture-decisions.mdc](.cursor/rules/architecture-decisions.mdc).

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
- **Calculates all state changes** (position math, score updates, etc.)

**Mindset:** "I don't care WHAT the user said. Just tell me: A or B?"

The orchestrator doesn't interpret language. It enforces rules:
- "Player must choose `pathChoice` before moving"
- "Can't modify Player 2's state when it's Player 1's turn"
- "Can't advance turn to a player with unfulfilled decisions"

### LLM = Interpreter (Flexible)
**Role:** Interprets WHAT the user means
- Translates messy human language into event primitives
- Handles context, intent, and variations
- Maps "quiero el más largo" → `PLAYER_ANSWERED` with answer "B"
- Understands game rules and player intent
- **Reports events, does NOT calculate state**

**Mindset:** "User said they want the longer path. That means answer is 'B'."

The LLM doesn't enforce or calculate - it interprets. The orchestrator validates and executes.

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
- Returns: `PLAYER_ANSWERED` with answer "B"
- Orchestrator validates, applies to pathChoice, and proceeds

### Result: Deterministic Flow + Natural Language

The orchestrator guarantees Santiago MUST choose before his turn advances. The LLM figures out whether his words mean "A" or "B".

---

## Thin LLM Principle

**The LLM is a translator, not a calculator.**

### What This Means

**LLM Reports Events:**
```json
{action: "PLAYER_ROLLED", value: 5}
{action: "PLAYER_ANSWERED", answer: "fight"}
```

**Orchestrator Calculates State:**
```typescript
// Orchestrator owns the math:
newPosition = currentPosition + rollValue
newScore = currentScore + points
```

### Why This Matters

**Before (LLM calculates):**
- LLM: "Player rolled 5, position is 10, so 10+5=15" → `ADD_STATE value: 5`
- Problem: LLM can make math errors
- Problem: Hard to test (depends on LLM being correct)
- Problem: LLM knows too much about state mechanics

**After (LLM reports):**
- LLM: "User said they rolled 5" → `PLAYER_ROLLED value: 5`
- Orchestrator: `position = currentPosition + 5`
- Benefit: Deterministic calculation
- Benefit: Easy to test
- Benefit: LLM is thin (just translates speech)

### Pure JSON Requirement

**The LLM must return PURE JSON** - no markdown, no code blocks:

```json
[
  {"action": "PLAYER_ROLLED", "value": 5},
  {"action": "NARRATE", "text": "Moving!"}
]
```

**Not this:**
```markdown
\`\`\`json
[{"action": "PLAYER_ROLLED", "value": 5}]
\`\`\`
```

**Benefit:** Strict parsing with `JSON.parse()`, clear error messages, one retry with feedback.

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
1. User announces action (e.g., "I rolled a 5")
2. LLM reports: PLAYER_ROLLED value: 5, NARRATE
3. Orchestrator calculates new position (position += 5)
4. Orchestrator checks board.squares at new position
5. If square has content, orchestrator injects synthetic transcript
6. LLM processes encounter (asks questions, captures answers via PLAYER_ANSWERED)

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

### Pattern 5: Turn Start Sanity Check

The orchestrator automatically announces at each turn start:

```typescript
"[PlayerName], it's your turn. You're at position [X]. Tell me what you rolled, or where you landed."
```

**Benefits:**
- State verification (user will correct if wrong)
- Clear prompt for what to say
- Flexible (accepts delta or absolute position)
- LLM doesn't need to remember to ask

## North Star Principle

> **The orchestrator controls the WHEN (deterministic flow).**
> **The LLM interprets the WHAT (natural language).**
> **The LLM reports events, does NOT calculate state.**
> **Synthetic transcripts bridge the gap.**

When in doubt:
- Need to enforce a rule? → Orchestrator injects synthetic transcript
- Need to understand user intent? → LLM interprets and acts
- Need game-specific data? → Config JSON
- Need to guarantee something happens? → Synthetic transcript
- Need to calculate state? → Orchestrator owns all math

This keeps Kali maintainable, reliable, testable, and game-agnostic.
