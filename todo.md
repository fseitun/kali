# Kali - Todo & Future Improvements

## High Priority

### 1. Update Snakes & Ladders Game Rules
**Issue:** The `turnStructure` in `public/games/snakes-and-ladders.json` currently says "Players must say 'roll the dice'" which contradicts the user-informed-rolls philosophy.

**Current text (line 46):**
```
"CRITICAL: Players must say 'roll the dice' or similar. When they do, return ONLY a ROLL_DICE action. DO NOT manually process rolls that players report (like 'I rolled a 3')."
```

**Should be updated to:**
```
"CRITICAL: Players will INFORM you of their physical dice roll (e.g., 'I rolled a 3'). Process this by: determining whose turn it is (check game.turn), finding that player in the players array, adding the roll to their position using ADD_STATE, checking if they landed on a snake or ladder (board.moves), using SET_STATE if they landed on a special square, checking win condition (position >= board.winPosition), switching turns if game not won, and narrating what happened with appropriate sound effects. ROLL_DICE is only for edge cases when users explicitly ask you to roll for them."
```

**Files affected:**
- `public/games/snakes-and-ladders.json`

---

## Medium Priority

### 2. State History & Rollback System
**Why:** Users can authoritatively override state but might make mistakes and need recovery.

**Implementation:**
- Create `src/history-manager.ts`
- Automatic snapshots before every state change
- Explicit checkpoints via voice ("Kali, checkpoint")
- Keep last 10 states (FIFO)
- Voice commands: "Kali, undo that" / "Kali, undo last 3 actions"
- Estimated: ~100 lines, minimal overhead

**Detailed spec:** See `kali.md` > Future Features & Improvements

---

### 3. Improve Error Recovery for Model Download
**Current:** If model download fails, the app shows an error but doesn't offer retry mechanism.

**Suggestion:**
- Add retry button/mechanism for failed model downloads
- Show progress more clearly (currently just percentage)
- Consider chunked download with resume capability for poor connections

**Files affected:**
- `src/model-manager.ts`
- `src/main.ts` (error handling in initializeWakeWord)

---

### 4. Consider Wake Word Change
**Current:** Wake word is "zookeeper" (line 3 in `config.ts`)

**Discussion point:** Should it be "Kali" instead? More intuitive and aligns with the app name.

**Trade-off:** "Kali" is shorter and might have more false positives, but "zookeeper" is unusual and memorable.

**Decision needed:** User preference

---

## Low Priority / Code Quality

### 5. Add State Schema Validation on Startup
**Current:** There's a basic `isValidGameState` check (line 103-110 in `main.ts`) that only validates the game name.

**Enhancement:**
- Consider deeper schema validation (validate player structure, board structure, etc.)
- Prevent subtle state corruption from persisting across sessions

**Files affected:**
- `src/main.ts`
- Potentially create `src/schema-validator.ts`

---

### 6. Enhanced Error Messages for Validation Failures
**Current:** Validation errors are logged but user gets no voice feedback.

**Enhancement:**
- When validation fails, Kali should narrate "Sorry, I couldn't process that" or similar
- Helps with voice-only interaction (users can't see console errors)

**Files affected:**
- `src/orchestrator/orchestrator.ts` (lines 46-48)

---

### 7. Consider TTS Voice Selection
**Current:** Uses default browser voice (line 19-40 in `speech-service.ts`)

**Enhancement:**
- Allow voice selection/preference
- Consider gender/accent preferences for family use
- Could be voice-configured: "Kali, use a male voice" / "Kali, use a female voice"

**Files affected:**
- `src/services/speech-service.ts`
- `src/config.ts` (add voice preference config)

---

### 8. Sound Effect Management
**Current:** Sound effects are loaded at startup (line 98 in `main.ts`)

**Enhancement:**
- Lazy load sound effects (load on first use)
- Preload only essential sounds
- Graceful degradation if sound fails to load

**Files affected:**
- `src/services/speech-service.ts`
- `src/game-loader/game-loader.ts`

---

## Documentation

### 9. Update README.md
**Current:** README mentions Phase 1 but doesn't reflect Phase 2/3 completion.

**Update needed:**
- Add Phase 2 status (✅ COMPLETE)
- Document Phase 3 progress (Snakes & Ladders integration)
- Update example commands to reflect user-informed rolls
- Add troubleshooting section

**Files affected:**
- `README.md`

---

### 10. Add Inline Documentation
**Current:** Code is clean but lacks JSDoc comments on key classes/methods.

**Enhancement:**
- Add JSDoc to public methods in:
  - `StateManager`
  - `Orchestrator`
  - `SpeechService`
  - `GameLoader`

---

## Code Structure

### 11. Project Structure Review
**Current structure is clean:**
```
src/
  ├── llm/              ✅ LLM clients and prompts
  ├── orchestrator/     ✅ Core orchestration logic
  ├── services/         ✅ Speech and UI services
  ├── utils/            ✅ Utilities and helpers
  ├── game-loader/      ✅ Game loading logic
  └── audio-worklet/    ✅ Audio processing
```

**No structural changes needed** - organization is logical and scales well.

---

## Testing (Future Phase)

### 12. Add Unit Tests
**Current:** No tests exist.

**Priority:** Low (prototype phase), but consider for Phase 4.

**Suggested framework:** Vitest (already in Vite ecosystem)

**Test candidates:**
- `validator.ts` (pure functions, easy to test)
- `state-manager.ts` (path operations)
- `OllamaClient.ts` (JSON parsing logic)

---

## Performance

### 13. IndexedDB Performance Monitoring
**Current:** Every state change writes to IndexedDB (line 77-81 in `state-manager.ts`)

**Consideration:**
- Monitor if this becomes a bottleneck with complex games (D&D with large state)
- Consider batching state updates or debouncing writes
- Currently not an issue for Snakes & Ladders

---

## Notes

- All items are **future work** - current implementation is solid for Phase 3
- Priority order reflects impact on user experience and voice-only design
- Most code is clean, DRY, and well-organized
- No dead code or commented-out sections found
- Error handling is generally good, but could be enhanced for voice-only UX
