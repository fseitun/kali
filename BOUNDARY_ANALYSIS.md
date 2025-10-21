# Boundary Analysis: Orchestrator vs KaliAppCore

**Date**: 2025-10-20
**Analysis**: After architecture refactoring

## File Sizes

| File | Lines | Status |
|------|-------|--------|
| `orchestrator.ts` | 395 | ✅ Refactored - Phase 1 complete (extracted turn, board, decision modules) |
| `system-prompt.ts` | 414 | ⚠️ Large - LLM instructions and formatting |
| `kali-app-core.ts` | 372 | ✅ Reasonable - pure coordination |
| `wake-word.ts` | 290 | ✅ Reasonable - focused responsibility |
| `turn-manager.ts` | 182 | ✅ Focused - turn management subsystem |
| `board-effects-handler.ts` | 122 | ✅ Focused - board mechanics subsystem |
| `decision-point-enforcer.ts` | 89 | ✅ Focused - decision enforcement subsystem |
| `state-manager.ts` | 133 | ✅ Small and focused |

## Responsibilities Matrix

### 🎮 Orchestrator (Game Engine / CPU)

**Core Identity**: The authoritative game engine that owns all game logic

**After Phase 1 Refactor** - Extracted to modules:
- TurnManager (182 lines) - Turn advancement, ownership validation, pending decisions
- BoardEffectsHandler (122 lines) - Board moves, square effects
- DecisionPointEnforcer (89 lines) - Decision point enforcement

| Responsibility | Methods | Lines |
|----------------|---------|-------|
| **State Authority** | `setupPlayers()`, `transitionPhase()` | ~50 |
| **Primitive Execution** | `executeAction()`, `executeActions()` | ~100 |
| **LLM Processing** | `handleTranscript()`, `processTranscript()` | ~50 |
| **Module Coordination** | Delegates to TurnManager, BoardEffectsHandler, DecisionPointEnforcer | ~50 |
| **Testing** | `testExecuteActions()` | ~40 |
| **Utilities** | `isLocked()`, `isProcessingEffect()`, `registerActionHandler()` | ~30 |

**Total**: ~395 lines (down from 650 - 39% reduction)

**Dependencies**:
- ✅ LLMClient (uses)
- ✅ StateManager (uses)
- ✅ SpeechService (uses for narration)
- ✅ StatusIndicator (uses for UI state)
- ❌ NO dependency on KaliAppCore

**What it OWNS**:
- ✅ All game state mutations
- ✅ Turn advancement logic (via TurnManager module)
- ✅ Phase transitions
- ✅ Player creation/setup
- ✅ Board mechanics (via BoardEffectsHandler module)
- ✅ Decision point enforcement (via DecisionPointEnforcer module)
- ✅ Primitive action validation & execution
- ✅ Square effect processing (via BoardEffectsHandler module)

**What it DOES NOT own**:
- ❌ Component initialization/wiring
- ❌ Voice recognition setup
- ❌ Game module loading
- ❌ UI lifecycle
- ❌ Turn announcement to user (delegates to speech service)

---

### 🎛️ KaliAppCore (Application Shell / Coordinator)

**Core Identity**: The application lifecycle coordinator that wires components

| Responsibility | Methods | Lines |
|----------------|---------|-------|
| **Initialization** | `initialize()`, `initializeOrchestrator()`, `initializeWakeWord()` | ~120 |
| **Name Collection Flow** | `runNameCollection()` | ~50 |
| **Turn Announcement** | `checkAndAdvanceTurn()` | ~15 |
| **Saved Game Handling** | `handleSavedGameOrSetup()` | ~30 |
| **Proactive Start** | `proactiveGameStart()` | ~10 |
| **Input Routing** | `handleWakeWord()`, `handleTranscription()` | ~40 |
| **LLM Client Factory** | `createLLMClient()` | ~10 |
| **Game Rules Formatting** | `formatGameRules()` | ~20 |
| **Lifecycle** | `dispose()` | ~20 |
| **Testing Helpers** | `testExecuteActions()`, `skipToPlaying()` | ~40 |

**Total**: ~372 lines

**Dependencies**:
- ✅ WakeWordDetector (creates)
- ✅ Orchestrator (creates, delegates to)
- ✅ StateManager (creates, reads from - NO mutations after refactor ✅)
- ✅ LLMClient (creates)
- ✅ GameLoader (uses)
- ✅ SpeechService (uses)
- ✅ UIService (uses)
- ✅ NameCollector (creates temporarily)

**What it OWNS**:
- ✅ Component initialization
- ✅ Component wiring
- ✅ Voice recognition lifecycle
- ✅ Game module loading
- ✅ LLM client creation
- ✅ Input routing (wake word → orchestrator)
- ✅ Turn change announcements (TTS)
- ✅ UI lifecycle

**What it DOES NOT own**:
- ❌ Game state mutations (delegates to orchestrator ✅)
- ❌ Game logic
- ❌ Turn advancement logic (delegates to orchestrator ✅)
- ❌ Phase transitions (delegates to orchestrator ✅)

---

## Boundary Clarity Assessment

### ✅ CLEAR Boundaries (After Refactoring)

1. **State Mutations**:
   - **Before**: ❌ Both mutated state
   - **After**: ✅ Only orchestrator mutates, app delegates

2. **Turn Management**:
   - **Before**: ❌ KaliAppCore directly set `game.turn`
   - **After**: ✅ Orchestrator owns, KaliAppCore just announces

3. **Phase Transitions**:
   - **Before**: ❌ Both changed `game.phase`
   - **After**: ✅ Only orchestrator transitions phases

4. **Player Setup**:
   - **Before**: ❌ NameCollector mutated state directly
   - **After**: ✅ NameCollector returns data, orchestrator applies

### 🟡 POTENTIAL Overlap Areas

1. **Both Access StateManager** (Read-Only for App)
   ```typescript
   // KaliAppCore - reads to check game state
   const state = this.stateManager.getState()
   const game = state.game as Record<string, unknown>

   // This is OK - read access is fine
   // Mutations go through orchestrator ✅
   ```
   **Status**: ✅ Acceptable - read access needed for coordination

2. **Both Use SpeechService**
   ```typescript
   // Orchestrator - narrates game events
   await this.speechService.speak(primitive.text)

   // KaliAppCore - announces turn changes
   await this.speechService.speak(message)
   ```
   **Status**: ✅ Acceptable - different purposes:
   - Orchestrator: Game narration from primitives
   - KaliAppCore: UI announcements (turn changes, setup messages)

3. **Name Collection Coordination**
   ```typescript
   // KaliAppCore creates NameCollector
   const nameCollector = new NameCollector(...)
   const playerNames = await nameCollector.collectNames(...)

   // Then delegates to orchestrator
   this.orchestrator.setupPlayers(playerNames)
   this.orchestrator.transitionPhase(GamePhase.PLAYING)
   ```
   **Status**: ✅ Clean separation - app coordinates flow, orchestrator mutates state

### ❌ NO Overlap (Good!)

- ✅ Only orchestrator executes primitive actions
- ✅ Only orchestrator validates actions
- ✅ Only orchestrator enforces board mechanics
- ✅ Only orchestrator checks decision points
- ✅ Only KaliAppCore initializes components
- ✅ Only KaliAppCore manages voice recognition lifecycle

---

## Stepping On Each Other?

### Before Refactoring: ❌ YES

**Problems**:
1. Both mutated `game.turn` → Race conditions possible
2. Both mutated `game.phase` → Unclear ownership
3. KaliAppCore had duplicate `hasPendingDecisions()` → DRY violation
4. NameCollector mutated state → 3-way confusion

### After Refactoring: ✅ NO

**Clean Separation**:
1. Orchestrator = **Policy** (game rules, state mutations, validation)
2. KaliAppCore = **Mechanism** (wiring, lifecycle, coordination)

**Analogy**:
- **Orchestrator** = Chess engine that knows rules and validates moves
- **KaliAppCore** = Chess board that displays pieces and routes user input

---

## Responsibility Overlap Check

| Responsibility | Orchestrator | KaliAppCore | Overlap? |
|----------------|--------------|-------------|----------|
| State mutations | ✅ OWNS | ❌ Delegates | ✅ Clear |
| Turn advancement | ✅ OWNS | ❌ Delegates | ✅ Clear |
| Phase transitions | ✅ OWNS | ❌ Delegates | ✅ Clear |
| Player setup | ✅ OWNS | ❌ Delegates | ✅ Clear |
| Board mechanics | ✅ OWNS | ❌ N/A | ✅ Clear |
| Decision enforcement | ✅ OWNS | ❌ N/A | ✅ Clear |
| LLM processing | ✅ OWNS | ❌ Routes input | ✅ Clear |
| Primitive execution | ✅ OWNS | ❌ N/A | ✅ Clear |
| Component initialization | ❌ N/A | ✅ OWNS | ✅ Clear |
| Voice recognition | ❌ N/A | ✅ OWNS | ✅ Clear |
| Game loading | ❌ N/A | ✅ OWNS | ✅ Clear |
| Turn announcements | ❌ Narrates game | ✅ Announces turns | 🟡 Different purposes |
| State reading | ✅ Uses | ✅ Uses | 🟡 Read-only OK |

**Overlap Score**: 0 critical overlaps, 2 acceptable shared resources

---

## Other Large Files Analysis

### `system-prompt.ts` (414 lines) ⚠️

**What it does**:
- Builds LLM system prompts
- Formats game state for LLM
- Contains all primitive action documentation
- Language-specific instructions

**Concerns**:
- 🟡 Growing large with all LLM instructions
- 🟡 Mixes concerns: prompt building + state formatting

**Potential Improvements**:
1. Split into modules:
   - `prompt-builder.ts` - Main prompt construction
   - `state-formatter.ts` - State context formatting
   - `primitive-docs.ts` - Primitive action documentation
   - `language-instructions.ts` - Localization rules

2. Or keep as-is:
   - It's cohesive (all about LLM communication)
   - Not growing rapidly
   - Well-organized with functions

**Recommendation**: ✅ Leave as-is for now, monitor growth

### `orchestrator.ts` (395 lines) ✅

**OUTDATED - Phase 1 refactor completed 2025-10-20**

This file has been successfully refactored. See `discussions/orchestrator-refactor-plan.md` for details.

**What was done**:
- Extracted TurnManager (182 lines) - Turn advancement, ownership validation
- Extracted BoardEffectsHandler (122 lines) - Board moves, square effects
- Extracted DecisionPointEnforcer (89 lines) - Decision point enforcement
- Reduced orchestrator from 650 → 395 lines (39% reduction)

**Current state**:
- ✅ Focused on core orchestration and coordination
- ✅ Clear module boundaries
- ✅ Significantly improved maintainability
- ✅ Each subsystem independently testable
- ✅ No further splitting needed at this time

---

## Architectural Health: Post-Refactoring

### Before Score: 4/10 ❌

**Issues**:
- State mutations scattered
- Unclear ownership
- Duplicate logic
- UI components mutating state

### After Score: 9.5/10 ✅

**Strengths**:
- ✅ Clear separation of concerns
- ✅ Single source of truth (orchestrator)
- ✅ No duplicate logic
- ✅ Clean delegation patterns
- ✅ UI components are pure
- ✅ Comprehensive test coverage (138 tests)
- ✅ Documented axioms
- ✅ **Orchestrator refactored (Phase 1 complete) - modular subsystems**

**Remaining Concerns**:
- 🟡 system-prompt.ts is large (414 lines) - could split if it grows further
- 🟡 Both classes access SpeechService - acceptable but watch for conflicts

**Missing**: -0.5 point for:
- No tests for KaliAppCore itself (coordination logic untested)
- Could benefit from integration tests of full app flow

---

## Recommendations

### Immediate: ✅ No Action Needed

Current boundaries are clear and well-enforced.

### Short Term (Next 3-6 months):

1. **Add KaliAppCore Integration Tests**
   ```typescript
   // Tests for:
   - Full initialization flow
   - Name collection → orchestrator setup
   - Turn advancement announcement flow
   - Saved game handling
   ```

2. **Add Unit Tests for Orchestrator Modules** ✅ PRIORITY
   - TurnManager unit tests
   - BoardEffectsHandler unit tests
   - DecisionPointEnforcer unit tests

### Long Term (6-12 months):

1. **Consider Splitting system-prompt.ts**
   - When adding more languages
   - When adding more primitive actions
   - When it reaches ~600 lines

2. **Document Coordination Patterns**
   - Create examples of correct delegation
   - Add to `.cursorrules` if patterns emerge

---

## Conclusion

**Are boundaries clear?** ✅ YES
- Orchestrator = Game engine (policy, rules, mutations)
- KaliAppCore = Application shell (mechanism, wiring, coordination)

**Are they stepping on each other?** ✅ NO
- Clean delegation pattern
- No state mutation conflicts
- No duplicate logic
- Acceptable shared resource usage (read-only state, TTS)

**Other huge files?** 🟡 TWO TO MONITOR
- `orchestrator.ts` (650 lines) - largest, but focused
- `system-prompt.ts` (414 lines) - large, cohesive

**Overall**: Architecture is in excellent shape after Phase 1 refactoring (2025-10-20). Orchestrator successfully decomposed into focused subsystems. Boundaries are clear, enforced by tests, and documented in axioms. Next focus: unit tests for new modules.
