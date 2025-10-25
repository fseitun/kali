# Kali - Voice Game Moderator

A voice-first game moderator for kids to play board games independently. Uses speech recognition to understand spoken player actions.

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

## Development

### Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run type-check` - Check TypeScript types

## Project Structure & Development

**For detailed information:**

- [File Structure & Locations](.cursor/rules/file-structure.mdc)
- [Common Development Tasks](.cursor/rules/common-tasks.mdc)
- [Development Guidelines](.cursor/rules/development-guidelines.mdc)
- [Testing Commands & Workflows](.cursor/rules/testing-commands.mdc)
