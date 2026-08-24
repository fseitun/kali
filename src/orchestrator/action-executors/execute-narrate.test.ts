import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPlayingStateFixture } from "../test-fixtures";
import type { ExecutionContext } from "../types";
import { executeNarrate } from "./execute-narrate";
import type { ActionExecutorContext } from "./shared";
import { StateManager } from "@/state-manager";

describe("Product scenario: Execute NARRATE", () => {
  let stateManager: StateManager;
  let speak: ReturnType<typeof vi.fn>;
  let playSound: ReturnType<typeof vi.fn>;
  let setState: ReturnType<typeof vi.fn>;
  let setLastNarration: ReturnType<typeof vi.fn>;
  let ctx: ActionExecutorContext;
  let execCtx: ExecutionContext;

  beforeEach(() => {
    stateManager = new StateManager();
    stateManager.init(
      createPlayingStateFixture({
        players: {
          p1: { id: "p1", name: "Alice", position: 3 },
          p2: { id: "p2", name: "Bob", position: 0 },
        },
        squares: {},
      }),
    );

    speak = vi.fn(async () => {});
    playSound = vi.fn();
    setState = vi.fn();
    setLastNarration = vi.fn();
    ctx = {
      stateManager,
      speechService: { speak, playSound },
      statusIndicator: { setState },
      setLastNarration,
    } as unknown as ActionExecutorContext;
    execCtx = {};
  });

  it("Expected outcome: Speaks the narration text the interpreter supplied", async () => {
    await executeNarrate(ctx, { action: "NARRATE", text: "Alice moves ahead." }, execCtx);

    expect(speak).toHaveBeenCalledWith("Alice moves ahead.");
    expect(execCtx.narrationPlans).toHaveLength(1);
  });

  it("Expected outcome: Does not speak when the interpreter narrates empty text", async () => {
    await executeNarrate(ctx, { action: "NARRATE", text: "" }, execCtx);

    // A speak("") still counts toward MeteredSpeechService, which would convince
    // applySilentSuccessFallback the turn was narrated and leave it silent.
    expect(speak).not.toHaveBeenCalled();
    expect(execCtx.narrationPlans ?? []).toHaveLength(0);
  });

  it("Expected outcome: Does not speak when the interpreter narrates whitespace only", async () => {
    await executeNarrate(ctx, { action: "NARRATE", text: "   \n " }, execCtx);

    expect(speak).not.toHaveBeenCalled();
    expect(execCtx.narrationPlans ?? []).toHaveLength(0);
  });

  it("Expected outcome: Still plays a sound effect attached to an empty narration", async () => {
    await executeNarrate(ctx, { action: "NARRATE", text: "", soundEffect: "dice" }, execCtx);

    expect(playSound).toHaveBeenCalledWith("dice");
    expect(speak).not.toHaveBeenCalled();
  });
});
