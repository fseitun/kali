# Kali Development Roadmap - Prioritized by Value/Complexity

This document consolidates all planned improvements and features, ranked by their value-to-complexity ratio. Only future work is included - completed features have been removed.

Ranked by value-to-complexity ratio.

---

1.8: Advanced Error Recovery & State Rollback
1.75: Orchestrator Authority Phase 2 (Rewards and Hazards)
1.6: State Corruption Recovery
1.5: Orchestrator Authority Phase 3 (Magic Door, Special Effects)
1.4: LLM Narration Rephrasing
1.4: Background Music & Audio Management System
1.33: IndexedDB Persistence for Resume Game
1.33: Explicit Save/Load Game Feature
1.0: Runtime Game Selection
1.0: User Language Selection at Setup
1.0: API Key / Secret Management
1.25: LLM Prompt Language Deduplication (all-en / all-es)

- **TODO:** Voice-based language setting (spoken command e.g. "Kali, speak English" / "Kali, cambiar a español") — no UI, change language anytime via spoken words

_(Value/Complexity ratio; higher = better ROI)_

---

## 🔥 Critical Priority (High Value / Low-Medium Complexity)

### Advanced Error Recovery & State Rollback 🔥

**Value: 9/10 | Complexity: 5/10 | Ratio: 1.8**

**Problem:** Basic voice feedback exists, but no typed error handling, state rollback, or atomic execution. Execution errors can cause partial state corruption.

**Implementation:**

- Add custom error classes (`ValidationError`, `LLMNetworkError`, `LLMParseError`, `ExecutionError`)
- Implement atomic execution with state rollback on any error
- Add state snapshotting before action sequences
- Enhanced voice feedback with specific error context
- Stop execution on first error (no partial corruption)

**Files:**

- `src/orchestrator/errors.ts` (new)
- `src/orchestrator/orchestrator.ts`
- `src/llm/GeminiClient.ts`
- `src/llm/OllamaClient.ts`

**Status:** Basic voice messages implemented, advanced phases needed

---

### IndexedDB Persistence for Resume Game 🔥

**Value: 8/10 | Complexity: 6/10 | Ratio: 1.33**

**Problem:** State is in-memory only, lost on page reload. No way to resume games after closing the app.

**Implementation:**

- Add `loadFromIndexedDB()` - Load saved game state on app start
- Add `saveToIndexedDB()` - Persist state to IndexedDB
- Add `enableAutosave()` - Automatic state persistence (debounced, e.g., 1s delay)
- Implement single "current game" save slot initially
- Handle IndexedDB errors gracefully (fall back to in-memory)
- Still pure infrastructure layer (no game logic)

**Files:**

- `src/state-manager.ts`
- `src/kali-app-core.ts` (initialization)

**Benefits:**

- Enables "resume game" feature
- Better user experience (no lost progress)
- Foundation for multiple save slots later

---

## ⭐ High Value (Significant Impact / Moderate Complexity)

### State Corruption Recovery ⭐

**Value: 8/10 | Complexity: 5/10 | Ratio: 1.6**

**Problem:** No validation or recovery if IndexedDB state becomes corrupted. Can cause silent failures.

**Implementation:**

- Add state schema validation on read (JSON Schema or Zod)
- Implement state migrations for version changes
- Add "safe mode" recovery that resets to last known good state
- Automatic state snapshots before mutations

**Files:**

- `src/state-manager.ts`
- `src/utils/state-validator.ts` (new)
- `src/utils/state-migrations.ts` (new)

---

### Explicit Save/Load Game Feature ⭐

**Value: 8/10 | Complexity: 6/10 | Ratio: 1.33**

**Problem:** App always starts fresh on launch. Users can't resume games explicitly.

**Implementation:**

- Voice commands: "Kali, save this game as [name]", "Kali, load game [name]", "Kali, what games are saved?"
- Implement multiple save slots in IndexedDB
- Add save metadata (timestamp, player names, game type)
- Resume flow with player confirmation ("Alice, you're at position 23, correct?")
- Add SAVE_GAME and LOAD_GAME primitive actions

**Files:**

- `src/save-manager.ts` (new)
- `src/state-manager.ts`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/types.ts` (new actions)

---

### LLM Narration Rephrasing ⭐

**Value: 7/10 | Complexity: 5/10 | Ratio: 1.4**

**Problem:** All system messages and i18n strings spoken as-is, making Kali sound robotic and repetitive.

**Implementation:**

- Pass all hardcoded narration (i18n, system messages) through the LLM before speaking for natural, friendly rephrasing.
- Cache up to N variations per text (configurable, default 5); rotate to avoid repetition.
- Add "personality" to Kali's voice; especially important for kids.
- Extend `LLMClient` with `rephraseNarration(text: string, locale: string): Promise<string>` — same meaning, preserve placeholders (e.g. `{name}`, `{position}`), rephrase as if talking to kids.
- Implement in `GeminiClient` and `OllamaClient` with a focused prompt (no state context).
- New service: `src/services/narration-rephrasing-service.ts` — cache `Map<string, string[]>`, rotate variations, fall back to original on LLM failure/timeout.
- `SpeechService.speak()` calls rephrasing service before speaking; fallback transparent to user.
- Config in `src/config.ts`: `NARRATION: { MAX_VARIATIONS: 5, ENABLE_REPHRASING: true }`.

**Edge cases:** LLM timeout or malformed output → fall back to original; validate placeholders and fall back if broken; cache session-only.

**Files:**

- `src/services/narration-rephrasing-service.ts` (new)
- `src/llm/LLMClient.ts` (add rephraseNarration method)
- `src/llm/GeminiClient.ts`, `src/llm/OllamaClient.ts` (implement rephrasing)
- `src/services/speech-service.ts` (integrate rephrasing service)
- `src/config.ts` (add narration config)
- `src/kali-app-core.ts`, `src/main.ts`, `src/debug.ts` (wire rephrasing service)

**Status:** Ready to implement

---

### Background Music & Audio Management System ⭐

**Value: 7/10 | Complexity: 5/10 | Ratio: 1.4**

**Problem:** No background music or ambient audio. Experience lacks immersion, especially for kids. No audio ducking during voice interaction causes clarity issues.

**Implementation:**

**Phase 1: Core Music System**

- Implement background music player with per-habitat tracks
- Per-player music tracking: music follows the current turn player's habitat
- Automatic habitat detection and music transitions
- WebAudio API integration with proper mixing/gain nodes
- Music loop handling with seamless playback
- Preload all habitat music tracks at game start
- Game config specifies music files per habitat:
  - Desert, Forest, Ocean, Arctic, Amazon, Savanna, India

**Phase 2: Volume Ducking (Audio Priority System)**

- Lower ALL audio (background music + sound effects) during listening state
- Lower ALL audio during TTS speaking
- Configurable ducking levels (e.g., music: 20%, effects: 40% during voice interaction)
- Smooth fade transitions (100-200ms) to avoid jarring cuts
- Restore full volume when returning to idle state
- Integration with wake-word state machine

**Phase 3: Crossfading & Transitions**

- Smooth crossfade between habitat music changes (2-3 second overlap)
- Detect habitat changes from player position updates
- Queue next track before current ends for gapless playback
- Handle edge cases: portals, special teleports, rapid position changes

**Phase 4: Voice Controls (Initially Hardcoded Config)**

- "Kali, music off" / "Kali, stop the music" → Mute background music
- "Kali, music on" / "Kali, play music" → Unmute background music
- "Kali, lower volume" / "Kali, quieter" → Reduce master volume by 20%
- "Kali, raise volume" / "Kali, louder" → Increase master volume by 20%
- "Kali, mute" → Mute all audio except TTS
- Store preferences in CONFIG (later: IndexedDB persistence)

**Phase 5: Config Integration**

- Add AUDIO section to config.ts:
  - MUSIC_ENABLED (default: true)
  - MASTER_VOLUME (0.0-1.0, default: 0.7)
  - MUSIC_VOLUME (0.0-1.0, default: 0.5)
  - EFFECTS_VOLUME (0.0-1.0, default: 0.8)
  - DUCKING_MUSIC_LEVEL (default: 0.2)
  - DUCKING_EFFECTS_LEVEL (default: 0.4)
  - CROSSFADE_DURATION_MS (default: 2500)
- Future: Make these voice-settable and persist to IndexedDB

**Files:**

- `src/services/audio-manager.ts` (new) - Core music + ducking system
- `src/services/speech-service.ts` - Integrate ducking callbacks
- `src/orchestrator/orchestrator.ts` - Habitat change detection
- `src/config.ts` - Audio configuration constants
- `src/game-loader/game-loader.ts` - Load music files from game config
- `src/game-loader/types.ts` - Add musicTracks to GameModule interface
- `public/games/kalimba/config.json` - Add habitat music paths
- `public/music/` - Store music files per habitat

**Assets Needed:**

- 7 looping music tracks (one per habitat) for Kalimba
- Royalty-free or Creative Commons licensed
- Format: MP3 or OGG (WebAudio compatible)
- Length: 1-2 minutes loop minimum

---

### Runtime Game Selection ⭐

**Value: 3/10 | Complexity: 3/10 | Ratio: 1.0**

**Problem:** Currently Kalimba-only. Runtime game selection deferred until a second game exists.

**Implementation (future):**

- Voice-activated game selection after language selection
- "Choose a game: [list from /public/games/]"
- Automatically detect available games from `/public/games/`
- Store last played game preference in IndexedDB
- Voice command to switch games: "Kali, change game" (with confirmation)
- Voice command to list games: "Kali, what games can we play?"

**Files:**

- `src/game-loader/game-loader.ts` (add discovery)
- `src/orchestrator/name-collector.ts` (add game selection phase)
- `src/config.ts`
- `src/state-manager.ts`

**Status:** GameLoader infrastructure exists, just needs UI flow

---

### User Language Selection at Setup ⭐

**Value: 4/10 | Complexity: 4/10 | Ratio: 1.0**

**Problem:** Runtime locale is already supported via `locale-manager` (es-AR / en-US, persisted in localStorage, fallback from `CONFIG.LOCALE`). What's missing is **voice-activated language selection at setup** (and optionally the voice command "Kali, speak English" / "Kali, cambiar a español").

**Implementation:**

- Voice-activated language selection on first launch
- "Choose your language: Spanish or English" / "Elegí tu idioma: Español o Inglés"
- Store language preference (e.g. localStorage; `locale-manager` already uses `kali-locale` key and reads on startup) or IndexedDB. New work is the setup/voice flow and optionally syncing i18n with persisted locale.
- Update `CONFIG.LOCALE` dynamically (or rely on persisted locale)
- Reload i18n translations
- Update LLM system prompt based on selected language
- Wake word "Kali" works phonetically in both languages

**Files:**

- `src/locale-manager.ts` (already persists/reads locale)
- `src/i18n/index.ts`
- `src/orchestrator/name-collector.ts` (add language selection phase)
- `src/config.ts`
- `src/state-manager.ts` (persist language choice if moving to shared state)

**Status:** i18n and locale-manager infrastructure exist, just needs setup/voice flow

---

### LLM Prompt Language Deduplication (all-en / all-es) ⭐

**Value: 5/10 | Complexity: 4/10 | Ratio: 1.25**

**Problem:** Prompts mix Spanish and English. Game examples, mechanics, decision prompts, and animal-encounter templates are Spanish-only. Only 3 narration lines are locale-aware. This inconsistency hurts LLM output quality (research: same-language examples improve output).

**Implementation:**

- Create two clean variants: **all English** and **all Spanish**
- Config: add `rules.examples` (or `examplesByLocale`) with `en-US` and `es-AR` keys; same for `decisionPoints[].prompt`
- Mechanics/turn structure: locale-keyed strings where user-facing (or English canonical with "translate to X" instruction)
- `formatAnimalEncounterContext()`: move hardcoded Spanish into `LOCALE_TEMPLATES` map
- `formatGameRules()`: accept locale, select locale-specific examples and prompts
- Fallback: `en-US` when a locale has no specific strings

**Files:**

- `public/games/kalimba/config.json` (add locale-keyed examples, prompts)
- `src/game-loader/types.ts` (schema for locale-keyed content)
- `src/llm/system-prompt.ts` (LOCALE_TEMPLATES, formatAnimalEncounterContext)
- `src/kali-app-core.ts` (formatGameRules locale param)

**Rationale:** Deduplication = no mixing. One prompt is 100% English, one 100% Spanish. User locale selects the variant. Improves LLM answers and token clarity.

---

## 💎 Strategic (Long-term Value / Higher Complexity)

### Orchestrator Authority Phase 2: Rewards and Hazards 💎

**Value: 7/10 | Complexity: 4/10 | Ratio: 1.75**

**Context:** Follow-up to Orchestrator Authority Phase 1 (animal encounter). Moves remaining LLM-delegated logic to orchestrator.

**Problem:** Rewards (points, hearts, instruments) and hazard resolution (checkTorch, checkAntiWasp) are applied via LLM SET_STATE. These are deterministic — orchestrator should own them.

**Implementation:**

- Move reward application into orchestrator (after encounter resolution)
- Add orchestrator logic for checkTorch, checkAntiWasp (read player items, apply effect)
- Config mechanics: remove instructions for LLM to apply these; document that orchestrator does it

**Files:**

- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/board-effects-handler.ts`
- `src/orchestrator/validator.ts` (update SQUARE_EFFECT_ALLOWED_PLAYER_KEYS)
- `public/games/kalimba/config.json`

---

### Orchestrator Authority Phase 3: Magic Door, Special Effects, Config Cleanup 💎

**Value: 6/10 | Complexity: 4/10 | Ratio: 1.5**

**Context:** Follow-up to Orchestrator Authority Phase 1 and 2.

**Problem:** Magic door formula, returnTo187, jumpToLeader are LLM-driven. Config has misleading instructions (e.g. "SET winner"). Current config uses `magicDoorPosition` and `magicDoorTarget`; any hearts/difficulty threshold could be added or renamed (e.g. to `magicDoorBaseDifficulty`) as a planned config cleanup.

**Implementation:**

- Magic door: orchestrator evaluates formula when player at 186 reports roll
- returnTo187, jumpToLeader: orchestrator-applied from square effects
- Fix config: remove "SET winner" from instructions; add or rename hearts/difficulty key to `magicDoorBaseDifficulty` if applicable (current keys: `magicDoorPosition`, `magicDoorTarget`)

**Files:**

- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/board-effects-handler.ts`
- `public/games/kalimba/config.json`
- `src/orchestrator/orchestrator.integration.test.ts`

---

### Game-Agnostic Orchestrator 💎

**Value: 8/10 | Complexity: 7/10 | Ratio: 1.14**

**Problem:** `BoardEffectsHandler` contains Kalimba-specific logic (board.moves, magic door, square effects). MVP is Kalimba-only; this is deferred until a second game is added.

**Implementation (future):**

- Move board logic to game config via `onStateChange` hooks
- Create `APPLY_BOARD_EFFECT` primitive action
- Enable games to define state transformation hooks in JSON
- Make BoardEffectsHandler truly generic

**Files:**

- `src/orchestrator/orchestrator.ts` (remove checkAndApplyBoardMoves)
- `src/orchestrator/types.ts` (add APPLY_BOARD_EFFECT)
- `src/game-loader/types.ts` (add hooks support)
- `public/games/kalimba/config.json` (add hooks)

---

### State History & Rollback System 💎

**Value: 7/10 | Complexity: 6/10 | Ratio: 1.17**

**Problem:** Users might make mistakes and need to recover from errors. No undo functionality.

**Implementation:**

- Automatic snapshots before every state mutation
- Explicit checkpoints via voice: "Kali, checkpoint" or "Kali, save checkpoint before boss fight"
- Retention policy: Keep last 10 states (FIFO queue)
- Voice-activated rollback: "Kali, undo that", "Kali, undo last 3 actions", "Kali, restore to [checkpoint name]"
- IndexedDB-based storage (async, non-blocking)
- Structure: `{ timestamp, state, action }` for automatic, `{ timestamp, state, label }` for explicit

**Files:**

- `src/history-manager.ts` (new)
- `src/state-manager.ts` (integrate snapshots)
- `src/orchestrator/orchestrator.ts` (integrate undo)

**Overhead:** <5ms per snapshot, minimal storage

---

### State Manager Transactions (Optional) 💎

**Value: 5/10 | Complexity: 6/10 | Ratio: 0.83**

**Problem:** Each `set()` is independent. No atomic multi-step mutations.

**Potential Enhancement:**

- Add `startTransaction()` / `commit()` / `rollback()` methods
- Orchestrator could batch multiple mutations atomically
- Better error recovery (rollback on validation failure)
- Foundation for undo/redo system

**Implementation:**

```typescript
class StateManager {
  startTransaction(): Transaction;
  commit(transaction: Transaction): void;
  rollback(transaction: Transaction): void;
}
```

**Files:**

- `src/state-manager.ts`
- `src/orchestrator/orchestrator.ts`

**Status:** Low priority - only needed if:

- Undo/redo feature is implemented (see State History & Rollback System)
- Complex multi-step mutations need atomicity
- Error recovery requires state rollback

**Verdict:** Consider only after State History & Rollback System is implemented

---

### LLM Request Optimization 💎

**Value: 7/10 | Complexity: 6/10 | Ratio: 1.17**

**Problem:** Full system prompt + state sent on every request, no caching. Latency and cost implications.

**Implementation:**

- Implement prompt caching for Gemini (via `cachedContent` API)
- Compress state context format (remove redundant fields)
- Use `stateDisplay` metadata more effectively
- Target: < 2s LLM response time (currently 2-4s)

**Files:**

- `src/llm/GeminiClient.ts`
- `src/llm/system-prompt.ts`

---

### Follow-ups: getActions & turn advancement (after movement-roll fix) 💎

**Context:** Fixes already shipped: sync `lastNarration` with app-spoken turn announcements (`src/kali-app-core.ts`) so the LLM sees the same prompt the user heard (avoids stale lines like “Pasaste.” confusing a bare number). Post-LLM coercion: a single dice-only `PLAYER_ANSWERED` is rewritten to `PLAYER_ROLLED` when `validatePlayerRolled` allows it (`Orchestrator.coerceMovementPlayerAnsweredToPlayerRolled` in `src/orchestrator/orchestrator.ts`). Tests: describe `Coerce PLAYER_ANSWERED → PLAYER_ROLLED for movement` in `src/orchestrator/orchestrator.integration.test.ts`.

**Future ideas (not implemented):**

1. **Smarter `shouldAdvanceTurn` for `PLAYER_ANSWERED`** — Today, almost any validated `PLAYER_ANSWERED` ends the turn even when `executePlayerAnswered` does nothing (no riddle, power check, or fork apply). Improvement: advance only when a handler reports consumption (e.g. explicit flags on `ExecutionContext`) or another well-defined rule. **Risk:** handlers live in several modules; naive before/after state diff is easy to get wrong. **When:** If “turn skipped, nothing happened” still happens for mistakes that are not a lone numeric movement (coercion does not cover those).

2. **Lower LLM temperature for `getActions` only** — Reduce `temperature` in `BaseLLMClient.attemptLLMCall` for action extraction. **Trade-off:** Affects every `getActions` call (not just dice); does not fix bad context by itself. **When:** Optional tuning if mis-tags remain frequent after the shipped fixes.

3. **Numeric fast path** — For unambiguous transcripts (e.g. trimmed `/^\d+$/` and `validatePlayerRolled` passes), skip the LLM to save latency and remove a failure mode. **Caution:** Must not intercept power-check/revenge numeric answers; those must stay `PLAYER_ANSWERED`.

---

### Enhanced Logging & Debug Tools 💎

**Value: 6/10 | Complexity: 5/10 | Ratio: 1.2**

**Problem:** Logger is basic, no structured logging or filtering. Hard to debug production issues.

**Implementation:**

- Add log levels with runtime filtering (DEBUG, INFO, WARN, ERROR)
- Implement structured logging (JSON format option)
- Add performance markers integration
- Create log export functionality for debugging
- Session replay for voice commands

**Files:**

- `src/utils/logger.ts`
- `src/utils/profiler.ts`

---

### Remote Error Reporting & Log Capture 📡

**Value: 5/10 | Complexity: 4/10 | Ratio: 1.25**

**Problem:** When users report issues in production, there is no way to inspect logs or errors remotely. Debugging requires reproduction or user-provided screenshots.

**Implementation:**

- Send production errors (stack traces) to a remote service (e.g. Sentry, LogRocket)
- Optional: capture minimal context (session ID, game phase) with errors
- Privacy: no transcripts, voice data, or PII without explicit consent
- Minimal version: errors-only SDK integration (~1–2 days)
- Full version: session replay, structured logs, source maps (~1–2 weeks)

**Files:**

- `src/utils/error-reporter.ts` (new)
- `src/main.ts`, `src/debug.ts` (init)
- Build config for source maps

---

## 🔧 Infrastructure (Foundation for Other Work)

### Dependency Injection Container 🔧

**Value: 6/10 | Complexity: 6/10 | Ratio: 1.0**

**Problem:** Hard-coded dependencies make coupling tight.

**Implementation:**

- Add lightweight DI container for services
- Make all dependencies injectable
- Improve modularity

**Files:**

- `src/di-container.ts` (new)
- Refactor all services to use DI

---

### API Key / Secret Management (Frontend Constraint) 🔧

**Value: 6/10 | Complexity: 5–8/10 (varies by solution) | Ratio: ~1.0**

**Problem:** Fully frontend app cannot safely hold API keys. Gemini (or any cloud LLM) requires a key that would be exposed in the client bundle or network traffic. Keys can be extracted, shared, or abused; providers may revoke keys with unexpected traffic.

**Potential mitigations:**

- **Backend proxy (BFF):** Minimal backend that holds the key and proxies LLM requests. Adds hosting, deployment, and security surface. Complexity: 7–8.
- **User-supplied keys:** Let users paste their own API key (stored in IndexedDB); each user brings their own. Simple but poor UX for kids/families. Complexity: 3.
- **Ollama-only for production:** Use only local Ollama; no cloud keys needed. Offline-first, but requires capable device. Complexity: low (already supported).

**Files (if BFF chosen):**

- New backend service
- `src/llm/GeminiClient.ts` — route requests via proxy
- `src/config.ts` — API base URL, key handling

**Status:** Documented risk; no immediate action. Revisit when scaling or sharing the app beyond personal use.

---

### Code Refactoring - Name Collector Extraction 🔧

**Value: 6/10 | Complexity: 5/10 | Ratio: 1.2**

**Problem:** Name collector (487 lines) has repeated confirmation patterns that could be extracted for reusability.

**Implementation:**

- Extract NameConfirmationHandler module (~150 lines)
  - Reusable confirmation flows
- Extract TimeoutManager utility
  - DRY timeout pattern
- Complete game session validation
- Performance validation

**Files:**

- `src/orchestrator/name-confirmation-handler.ts` (new)
- `src/utils/timeout-manager.ts` (new)
- `src/orchestrator/name-collector.ts` (refactor)

**Benefits:**

- Smaller, focused files (easier to understand)
- Reusable confirmation patterns
- Reduced cognitive load
- Foundation for other setup flows

**Estimated Effort:** 4-6 hours

---

### Event System 🔧

**Value: 6/10 | Complexity: 6/10 | Ratio: 1.0**

**Problem:** Tight coupling between components, no observable state changes.

**Implementation:**

- Implement event bus for state changes
- Add lifecycle hooks (onTurnStart, onTurnEnd, onGameEnd)
- Enable game modules to listen to events
- Reduces coupling, enables plugins/extensions

**Files:**

- `src/events/event-bus.ts` (new)
- Integrate across modules

---

### Modernize Async Patterns 🔧

**Value: 5/10 | Complexity: 5/10 | Ratio: 1.0**

**Problem:** Some Promise constructor anti-patterns, missing proper error boundaries.

**Implementation:**

- Replace Promise constructor patterns with async/await where appropriate
- Add proper try-catch blocks with typed errors
- Implement error boundary utilities
- Clean up name-collector.ts promise chains

**Files:**

- `src/orchestrator/name-collector.ts`
- `src/state-manager.ts`
- `src/wake-word.ts`

---

## 🎨 Polish (Nice to Have / Lower Priority)

### Graceful Degradation 🎨

**Value: 7/10 | Complexity: 4/10 | Ratio: 1.75**

**Problem:** Voice-only approach fails if TTS unavailable. No fallback.

**Implementation:**

- Add visual fallback mode detection
- Display narration text if TTS fails repeatedly
- Add accessibility mode toggle
- Ensure app is still usable with broken TTS

**Files:**

- `src/services/speech-service.ts`
- `src/services/ui-service.ts`
- `src/services/production-ui-service.ts`

---

### Audio Pipeline Optimization 🎨

**Value: 5/10 | Complexity: 6/10 | Ratio: 0.83**

**Problem:** No buffer pooling, potential memory pressure from audio chunks.

**Implementation:**

- Implement buffer pool for audio processing
- Add backpressure handling in audio worklet
- Optimize PCM to Float32 conversion
- Reduce GC pressure

**Files:**

- `src/audio-worklet/vosk-processor.js`
- `src/wake-word.ts`

**Note:** Only needed if performance issues observed

---

### TTS Voice Selection 🎨

**Value: 6/10 | Complexity: 4/10 | Ratio: 1.5**

**Problem:** Uses default browser voice. No customization.

**Implementation:**

- Allow voice selection/preference
- Gender/accent preferences for family use
- Voice-configured: "Kali, use a male voice" / "Kali, use a female voice"
- Store preference in config

**Files:**

- `src/services/speech-service.ts`
- `src/config.ts`

---

### Improve Model Download Error Recovery 🎨

**Value: 5/10 | Complexity: 4/10 | Ratio: 1.25**

**Problem:** If model download fails, app shows error but no retry mechanism.

**Implementation:**

- Add retry button/mechanism for failed downloads
- Show progress more clearly (currently just percentage)
- Consider chunked download with resume capability for poor connections

**Files:**

- `src/model-manager.ts`
- `src/main.ts`

---

### PWA Manifest: Screenshots & Square Icons 🎨

**Value: 3/10 | Complexity: 2/10 | Ratio: 1.5 | Priority: Low**

**Problem:** Richer PWA install UI warnings: no screenshot with `form_factor: wide` (desktop), no screenshot for narrow/unset (mobile); icons at `/icon-192.svg` and `/icon-512.svg` fail to load in production; many OS require at least one square (raster) icon.

**Implementation:**

- Add `screenshots` to manifest: one with `form_factor: "wide"` (desktop), one with `form_factor: "narrow"` or unset (mobile); add `public/screenshot-wide.png` and `public/screenshot-narrow.png` (real app screenshots).
- Add square PNG icons: `public/icon-192.png` and `public/icon-512.png` (or generate from existing SVGs); add PNG entries to `manifest.icons` in `vite.config.ts` and `public/manifest.json`.
- Ensure icon/screenshot paths work in production (root-relative, assets in `public/`).

**Files:**

- `vite.config.ts` (VitePWA `manifest.icons` and `manifest.screenshots`)
- `public/manifest.json`
- `public/` (new: `icon-192.png`, `icon-512.png`, `screenshot-wide.png`, `screenshot-narrow.png`)

---

### Revisit: Vosk Model Source (alphacephei CDN) 🔄

**Value: 6/10 | Complexity: 3/10 | Ratio: 2.0**

**Context:** Model now defaults to alphacephei.com CDN (no public/ shipping). AlphaCephei is the canonical Vosk maintainer but is a small Russia-based operation with no hosting SLA. CORS may block fetch in some environments.

**Revisit:**

- Monitor alphacephei reliability and CORS behavior in production
- If issues arise: consider self-hosting the model on project CDN (S3/R2), or publishing an npm package (e.g. `@kali/vosk-model-es`) served via jsDelivr (CORS-enabled)
- Update docs with real-world findings

---

### Sound Effect Management 🎨

**Value: 4/10 | Complexity: 4/10 | Ratio: 1.0**

**Problem:** All sound effects loaded at startup.

**Implementation:**

- Lazy load sound effects (load on first use)
- Preload only essential sounds
- Graceful degradation if sound fails to load

**Files:**

- `src/services/speech-service.ts`
- `src/game-loader/game-loader.ts`

---

### State Change Listeners (Optional) 🎨

**Value: 4/10 | Complexity: 5/10 | Ratio: 0.8**

**Problem:** No way to observe state changes. Components can't react to mutations.

**Potential Enhancement:**

- Add `subscribe()` / `unsubscribe()` methods
- UI could reactively update on state changes
- Better debugging (log all state changes)
- Enable reactive patterns

**Implementation:**

```typescript
class StateManager {
  subscribe(path: string, callback: (value: unknown) => void): void;
  unsubscribe(path: string, callback: (value: unknown) => void): void;
}
```

**Files:**

- `src/state-manager.ts`

**Status:** Very low priority - only needed if:

- Visual UI is added (currently voice-only)
- Real-time state visualization for debugging
- Reactive UI framework integration

**Verdict:** Not needed for voice-only app. Skip unless requirements change.
