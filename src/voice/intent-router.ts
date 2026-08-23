import type { LLMClient } from "@/llm/LLMClient";

export type ListeningMode = "ambient" | "prompted";

type RouteKind = "GAME_COMMAND" | "AMBIGUOUS" | "SOCIAL_CHAT_OR_NOISE";

export interface IntentRouterContext {
  mode: ListeningMode;
  wakeWords: readonly string[];
  inNameCollection: boolean;
  hasPendingDecisionPrompt: boolean;
}

export interface RouteDecision {
  kind: RouteKind;
  transcript: string;
  usedLlmFallback: boolean;
}

function normalizeWakeWords(wakeWords: readonly string[]): string[] {
  return wakeWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
}

function stripAmbientWakeWord(
  transcript: string,
  wakeWords: readonly string[],
): { hasWakeWord: boolean; stripped: string } {
  const trimmed = transcript.trim();
  if (trimmed === "") {
    return { hasWakeWord: false, stripped: "" };
  }
  const lower = trimmed.toLowerCase();
  const normalizedWakeWords = normalizeWakeWords(wakeWords);
  for (const wakeWord of normalizedWakeWords) {
    if (lower === wakeWord) {
      return { hasWakeWord: true, stripped: "" };
    }
    if (lower.startsWith(`${wakeWord} `)) {
      return { hasWakeWord: true, stripped: trimmed.slice(wakeWord.length).trim() };
    }
  }
  return { hasWakeWord: false, stripped: trimmed };
}

function isLikelyStructuredAnswer(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\b\d+\b/u.test(lower)) {
    return true;
  }
  if (
    /\b(uno|una|dos|tres|cuatro|cinco|seis|si|sí|no|left|right|izquierda|derecha|roll|dado)\b/u.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

function isLikelyLowSignal(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.length <= 1) {
    return true;
  }
  return /^(eh+|ah+|mm+|mmm+|uh+|um+|jugadores|players?)$/u.test(lower);
}

function deterministicRoute(
  transcript: string,
  context: IntentRouterContext,
): Omit<RouteDecision, "usedLlmFallback"> {
  const ambientCandidate = stripAmbientWakeWord(transcript, context.wakeWords);
  const candidate = context.mode === "ambient" ? ambientCandidate.stripped : transcript.trim();

  if (context.mode === "ambient" && !ambientCandidate.hasWakeWord) {
    return { kind: "SOCIAL_CHAT_OR_NOISE", transcript: transcript.trim() };
  }
  if (candidate === "") {
    return { kind: "AMBIGUOUS", transcript: "" };
  }
  if (isLikelyLowSignal(candidate)) {
    return { kind: "AMBIGUOUS", transcript: candidate };
  }
  if (context.inNameCollection || context.hasPendingDecisionPrompt) {
    return { kind: "GAME_COMMAND", transcript: candidate };
  }
  if (context.mode === "prompted") {
    return { kind: "GAME_COMMAND", transcript: candidate };
  }
  if (isLikelyStructuredAnswer(candidate)) {
    return { kind: "GAME_COMMAND", transcript: candidate };
  }
  return { kind: "SOCIAL_CHAT_OR_NOISE", transcript: candidate };
}

/**
 * Routes a transcript to gameplay handling, ambiguity handling, or ignore.
 * Deterministic routing runs first; an optional LLM fallback is used for ambiguous cases.
 */
export async function routeTranscript(
  transcript: string,
  context: IntentRouterContext,
  llmClient?: LLMClient | null,
): Promise<RouteDecision> {
  const deterministic = deterministicRoute(transcript, context);
  if (deterministic.kind !== "AMBIGUOUS" || !llmClient || deterministic.transcript === "") {
    return { ...deterministic, usedLlmFallback: false };
  }

  const expectedContext = context.inNameCollection
    ? "setup response: player count or player name"
    : context.hasPendingDecisionPrompt
      ? "gameplay decision answer for current turn"
      : "gameplay command";
  const analysis = await llmClient.analyzeResponse(deterministic.transcript, expectedContext);
  if (analysis.isOnTopic) {
    return {
      kind: "GAME_COMMAND",
      transcript: deterministic.transcript,
      usedLlmFallback: true,
    };
  }
  return { ...deterministic, usedLlmFallback: true };
}
