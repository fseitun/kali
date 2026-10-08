import { beforeEach, describe, expect, it, vi } from "vitest";
import { NameCollector } from "./name-collector";
import type { GameMetadata } from "@/game-loader/types";
import { setLocale, t } from "@/i18n/translations";
import type { LLMClient } from "@/llm/LLMClient";
import type { ISpeechService } from "@/services/speech-service";

describe("Product scenario: Name Collector runtime behavior", () => {
  let mockSpeechService: ISpeechService;
  let mockLLMClient: LLMClient;
  let mockBeginPromptedCapture: () => void;
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
    mockBeginPromptedCapture = vi.fn();
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
      mockBeginPromptedCapture,
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

  it("Expected outcome: Begins prompted capture once when collecting names", async () => {
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockBeginPromptedCapture,
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

    expect(mockBeginPromptedCapture).toHaveBeenCalledTimes(1);
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
      mockBeginPromptedCapture,
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
      mockBeginPromptedCapture,
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

  function spokenTexts(): string[] {
    return (mockSpeechService.speak as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([text]) => text)
      .filter((text): text is string => typeof text === "string");
  }

  it("Expected outcome: Renames a duplicate that is not the immediately previous name", async () => {
    gameMetadata = { ...gameMetadata, maxPlayers: 4 };
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockBeginPromptedCapture,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("3");
    await sendTranscript("Ana");
    await sendTranscript("Bob");
    await sendTranscript("Ana");
    await sendTranscript("sí");

    const names = await collectPromise;
    expect(names[0]).toBe("Ana");
    expect(names[1]).toBe("Bob");
    expect(names[2]).not.toBe("Ana");
    expect(names[2].startsWith("Ana ")).toBe(true);
  });

  it("Expected outcome: Joins the final name list with the localized conjunction", async () => {
    setLocale("en-US");
    try {
      const collector = new NameCollector(
        mockSpeechService,
        "Test Game",
        mockBeginPromptedCapture,
        mockLLMClient,
        gameMetadata,
      );

      const collectPromise = collector.collectNames((handler) => {
        transcriptHandler = handler;
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await sendTranscript("2");
      await sendTranscript("Ana");
      await sendTranscript("Ana");
      await sendTranscript("yes");
      await collectPromise;

      const readyLine = spokenTexts().find((text) => text.startsWith("Excellent!"));
      expect(readyLine).toBeDefined();
      expect(readyLine).toContain(t("setup.nameListLastJoiner"));
      expect(readyLine).not.toContain(" y ");
    } finally {
      setLocale("es-AR");
    }
  });

  it("Expected outcome: Ignores a second transcript that arrives while the first is still being handled", async () => {
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockBeginPromptedCapture,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("2");
    await sendTranscript("Alice");

    const handler = transcriptHandler as unknown as (t: string) => Promise<void>;
    await Promise.all([handler("Bob"), handler("Bob")]);
    await collectPromise;

    const confirmations = spokenTexts().filter(
      (text) => text === t("setup.nameConfirmYes", { name: "Bob" }),
    );
    expect(confirmations).toHaveLength(1);
  });

  it("Expected outcome: Re-asks out loud when a second transcript overlaps the first", async () => {
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockBeginPromptedCapture,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = collector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendTranscript("2");
    await sendTranscript("Alice");

    const handler = transcriptHandler as unknown as (t: string) => Promise<void>;
    await Promise.all([handler("Bob"), handler("Bob")]);
    await collectPromise;

    // A child who talks over the first answer must not be met with silence.
    const askedTwice = spokenTexts().filter(
      (text) => text === t("setup.playerName", { number: 2 }),
    );
    expect(askedTwice.length).toBeGreaterThanOrEqual(2);
  });

  it("Expected outcome: Skip ready message option suppresses setup ready prompt", async () => {
    const collector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockBeginPromptedCapture,
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
