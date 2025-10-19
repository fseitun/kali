# LLM Narration Rephrasing

## Overview
Make Kali rephrase all hardcoded narration (i18n strings, system messages) through the LLM before speaking. This will make the voice output sound more natural, friendly, and less robotic - even if it costs extra LLM calls.

## Implementation Strategy

### 1. Extend LLM Client Interface
Add a new method to `LLMClient` interface:
```typescript
rephraseNarration(text: string, locale: string): Promise<string>
```

This method will:
- Take the hardcoded text as input
- Return a natural, friendly rephrasing
- Keep the same meaning and any placeholders intact
- Be simple and focused (no state context needed)

### 2. Implement in LLM Clients
Add the `rephraseNarration` implementation to both:
- `GeminiClient.ts` - Fast, recommended path
- `OllamaClient.ts` - Local, slower path

The prompt will instruct the LLM to:
- Rephrase naturally as if talking to kids
- Preserve exact placeholder syntax (e.g., `{name}`, `{position}`)
- Keep the same language as input
- Be friendly, warm, and encouraging

### 3. Create Narration Rephrasing Service
New file: `src/services/narration-rephrasing-service.ts`

This service will:
- Cache up to N variations per text (configurable, default 5)
- Rotate through cached variations to avoid repetition
- Stop generating new variations once we hit the limit
- Fall back to original text if LLM fails or times out
- Handle errors gracefully

Data structure:
```typescript
Map<string, string[]> // originalText -> [variation1, variation2, ...]
```

### 4. Integrate into Speech Service
Modify `SpeechService.speak()` to:
- Accept the rephrasing service in constructor
- Call `rephrasingService.getRephrasedText(text)` before speaking
- Handle fallback transparently (user never knows if rephrasing failed)
- Log rephrasing attempts for debugging

### 5. Configuration
Add to `src/config.ts`:
```typescript
NARRATION: {
  MAX_VARIATIONS: 5, // Stop creating new variations after this
  ENABLE_REPHRASING: true, // Master switch
}
```

## Files to Create/Modify

**New files:**
- `src/services/narration-rephrasing-service.ts`

**Modified files:**
- `src/llm/LLMClient.ts` - Add rephraseNarration method
- `src/llm/GeminiClient.ts` - Implement rephrasing
- `src/llm/OllamaClient.ts` - Implement rephrasing
- `src/services/speech-service.ts` - Integrate rephrasing service
- `src/config.ts` - Add narration config
- `src/kali-app-core.ts` - Instantiate and pass rephrasing service
- `src/main.ts` - Pass service through constructor chain
- `src/debug.ts` - Pass service through constructor chain

## Benefits
- Natural, varied narration instead of robotic repetition
- Works for all languages (i18n)
- Transparent to existing code
- Graceful degradation (fallback to original on failure)
- User controls variation cap to balance freshness vs cost
- No changes needed to orchestrator, name-collector, or game logic

## Edge Cases
- LLM timeout: Fall back to original text
- LLM returns malformed text: Fall back to original
- Placeholder corruption: Validate and fall back if broken
- Empty cache: Generate first variation on-demand
- Persistence: Cache is session-only (intentional for freshness across sessions)

## Todo

- [ ] Add NARRATION config to src/config.ts with MAX_VARIATIONS and ENABLE_REPHRASING
- [ ] Extend LLMClient interface with rephraseNarration method
- [ ] Implement rephraseNarration in GeminiClient with focused prompt
- [ ] Implement rephraseNarration in OllamaClient with focused prompt
- [ ] Create NarrationRephrasingService with variation caching and rotation logic
- [ ] Modify SpeechService to use rephrasing service before speaking
- [ ] Wire up rephrasing service in kali-app-core, main.ts, and debug.ts
