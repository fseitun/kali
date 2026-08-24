import type { LLMClient } from "@/llm/LLMClient";

export type ListeningMode = "ambient" | "prompted";

type RouteKind = "GAME_COMMAND" | "AMBIGUOUS" | "SOCIAL_CHAT_OR_NOISE";

export interface IntentRouterContext {
  mode: ListeningMode;
  wakeWords: readonly string[];
  inNameCollection: boolean;
  awaitingPlayerAnswer: boolean;
}

export interface RouteDecision {
  kind: RouteKind;
  transcript: string;
  usedLlmFallback: boolean;
}

interface DeterministicRoute {
  kind: RouteKind;
  transcript: string;
  /**
   * The child said the wake word, or Kali had just asked something: either way this utterance
   * is meant for her, so it must never be dropped in silence.
   */
  addressedToKali: boolean;
}

function normalizeWakeWords(wakeWords: readonly string[]): string[] {
  return wakeWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
}

/** Punctuation the recogniser puts around the wake word: "¿Kali?", "Kali, saqué cuatro". */
const WAKE_WORD_LEADING = /^[¿¡"'\s]+/u;
const WAKE_WORD_TRAILING = /^[\s,.:;!?]+/u;

function stripAmbientWakeWord(
  transcript: string,
  wakeWords: readonly string[],
): { hasWakeWord: boolean; stripped: string } {
  const trimmed = transcript.trim().replace(WAKE_WORD_LEADING, "");
  const lower = trimmed.toLowerCase();
  for (const wakeWord of normalizeWakeWords(wakeWords)) {
    if (!lower.startsWith(wakeWord)) {
      continue;
    }
    const rest = trimmed.slice(wakeWord.length);
    // Only a word boundary counts: "kalimba" is a game name, not a child addressing Kali.
    if (rest !== "" && !WAKE_WORD_TRAILING.test(rest)) {
      continue;
    }
    return { hasWakeWord: true, stripped: rest.replace(WAKE_WORD_TRAILING, "").trim() };
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

function deterministicRoute(transcript: string, context: IntentRouterContext): DeterministicRoute {
  const isAmbient = context.mode === "ambient";
  const ambientCandidate = stripAmbientWakeWord(transcript, context.wakeWords);
  const candidate = isAmbient ? ambientCandidate.stripped : transcript.trim();
  const addressedToKali = !isAmbient || ambientCandidate.hasWakeWord;
  const awaitingReply = context.inNameCollection || context.awaitingPlayerAnswer;

  // Nobody said the wake word and Kali is not waiting on anyone: this is the table talking.
  if (!addressedToKali && !awaitingReply) {
    return { kind: "SOCIAL_CHAT_OR_NOISE", transcript: transcript.trim(), addressedToKali };
  }
  if (candidate === "" || isLikelyLowSignal(candidate)) {
    return { kind: "AMBIGUOUS", transcript: candidate, addressedToKali };
  }
  // The wake word (or the prompt she just gave) proves the utterance is for Kali, whether or
  // not it matches a heuristic. Dropping it here loses the very commands she asked for.
  if (addressedToKali || isLikelyStructuredAnswer(candidate)) {
    return { kind: "GAME_COMMAND", transcript: candidate, addressedToKali };
  }
  // Kali is owed an answer and this was not said to her: only the LLM can tell an answer she
  // is waiting on from the children talking among themselves.
  return { kind: "AMBIGUOUS", transcript: candidate, addressedToKali };
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
  const { kind, transcript: routed, addressedToKali } = deterministicRoute(transcript, context);
  // Something said to Kali that she cannot place is worth a "repeat, please"; the same words
  // overheard from across the table are not.
  const unresolved: RouteKind = addressedToKali ? "AMBIGUOUS" : "SOCIAL_CHAT_OR_NOISE";
  if (kind !== "AMBIGUOUS") {
    return { kind, transcript: routed, usedLlmFallback: false };
  }
  if (!llmClient || routed === "") {
    return { kind: unresolved, transcript: routed, usedLlmFallback: false };
  }

  const expectedContext = context.inNameCollection
    ? "setup response: player count or player name"
    : context.awaitingPlayerAnswer
      ? "gameplay decision answer for current turn"
      : "gameplay command";
  const analysis = await llmClient.analyzeResponse(routed, expectedContext);
  return {
    kind: analysis.isOnTopic ? "GAME_COMMAND" : unresolved,
    transcript: routed,
    usedLlmFallback: true,
  };
}
