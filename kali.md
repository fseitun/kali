# Brief: Project Kali

## Goal

Kali is an always-available, voice-first game moderator. Its immediate goal is to moderate a game of **Snakes and Ladders** by understanding spoken player actions. The long-term vision is a **game-agnostic engine** capable of learning new games, including complex ones like Dungeons & Dragons, simply by being fed their rulebooks and state schemas.

## Core Principle: The CPU and the Game Designer

To achieve scalability, Kali is built on a strict separation of duties:

* **The LLM (The Game Designer):** A creative but untrusted component. It reads the game rules, understands player intent, and translates high-level concepts (e.g., "I landed on a ladder") into a sequence of simple, primitive instructions.
* **The Orchestrator (The CPU):** A deterministic, authoritative, and simple component. It knows nothing about game rules. It only understands a tiny set of **primitive actions** (`READ_STATE`, `WRITE_STATE`, `ROLL_DICE`, `NARRATE`). It validates and executes the instructions from the LLM, guaranteeing the integrity of the game state.

This model ensures the Orchestrator's code remains small and universal, while the game-specific logic resides entirely within the context provided to the LLM.

---

## Technologies

* **Platform:** Foreground Web App (PWA) with the screen always on.
* **Audio Pipeline:** WebAudio `AudioWorklet` for processing, **Vosk** for both wake-word and full speech-to-text.
* **STT:** **Vosk** (on-device, fully offline and free) with runtime model caching via the Cache API.
* **LLM:** Remote API (e.g., OpenAI, Google Gemini).
* **Orchestrator:** In-page JavaScript responsible for validating and executing primitive actions.
* **State Store:** `IndexedDB` for persistent session state.
* **TTS & Sounds:** Browser's `speechSynthesis` API and WebAudio for preloaded local sound effects.

> **Note:** Initially planned to use Porcupine for wake word detection, but Vosk provides both wake word and full STT capabilities with zero cost and unlimited users, making it ideal for families.

---

## Phased Development Plan

### Phase 1: The Core Audio Pipeline ✅ **COMPLETE**

**Goal:** Reliably capture a voice command after the wake word.

* **Tasks:**
    * ✅ Implement the wake-word listener using `AudioWorklet` and Vosk keyword spotting.
    * ✅ Create a state machine to switch between wake-word listening and full transcription.
    * ✅ Implement runtime model downloading with the Cache API for offline persistence.
    * ✅ Implement full speech-to-text transcription after wake-word detection.
* **Milestone:** The system accurately transcribes a user's spoken command to the console after they say "Kali...".
* **Status:** **COMPLETE** - System detects the "Kali" wake word, transcribes the following speech, and displays the result.

### Phase 2: The Primitive Orchestration Loop ✅ **COMPLETE**

**Goal:** Build and validate the core `LLM -> Validator -> DB Write` cycle using primitive actions.

* **Tasks:**
    * ✅ **1. Define Primitives:** Create a TypeScript interface or JSON schema for the core primitive actions: `WRITE_STATE`, `READ_STATE`, `NARRATE`.
    * ✅ **2. Setup Database:** Create a simple wrapper for `IndexedDB` to manage a test state (e.g., `{ "counterValue": 0 }`).
    * ✅ **3. Implement LLM Client:** Write the code to send a transcript to a remote LLM API and receive the JSON response.
    * ✅ **4. Build the Orchestrator:**
        * It should take the transcript from the STT.
        * Construct a prompt for the LLM asking it to return a primitive action.
        * Receive the LLM's JSON response.
        * **Build the Validator:** Check if the received action is valid (e.g., does the `path` for `WRITE_STATE` exist?).
        * Execute the validated action on the `IndexedDB` state.
        * Trigger the `NARRATE` action via the TTS.
* **Milestone:** Successfully changing a value in the local database based on a validated, LLM-generated primitive action (e.g., "Kali, set the counter to five" results in the database updating and Kali saying "Okay, the counter is now five.").
* **Status:** **COMPLETE** - Full orchestration loop implemented with Ollama integration, validation, IndexedDB persistence, and TTS narration. LLM swappability verified (one-line change in main.ts).

### Phase 3: First Game Integration (Snakes and Ladders) ✅ **COMPLETE**

**Goal:** Moderate a full game of Snakes and Ladders, with all game logic handled by the LLM.

* **Tasks:**
    * ✅ Define the Snakes and Ladders board and player state in `IndexedDB`.
    * ✅ Write the game's rules into a plain text document.
    * ✅ Update the Orchestrator to feed the rules and current game state into the LLM's context with every prompt.
    * ✅ Add the `ROLL_DICE` primitive to the Orchestrator.
    * ✅ Integrate local sound effects triggered by the `NARRATE` primitive.
    * ✅ Implement voice-based player name collection at game start
    * ✅ Add transcription error correction for common mishearings
    * ✅ Format state context for LLM in human-readable way
    * ✅ Configure app to always start fresh (SETUP phase) on launch
* **Milestone:** A complete, voice-moderated game of Snakes and Ladders is playable from start to finish.
* **Status:** **COMPLETE** - Full game playable with voice name collection, concise narration, and proper state management.

### Phase 4: The Game-Agnostic Engine (Future-Proofing)

**Goal:** Evolve the system to handle complexity and make loading new games trivial, paving the way for D&D.

* **Tasks:**
    * Refactor to easily load different rule documents and initial state files.
    * Implement a basic **Retrieval-Augmented Generation (RAG)** system: instead of sending the whole rulebook, the Orchestrator searches for the most relevant rule snippet to include in the prompt.
    * Prototype **Agentic Chains:** The Orchestrator learns to handle a multi-step player turn by making a sequence of smaller, validated LLM calls.
* **Milestone:** Demonstrate that the system can load and play a different simple game without code changes, and show a successful prototype of the RAG and chaining logic required for future complex games.

---

## Todo & Future Improvements

### High Priority

#### Explicit Save/Load Game Feature
**Context:** Currently, the app always starts fresh on every launch (resets to SETUP phase). This is the correct default for voice-controlled board games, but users might want to explicitly save and resume games.

**Requirements:**
* **Voice Commands:**
  * "Kali, save this game as [name]" - Saves current state with a label
  * "Kali, load game [name]" - Loads a saved game
  * "Kali, what games are saved?" - Lists available saved games
* **Resume Flow:**
  * When loading, have each player confirm their name and position
  * "Alice, you're at position 23, correct?" (wait for yes/no)
  * If player says "no", ask them to correct: "Where are you?"
  * Validate all players before continuing
* **Storage:**
  * Store saved games separately from active session in IndexedDB
  * Structure: `{ saveName, timestamp, state }`
  * Allow multiple saved games per browser

**Implementation:**
* Create `src/save-manager.ts` for save/load operations
* Add SAVE_GAME and LOAD_GAME as custom action handlers in orchestrator
* Create voice-driven validation flow for loaded games
* Update system prompt with save/load commands

**Status:** Not started - future enhancement

---

### Medium Priority

#### Hybrid Deterministic Rule Enforcement
**Context:** Currently, ladder/snake moves in Snakes and Ladders are automatically enforced by the orchestrator after position changes. This hybrid approach keeps game-specific deterministic rules in code while letting the LLM handle narrative and interpretation.

**Status:** Implemented for ladder/snake moves in Snakes and Ladders (see `orchestrator.ts:checkAndApplyBoardMoves`)

**Future Expansion Considerations:**
* **Win Condition Checking:** Automatically detect and enforce win conditions (e.g., position >= 100) rather than relying on LLM
* **Bounds Checking:** Prevent invalid moves (e.g., position < 0, position > max)
* **Turn Validation:** Automatically enforce turn order rather than trusting LLM
* **Resource Management:** In complex games (D&D), enforce resource constraints (e.g., can't spend more mana than available)

**Trade-offs:**
* **Pro:** 100% reliable, fast, cheaper, deterministic
* **Pro:** Catches LLM errors silently without breaking game flow
* **Con:** Game-specific logic in orchestrator (less generic)
* **Con:** Need to update code for each game's deterministic rules

**Decision Point:** Evaluate per-game whether critical rules should be code-enforced or LLM-handled. Simple deterministic rules (ladders, bounds) are good candidates for code enforcement. Complex rules requiring interpretation (combat strategies, roleplay outcomes) should stay with LLM.

#### State History & Rollback System
**Context:** Users can authoritatively override state (e.g., "I'm at level 81 with a sword"), but they might make mistakes and need to recover from errors.

**Requirements:**
* **Automatic Snapshots:** Before every state mutation, store a snapshot in IndexedDB
  * Structure: `{ timestamp, state, action }` for automatic snapshots
  * Structure: `{ timestamp, state, label: "user-provided-name" }` for explicit checkpoints
* **Explicit Checkpoints:** Voice command to create named restore points (e.g., "Kali, checkpoint" or "Kali, save checkpoint before boss fight")
* **Retention Policy:** Keep last 10 states (FIFO queue)
* **Voice-Activated Rollback:**
  * Simple undo: "Kali, undo that" or "Kali, undo"
  * Multi-step undo: "Kali, undo last 3 actions"
  * Named restore: "Kali, restore to [checkpoint name]"

**Implementation:**
* Create `src/history-manager.ts`
* Automatic snapshots before every state change
* ~100 lines of code for history manager
* IndexedDB-based storage (async, non-blocking)
* Minimal overhead: <5ms per snapshot on modern devices
* Storage minimal: game states are small JSON objects
* **Voice-Only Design:** All recovery must be voice-triggered since users cannot see the screen

#### Improve Error Recovery for Model Download
**Current:** If model download fails, the app shows an error but doesn't offer retry mechanism.

**Suggestions:**
* Add retry button/mechanism for failed model downloads
* Show progress more clearly (currently just percentage)
* Consider chunked download with resume capability for poor connections

**Files affected:** `src/model-manager.ts`, `src/main.ts` (error handling in initializeWakeWord)

#### Consider Wake Word Change
**Current:** Wake word is "zookeeper" (line 3 in `config.ts`)

**Discussion:** Should it be "Kali" instead? More intuitive and aligns with the app name.

**Trade-off:** "Kali" is shorter and might have more false positives, but "zookeeper" is unusual and memorable.

**Decision needed:** User preference

#### Enhanced Error Messages for Validation Failures
**Current:** Validation errors are logged but user gets no voice feedback.

**Enhancement:**
* When validation fails, Kali should narrate "Sorry, I couldn't process that" or similar
* Helps with voice-only interaction (users can't see console errors)

**Files affected:** `src/orchestrator/orchestrator.ts` (lines 46-48)

#### TTS Voice Selection
**Current:** Uses default browser voice (line 19-40 in `speech-service.ts`)

**Enhancement:**
* Allow voice selection/preference
* Consider gender/accent preferences for family use
* Could be voice-configured: "Kali, use a male voice" / "Kali, use a female voice"

**Files affected:** `src/services/speech-service.ts`, `src/config.ts` (add voice preference config)

---

### Low Priority

#### Add State Schema Validation on Startup
**Current:** There's a basic `isValidGameState` check (line 103-110 in `main.ts`) that only validates the game name.

**Enhancement:**
* Consider deeper schema validation (validate player structure, board structure, etc.)
* Prevent subtle state corruption from persisting across sessions

**Files affected:** `src/main.ts`, potentially create `src/schema-validator.ts`

#### Sound Effect Management
**Current:** Sound effects are loaded at startup (line 98 in `main.ts`)

**Enhancement:**
* Lazy load sound effects (load on first use)
* Preload only essential sounds
* Graceful degradation if sound fails to load

**Files affected:** `src/services/speech-service.ts`, `src/game-loader/game-loader.ts`

#### Update README.md
**Current:** README mentions Phase 1 but doesn't reflect Phase 2/3 completion.

**Updates needed:**
* Add Phase 2 status (✅ COMPLETE)
* Document Phase 3 progress (Snakes & Ladders integration)
* Update example commands to reflect user-informed rolls
* Add troubleshooting section

**Files affected:** `README.md`

#### Add Inline Documentation
**Current:** Code is clean but lacks JSDoc comments on key classes/methods.

**Enhancement:** Add JSDoc to public methods in:
* `StateManager`
* `Orchestrator`
* `SpeechService`
* `GameLoader`

#### Project Structure Review
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

**Status:** No structural changes needed - organization is logical and scales well.

#### Add Unit Tests
**Current:** No tests exist.

**Priority:** Low (prototype phase), but consider for Phase 4.

**Suggested framework:** Vitest (already in Vite ecosystem)

**Test candidates:**
* `validator.ts` (pure functions, easy to test)
* `state-manager.ts` (path operations)
* `OllamaClient.ts` (JSON parsing logic)

#### IndexedDB Performance Monitoring
**Current:** Every state change writes to IndexedDB (line 77-81 in `state-manager.ts`)

**Consideration:**
* Monitor if this becomes a bottleneck with complex games (D&D with large state)
* Consider batching state updates or debouncing writes
* Currently not an issue for Snakes & Ladders

---

## Notes

* All items are future work - current implementation is solid for Phase 3
* Priority order reflects impact on user experience and voice-only design
* Most code is clean, DRY, and well-organized
* No dead code or commented-out sections found
* Error handling is generally good, but could be enhanced for voice-only UX
