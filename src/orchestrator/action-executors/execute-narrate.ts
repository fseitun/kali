import { resolveNarrationPlan } from "../narration-policy";
import type { ExecutionContext, PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";

function recordNarrationPlan(
  execCtx: ExecutionContext,
  text: string,
  source: "deterministic" | "llm",
): void {
  execCtx.narrationPlans = execCtx.narrationPlans ?? [];
  execCtx.narrationPlans.push({ text, source, consumedEventIds: [] });
}

function applyDeterministicNarration(
  ctx: ActionExecutorContext,
  execCtx: ExecutionContext,
): string | undefined {
  const state = ctx.stateManager.getState();
  const deterministicPlan = resolveNarrationPlan({
    state,
    events: execCtx.domainEvents ?? [],
  });
  if (!deterministicPlan) {
    return undefined;
  }
  execCtx.domainEvents =
    execCtx.domainEvents?.filter(
      (event) => !deterministicPlan.consumedEventIds.includes(event.eventId),
    ) ?? [];
  execCtx.narrationPlans = execCtx.narrationPlans ?? [];
  execCtx.narrationPlans.push(deterministicPlan);
  ctx.setLastNarration(deterministicPlan.text);
  return deterministicPlan.text;
}

function computeNarrateSpeech(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "NARRATE" }>,
  execCtx: ExecutionContext,
): string {
  const incomingNarrationText = primitive.text?.trim() ?? "";
  const deterministicSpeech = applyDeterministicNarration(ctx, execCtx);
  if (deterministicSpeech !== undefined) {
    return deterministicSpeech;
  }

  if (incomingNarrationText) {
    ctx.setLastNarration(incomingNarrationText);
    recordNarrationPlan(execCtx, incomingNarrationText, "llm");
  }
  return incomingNarrationText;
}

export async function executeNarrate(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "NARRATE" }>,
  execCtx: ExecutionContext,
): Promise<void> {
  const textToSpeak = computeNarrateSpeech(ctx, primitive, execCtx);

  if (primitive.soundEffect) {
    ctx.speechService.playSound(primitive.soundEffect);
  }
  // An empty NARRATE must not reach speak(): MeteredSpeechService would count the turn as
  // narrated and applySilentSuccessFallback would leave a genuinely silent turn alone.
  if (textToSpeak === "") {
    return;
  }
  ctx.statusIndicator.setState("speaking");
  await ctx.speechService.speak(textToSpeak);
}
