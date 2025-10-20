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
- All LLM clients implement `LLMClient` interface
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
- **After making code changes, always run `npm test && npm run lint && npm run type-check` and fix any issues**
- Add JSDoc comments to:
  - All public methods and functions
  - All exported interfaces, types, and classes
  - Complex private methods where the logic is non-obvious

## Development Roadmap

For a comprehensive, prioritized list of all planned improvements and features, see:

**📋 [Prioritized Development Roadmap](./discussions/prioritized-roadmap.md)**

All todos are ranked by value-to-complexity ratio and organized into:
- 🔥 **Critical Priority** - High value, low-medium complexity (do first)
- ⭐ **High Value** - Significant impact, moderate complexity
- 💎 **Strategic** - Long-term value, higher complexity
- 🔧 **Infrastructure** - Foundational work that enables other improvements
- 🎨 **Polish** - Nice to have, lower priority

### Current Focus Areas

The immediate priorities are:
1. **Error Recovery & Voice Feedback** - All errors need voice feedback (voice-only UX)
2. **Code Quality** - Eliminate duplication, improve type safety
3. **Reliability** - LLM fallbacks, state corruption recovery
4. **Performance** - State batching, LLM optimization
5. **Testing Infrastructure** - Add Vitest and comprehensive test coverage

See the [roadmap document](./discussions/prioritized-roadmap.md) for detailed implementation plans and sequencing recommendations.

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
  - `LLMClient.ts` - Interface for LLM providers
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
