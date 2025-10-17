# Kali - Voice Game Moderator

A voice-first game moderator for kids to play board games independently. Uses speech recognition to understand spoken player actions.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Click "Start Kali" and grant microphone permissions
4. On first load, Vosk model downloads automatically (~40MB, cached for offline use)
5. Say "Kali" to wake, then speak your command

## How It Works

### Architecture

- **LLM (Game Designer)**: Creative component that understands game rules and translates to primitive actions
- **Orchestrator (CPU)**: Deterministic component that validates and executes primitive actions
- **Audio Pipeline**: WebAudio + Vosk speech recognition (fully offline!)

### Voice Interaction

1. Say **"Kali"** - wake word detector activates
2. System responds: "Listening for command..."
3. Speak your command (you have 5 seconds)
4. Your speech is transcribed and displayed
5. System returns to listening for wake word

**Example**: "Kali" → "I rolled a six and landed on square twelve"

## Phase 1: Core Audio Pipeline ✅ COMPLETE

- ✅ Wake word detection using Vosk keyword spotting
- ✅ Full speech transcription after wake word
- ✅ Runtime model downloading with caching
- ✅ Fully offline operation after first load
- ✅ PWA with service worker caching

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
