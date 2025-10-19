# Error Recovery & Validation Analysis

## Context

During implementation of strict turn enforcement (to fix bug where Federico moved twice), we discovered that error handling is currently silent - users get no voice feedback when things go wrong. This is unacceptable for a voice-only interface.

## The Bug That Started This

**Issue**: LLM forgot to advance turn after Federico's move, causing Santiago's dice roll to be applied to Federico.

**Root Cause**: LLM forgot to set `game.turn = "p2"` after Federico's first move.

**Solution Implemented**:
- Layer 1: Validator blocks player state mutations when it's not their turn (pre-execution)
- Layer 2: Orchestrator asserts turn ownership during execution (catches validator bugs)

## Current Error Handling Problems

### Silent Failures Everywhere

All errors currently just log to console - users hear **nothing**:

1. **Validation Failures**: Returns silently, no voice feedback
2. **LLM Network Errors**: Returns empty array, silent exit
3. **Execution Errors**: Caught and logged, loop continues (partial state corruption)
4. **Malformed LLM Response**: Returns empty array, silent exit

**Voice-Only UX Impact**: Users don't know if:
- System heard them
- They should repeat
- Something went wrong
- Game state is corrupted

## Error Scenarios & Recovery Strategies

### Scenario 1: Validation Error (Turn Violation)

**What Happened**: LLM tried to modify players.1 when game.turn="p1"

**Why**: Either LLM forgot to advance turn, or user spoke out of turn

**Current Behavior**:
```typescript
if (!validation.valid) {
  Logger.error('Validation failed:', validation.error)  // Console only
  return  // Silent exit
}
```

**Recommended Recovery**:
```typescript
if (!validation.valid && validation.error.includes('Cannot modify players')) {
  const state = await stateManager.getState()
  const currentPlayer = getCurrentPlayerName(state)

  await speechService.speak(
    `Perdón, creo que es el turno de ${currentPlayer}. ` +
    `${currentPlayer}, si estás de acuerdo tirá el dado. ` +
    `Si no, decime dónde estamos y voy a tratar de seguir desde ahí.`
  )
}
```

**Strategy**: Acknowledge confusion, state system belief, give user control to correct

---

### Scenario 2: LLM Network/API Error

**What Happened**: Gemini/Ollama unreachable or returned error

**Why**: Internet down, API key invalid, service overloaded

**Current Behavior**:
```typescript
// In LLM client
catch (error) {
  Logger.error('GeminiClient error:', error)
  return []  // Empty array
}

// In orchestrator
if (actions.length === 0) {
  Logger.warn('No actions returned from LLM')
  return  // Silent exit
}
```

**Recommended Recovery**:
```typescript
// In LLM client, throw specific error type
throw new LLMNetworkError('Gemini API unreachable')

// In orchestrator
catch (error) {
  if (error instanceof LLMNetworkError) {
    await speechService.speak(
      "Perdón, tuve un problema de conexión. Esperá un momento y volvé a intentar."
    )
  }
}
```

**Strategy**: Inform user it's not their fault, ask to wait and retry, state is preserved

---

### Scenario 3: Malformed LLM Response

**What Happened**: LLM returned garbage, not valid JSON

**Why**: LLM hallucinated, prompt confusion

**Current Behavior**: Same as network error - returns empty array, silent exit

**Recommended Recovery**:
```typescript
if (actions.length === 0) {
  await speechService.speak(
    "Perdón, no entendí bien. ¿Podés repetir qué querés hacer?"
  )
}
```

**Strategy**: Simple retry request

---

### Scenario 4: Execution Assertion Error (Mid-Sequence Turn Violation)

**What Happened**: Turn changed mid-action-sequence, breaking execution assertion

**Why**: This is a BUG IN OUR CODE - validator let something through it shouldn't have

**Example**:
```json
// turn=p1, all actions pass validation
[
  {"action": "ADD_STATE", "path": "players.0.position", "value": 3},  // ✅
  {"action": "SET_STATE", "path": "game.turn", "value": "p2"},        // ✅
  {"action": "SET_STATE", "path": "players.0.bonus", "value": true}   // ❌ Assertion fails!
]
```

**Current Behavior**:
```typescript
try {
  await this.executeAction(action, context)
} catch (error) {
  Logger.error('Failed to execute action:', action, error)
  // Loop continues, state may be corrupted
}
```

**Recommended Recovery**:
```typescript
// Option A: Stop execution on first error
private async executeActions(actions: PrimitiveAction[], context: ExecutionContext): Promise<void> {
  for (const action of actions) {
    await this.executeAction(action, context)  // Don't catch - let it throw
  }
}

// Option B: Stop + Rollback (better)
private async executeActions(actions: PrimitiveAction[], context: ExecutionContext): Promise<void> {
  const stateSnapshot = await this.stateManager.getState()

  try {
    for (const action of actions) {
      await this.executeAction(action, context)
    }
  } catch (error) {
    // Rollback on ANY error
    await this.stateManager.resetState(stateSnapshot)

    // Explain what happened
    await this.speechService.speak(
      "Perdón, hubo un error procesando eso. El estado del juego está como antes. " +
      "¿Podés decirme en qué posición está cada jugador?"
    )

    throw error  // Re-throw for logging
  }
}
```

**Strategy**: Atomic execution (all or nothing), rollback on error, ask user to manually restore state

---

## Key Decisions

### 1. Should Execution Errors Stop the Loop or Continue?

**Decision: STOP**

**Reasoning**:
- Continuing risks partial state corruption
- User might hear narration but state is inconsistent
- Better to fail completely than fail partially

**Implementation**: Don't catch errors in execution loop - let them throw

**Better Implementation**: Stop + Rollback (atomic execution)

---

### 2. How to Handle Execution Assertion Failures?

**What It Means**: Validator bug - it let through something it shouldn't have

**Options**:

**A. Fatal in Dev, Graceful in Prod**:
```typescript
if (process.env.NODE_ENV === 'development') {
  throw error  // Crash with stack trace
} else {
  // Graceful degradation
}
```

**B. Always Gracefully Degrade**:
```typescript
catch (error) {
  if (error.message.includes('Turn ownership violation')) {
    Logger.error('VALIDATOR BUG:', error)
    await this.stateManager.resetState(stateSnapshot)
    await this.speechService.speak(
      "Ay, perdón. Tuve un error interno. " +
      "Volvimos al estado anterior. " +
      "Decime dónde está cada jugador y seguimos desde ahí."
    )
    return
  }
  throw error
}
```

**C. Make Validator Smarter (Prevention)**:

Simulate action sequence during validation:
```typescript
function validateActions(actions, state, stateManager) {
  let simulatedState = deepClone(state)

  for (const action of actions) {
    // Validate against current simulated state
    const result = validateAction(action, simulatedState, stateManager)
    if (!result.valid) return result

    // Apply action to simulation
    if (action.action === 'SET_STATE') {
      setPath(simulatedState, action.path, action.value)
    }
    // ... etc
  }

  return { valid: true }
}
```

**Recommendation**: Combination of B + C
- Implement graceful degradation now
- Add simulation to validator later (more robust but complex)

---

### 3. Should We Differentiate Error Types?

**Decision: YES**

**Implementation**:
```typescript
class ValidationError extends Error {
  constructor(public userMessage: string) { super(userMessage) }
}
class LLMNetworkError extends Error {}
class LLMParseError extends Error {}
class ExecutionError extends Error {}
```

**Benefits**:
- Specific user feedback per error type
- Better debugging/telemetry
- Appropriate recovery strategies

---

## Recommended Implementation Plan

### Phase 1: Basic Voice Feedback (Immediate)

1. **Add Error Classes**:
   - Create `src/orchestrator/errors.ts`
   - Define `ValidationError`, `LLMNetworkError`, `LLMParseError`, `ExecutionError`

2. **Update LLM Clients**:
   - Throw `LLMNetworkError` on network failures
   - Throw `LLMParseError` on malformed responses
   - Stop returning empty arrays

3. **Update Orchestrator**:
   - Add voice feedback for validation failures (turn violations)
   - Add voice feedback for LLM errors (network/parse)
   - Stop execution on first error (don't catch in loop)

4. **Voice Messages**:
   - Turn violation: "Perdón, creo que es el turno de X..."
   - Network error: "Perdón, tuve un problema de conexión..."
   - Parse error: "Perdón, no entendí bien. ¿Podés repetir?"
   - Execution error: "Perdón, hubo un error..."

**Files to Modify**:
- `src/orchestrator/errors.ts` (new)
- `src/orchestrator/orchestrator.ts`
- `src/llm/GeminiClient.ts`
- `src/llm/OllamaClient.ts`

**Estimated Effort**: ~2 hours

---

### Phase 2: State Rollback (Medium Priority)

1. **Add State Snapshotting**:
   - Capture state before executing actions
   - Rollback on any execution error
   - Atomic execution: all succeed or all fail

2. **Update StateManager**:
   - Add `snapshot()` method
   - Add `restore(snapshot)` method
   - Use deep cloning (already have `deep-clone.ts`)

3. **Voice Recovery Flow**:
   - On rollback: "El estado del juego está como antes"
   - Ask user to manually confirm state
   - Continue from confirmed state

**Files to Modify**:
- `src/state-manager.ts`
- `src/orchestrator/orchestrator.ts`

**Estimated Effort**: ~3 hours

---

### Phase 3: Validator Simulation (Future Enhancement)

1. **Make Validator Simulate Actions**:
   - Clone state before validation
   - Apply each action to simulated state
   - Validate against live simulated state (not snapshot)

2. **Benefits**:
   - Catches mid-sequence turn violations
   - Execution assertion becomes redundant
   - More robust validation

3. **Trade-offs**:
   - More complex validator
   - Need to duplicate execution logic
   - Slightly slower validation

**Files to Modify**:
- `src/orchestrator/validator.ts`

**Estimated Effort**: ~4 hours

---

## Voice Feedback Patterns

### Turn Violation
**Pattern**: State belief + Control to user
```
"Perdón, creo que es el turno de ${playerName}.
${playerName}, si estás de acuerdo ${expectedAction}.
Si no, decime dónde estamos y voy a tratar de seguir desde ahí."
```

### Network Error
**Pattern**: Not user's fault + Retry instruction
```
"Perdón, tuve un problema de conexión.
Esperá un momento y volvé a intentar."
```

### Parse Error
**Pattern**: Simple retry request
```
"Perdón, no entendí bien. ¿Podés repetir qué querés hacer?"
```

### Execution Error / Rollback
**Pattern**: Acknowledge error + State safety + Manual recovery
```
"Perdón, hubo un error procesando eso.
El estado del juego está como antes.
¿Podés decirme en qué posición está cada jugador?"
```

### Execution Assertion (Validator Bug)
**Pattern**: Take ownership + Rollback + Manual recovery
```
"Ay, perdón. Tuve un error interno.
Volvimos al estado anterior.
Decime dónde está cada jugador y seguimos desde ahí."
```

---

## Error Recovery Philosophy

### Principles

1. **Never Silent**: Users must always get voice feedback in a voice-only interface
2. **User Control**: When uncertain, give users control to correct/confirm
3. **State Safety**: Prefer rollback over corruption
4. **Clear Attribution**: Distinguish system errors from user errors
5. **Recovery Path**: Always provide a way forward

### User Experience Goals

- **Transparency**: User knows what went wrong (in simple terms)
- **Confidence**: User knows system is working and safe
- **Control**: User can override/correct system beliefs
- **Continuity**: Game can continue after errors

### Technical Goals

- **Atomicity**: All actions succeed or all fail
- **State Integrity**: No partial corruption
- **Defensive Design**: Catch bugs before they corrupt state
- **Telemetry**: Log errors for debugging without user seeing details

---

## Testing Strategy

### Manual Testing Scenarios

1. **Turn Violation**:
   - Have LLM try to modify wrong player
   - Verify voice feedback
   - Verify state unchanged

2. **Network Failure**:
   - Disconnect internet
   - Say command
   - Verify voice feedback

3. **Malformed Response**:
   - Mock LLM to return invalid JSON
   - Verify voice feedback

4. **Mid-Sequence Turn Change**:
   - Create action sequence that changes turn mid-sequence
   - Verify execution stops
   - Verify rollback works

### Future: Automated Tests

- Unit tests for error classes
- Integration tests for recovery flows
- Mock LLM client for testing error scenarios

---

## Open Questions

1. **Retry Logic**: Should network errors auto-retry? How many times?
2. **Telemetry**: Should we send error stats somewhere for monitoring?
3. **User Education**: Should we explain errors in more detail first time they happen?
4. **State Inspection**: Voice command to check state? "Kali, where is everyone?"
5. **Error History**: Should errors be logged in a way user can review?

---

## Status

**Current Implementation**:
- ✅ Turn validation in validator (blocks wrong player)
- ✅ Execution assertion (catches validator bugs)
- ❌ No voice feedback for errors
- ❌ No state rollback
- ❌ Execution errors allow partial corruption

**Next Steps**:
- Phase 1: Add voice feedback for all error types
- Phase 2: Add state rollback for atomic execution
- Phase 3: Make validator simulate action sequences

---

## Related Files

- `src/orchestrator/validator.ts` - Validation logic
- `src/orchestrator/orchestrator.ts` - Execution logic
- `src/llm/GeminiClient.ts` - Gemini LLM client
- `src/llm/OllamaClient.ts` - Ollama LLM client
- `src/state-manager.ts` - State management
- `src/services/speech-service.ts` - TTS for voice feedback
