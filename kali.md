Brief: Project Kali
Goal
Kali is an always-available, voice-first game moderator. Its immediate goal is to moderate a game of Snakes and Ladders by understanding spoken player actions. The long-term vision is a game-agnostic engine capable of learning new games, including complex ones like Dungeons & Dragons, simply by being fed their rulebooks and state schemas.

Core Principle: The CPU and the Game Designer
To achieve scalability, Kali is built on a strict separation of duties:

The LLM (The Game Designer): A creative but untrusted component. It reads the game rules, understands player intent, and translates high-level concepts (e.g., "I landed on a ladder") into a sequence of simple, primitive instructions.

The Orchestrator (The CPU): A deterministic, authoritative, and simple component. It knows nothing about game rules. It only understands a tiny set of primitive actions (READ, WRITE, ROLL_DICE, NARRATE). It validates and executes the instructions from the LLM, guaranteeing the integrity of the game state.

This model ensures the Orchestrator's code remains small and universal, while the game-specific logic resides entirely within the context provided to the LLM.

Technologies
Platform: Foreground Web App (PWA) with the screen always on.

Audio Pipeline: WebAudio AudioWorklet for processing, Vosk for wake-word detection and speech-to-text.

STT: Vosk (on-device, fully offline and free) with runtime model caching.

LLM: Remote API (e.g., OpenAI, Google Gemini).

Orchestrator: In-page JavaScript responsible for validating and executing primitive actions.

State Store: IndexedDB for persistent session state.

TTS & Sounds: Browser's speechSynthesis API and WebAudio for preloaded local sound effects.

Note: Initially planned to use Porcupine for wake word detection, but Vosk provides both wake word and full STT capabilities with zero cost and unlimited users, making it ideal for families.

Phased Development Plan
Phase 1: The Core Audio Pipeline ✅ COMPLETE
Goal: Reliably capture a voice command after the wake word.

Tasks:

✅ Implement the wake-word listener using AudioWorklet and Vosk keyword spotting.

✅ State machine to switch between wake word listening and full transcription.

✅ Runtime model downloading with Cache API for offline persistence.

✅ Full speech-to-text transcription after wake word detection.

Milestone: The system accurately transcribes a user's spoken command to the console after they say "Kali...".

Status: COMPLETE - System detects "Kali" wake word, transcribes following speech, and displays results.

Phase 2: The Primitive Orchestration Loop
Goal: Build and validate the core LLM -> Validator -> DB Write cycle using primitive actions.

Tasks:

Define a minimal set of primitive actions: WRITE_STATE, READ_STATE, NARRATE.

Create a simple test state in IndexedDB (e.g., a counter).

Prompt the LLM to return a JSON object with a primitive action in response to a command (e.g., "Kali, set the counter to five").

Build the Orchestrator's validator to check and safely execute these primitives.

Milestone: Successfully change a value in the local database based on a validated, LLM-generated primitive action.

Phase 3: First Game Integration (Snakes and Ladders)
Goal: Moderate a full game of Snakes and Ladders, with all game logic handled by the LLM.

Tasks:

Define the Snakes and Ladders board and player state in IndexedDB.

Write the game's rules into a plain text document.

Update the Orchestrator to feed the rules and current game state into the LLM's context with every prompt.

Add the ROLL_DICE primitive to the Orchestrator.

Integrate local sound effects triggered by the NARRATE primitive.

Milestone: A complete, voice-moderated game of Snakes and Ladders is playable from start to finish.

Phase 4: The Game-Agnostic Engine (Future-Proofing)
Goal: Evolve the system to handle complexity and make loading new games trivial, paving the way for D&D.

Tasks:

Refactor to easily load different rule documents and initial state files.

Implement a basic Retrieval-Augmented Generation (RAG) system: instead of sending the whole rulebook, the Orchestrator searches for the most relevant rule snippet to include in the prompt.

Prototype Agentic Chains: The Orchestrator learns to handle a multi-step player turn by making a sequence of smaller, validated LLM calls.

Milestone: Demonstrate that the system can load and play a different simple game without code changes, and show a successful prototype of the RAG and chaining logic required for future complex games.
