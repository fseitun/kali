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

## Architecture

Kali is built on a strict separation between the **LLM** (interprets natural language) and the **Orchestrator** (validates and executes primitive actions). This separation ensures the system remains reliable, testable, and game-agnostic.

**For detailed architecture information:**
- [Core Architecture & Technology Stack](.cursor/rules/architecture.mdc)
- [Architecture Decisions & Rationale](.cursor/rules/architecture-decisions.mdc)
- [Guided LLM Pattern Philosophy](.cursor/kali-architecture.md)

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
- In-memory state management
- Text-to-speech narration

### Phase 3: Game Integration ✅
- Snakes & Ladders and Kalimba fully playable
- Sound effects support
- Turn management with modular subsystems
- Win condition detection
- Testing infrastructure with Vitest

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
- **After making code changes, always run `npm run test && npm run lint && npm run type-check` and fix any issues**
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

## Project Structure & Development

**For detailed information:**
- [File Structure & Locations](.cursor/rules/file-structure.mdc)
- [Common Development Tasks](.cursor/rules/common-tasks.mdc)
- [Development Guidelines](.cursor/rules/development-guidelines.mdc)
- [Testing Commands & Workflows](.cursor/rules/testing-commands.mdc)
