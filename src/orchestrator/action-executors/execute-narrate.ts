import { resolveDeterministicNarrationOverrides } from "../action-executor-narration-overrides";
import type { ExecutionContext, PrimitiveAction } from "../types";
import type { ActionExecutorContext } from "./shared";
import { GAME_PATH } from "@/state-paths";

function computeNarrateSpeech(
  ctx: ActionExecutorContext,
  primitive: Extract<PrimitiveAction, { action: "NARRATE" }>,
  execCtx: ExecutionContext,
): string {
  const incomingNarrationText = primitive.text;
  const overridden = resolveDeterministicNarrationOverrides(ctx, execCtx, incomingNarrationText);
  if (overridden !== undefined) {
    return overridden;
  }

  const state = ctx.stateManager.getState();
  const pending = state.game.pending as { kind?: string; riddlePrompt?: string } | null | undefined;
  if (
    ctx.boardEffectsHandler.isProcessingEffect() &&
    pending?.kind === "riddle" &&
    incomingNarrationText
  ) {
    ctx.stateManager.set(GAME_PATH.pending, {
      ...pending,
      riddlePrompt: incomingNarrationText,
    });
  }

  if (incomingNarrationText) {
    ctx.setLastNarration(incomingNarrationText);
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
