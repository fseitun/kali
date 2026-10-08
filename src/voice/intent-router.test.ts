import { describe, expect, it, vi } from "vitest";
import { routeTranscript } from "./intent-router";

function mockLlm(isOnTopic: boolean): Parameters<typeof routeTranscript>[2] {
  return {
    setGameRules: vi.fn(),
    getActions: vi.fn(),
    extractName: vi.fn(),
    extractPlayerCount: vi.fn(),
    analyzeResponse: vi.fn().mockResolvedValue({ isOnTopic }),
  };
}

describe("Product scenario: intent router", () => {
  const baseContext = {
    wakeWords: ["kali", "cali"],
    inNameCollection: false,
    awaitingPlayerAnswer: false,
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
    const llm = mockLlm(true);
    const decision = await routeTranscript(
      "jugadores",
      { ...baseContext, mode: "prompted", inNameCollection: true },
      llm,
    );
    expect(llm?.analyzeResponse).toHaveBeenCalled();
    expect(decision.kind).toBe("GAME_COMMAND");
    expect(decision.usedLlmFallback).toBe(true);
  });

  it("Expected outcome: Takes a wake-worded command that matches no heuristic", async () => {
    // Kali tells children to say things like this out loud, so dropping it silently kills the
    // command she just asked for.
    const decision = await routeTranscript("kali quiero abrir la puerta mágica", {
      ...baseContext,
      mode: "ambient",
    });
    expect(decision.kind).toBe("GAME_COMMAND");
    expect(decision.transcript).toBe("quiero abrir la puerta mágica");
  });

  it("Expected outcome: Takes a wake-worded command the recogniser punctuated", async () => {
    const decision = await routeTranscript("Kali, empecemos de nuevo", {
      ...baseContext,
      mode: "ambient",
    });
    expect(decision.kind).toBe("GAME_COMMAND");
    expect(decision.transcript).toBe("empecemos de nuevo");
  });

  it("Expected outcome: Asks again instead of vanishing when only the wake word is heard", async () => {
    const decision = await routeTranscript("kali", { ...baseContext, mode: "ambient" });
    expect(decision.kind).toBe("AMBIGUOUS");
  });

  it("Expected outcome: A word that merely starts with the wake word is not addressed to Kali", async () => {
    const decision = await routeTranscript("kalimba es re divertido", {
      ...baseContext,
      mode: "ambient",
    });
    expect(decision.kind).toBe("SOCIAL_CHAT_OR_NOISE");
  });

  it("Expected outcome: Takes an outstanding answer that skipped the wake word", async () => {
    // The prompted window is ten seconds; a child thinking about a fork routinely takes longer.
    const decision = await routeTranscript("izquierda", {
      ...baseContext,
      mode: "ambient",
      awaitingPlayerAnswer: true,
    });
    expect(decision.kind).toBe("GAME_COMMAND");
    expect(decision.transcript).toBe("izquierda");
  });

  it("Expected outcome: Lets the LLM rescue a sentence-length riddle answer without wake word", async () => {
    const llm = mockLlm(true);
    const decision = await routeTranscript(
      "creo que vive en el océano",
      { ...baseContext, mode: "ambient", awaitingPlayerAnswer: true },
      llm,
    );
    expect(decision.kind).toBe("GAME_COMMAND");
    expect(decision.usedLlmFallback).toBe(true);
  });

  it("Expected outcome: Stays quiet about table talk the LLM says is off topic", async () => {
    const llm = mockLlm(false);
    const decision = await routeTranscript(
      "pasame la manzana que tengo hambre",
      { ...baseContext, mode: "ambient", awaitingPlayerAnswer: true },
      llm,
    );
    // Nobody asked Kali anything: re-asking here would talk over the table for every sentence.
    expect(decision.kind).toBe("SOCIAL_CHAT_OR_NOISE");
  });

  it("Expected outcome: Says it did not understand when the wake word came with nonsense", async () => {
    const llm = mockLlm(false);
    const decision = await routeTranscript("kali mmm", { ...baseContext, mode: "ambient" }, llm);
    expect(decision.kind).toBe("AMBIGUOUS");
  });
});
