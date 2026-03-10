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

   # Or use Groq (fast, free tier available)
   VITE_GROQ_API_KEY=your_groq_api_key_here
   VITE_LLM_PROVIDER=groq

   # Or use OpenRouter (many models: Claude, Gemini, Llama, etc.)
   VITE_OPENROUTER_API_KEY=your_api_key_here
   VITE_LLM_PROVIDER=openrouter
   # VITE_OPENROUTER_MODEL=google/gemini-2.0-flash-001  # optional, default

   # Or use DeepInfra (low-cost inference, prompt cache; get key at https://deepinfra.com/dash/api_keys)
   VITE_DEEPINFRA_API_KEY=your_api_key_here
   VITE_LLM_PROVIDER=deepinfra
   # VITE_DEEPINFRA_MODEL=Qwen/Qwen2.5-72B-Instruct  # optional, default

   # Or use Ollama (local, free; use llama3.2:1b for low resource usage)
   VITE_LLM_PROVIDER=ollama
   VITE_OLLAMA_MODEL=llama3.2:1b
   ```

   When using Ollama, run `ollama run llama3.2:1b` in another terminal before starting the app.

3. Start development server:

   ```bash
   npm run dev
   ```

4. Choose your interface:
   - **Production**: `http://localhost:5173/` (minimal pulsating orb)
   - **Debug**: `http://localhost:5173/debug` (full console & logs)

5. Click "Start Kali" and grant microphone permissions
6. On first load, Vosk model downloads automatically (~40MB, cached for offline use)
7. Say "Kali" to wake, then speak your command

### Vosk Model & CDN

By default, the model is fetched from the alphacephei CDN (no model in `public/` needed). Production deployments (e.g. Vercel) may hit CORS limits—if the model fails to load, set `VITE_VOSK_MODEL_URL` to your own CDN:

- **Vercel Blob** (recommended for production): Create a public Blob store in Vercel, put `vosk-model-small-es-0.42.zip` in `public/`, run `npm run upload-vosk`, then set `VITE_VOSK_MODEL_URL` in Vercel env vars to the printed URL.
- **S3, R2, etc.**: Upload `vosk-model-small-es-0.42.zip`, configure CORS (`Access-Control-Allow-Origin` must include your app's origin), set `VITE_VOSK_MODEL_URL`.

## Goal & Vision

Kali is an always-available, voice-first game moderator. Its immediate goal is to moderate **Kalimba** by understanding spoken player actions. The long-term vision is a **game-agnostic engine** capable of learning new games, including complex ones like Dungeons & Dragons, simply by being fed their rulebooks and state schemas.

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
- [Task Guides](.cursor/rules/task-guides.mdc)
- [Development Guidelines](.cursor/rules/development-guidelines.mdc)
- [Testing Commands & Workflows](.cursor/rules/testing-commands.mdc)
