# Kali - Voice Game Moderator

A voice-first game moderator for kids to play board games independently. Uses speech recognition to understand spoken player actions.

## 🎯 Current Status

- ✅ Phase 1: Core Audio Pipeline (Complete)
- ✅ Phase 2: Orchestration Loop (Complete)
- ✅ Phase 3: Snakes & Ladders Integration (Complete)
- ✅ Performance Profiling & Google Gemini Integration (Complete)
- ✅ Production UI with Status Indicator (Complete)

## Setup

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
7. Say "Zookeeper" to wake, then speak your command

## How It Works

### Architecture

- **LLM (Game Designer)**: Creative component that understands game rules and translates to primitive actions
- **Orchestrator (CPU)**: Deterministic component that validates and executes primitive actions
- **Audio Pipeline**: WebAudio + Vosk speech recognition (fully offline!)

### Voice Interaction

1. Say **"Zookeeper"** - wake word detector activates
2. System responds: "Listening for command..."
3. Speak your command (you have 5 seconds)
4. Your speech is transcribed and displayed
5. System returns to listening for wake word

**Example**: "Zookeeper" → "I rolled a six and landed on square twelve"

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
- Snakes & Ladders fully playable
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

## Technologies

- **Platform**: Progressive Web App (PWA) with offline support
- **Speech Recognition**: Vosk (completely free, fully offline)
- **Audio Processing**: WebAudio API with AudioWorklet
- **Model Caching**: Cache API for persistent storage
- **Build Tool**: Vite with TypeScript

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Check TypeScript types
