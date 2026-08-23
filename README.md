# Kali - Voice Game Moderator

A voice-first game moderator for kids to play board games independently. Uses speech recognition to understand spoken player actions.

## Quick Start

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the LLM provider (create `.env` file):

   ```bash
   # DeepInfra (get key at https://deepinfra.com/dash/api_keys)
   VITE_DEEPINFRA_API_KEY=your_api_key_here
   VITE_LLM_PROVIDER=deepinfra
   # VITE_DEEPINFRA_MODEL=Qwen/Qwen2.5-72B-Instruct  # optional, default

   # Optional: show export-logs button in production UI
   VITE_SHOW_EXPORT_BUTTON=true
   ```

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

- [Architecture, conventions & state axioms](CLAUDE.md)
- [Guided LLM Pattern Philosophy](docs/kali-architecture.md)
- [Architecture Decision Records](docs/adr/README.md)

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

- [Commands, conventions & testing workflows](CLAUDE.md)
- [Integration scenario guide](integration/README.md)
