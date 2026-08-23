import { describe, expect, it, vi } from "vitest";
import { routeTranscript } from "./intent-router";

describe("Product scenario: intent router", () => {
  const baseContext = {
    wakeWords: ["kali", "cali"],
    inNameCollection: false,
    hasPendingDecisionPrompt: false,
  } as const;

  it("Expected outcome: Drops ambient chatter without wake word", async () => {
    const decision = await routeTranscript("hola chicos", { ...baseContext, mode: "ambient" });
    expect(decision.kind).toBe("SOCIAL_CHAT_OR_NOISE");
    expect(decision.usedLlmFallback).toBe(false);
  });

  it("Expected outcome: Routes ambient wake-word command to gameplay", async () => {
    const decision = await routeTranscript("kali tirar dado", { ...baseContext, mode: "ambient" });
    expect(decision.kind).toBe("GAME_COMMAND");
    expect(decision.transcript).toBe("tirar dado");
  });

  it("Expected outcome: Accepts prompted response without wake word", async () => {
    const decision = await routeTranscript("somos dos jugadores", {
      ...baseContext,
      mode: "prompted",
      inNameCollection: true,
    });
    expect(decision.kind).toBe("GAME_COMMAND");
  });

  it("Expected outcome: Uses LLM fallback for ambiguous tokens", async () => {
    const analyzeResponse = vi.fn().mockResolvedValue({ isOnTopic: true });
    const decision = await routeTranscript(
      "jugadores",
      { ...baseContext, mode: "prompted", inNameCollection: true },
      {
        setGameRules: vi.fn(),
        getActions: vi.fn(),
        extractName: vi.fn(),
        extractPlayerCount: vi.fn(),
        analyzeResponse,
      },
    );
    expect(analyzeResponse).toHaveBeenCalled();
    expect(decision.kind).toBe("GAME_COMMAND");
    expect(decision.usedLlmFallback).toBe(true);
  });
});
