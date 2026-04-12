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
    } as unknown as ISpeechService;
    mockLLMClient = {
      analyzeResponse: vi.fn(async () => ({ isOnTopic: true })),
      extractName: vi.fn(async (text: string) => text.trim()),
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
