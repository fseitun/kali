# Kali - Voice Game Moderator

A voice-first game moderator for kids to play board games independently. Uses speech recognition to understand spoken player actions.

## Quick Start

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the environment:

   ```bash
   cp .env.example .env
   ```

   Two keys are required — the app throws `ConfigValidationError` at startup without them:

   ```bash
   # Speech-to-text (get key at https://console.deepgram.com/)
   VITE_DEEPGRAM_API_KEY=your_api_key_here

   # LLM (get key at https://deepinfra.com/dash/api_keys)
   VITE_LLM_PROVIDER=deepinfra
   VITE_DEEPINFRA_API_KEY=your_api_key_here
   ```

   `.env.example` lists every other variable the app reads, with its default.

3. Start development server:

   ```bash
   npm run dev
   ```

4. Choose your interface:
   - **Production**: `http://localhost:5173/` (minimal pulsating orb)
   - **Debug**: `http://localhost:5173/debug` (full console & logs)

5. Click "Start Kali" and grant microphone permissions
6. Say "Kali" to wake, then speak your command

### Speech recognition

Speech is streamed to **Deepgram** over a websocket (`src/voice-recognition/deepgram-stream.ts`).
There is no on-device model and nothing to download — set `VITE_DEEPGRAM_API_KEY` and go.

## Goal & Vision

Kali is an always-available, voice-first game moderator. It moderates **Kalimba** by
understanding spoken player actions. It is a Kalimba app, not a generic engine — the
board, squares, and effects are Kalimba's, on purpose.

## Architecture

Kali is built on a strict separation between the **LLM** (interprets natural language) and the **Orchestrator** (validates and executes primitive actions). This separation ensures the system remains reliable, testable, and game-agnostic.

**For detailed architecture information:**

- [Architecture, conventions & state axioms](AGENTS.md)
- [Guided LLM Pattern Philosophy](docs/kali-architecture.md)
- [Architecture Decision Records](docs/adr/README.md)

## Development

### Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run type-check` - Check TypeScript types (app + `worker/`)
- `npm run knip` - Find unused files, exports, and dependencies
- `npm run full-check` - lint:fix + type-check + test + format (run before calling a change done)

## Project Structure & Development

**For detailed information:**

- [Commands, conventions & testing workflows](AGENTS.md)
- [Integration scenario guide](integration/README.md)
