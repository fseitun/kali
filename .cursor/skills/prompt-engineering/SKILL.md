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

## Vendor-agnostic checklist

- Put **stable role and global rules** in the system (or equivalent) layer; put **task-specific** text and examples in user/context turns when your stack allows it.
- Use **clear sections or tags** for long context (documents, rules, state) so the model can anchor on them.
- For **few-shot** examples, use a compact, scannable format (bullets or YAML-style blocks); keep examples aligned with the real JSON schema.
- State **tool/primitive boundaries** explicitly: what the model may emit vs what the host computes.
- For **speech-to-speech or TTS-heavy** flows, add explicit tone, pacing, and confirmation rules (names, numbers) per OpenAI’s voice-agent guidance.

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
