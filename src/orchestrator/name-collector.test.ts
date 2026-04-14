import { beforeEach, describe, expect, it, vi } from "vitest";
import { NameCollector } from "./name-collector";
import type { GameMetadata } from "@/game-loader/types";
import type { LLMClient } from "@/llm/LLMClient";
import type { ISpeechService } from "@/services/speech-service";

describe("Product scenario: Name Collector runtime behavior", () => {
  let mockSpeechService: ISpeechService;
  let mockLLMClient: LLMClient;
  let mockEnableDirectTranscription: () => void;
  let gameMetadata: GameMetadata;
  let transcriptHandler: ((text: string) => void) | null;

  beforeEach(() => {
    transcriptHandler = null;
    mockSpeechService = {
      speak: vi.fn(async () => {}),
      playSound: vi.fn(),
      startLoopingSound: vi.fn(),
      stopLoopingSound: vi.fn(),
      loadSound: vi.fn(async () => {}),
      prime: vi.fn(),
    } as unknown as ISpeechService;
    mockLLMClient = {
      analyzeResponse: vi.fn(async () => ({ isOnTopic: true })),
      extractName: vi.fn(async (text: string) => text.trim()),
      extractPlayerCount: vi.fn(async () => null),
    } as unknown as LLMClient;
    mockEnableDirectTranscription = vi.fn();
    gameMetadata = {
      id: "test-game",
      name: "Test Game",
      minPlayers: 2,
      maxPlayers: 4,
      objective: "Test objective",
    };
  });

  async function sendTranscript(text: string): Promise<void> {
    const fn = transcriptHandler;
    if (!fn) {
      throw new Error("transcriptHandler not set");
    }
    await (fn as (t: string) => Promise<void>)(text);
  }

  it("Expected outcome: Collect Names returns names in order for happy path", async () => {
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockEnableDirectTranscription,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("2");
    await sendTranscript("Alice");
    await sendTranscript("Bob");

    await expect(collectPromise).resolves.toEqual(["Alice", "Bob"]);
  });

  it("Expected outcome: Enables direct transcription when collecting first player name", async () => {
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockEnableDirectTranscription,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("2");
    await sendTranscript("Alice");
    await sendTranscript("Bob");
    await collectPromise;

    expect(mockEnableDirectTranscription).toHaveBeenCalledTimes(1);
  });

  it("Expected outcome: Accepts numeric player count even when on-topic classifier fails", async () => {
    const analyzeResponseSpy = vi.fn(async (_text: string, expectedContext: string) => {
      if (expectedContext.includes("player count")) {
        return { isOnTopic: false as const, urgentMessage: "off topic" };
      }
      return { isOnTopic: true as const };
    });
    mockLLMClient = {
      analyzeResponse: analyzeResponseSpy,
      extractName: vi.fn(async (text: string) => text.trim()),
      extractPlayerCount: vi.fn(async () => null),
    } as unknown as LLMClient;
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockEnableDirectTranscription,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("2");
    await sendTranscript("Alice");
    await sendTranscript("Bob");

    await expect(collectPromise).resolves.toEqual(["Alice", "Bob"]);
    expect(analyzeResponseSpy).not.toHaveBeenCalledWith(
      "2",
      expect.stringContaining("player count"),
    );
  });

  it("Expected outcome: Uses LLM player count extraction fallback for natural-language phrasing", async () => {
    const extractPlayerCountSpy = vi.fn(async () => 2);
    mockLLMClient = {
      analyzeResponse: vi.fn(async () => ({ isOnTopic: true })),
      extractName: vi.fn(async (text: string) => text.trim()),
      extractPlayerCount: extractPlayerCountSpy,
    } as unknown as LLMClient;
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockEnableDirectTranscription,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("vamos a jugar en pareja");
    await sendTranscript("Alice");
    await sendTranscript("Bob");

    await expect(collectPromise).resolves.toEqual(["Alice", "Bob"]);
    expect(extractPlayerCountSpy).toHaveBeenCalledWith("vamos a jugar en pareja", 2, 4);
  });

  it("Expected outcome: Skip ready message option suppresses setup ready prompt", async () => {
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockEnableDirectTranscription,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames(
      (handler) => {
        transcriptHandler = handler;
      },
      { skipReadyMessage: true },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("2");
    await sendTranscript("Alice");
    await sendTranscript("Bob");
    await collectPromise;

    const spokenTexts = (mockSpeechService.speak as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([text]) => text)
      .filter((text): text is string => typeof text === "string");
    expect(spokenTexts.some((text) => text.includes("arranca") || text.includes("starts"))).toBe(
      false,
    );
  });
});
