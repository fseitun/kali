# Kali - Voice Game Moderator

A voice-first game moderator that understands spoken player actions and moderates games through an LLM-driven orchestrator.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Grant microphone permissions when prompted
4. Wait for Vosk model download (happens automatically on first load)

## Architecture

- **LLM (Game Designer)**: Creative component that understands game rules and translates to primitive actions
- **Orchestrator (CPU)**: Deterministic component that validates and executes primitive actions
- **Audio Pipeline**: WebAudio + Vosk wake word detection + VAD + STT

## Phase 1: Core Audio Pipeline

Current phase focuses on reliable voice command capture after wake word detection.

**Wake Word**: "Kali" (using Vosk - completely free and offline!)

### Current Status

- ✅ Project setup with Vite, TypeScript, PWA
- ✅ Wake word listener implementation (Vosk - completely free!)
- ⏳ VAD integration
- ⏳ STT pipeline
- ⏳ End-to-end testing
