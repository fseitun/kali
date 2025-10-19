# Code Refactoring Analysis - Large File Extraction

## Overview

Several core files have grown large and contain multiple distinct responsibilities. This document analyzes refactoring opportunities to improve maintainability, testability, and code clarity.

## File Metrics

| File                  | Lines | Priority | Complexity | Refactor Value | Estimated Effort |
|-----------------------|-------|----------|------------|----------------|------------------|
| orchestrator.ts       | 536   | CRITICAL | High       | Very High      | 6-8 hours        |
| name-collector.ts     | 487   | MEDIUM   | Medium     | Medium         | 4-6 hours        |
| system-prompt.ts      | 465   | LOW      | Low        | Low            | N/A              |
| validator.ts          | 449   | LOW      | Low        | Low            | N/A              |

---

## Priority 1: Orchestrator Refactoring (CRITICAL)

### Current State

**File:** `src/orchestrator/orchestrator.ts` (536 lines)

**Responsibilities:**
1. Core orchestration loop (LLM request/response cycle)
2. Action validation and execution
3. Turn management (auto-advance, ownership checks)
4. Board effects (snakes/ladders, square effects)
5. Decision point enforcement
6. Processing lock management
7. State coordination

**Problem:** Too many responsibilities in one class. Turn management, board effects, and decision points are distinct subsystems that could be independently tested and maintained.

### Proposed Extractions

#### Extract 1: Turn Management System (~100 lines)

**New File:** `src/orchestrator/turn-manager.ts`

**Methods to Extract:**
- `hasPendingDecisions(state: GameState): boolean` (lines 54-98)
- `autoAdvanceTurn(): Promise<void>` (lines 104-150)
- `assertPlayerTurnOwnership(path: string): Promise<void>` (lines 386-414)

**Responsibilities:**
- Check if current player has pending decisions
- Automatically advance turn when conditions are met
- Validate turn ownership before state mutations
- Announce next player via TTS

**Interface:**
```typescript
export class TurnManager {
  constructor(
    private stateManager: StateManager,
    private speechService: SpeechService
  ) {}

  hasPendingDecisions(state: GameState): boolean
  async autoAdvanceTurn(): Promise<void>
  async assertPlayerTurnOwnership(path: string): Promise<void>
}
```

**Benefits:**
- Isolated turn logic testing
- Clearer turn advancement rules
- Easier to modify turn mechanics per game

---

#### Extract 2: Board Effects Handler (~120 lines)

**New File:** `src/orchestrator/board-effects-handler.ts`

**Methods to Extract:**
- `checkAndApplyBoardMoves(path: string): Promise<void>` (lines 248-275)
- `checkAndApplySquareEffects(path: string, context: ExecutionContext): Promise<void>` (lines 277-320)

**Responsibilities:**
- Apply automatic board moves (snakes, ladders)
- Trigger square-specific effects (encounters, items, hazards)
- Inject synthetic transcripts for LLM to process effects

**Interface:**
```typescript
export class BoardEffectsHandler {
  constructor(
    private stateManager: StateManager,
    private llmProcessor: (transcript: string, context: ExecutionContext) => Promise<boolean>
  ) {}

  async checkAndApplyBoardMoves(path: string): Promise<void>
  async checkAndApplySquareEffects(path: string, context: ExecutionContext): Promise<void>
}
```

**Benefits:**
- Game-specific board logic isolated
- Easier to make orchestrator game-agnostic (future goal)
- Clearer square effect processing flow

**Note:** This is currently game-specific (Snakes & Ladders + Kalimba). Future work: Move to game config hooks to make orchestrator fully game-agnostic.

---

#### Extract 3: Decision Point Enforcer (~60 lines)

**New File:** `src/orchestrator/decision-point-enforcer.ts`

**Methods to Extract:**
- `enforceDecisionPoints(context: ExecutionContext): Promise<void>` (lines 322-384)

**Responsibilities:**
- Check if current player is at a decision point
- Enforce required field completion before movement
- Inject prompts to ask player for decisions

**Interface:**
```typescript
export class DecisionPointEnforcer {
  constructor(
    private stateManager: StateManager,
    private llmProcessor: (transcript: string, context: ExecutionContext) => Promise<boolean>
  ) {}

  async enforceDecisionPoints(context: ExecutionContext): Promise<void>
}
```

**Benefits:**
- Decision point logic testable in isolation
- Easier to add game-specific decision points
- Clearer enforcement flow

---

### Orchestrator After Refactoring

**Reduced Size:** ~250 lines (from 536)

**Remaining Responsibilities:**
- Core orchestration loop
- LLM request/response cycle
- Action validation coordination
- Action execution dispatch
- Processing lock management
- Module coordination

**New Structure:**
```typescript
export class Orchestrator {
  private turnManager: TurnManager
  private boardEffectsHandler: BoardEffectsHandler
  private decisionPointEnforcer: DecisionPointEnforcer
  private actionHandlers: Map<string, ActionHandler> = new Map()
  private isProcessing = false

  constructor(
    llmClient: LLMClient,
    stateManager: StateManager,
    speechService: SpeechService,
    statusIndicator: StatusIndicator,
    initialState: GameState
  ) {
    this.turnManager = new TurnManager(stateManager, speechService)
    this.boardEffectsHandler = new BoardEffectsHandler(stateManager, this.processTranscript.bind(this))
    this.decisionPointEnforcer = new DecisionPointEnforcer(stateManager, this.processTranscript.bind(this))
    // ... rest of initialization
  }

  // Core orchestration methods only
  async handleTranscript(transcript: string): Promise<void>
  private async processTranscript(transcript: string, context: ExecutionContext): Promise<boolean>
  private async executeActions(actions: PrimitiveAction[], context: ExecutionContext): Promise<void>
  private async executeAction(action: PrimitiveAction, context: ExecutionContext): Promise<void>
}
```

---

## Priority 2: Name Collector Refactoring (MEDIUM)

### Current State

**File:** `src/orchestrator/name-collector.ts` (487 lines)

**Responsibilities:**
1. Player count collection
2. Individual name collection per player
3. Name confirmation flows
4. Conflict resolution
5. Alternative name handling
6. Timeout management (repeated pattern)
7. Player state creation

**Problem:** Long but mostly sequential conversation flow. Confirmation patterns are repeated multiple times with slight variations.

### Proposed Extractions

#### Extract 1: Confirmation Flow Handlers (~150 lines)

**New File:** `src/orchestrator/name-confirmation-handler.ts`

**Methods to Extract:**
- `confirmName()` (lines 175-221)
- `confirmFriendlyName()` (lines 281-327)
- `waitForConfirmation()` (lines 369-412)
- `resolveAlternativeName()` (lines 414-462)

**Responsibilities:**
- Handle yes/no confirmations
- LLM-based intent analysis for confirmations
- Retry flows on negative confirmation
- Timeout handling with defaults

**Interface:**
```typescript
export class NameConfirmationHandler {
  constructor(
    private speechService: SpeechService,
    private llmClient: LLMClient,
    private timeoutManager: TimeoutManager
  ) {}

  async confirmName(
    name: string,
    onTranscript: (handler: (text: string) => void) => void,
    onRetry: () => Promise<string>
  ): Promise<string>

  async confirmFriendlyName(
    name: string,
    onTranscript: (handler: (text: string) => void) => void,
    onRetry: () => Promise<string>
  ): Promise<string>
}
```

**Benefits:**
- Reusable confirmation pattern
- Easier to test confirmation logic
- Simpler to add new confirmation flows

---

#### Extract 2: Timeout Management Utility

**New File:** `src/utils/timeout-manager.ts`

**Pattern to Extract:**
Repeated pattern of:
```typescript
if (this.timeoutHandle) {
  clearTimeout(this.timeoutHandle)
  this.timeoutHandle = null
}
this.timeoutHandle = window.setTimeout(callback, ms)
```

**Interface:**
```typescript
export class TimeoutManager {
  private handle: number | null = null

  setup(callback: () => void, ms: number): void
  clear(): void
}
```

**Benefits:**
- DRY principle
- Reduces boilerplate
- Easier to test timeout behavior

---

### Name Collector After Refactoring

**Reduced Size:** ~330 lines (from 487)

**Remaining Responsibilities:**
- Overall name collection flow coordination
- Player count collection
- Individual name collection loop
- Conflict detection and resolution coordination
- Player state creation
- Phase transitions

**Trade-off Analysis:**

**Pros:**
- Cleaner main flow
- Reusable confirmation handlers
- Better testability

**Cons:**
- More files to navigate
- Confirmation flows are tightly coupled to name collection context
- May add indirection without huge clarity gain

**Recommendation:** PROCEED with extraction. The confirmation handlers are complex enough to warrant isolation, and the reusable patterns will help if we add other setup flows (game selection, language selection).

---

## Priority 3: System Prompt (LOW - Skip Refactoring)

### Current State

**File:** `src/llm/system-prompt.ts` (465 lines)

**Content:**
- Base primitives documentation (~180 lines)
- Turn management instructions (~80 lines)
- Dice roll interpretation rules (~60 lines)
- State awareness guidelines (~50 lines)
- Narration style instructions (~40 lines)
- State formatting utilities (~55 lines)

### Analysis

**Why NOT to refactor:**

1. **Content Type:** Mostly static text (LLM instructions)
2. **Already Organized:** Functions clearly separate concerns
3. **Low Complexity:** No complex logic, just string templates
4. **Single Purpose:** All content relates to LLM system prompt
5. **Extraction Cost:** Would create many small files without clarity gain

**Example of what extraction would look like:**
```
src/llm/system-prompt/
  base-primitives.ts       (~180 lines)
  turn-management.ts       (~80 lines)
  dice-interpretation.ts   (~60 lines)
  state-awareness.ts       (~50 lines)
  narration-style.ts       (~40 lines)
  state-formatting.ts      (~55 lines)
```

**Problem:** User needs to jump between 6 files to understand the full prompt. Current single-file approach is actually clearer.

**Recommendation:** KEEP AS-IS. The file is well-organized with clear function boundaries. Text content is inherently verbose.

---

## Priority 4: Validator (LOW - Skip Refactoring)

### Current State

**File:** `src/orchestrator/validator.ts` (449 lines)

**Content:**
- Main validation orchestrator (~60 lines)
- Action-specific validators (~300 lines)
- Helper functions (~90 lines)

### Analysis

**Current Structure:**
```typescript
validateActions()           // Orchestrates validation
validateAction()            // Dispatches to specific validator
validateSetState()          // ~40 lines
validateAddState()          // ~35 lines
validateSubtractState()     // ~30 lines
validateReadState()         // ~15 lines
validateNarrate()           // ~15 lines
validateRollDice()          // ~5 lines
validateResetGame()         // ~5 lines
validateField()             // Helper
validateTurnOwnership()     // Helper
validateDecisionBeforeMove() // Helper
applyActionToMockState()    // Helper for stateful validation
```

**Why NOT to refactor:**

1. **Already Well-Organized:** Each function has a single, clear purpose
2. **Low Individual Complexity:** No function exceeds 60 lines
3. **Clear Naming:** Function names are descriptive
4. **High Cohesion:** All validators are related to action validation
5. **Easy to Navigate:** Can jump to any validator quickly

**Possible Extraction:**
Could group validators by action type into separate files:
```
src/orchestrator/validators/
  state-validators.ts      (SET_STATE, ADD_STATE, SUBTRACT_STATE, READ_STATE)
  action-validators.ts     (NARRATE, ROLL_DICE, RESET_GAME)
  validation-helpers.ts    (shared helpers)
```

**Problem:** Would fragment a cohesive unit. Current structure is readable and maintainable.

**Recommendation:** KEEP AS-IS. The validator is well-structured and not causing pain. Refactoring would add file-juggling without clarity gain.

---

## Implementation Strategy

### Phase 1: Orchestrator Extraction (High Priority)

**Goal:** Extract 3 subsystems from orchestrator

**Steps:**

1. **Create TurnManager**
   - Create `src/orchestrator/turn-manager.ts`
   - Copy turn-related methods
   - Add constructor with StateManager and SpeechService
   - Add JSDoc comments
   - Export TurnManager class

2. **Create BoardEffectsHandler**
   - Create `src/orchestrator/board-effects-handler.ts`
   - Copy board effects methods
   - Add constructor with StateManager and LLM processor callback
   - Add JSDoc comments
   - Export BoardEffectsHandler class

3. **Create DecisionPointEnforcer**
   - Create `src/orchestrator/decision-point-enforcer.ts`
   - Copy decision point enforcement method
   - Add constructor with StateManager and LLM processor callback
   - Add JSDoc comments
   - Export DecisionPointEnforcer class

4. **Update Orchestrator**
   - Instantiate extracted modules in constructor
   - Replace method calls with module calls
   - Remove extracted methods
   - Update imports
   - Keep orchestrator focused on coordination

5. **Testing**
   - Run `npm run lint` and fix issues
   - Run `npm run type-check` and fix issues
   - Manual test: Complete game session
   - Verify turn advancement works
   - Verify board effects apply correctly
   - Verify decision points enforce properly

**Estimated Effort:** 6-8 hours

---

### Phase 2: Name Collector Extraction (Medium Priority)

**Goal:** Extract confirmation handlers from name collector

**Steps:**

1. **Create NameConfirmationHandler**
   - Create `src/orchestrator/name-confirmation-handler.ts`
   - Extract confirmation methods
   - Add constructor with dependencies
   - Add JSDoc comments
   - Export NameConfirmationHandler class

2. **Create TimeoutManager Utility**
   - Create `src/utils/timeout-manager.ts`
   - Implement timeout setup/clear pattern
   - Add JSDoc comments
   - Export TimeoutManager class

3. **Update NameCollector**
   - Instantiate NameConfirmationHandler in constructor
   - Use TimeoutManager for timeout handling
   - Replace extracted methods with handler calls
   - Update imports
   - Clean up remaining code

4. **Testing**
   - Run `npm run lint` and fix issues
   - Run `npm run type-check` and fix issues
   - Manual test: Complete name collection flow
   - Verify all confirmation flows work
   - Verify timeout handling works
   - Verify conflict resolution works

**Estimated Effort:** 4-6 hours

---

### Phase 3: Integration & Documentation

**Goal:** Ensure everything works together, update documentation

**Steps:**

1. **Integration Testing**
   - Complete game session from start to finish
   - Test all edge cases (timeouts, errors, conflicts)
   - Performance check (ensure no slowdown)
   - Memory check (ensure no leaks)

2. **Documentation Updates**
   - Update `kali.md` with new file structure
   - Document new module interfaces
   - Update architecture section
   - Add refactoring notes

3. **Code Review**
   - Self-review all changes
   - Check for any remaining TODOs
   - Verify JSDoc completeness
   - Ensure consistent code style

**Estimated Effort:** 2-3 hours

---

## Todo Checklist

### Phase 1: Orchestrator Extraction

**Turn Manager:**
- [ ] Create `src/orchestrator/turn-manager.ts`
- [ ] Extract `hasPendingDecisions()` method
- [ ] Extract `autoAdvanceTurn()` method
- [ ] Extract `assertPlayerTurnOwnership()` method
- [ ] Add TurnManager constructor with dependencies
- [ ] Add JSDoc to all TurnManager methods
- [ ] Export TurnManager class

**Board Effects Handler:**
- [ ] Create `src/orchestrator/board-effects-handler.ts`
- [ ] Extract `checkAndApplyBoardMoves()` method
- [ ] Extract `checkAndApplySquareEffects()` method
- [ ] Add BoardEffectsHandler constructor with dependencies
- [ ] Add JSDoc to all BoardEffectsHandler methods
- [ ] Export BoardEffectsHandler class

**Decision Point Enforcer:**
- [ ] Create `src/orchestrator/decision-point-enforcer.ts`
- [ ] Extract `enforceDecisionPoints()` method
- [ ] Add DecisionPointEnforcer constructor with dependencies
- [ ] Add JSDoc to all DecisionPointEnforcer methods
- [ ] Export DecisionPointEnforcer class

**Orchestrator Integration:**
- [ ] Import new modules in orchestrator
- [ ] Instantiate TurnManager in constructor
- [ ] Instantiate BoardEffectsHandler in constructor
- [ ] Instantiate DecisionPointEnforcer in constructor
- [ ] Replace `hasPendingDecisions()` calls with `turnManager.hasPendingDecisions()`
- [ ] Replace `autoAdvanceTurn()` calls with `turnManager.autoAdvanceTurn()`
- [ ] Replace `assertPlayerTurnOwnership()` calls with `turnManager.assertPlayerTurnOwnership()`
- [ ] Replace `checkAndApplyBoardMoves()` calls with `boardEffectsHandler.checkAndApplyBoardMoves()`
- [ ] Replace `checkAndApplySquareEffects()` calls with `boardEffectsHandler.checkAndApplySquareEffects()`
- [ ] Replace `enforceDecisionPoints()` calls with `decisionPointEnforcer.enforceDecisionPoints()`
- [ ] Remove extracted methods from orchestrator
- [ ] Clean up orchestrator code

**Testing & Validation:**
- [ ] Run `npm run lint` - should pass with no errors
- [ ] Run `npm run type-check` - should pass with no errors
- [ ] Manual test: Start new game with 2 players
- [ ] Manual test: Complete full turn cycle
- [ ] Manual test: Verify turn auto-advancement works
- [ ] Manual test: Verify board effects apply (snakes/ladders)
- [ ] Manual test: Verify square effects trigger (Kalimba encounters)
- [ ] Manual test: Verify decision points enforce (path choice)
- [ ] Manual test: Play complete game session to verify no regressions

---

### Phase 2: Name Collector Extraction

**Confirmation Handler:**
- [ ] Create `src/orchestrator/name-confirmation-handler.ts`
- [ ] Extract `confirmName()` method
- [ ] Extract `confirmFriendlyName()` method
- [ ] Extract `waitForConfirmation()` method
- [ ] Extract `resolveAlternativeName()` method
- [ ] Add NameConfirmationHandler constructor with dependencies
- [ ] Add JSDoc to all confirmation methods
- [ ] Export NameConfirmationHandler class

**Timeout Manager:**
- [ ] Create `src/utils/timeout-manager.ts`
- [ ] Implement `setup(callback, ms)` method
- [ ] Implement `clear()` method
- [ ] Add JSDoc to TimeoutManager class and methods
- [ ] Export TimeoutManager class

**Name Collector Integration:**
- [ ] Import NameConfirmationHandler in name-collector
- [ ] Import TimeoutManager in name-collector
- [ ] Instantiate NameConfirmationHandler in constructor
- [ ] Create TimeoutManager instance in constructor
- [ ] Replace direct timeout handling with TimeoutManager calls
- [ ] Replace confirmation methods with handler calls
- [ ] Remove extracted methods from name-collector
- [ ] Clean up name-collector code

**Testing & Validation:**
- [ ] Run `npm run lint` - should pass with no errors
- [ ] Run `npm run type-check` - should pass with no errors
- [ ] Manual test: Start new game and go through name collection
- [ ] Manual test: Test player count collection
- [ ] Manual test: Test name confirmation (accept)
- [ ] Manual test: Test name confirmation (reject and retry)
- [ ] Manual test: Test timeout handling
- [ ] Manual test: Test name conflict resolution
- [ ] Manual test: Test alternative name handling
- [ ] Manual test: Verify all speech prompts work correctly

---

### Phase 3: Integration & Documentation

**Integration Testing:**
- [ ] Complete game session from startup to game end
- [ ] Test error scenarios (validation failures, LLM errors)
- [ ] Test edge cases (timeouts, interruptions)
- [ ] Performance check: Verify no slowdown in orchestration loop
- [ ] Performance check: Verify no slowdown in name collection
- [ ] Memory check: Play extended session, check for memory leaks

**Documentation:**
- [ ] Update `kali.md` "Important File Locations" section with new files
- [ ] Document TurnManager interface and responsibilities
- [ ] Document BoardEffectsHandler interface and responsibilities
- [ ] Document DecisionPointEnforcer interface and responsibilities
- [ ] Document NameConfirmationHandler interface and responsibilities
- [ ] Document TimeoutManager utility
- [ ] Add "Refactoring History" section to kali.md
- [ ] Update architecture diagrams if any exist

**Code Quality:**
- [ ] Review all new files for code quality
- [ ] Check JSDoc completeness on all public methods
- [ ] Verify consistent code style across new files
- [ ] Remove any debug logging or TODOs
- [ ] Ensure all imports are used
- [ ] Ensure no unused code remains

**Final Validation:**
- [ ] Run full lint check one more time
- [ ] Run full type check one more time
- [ ] Git status check - review all changed files
- [ ] Self-review all diffs before committing
- [ ] Commit with clear, descriptive message

---

## Benefits

### Improved Maintainability
- **Smaller Files:** Orchestrator reduced from 536 to ~250 lines
- **Focused Responsibilities:** Each module has a single, clear purpose
- **Easier Navigation:** Find relevant code faster
- **Reduced Cognitive Load:** Understand one concern at a time

### Better Testability
- **Isolated Testing:** Test turn logic without orchestrator overhead
- **Mocking Made Easy:** Mock dependencies cleanly
- **Faster Test Execution:** Unit tests run faster with smaller scope
- **Better Coverage:** Easier to achieve high test coverage

### Enhanced Extensibility
- **New Game Mechanics:** Add game-specific turn logic without touching orchestrator
- **Plug-in Architecture:** Extracted modules can be swapped per game
- **Reusable Patterns:** Confirmation handlers usable for other flows
- **Clear Extension Points:** Know exactly where to add new features

### Clearer Architecture
- **Separation of Concerns:** Each module handles one aspect
- **Dependency Visibility:** Constructor injection makes dependencies explicit
- **Reduced Coupling:** Modules interact through clear interfaces
- **Better Code Organization:** Related code lives together

---

## Trade-offs

### More Files
- **Navigation:** Need to jump between more files
- **Mental Model:** Must understand module boundaries
- **Import Management:** More import statements
- **Mitigation:** Good naming and clear interfaces help

### Dependency Injection
- **Setup Complexity:** Constructor gets longer
- **Dependency Passing:** Must pass dependencies through
- **Circular Dependencies:** Risk if not careful
- **Mitigation:** Use constructor injection pattern consistently

### Potential Over-Engineering
- **Simple Features:** May add complexity for simple additions
- **Abstractions:** Too many layers can obscure simple logic
- **Premature Optimization:** Extracting before pain point
- **Mitigation:** Only extract when clear benefit exists

### Learning Curve
- **New Contributors:** Must learn module structure
- **Documentation:** Requires keeping docs updated
- **Context Switching:** More files to understand full flow
- **Mitigation:** Comprehensive JSDoc and architecture docs

---

## Success Metrics

### Quantitative
- [ ] Orchestrator reduced below 300 lines (target: ~250)
- [ ] Each extracted module < 150 lines
- [ ] All lint checks pass
- [ ] All type checks pass
- [ ] No performance regression (< 5% slowdown acceptable)
- [ ] Test coverage maintained or improved

### Qualitative
- [ ] Orchestrator code is easier to read
- [ ] Turn management logic is clearer
- [ ] Board effects are easier to understand
- [ ] Decision point enforcement is more obvious
- [ ] Confirmation flows are reusable
- [ ] Module boundaries feel natural

### Risk Mitigation
- [ ] No behavioral changes (only structural)
- [ ] All existing functionality works
- [ ] No new bugs introduced
- [ ] State management remains consistent
- [ ] Error handling unchanged

---

## Future Considerations

### After This Refactoring

**Potential Next Steps:**

1. **Testing Infrastructure**
   - Add unit tests for extracted modules
   - Add integration tests for orchestrator
   - Target 80%+ coverage on core logic

2. **Game-Agnostic Orchestrator**
   - Move BoardEffectsHandler logic to game config
   - Create hook system for game-specific behavior
   - Make orchestrator truly universal

3. **Error Handling Modules**
   - Extract error recovery logic (see error-recovery-analysis.md)
   - Create ErrorHandler service
   - Implement state rollback system

4. **Dependency Injection Container**
   - Add lightweight DI container
   - Centralize dependency management
   - Improve testability further

### Not Recommended

1. **System Prompt Extraction**
   - Keep as single file (content-heavy, well-organized)

2. **Validator Fragmentation**
   - Keep as single file (already well-structured)

3. **Micro-Services Pattern**
   - Don't over-extract (balance clarity with simplicity)

---

## Related Documents

- `error-recovery-analysis.md` - Error handling strategy
- `prioritized-roadmap.md` - Overall project roadmap
- `llm-narration-rephrasing.md` - LLM rephrasing feature plan
- `kali.md` - Project brief and architecture

---

## Status

**Current State:** Analysis complete, ready for implementation

**Priority:** HIGH (Orchestrator), MEDIUM (Name Collector)

**Estimated Total Effort:** 12-17 hours

**Recommended Timeline:**
- Week 1: Phase 1 (Orchestrator extraction)
- Week 2: Phase 2 (Name Collector extraction)
- Week 2: Phase 3 (Integration & documentation)

**Next Action:** Start with Phase 1, Task 1 - Create TurnManager module
