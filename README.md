# Kali - Voice Game Moderator

A voice-first game moderator for kids to play board games independently. Uses speech recognition to understand spoken player actions.

## 🎯 Current Status

- ✅ Phase 1: Core Audio Pipeline (Complete)
- ✅ Phase 2: Orchestration Loop (Complete)
- ✅ Phase 3: Snakes & Ladders Integration (Complete)
- ✅ Performance Profiling & Google Gemini Integration (Complete)
- ✅ Production UI with Status Indicator (Complete)

## Quick Start

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure LLM provider (create `.env` file):
   ```bash
   # For Google Gemini (fast, recommended)
   VITE_GEMINI_API_KEY=your_api_key_here
   VITE_LLM_PROVIDER=gemini

   # Or use Ollama (local, slow but free)
   VITE_LLM_PROVIDER=ollama
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Choose your interface:
   - **Production**: `http://localhost:5173/` (minimal pulsating orb)
   - **Debug**: `http://localhost:5173/debug.html` (full console & logs)

5. Click "Start Kali" and grant microphone permissions
6. On first load, Vosk model downloads automatically (~40MB, cached for offline use)
7. Say "Kali" to wake, then speak your command

## Goal & Vision

Kali is an always-available, voice-first game moderator. Its immediate goal is to moderate games like **Snakes and Ladders** and **Kalimba** by understanding spoken player actions. The long-term vision is a **game-agnostic engine** capable of learning new games, including complex ones like Dungeons & Dragons, simply by being fed their rulebooks and state schemas.

### Vision: LLM-Assisted Game Creation

The long-term goal is a system where:
- Users feed game rules and context to an LLM service/endpoint
- LLM generates game definition JSON (rules, state schema, primitives)
- Human validates and uploads to engine (S3/repo/JSON storage)
- New games become instantly available to Kali
- Enables complex games (D&D and beyond) without code changes

## Core Principle: The CPU and the Game Designer

To achieve scalability, Kali is built on a strict separation of duties:

### The LLM (Game Designer)
- Creative but untrusted component
- Reads game rules and understands player intent
- Translates high-level concepts into primitive action sequences
- All game-specific logic lives in the LLM context

### The Orchestrator (CPU)
- Deterministic, authoritative, and simple component
- Knows nothing about game rules
- Only understands primitive actions: `READ_STATE`, `WRITE_STATE`, `ROLL_DICE`, `NARRATE`
- Validates and executes instructions from the LLM
- Guarantees game state integrity

This separation ensures the Orchestrator stays small and universal.

## How It Works

### Architecture Overview

- **LLM (Game Designer)**: Creative component that understands game rules and translates to primitive actions
- **Orchestrator (CPU)**: Deterministic component that validates and executes primitive actions
- **Audio Pipeline**: WebAudio + Vosk speech recognition (fully offline!)

### Voice Interaction Flow

1. User says wake word: "Kali"
2. System responds: "Listening for command..."
3. User speaks command (5 second window)
4. System transcribes and processes via LLM
5. Orchestrator validates and executes primitives
6. System narrates response via TTS
7. Returns to listening for wake word

**Example**: "Kali" → "I rolled a six and landed on square twelve"

## Core Architecture

### Primitive Actions
The orchestrator only understands these primitives:
- `READ_STATE` - Read from game state
- `WRITE_STATE` - Write to game state
- `ROLL_DICE` - Generate random numbers
- `NARRATE` - Speak to players via TTS

### State Machine
Audio pipeline follows: idle → listening → processing → speaking

### Voice-Only UX
- Screen stays on but no visual interaction required
- All feedback must be audible
- Users cannot see errors, so voice feedback is critical

### LLM Swappability
- All LLM clients implement `ILLMClient` interface
- Switching providers is a one-line change

### Processing Lock
- Prevents overlapping LLM requests
- Ensures serial processing of voice commands

## Technologies

### Platform & Audio
- **Platform**: Progressive Web App (PWA) with screen always on
- **Language**: TypeScript (ES2022, strict mode)
- **Build Tool**: Vite
- **Audio Pipeline**: WebAudio API + AudioWorklet
- **Speech Recognition**: Vosk (fully offline, wake word + STT)

### LLM & State
- **LLM Clients**: Gemini (fast, recommended) or Ollama (local)
- **State Storage**: IndexedDB for persistent sessions
- **TTS**: Browser SpeechSynthesis API
- **Sound Effects**: WebAudio for preloaded local audio

### Caching & Offline
- **Model Caching**: Cache API for Vosk model persistence
- **Service Worker**: Cache API for offline operation

## Features

### Phase 1: Core Audio Pipeline ✅
- Wake word detection using Vosk keyword spotting
- Full speech transcription after wake word
- Runtime model downloading with caching
- Fully offline operation after first load
- PWA with service worker caching

### Phase 2: Orchestration Loop ✅
- LLM integration (Ollama & Google Gemini)
- Primitive action validation
- IndexedDB state persistence
- Text-to-speech narration

### Phase 3: Game Integration ✅
- Snakes & Ladders and Kalimba fully playable
- Sound effects support
- Turn management
- Win condition detection

### Latest: Performance & UI ✅
- **Performance Profiling**: Track LLM response times
- **Processing Lock**: Prevents overlapping requests
- **Status Indicator**: Visual feedback (idle → listening → processing → speaking)
- **Dual UI Modes**:
  - Production: Minimal pulsating orb at `/`
  - Debug: Full console logs at `/debug.html`
- **Google Gemini**: Fast API integration (~1-3s vs 48s for local Ollama)

## Development

### Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run type-check` - Check TypeScript types

### Development Guidelines

- Write clean, canonical, and DRY code
- Avoid smart hacks, obscure patterns, or clever tricks
- Add comments ONLY when they add significant value
- Use strict TypeScript with all compiler warnings enabled
- Follow ESLint rules for code quality
- **After making code changes, always run `npm run lint` and `npm run type-check` and fix any issues**
- Add JSDoc comments to:
  - All public methods and functions
  - All exported interfaces, types, and classes
  - Complex private methods where the logic is non-obvious

## Todo & Future Improvements

### High Priority

#### Error Recovery & Voice Feedback
**Context:** Currently, all errors (validation failures, LLM network errors, execution errors) are silently logged to console with no voice feedback. This is unacceptable for a voice-only interface - users have no way to know if something went wrong, if they should retry, or if the system heard them.

**Plan:** [See detailed analysis and implementation plan](./error-recovery-analysis.md)

**Key Issues:**
* **Validation failures** (turn violations): Silent exit, no user feedback
* **LLM network errors**: Returns empty array, silent exit
* **Execution errors**: Partial state corruption possible
* **No state rollback**: Failed actions can leave game in inconsistent state

**Implementation Priority:**
1. **Phase 1** (Immediate): Add voice feedback for all error types with specific, helpful messages
2. **Phase 2** (Medium): Add state snapshotting and rollback for atomic execution
3. **Phase 3** (Future): Make validator simulate action sequences to catch mid-sequence violations

**Status:** Analysis complete - ready to implement Phase 1

#### LLM Narration Rephrasing
**Context:** Currently, all system messages and i18n strings are spoken as-is, making Kali sound robotic and repetitive. This makes the experience feel rigid, especially for kids.

**Plan:** [See detailed implementation plan](./llm-narration-rephrasing.md)

**Status:** Planned - ready to implement

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

#### Runtime Game Selection
**Context:** Currently defaulting to Kalimba game (set in `CONFIG.GAME.DEFAULT_MODULE`). Similar to language selection, users should be able to choose which game to play at runtime.

**Requirements:**
* **Voice-Activated Game Selection:**
  * After language selection (or at setup if language is already set): "Choose a game: Kalimba or Snakes and Ladders" / "Elegí un juego: Kalimba o Serpientes y Escaleras"
  * User responds with game name
  * System loads the selected game module and initializes with appropriate rules
* **Persistence:**
  * Store last played game preference in IndexedDB
  * Option to change games: "Kali, change game" / "Kali, cambiar juego"
* **Game Discovery:**
  * Automatically detect available games from `/public/games/*.json`
  * Voice command to list available games: "Kali, what games can we play?" / "Kali, ¿qué juegos hay?"
* **Implementation:**
  * Add game selection phase between language selection and player setup
  * Update `GameLoader` to support dynamic game selection
  * Create voice flow for game switching mid-session (with confirmation to avoid losing progress)
  * Update system prompt dynamically based on selected game

**Status:** Not started - currently defaulting to Kalimba

#### User Language Selection at Setup
**Context:** Currently hardcoded to Spanish (Argentina) with the wake word "Kali". The system uses Spanish (Argentina) voices, Spanish i18n strings, and instructs the LLM to respond in Rioplatense Spanish.

**Requirements:**
* **Voice-Activated Language Selection:**
  * On first launch or after language reset: "Choose your language: Spanish or English" / "Elegí tu idioma: Español o Inglés"
  * User responds: "Spanish" / "Español" or "English" / "Inglés"
  * System sets locale and restarts with appropriate language
* **Persistence:**
  * Store language preference in IndexedDB
  * Remember choice across sessions
* **Wake Word:**
  * "Kali" works phonetically in both languages
  * No need to change wake word based on language
* **Implementation:**
  * Add language selection phase before SETUP
  * Update `CONFIG.LOCALE` dynamically based on selection
  * Reload i18n translations
  * Update LLM system prompt based on selected language

**Status:** Not started - currently defaulting to Spanish (Argentina)

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

#### Wake Word
**Current:** Wake word is "Kali" with phonetic variants: "kali", "cali", "calli", "kaly", "caly" (in `config.ts`)

**Changed from:** Previously "zookeeper" - changed to "Kali" for better alignment with app name and multi-language support.

**Note:** "Kali" works phonetically in both Spanish and English, making it ideal for multi-language support.

#### Enhanced Error Messages for Validation Failures
**Current:** Validation errors are logged but user gets no voice feedback.

**Enhancement:**
* When validation fails, Kali should narrate "Sorry, I couldn't process that" or similar
* Helps with voice-only interaction (users can't see console errors)

**Files affected:** `src/orchestrator/orchestrator.ts`

#### TTS Voice Selection
**Current:** Uses default browser voice (in `speech-service.ts`)

**Enhancement:**
* Allow voice selection/preference
* Consider gender/accent preferences for family use
* Could be voice-configured: "Kali, use a male voice" / "Kali, use a female voice"

**Files affected:** `src/services/speech-service.ts`, `src/config.ts` (add voice preference config)

### Low Priority

#### Add State Schema Validation on Startup
**Current:** There's a basic `isValidGameState` check in `main.ts` that only validates the game name.

**Enhancement:**
* Consider deeper schema validation (validate player structure, board structure, etc.)
* Prevent subtle state corruption from persisting across sessions

**Files affected:** `src/main.ts`, potentially create `src/schema-validator.ts`

#### Sound Effect Management
**Current:** Sound effects are loaded at startup in `main.ts`

**Enhancement:**
* Lazy load sound effects (load on first use)
* Preload only essential sounds
* Graceful degradation if sound fails to load

**Files affected:** `src/services/speech-service.ts`, `src/game-loader/game-loader.ts`

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
**Current:** Every state change writes to IndexedDB in `state-manager.ts`

**Consideration:**
* Monitor if this becomes a bottleneck with complex games (D&D with large state)
* Consider batching state updates or debouncing writes
* Currently not an issue for Snakes & Ladders

## Key Patterns & Implementation Details

### Hybrid Deterministic Rules
Some game rules are enforced by the orchestrator (e.g., ladder/snake moves in Snakes & Ladders) rather than trusting the LLM. This is done for:
- 100% reliability
- Faster execution
- Cost reduction
- Silent error correction

See `checkAndApplyBoardMoves` in `orchestrator.ts` for implementation.

### Error Recovery
- Validation failures should provide voice feedback (voice-only UX)
- Processing errors should reset to idle state
- Model download failures need user-friendly recovery

### State Persistence
- App always starts fresh (SETUP phase) on launch
- Current session state persists in IndexedDB
- Future: Explicit save/load game feature planned

## Architecture Decisions

### Why Vosk?
- Completely free and offline
- No API limits or costs
- Both wake word and full STT
- Ideal for families

### Why LLM Swappability?
- Gemini: Fast (1-3s), low cost, cloud-based
- Ollama: Slow (30-50s), free, fully local
- Users choose based on needs

### Why IndexedDB?
- Persistent across sessions
- Async/non-blocking
- Large storage capacity
- Standard browser API

### Why Processing Lock?
- Prevents overlapping LLM requests
- Ensures deterministic state updates
- Avoids race conditions
- Better UX (no confusing parallel responses)

## Important File Locations

### Core Logic
- `src/orchestrator/` - Core validation and execution logic
  - `orchestrator.ts` - Main orchestration loop
  - `validator.ts` - Primitive action validation
  - `types.ts` - Type definitions for primitives
  - `name-collector.ts` - Voice-based player name collection
- `src/llm/` - LLM clients and system prompts
  - `ILLMClient.ts` - Interface for LLM providers
  - `GeminiClient.ts` - Google Gemini integration
  - `OllamaClient.ts` - Local Ollama integration
  - `system-prompt.ts` - LLM system prompt generator

### Services
- `src/services/` - Speech and UI services
  - `speech-service.ts` - TTS and audio playback
  - `ui-service.ts` - UI service interface
  - `production-ui-service.ts` - Minimal pulsating orb UI
  - `debug-ui-service.ts` - Full debug console UI

### Audio Pipeline
- `src/audio-worklet/` - Audio processing for Vosk
  - `vosk-processor.js` - AudioWorklet processor
- `src/wake-word.ts` - Wake word detection state machine
- `src/model-manager.ts` - Vosk model downloading and caching

### Game System
- `src/game-loader/` - Game definition loading
  - `game-loader.ts` - Loads game JSON and sound effects
  - `types.ts` - Game definition types
- `public/games/` - Game definitions (JSON files)
  - Each JSON contains: name, rules, initialState, soundEffects

### State Management
- `src/state-manager.ts` - IndexedDB wrapper with path-based operations

### Utilities
- `src/utils/` - Helper functions
  - `logger.ts` - Logging utility
  - `profiler.ts` - Performance profiling
  - `name-helper.ts` - Name transcription error correction
  - `deep-clone.ts` - Deep cloning utility

### Configuration & Entry Points
- `src/config.ts` - App configuration (wake word, timeouts, etc.)
- `src/main.ts` - Production app entry point
- `src/debug.ts` - Debug interface entry point

## Common Tasks

### Adding New Primitive Actions
1. Add new action type to `src/orchestrator/types.ts`
2. Implement validation in `src/orchestrator/validator.ts`
3. Add execution handler in `src/orchestrator/orchestrator.ts`
4. Update system prompt in `src/llm/system-prompt.ts`

### Adding New Game Support
1. Create game definition JSON in `public/games/`
2. Include: name, rules (plain text), initialState, soundEffects
3. No code changes needed - game logic lives in LLM context

### Modifying LLM Prompts
1. Edit `src/llm/system-prompt.ts`
2. Test with both Gemini and Ollama if possible
3. Keep prompts concise to reduce latency and cost

### Adjusting Voice Flows
1. Modify `src/orchestrator/orchestrator.ts` for main flow
2. Edit `src/orchestrator/name-collector.ts` for name collection
3. Update `src/wake-word.ts` for state machine changes
