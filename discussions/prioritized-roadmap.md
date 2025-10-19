# Kali Development Roadmap - Prioritized by Value/Complexity

This document consolidates all planned improvements and features, ranked by their value-to-complexity ratio.

**Legend:**
- 🔥 **Critical** - High value, low-medium complexity (do first)
- ⭐ **High Value** - Significant impact, moderate complexity
- 💎 **Strategic** - Long-term value, higher complexity
- 🔧 **Infrastructure** - Foundational, enables other work
- 🎨 **Polish** - Nice to have, lower priority

---

## 🔥 Critical Priority (High Value / Low-Medium Complexity)

### 1. Error Recovery & Voice Feedback 🔥
**Value: 10/10 | Complexity: 4/10 | Ratio: 2.5**

**Problem:** All errors (validation failures, LLM network errors, execution errors) are silently logged with no voice feedback. Unacceptable for voice-only interface.

**Implementation:**
- Add voice narration for all error types with specific, helpful messages
- Validation failures: "I can't do that right now, it's not your turn"
- LLM failures: "Sorry, I didn't catch that. Can you try again?"
- Execution errors: "Something went wrong. Let's try that again"
- Add `ErrorHandler` service with error classification (transient, permanent, critical)
- Implement automatic retry with exponential backoff for transient errors

**Files:**
- `src/services/error-handler.ts` (new)
- `src/orchestrator/orchestrator.ts`
- `src/llm/GeminiClient.ts`
- `src/llm/OllamaClient.ts`

**Status:** Analysis complete in `discussions/error-recovery-analysis.md` - ready to implement

---

### 2. Eliminate LLM Client Duplication 🔥
**Value: 8/10 | Complexity: 3/10 | Ratio: 2.67**

**Problem:** `GeminiClient.ts` and `OllamaClient.ts` share 90% identical code for `extractName()` and `analyzeResponse()` methods.

**Implementation:**
- Create `BaseLLMClient` abstract class with shared methods
- Move `extractName()` and `analyzeResponse()` to base class
- Both clients extend base class and only implement `getActions()`
- Reduces code duplication by ~200 lines

**Files:**
- `src/llm/BaseLLMClient.ts` (new)
- `src/llm/GeminiClient.ts` (refactor)
- `src/llm/OllamaClient.ts` (refactor)

---

### 3. LLM Fallback Strategies 🔥
**Value: 9/10 | Complexity: 4/10 | Ratio: 2.25**

**Problem:** Empty array returned on LLM failure, no user feedback or recovery.

**Implementation:**
- Add fallback responses for common commands (roll dice, check position, whose turn)
- Implement retry logic with alternate prompts
- Add voice feedback for LLM errors
- Cache recent successful responses as fallbacks
- Add request deduplication/debouncing

**Files:**
- `src/llm/GeminiClient.ts`
- `src/llm/OllamaClient.ts`
- `src/orchestrator/orchestrator.ts`
- `src/llm/fallback-responses.ts` (new)

---

### 4. State Manager Batching 🔥
**Value: 8/10 | Complexity: 4/10 | Ratio: 2.0**

**Problem:** Each `stateManager.set()` call triggers full state clone and IndexedDB write. Performance bottleneck.

**Implementation:**
- Add `beginTransaction()` / `commitTransaction()` methods to batch writes
- Implement debounced state persistence (e.g., 100ms delay)
- Add in-memory cache layer
- Target: < 100ms state write latency (currently can be 200-500ms)

**Files:**
- `src/state-manager.ts`
- `src/orchestrator/orchestrator.ts`

---

## ⭐ High Value (Significant Impact / Moderate Complexity)

### 5. Type Safety Improvements ⭐
**Value: 7/10 | Complexity: 4/10 | Ratio: 1.75**

**Problem:** Multiple type assertions with `as unknown as Record<string, unknown>` in validator, unsafe JSON parsing.

**Implementation:**
- Create proper type guards for action validation
- Add JSON parse error handling with safe parsing utilities
- Replace type assertions with type guards
- Add discriminated union types for actions
- Eliminate all `as unknown` casts

**Files:**
- `src/orchestrator/validator.ts`
- `src/llm/GeminiClient.ts`
- `src/llm/OllamaClient.ts`
- `src/utils/json-parser.ts` (new)
- `src/utils/type-guards.ts` (new)

---

### 6. State Corruption Recovery ⭐
**Value: 8/10 | Complexity: 5/10 | Ratio: 1.6**

**Problem:** No validation or recovery if IndexedDB state becomes corrupted. Can cause silent failures.

**Implementation:**
- Add state schema validation on read (JSON Schema or Zod)
- Implement state migrations for version changes
- Add "safe mode" recovery that resets to last known good state
- Automatic state snapshots before mutations

**Files:**
- `src/state-manager.ts`
- `src/utils/state-validator.ts` (new)
- `src/utils/state-migrations.ts` (new)

---

### 7. User Language Selection at Setup ⭐
**Value: 9/10 | Complexity: 6/10 | Ratio: 1.5**

**Problem:** Currently hardcoded to Spanish (Argentina). Need runtime language selection.

**Implementation:**
- Voice-activated language selection on first launch
- "Choose your language: Spanish or English" / "Elegí tu idioma: Español o Inglés"
- Store language preference in IndexedDB
- Update `CONFIG.LOCALE` dynamically
- Reload i18n translations
- Update LLM system prompt based on selected language
- Wake word "Kali" works phonetically in both languages

**Files:**
- `src/i18n/index.ts`
- `src/orchestrator/name-collector.ts` (add language selection phase)
- `src/config.ts`
- `src/state-manager.ts` (persist language choice)

**Status:** Currently defaulting to Spanish (Argentina)

---

### 8. Explicit Save/Load Game Feature ⭐
**Value: 8/10 | Complexity: 6/10 | Ratio: 1.33**

**Problem:** App always starts fresh on launch. Users can't resume games explicitly.

**Implementation:**
- Voice commands: "Kali, save this game as [name]", "Kali, load game [name]", "Kali, what games are saved?"
- Implement multiple save slots in IndexedDB
- Add save metadata (timestamp, player names, game type)
- Resume flow with player confirmation ("Alice, you're at position 23, correct?")
- Add SAVE_GAME and LOAD_GAME primitive actions

**Files:**
- `src/save-manager.ts` (new)
- `src/state-manager.ts`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/types.ts` (new actions)

**Status:** Planned - future enhancement

---

### 9. LLM Narration Rephrasing ⭐
**Value: 7/10 | Complexity: 5/10 | Ratio: 1.4**

**Problem:** All system messages and i18n strings spoken as-is, making Kali sound robotic and repetitive.

**Implementation:**
- Pass system messages through LLM for natural rephrasing
- Cache rephrased messages to avoid redundant API calls
- Add "personality" to Kali's voice
- Especially important for kids

**Files:**
- `src/services/speech-service.ts`
- `src/llm/GeminiClient.ts` (add rephrasing method)
- `src/i18n/index.ts`

**Status:** Planned in `discussions/llm-narration-rephrasing.md` - ready to implement

---

### 10. Runtime Game Selection ⭐
**Value: 7/10 | Complexity: 5/10 | Ratio: 1.4**

**Problem:** Currently defaulting to Kalimba game. Need runtime game selection.

**Implementation:**
- Voice-activated game selection after language selection
- "Choose a game: Kalimba or Snakes and Ladders"
- Automatically detect available games from `/public/games/`
- Store last played game preference in IndexedDB
- Voice command to switch games: "Kali, change game" (with confirmation)
- Voice command to list games: "Kali, what games can we play?"

**Files:**
- `src/game-loader/game-loader.ts` (add discovery)
- `src/orchestrator/name-collector.ts` (add game selection phase)
- `src/config.ts`
- `src/state-manager.ts`

**Status:** Currently defaulting to Kalimba

---

## 💎 Strategic (Long-term Value / Higher Complexity)

### 11. Testing Infrastructure 🔧💎
**Value: 9/10 | Complexity: 7/10 | Ratio: 1.29**

**Problem:** No tests exist, making refactoring risky. Critical for long-term maintainability.

**Implementation:**

**Phase 1: Core Setup**
- Add Vitest test framework
- Create test utilities and mocks
- Add coverage reporting
- Target: vitest.config.ts, src/test-utils/

**Phase 2: Unit Tests**
- Test validator functions with edge cases
- Test state manager path operations
- Test turn ownership validation
- Test primitive action execution
- Target: 80%+ coverage on core modules

**Phase 3: Integration Tests**
- Mock LLM responses for predictable testing
- Test full turn sequences
- Test error recovery flows
- Test name collection flow

**Files:**
- `vitest.config.ts` (new)
- `package.json` (add vitest)
- `src/test-utils/` (new)
- `src/orchestrator/__tests__/validator.test.ts` (new)
- `src/__tests__/state-manager.test.ts` (new)
- `src/__tests__/integration/` (new)

---

### 12. Game-Agnostic Orchestrator 💎
**Value: 8/10 | Complexity: 7/10 | Ratio: 1.14**

**Problem:** `checkAndApplyBoardMoves` in orchestrator is game-specific (Snakes & Ladders logic). Violates core architecture principle.

**Implementation:**
- Move board move logic to game config via `onStateChange` hooks
- Create `APPLY_BOARD_EFFECT` primitive action
- Remove hard-coded Snakes & Ladders logic from orchestrator
- Enable games to define state transformation hooks in JSON

**Files:**
- `src/orchestrator/orchestrator.ts` (remove checkAndApplyBoardMoves)
- `src/orchestrator/types.ts` (add APPLY_BOARD_EFFECT)
- `src/game-loader/types.ts` (add hooks support)
- `public/games/snakes-and-ladders/config.json` (add hooks)

---

### 13. State History & Rollback System 💎
**Value: 7/10 | Complexity: 6/10 | Ratio: 1.17**

**Problem:** Users might make mistakes and need to recover from errors. No undo functionality.

**Implementation:**
- Automatic snapshots before every state mutation
- Explicit checkpoints via voice: "Kali, checkpoint" or "Kali, save checkpoint before boss fight"
- Retention policy: Keep last 10 states (FIFO queue)
- Voice-activated rollback: "Kali, undo that", "Kali, undo last 3 actions", "Kali, restore to [checkpoint name]"
- IndexedDB-based storage (async, non-blocking)
- Structure: `{ timestamp, state, action }` for automatic, `{ timestamp, state, label }` for explicit

**Files:**
- `src/history-manager.ts` (new)
- `src/state-manager.ts` (integrate snapshots)
- `src/orchestrator/orchestrator.ts` (integrate undo)

**Overhead:** <5ms per snapshot, minimal storage

---

### 14. LLM Request Optimization 💎
**Value: 7/10 | Complexity: 6/10 | Ratio: 1.17**

**Problem:** Full system prompt + state sent on every request, no caching. Latency and cost implications.

**Implementation:**
- Implement prompt caching for Gemini (via `cachedContent` API)
- Compress state context format (remove redundant fields)
- Use `stateDisplay` metadata more effectively
- Target: < 2s LLM response time (currently 2-4s)

**Files:**
- `src/llm/GeminiClient.ts`
- `src/llm/system-prompt.ts`

---

### 15. Enhanced Logging & Debug Tools 💎
**Value: 6/10 | Complexity: 5/10 | Ratio: 1.2**

**Problem:** Logger is basic, no structured logging or filtering. Hard to debug production issues.

**Implementation:**
- Add log levels with runtime filtering (DEBUG, INFO, WARN, ERROR)
- Implement structured logging (JSON format option)
- Add performance markers integration
- Create log export functionality for debugging
- Session replay for voice commands

**Files:**
- `src/utils/logger.ts`
- `src/utils/profiler.ts`

---

## 🔧 Infrastructure (Foundation for Other Work)

### 16. Dependency Injection Container 🔧
**Value: 6/10 | Complexity: 6/10 | Ratio: 1.0**

**Problem:** Hard-coded dependencies make testing difficult and coupling tight.

**Implementation:**
- Add lightweight DI container for services
- Make all dependencies injectable
- Improve testability and modularity
- Enables mocking for unit tests

**Files:**
- `src/di-container.ts` (new)
- Refactor all services to use DI

**Note:** Should be done before extensive testing work

---

### 17. Event System 🔧
**Value: 6/10 | Complexity: 6/10 | Ratio: 1.0**

**Problem:** Tight coupling between components, no observable state changes.

**Implementation:**
- Implement event bus for state changes
- Add lifecycle hooks (onTurnStart, onTurnEnd, onGameEnd)
- Enable game modules to listen to events
- Reduces coupling, enables plugins/extensions

**Files:**
- `src/events/event-bus.ts` (new)
- Integrate across modules

---

### 18. Modernize Async Patterns 🔧
**Value: 5/10 | Complexity: 5/10 | Ratio: 1.0**

**Problem:** Some Promise constructor anti-patterns, missing proper error boundaries.

**Implementation:**
- Replace Promise constructor patterns with async/await where appropriate
- Add proper try-catch blocks with typed errors
- Implement error boundary utilities
- Clean up name-collector.ts promise chains

**Files:**
- `src/orchestrator/name-collector.ts`
- `src/state-manager.ts`
- `src/wake-word.ts`

---

## 🎨 Polish (Nice to Have / Lower Priority)

### 19. Graceful Degradation 🎨
**Value: 7/10 | Complexity: 4/10 | Ratio: 1.75**

**Problem:** Voice-only approach fails if TTS unavailable. No fallback.

**Implementation:**
- Add visual fallback mode detection
- Display narration text if TTS fails repeatedly
- Add accessibility mode toggle
- Ensure app is still usable with broken TTS

**Files:**
- `src/services/speech-service.ts`
- `src/services/ui-service.ts`
- `src/services/production-ui-service.ts`

---

### 20. Audio Pipeline Optimization 🎨
**Value: 5/10 | Complexity: 6/10 | Ratio: 0.83**

**Problem:** No buffer pooling, potential memory pressure from audio chunks.

**Implementation:**
- Implement buffer pool for audio processing
- Add backpressure handling in audio worklet
- Optimize PCM to Float32 conversion
- Reduce GC pressure

**Files:**
- `src/audio-worklet/vosk-processor.js`
- `src/wake-word.ts`

**Note:** Only needed if performance issues observed

---

### 21. TTS Voice Selection 🎨
**Value: 6/10 | Complexity: 4/10 | Ratio: 1.5**

**Problem:** Uses default browser voice. No customization.

**Implementation:**
- Allow voice selection/preference
- Gender/accent preferences for family use
- Voice-configured: "Kali, use a male voice" / "Kali, use a female voice"
- Store preference in config

**Files:**
- `src/services/speech-service.ts`
- `src/config.ts`

---

### 22. Improve Model Download Error Recovery 🎨
**Value: 5/10 | Complexity: 4/10 | Ratio: 1.25**

**Problem:** If model download fails, app shows error but no retry mechanism.

**Implementation:**
- Add retry button/mechanism for failed downloads
- Show progress more clearly (currently just percentage)
- Consider chunked download with resume capability for poor connections

**Files:**
- `src/model-manager.ts`
- `src/main.ts`

---

### 23. Sound Effect Management 🎨
**Value: 4/10 | Complexity: 4/10 | Ratio: 1.0**

**Problem:** All sound effects loaded at startup.

**Implementation:**
- Lazy load sound effects (load on first use)
- Preload only essential sounds
- Graceful degradation if sound fails to load

**Files:**
- `src/services/speech-service.ts`
- `src/game-loader/game-loader.ts`

---

### 24. JSDoc Documentation 🎨
**Value: 4/10 | Complexity: 3/10 | Ratio: 1.33**

**Problem:** Code is clean but lacks JSDoc comments on some key classes/methods.

**Implementation:**
- Add JSDoc to public methods in StateManager, Orchestrator, SpeechService, GameLoader
- Include @param, @returns, @throws tags
- Improve IDE autocomplete experience

**Files:**
- Core classes across the codebase

**Status:** Partially complete - some classes already documented

---

## ❌ Deprioritized / Not Needed

### State Schema Validation on Startup
**Status:** Covered by #6 (State Corruption Recovery) - more comprehensive approach

### Project Structure Review
**Status:** Current structure is clean and scales well - no changes needed

### IndexedDB Performance Monitoring
**Status:** Covered by #4 (State Manager Batching) - proactive solution better than monitoring

### Hybrid Deterministic Rule Enforcement
**Status:** Exists but should be removed - covered by #12 (Game-Agnostic Orchestrator)

---

## Implementation Sequencing Recommendation

Based on dependencies and value/complexity:

1. **Quick Wins (Week 1-2)**
   - #1: Error Recovery & Voice Feedback
   - #2: Eliminate LLM Client Duplication
   - #3: LLM Fallback Strategies

2. **Foundation (Week 3-4)**
   - #4: State Manager Batching
   - #5: Type Safety Improvements
   - #6: State Corruption Recovery
   - #16: Dependency Injection (enables testing)

3. **Testing Infrastructure (Week 5-6)**
   - #11: Testing Infrastructure (all phases)

4. **User-Facing Features (Week 7-9)**
   - #7: User Language Selection
   - #8: Save/Load Game Feature
   - #9: LLM Narration Rephrasing
   - #10: Runtime Game Selection

5. **Strategic Architecture (Week 10-12)**
   - #12: Game-Agnostic Orchestrator
   - #13: State History & Rollback
   - #14: LLM Request Optimization
   - #17: Event System

6. **Polish (Ongoing)**
   - #15, #18, #19, #20, #21, #22, #23, #24 as time permits

---

## Success Metrics

- ✅ Zero silent errors - all errors have voice feedback
- ✅ Zero type assertions in production code
- ✅ 80%+ test coverage on core modules
- ✅ < 100ms state write latency (batched)
- ✅ < 2s LLM response time (with caching)
- ✅ Zero hard-coded game logic in orchestrator
- ✅ Multi-language support with runtime selection
- ✅ Save/load functionality for game sessions

---

**Last Updated:** 2025-10-19
