import { resolveNarrationPlan } from "../narration-policy";
import type { ExecutionContext, PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";
import { GAME_PATH } from "@/state-paths";

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
  incomingNarrationText: string | undefined,
): string | undefined {
  const state = ctx.stateManager.getState();
  const deterministicPlan = resolveNarrationPlan({
    state,
    events: execCtx.domainEvents ?? [],
    incomingNarrationText,
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

function syncRiddlePromptForCurrentNarrate(
  ctx: ActionExecutorContext,
  incomingNarrationText: string | undefined,
): void {
  if (!incomingNarrationText) {
    return;
  }
  const state = ctx.stateManager.getState();
  const pending = state.game.pending as { kind?: string; riddlePrompt?: string } | null | undefined;
  if (!ctx.boardEffectsHandler.isProcessingEffect() || pending?.kind !== "riddle") {
    return;
  }
  ctx.stateManager.set(GAME_PATH.pending, {
    ...pending,
    riddlePrompt: incomingNarrationText,
  });
}

function computeNarrateSpeech(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "NARRATE" }>,
  execCtx: ExecutionContext,
): string {
  const incomingNarrationText = primitive.text;
  const deterministicSpeech = applyDeterministicNarration(ctx, execCtx, incomingNarrationText);
  if (deterministicSpeech !== undefined) {
    return deterministicSpeech;
  }

  syncRiddlePromptForCurrentNarrate(ctx, incomingNarrationText);

  if (incomingNarrationText) {
    ctx.setLastNarration(incomingNarrationText);
    recordNarrationPlan(execCtx, incomingNarrationText, "llm");
  }
  return incomingNarrationText ?? "";
}

export async function executeNarrate(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "NARRATE" }>,
  execCtx: ExecutionContext,
): Promise<void> {
  const textToSpeak = computeNarrateSpeech(ctx, primitive, execCtx);

  ctx.statusIndicator.setState("speaking");
  if (primitive.soundEffect) {
    ctx.speechService.playSound(primitive.soundEffect);
  }
  await ctx.speechService.speak(textToSpeak);
}
