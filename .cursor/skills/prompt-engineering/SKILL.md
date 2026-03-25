---
name: prompt-engineering
description: >-
  Applies vendor-agnostic prompt engineering when editing Kali LLM system
  prompts, game JSON that feeds the model, or debugging interpreter behavior.
  Use when changing src/llm/system-prompt.ts, public/games/**/config.json
  metadata or decision-point prompts, narration/tone guidance, or when the user
  asks for prompt rewrites, few-shot structure, long-context layout, voice-agent
  tone, or OpenAI/Anthropic best practices for instructions.
---

# Prompt engineering (Kali)

## When to use this skill

- Editing [`src/llm/system-prompt.ts`](../../../src/llm/system-prompt.ts) or related LLM context formatters.
- Editing game copy that becomes LLM input: `metadata`, `decisionPoints[].prompt`, examples in [`public/games/**/*.json`](../../../public/games).
- Improving narration tone, clarity, or consistency for voice-first play.
- Diagnosing systematic LLM mistakes (wrong primitives, skipped steps, format drift) where prompt structure may help.

## Kali-specific contract (do not override with generic advice)

- **Guided LLM:** The model interprets; the orchestrator validates and executes. See [`.cursor/kali-architecture.md`](../../kali-architecture.md) (thin LLM, primitive box, synthetic transcripts).
- **Output shape:** Primitives as **pure JSON** (no markdown fences); orchestrator is authoritative for state.
- **Cost/latency:** Prefer concise system instructions; put bulky reference in structured blocks only when needed.
- **Locales:** Keep a single locale per prompt variant where possible (see roadmap/task guides for i18n).

## Where runtime prompt text lives

- **System / primitives + narration examples:** [`src/llm/system-prompt.ts`](../../../src/llm/system-prompt.ts).
- **User-turn envelope (tag order):** [`src/llm/BaseLLMClient.ts`](../../../src/llm/BaseLLMClient.ts) (`<game_state>`, optional `<last_utterance>`, `<user_command>`).
- **State blob copy and sections:** [`src/llm/state-context.ts`](../../../src/llm/state-context.ts), [`src/i18n/llm-state-context.ts`](../../../src/i18n/llm-state-context.ts).
- **Game rules and decision prompts in JSON:** [`public/games/**/*.json`](../../../public/games).
- **Auxiliary model prompts:** e.g. [`src/i18n/riddle-judge-prompt.ts`](../../../src/i18n/riddle-judge-prompt.ts).

## Maps to @Prompt OpenAI / @Prompt Anthropic

Use the indexed docs for depth; below is how their guidance lands in Kali.

- **System vs user:** Stable role, tone, and primitive contract live in the **system** prompt (`buildSystemPrompt`); per-turn **user** content is built in [`BaseLLMClient`](../../../src/llm/BaseLLMClient.ts) (state + transcript). Matches OpenAI’s “tone in system, task in user” split.
- **Long context order:** Anthropic recommends large reference first, immediate task last. Kali’s user message already puts **`<game_state>`** (and optional **`<last_utterance>`**) **before** **`<user_command>`**—do not invert when changing formatters.
- **Sections / XML-style tags:** Prefer consistent tagged blocks (as in the user envelope) for any new context; avoid long untagged dumps.
- **Few-shots:** Keep examples compact (bullets or YAML-style); every example must match **real** primitive JSON (OpenAI prompting / “example outputs” guidance).
- **Explicit instructions for JSON output:** Interpreter output is tool-like; keep format rules literal and repeated where drift happens, even if some reasoning-style models prefer high-level goals only (OpenAI prompt-guidance / text-generation).
- **Empirical iteration:** Prefer a minimal prompt diff plus **`npm run full-check`** and targeted [`src/llm/*.test.ts`](../../../src/llm) (and reproduction transcripts) over large rewrites—both vendors stress measuring behavior when prompts or model versions change.
- **When prompting is not the fix:** Latency, cost, or systematic **validation** failures may need a different model, provider settings, or orchestrator policy (Anthropic overview: not every eval gap is solved by more instructions).
- **Chaining:** Production gameplay uses **one** interpreter call per transcript. Anthropic-style **prompt chains** apply to offline tooling, evals, or future multi-step pipelines—not the default live path unless architecture changes.
- **Voice / TTS:** Use explicit pacing, clarity, and confirmation for **names and numbers**; see OpenAI [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents) and development voice-UX rules in [`.cursor/rules/development-guidelines.mdc`](../../rules/development-guidelines.mdc).

## Vendor-agnostic checklist (short)

Stable rules in **system**; transient facts + user text in **user**. Tag big blocks. Few-shots match schema. State primitive vs host boundaries. Voice flows spell out hearable outcomes.

## Official references (index in Cursor for `@` mentions)

Add these as indexed documentation in Cursor if you want `@Prompt OpenAI` and `@Prompt Anthropic` in chat; **use the same display names** so they match project rules.

**OpenAI**

- [Prompting](https://developers.openai.com/api/docs/guides/prompting)
- [Prompt guidance (model behavior)](https://developers.openai.com/api/docs/guides/prompt-guidance)
- [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)
- [Text generation / prompt engineering](https://developers.openai.com/api/docs/guides/text-generation)

**Anthropic**

- [Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
- [System prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/system-prompts)
- [Long context tips](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips)
- [Chain prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/chain-prompts)

Start with the smallest prompt change that fixes a measured failure; add structure only when it addresses a real drift or error mode.
