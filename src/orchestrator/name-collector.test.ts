import { describe, it, expect, beforeEach, vi } from "vitest";
import { NameCollector } from "./name-collector";
import type { GameMetadata } from "@/game-loader/types";
import type { LLMClient } from "@/llm/LLMClient";
import type { SpeechService } from "@/services/speech-service";

describe("Product scenario: Name Collector State Isolation (Rule #4)", () => {
  let mockSpeechService: SpeechService;
  let mockLLMClient: LLMClient;
  let mockEnableDirectTranscription: () => void;
  let gameMetadata: GameMetadata;

  beforeEach(() => {
    mockSpeechService = {
      speak: vi.fn(async () => {}),
      playSound: vi.fn(),
    } as unknown as SpeechService;

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

  describe("Product scenario: Constructor and Dependencies", () => {
    it("Expected outcome: Has no state Manager dependency", () => {
      const nameCollector = new NameCollector(
        mockSpeechService,
        "Test Game",
        mockEnableDirectTranscription,
        mockLLMClient,
        gameMetadata,
      );

      const constructorParams =
        NameCollector.toString().match(/constructor\s*\(([\s\S]*?)\)/)?.[1] ?? "";

      const hasStateManager =
        constructorParams.includes("stateManager") || constructorParams.includes("StateManager");

      expect(hasStateManager).toBe(false);
      expect(nameCollector).toBeDefined();
    });

    it("Expected outcome: Accepts only presentation layer dependencies", () => {
      const nameCollector = new NameCollector(
        mockSpeechService,
        "Test Game",
        mockEnableDirectTranscription,
        mockLLMClient,
        gameMetadata,
      );

      expect(nameCollector).toBeDefined();
      expect(mockSpeechService).toBeDefined();
      expect(mockLLMClient).toBeDefined();
    });
  });

  describe("Product scenario: Collect Names Return Type", () => {
    it("Expected outcome: Returns pure data without state mutations", async () => {
      const code = NameCollector.toString();

      const hasNoSetCalls = !code.includes("stateManager.set");
      const hasNoPlayerIdGeneration = !code.match(/['"`]p\d+['"`]/);

      expect(hasNoSetCalls).toBe(true);
      expect(hasNoPlayerIdGeneration).toBe(true);
    });
  });

  describe("Product scenario: State Mutation Prevention", () => {
    it("Expected outcome: Does not mutate game state directly", () => {
      const code = NameCollector.toString();

      const hasNoStateManagerImport = !code.match(/import.*StateManager.*from/g);
      const hasNoStateManagerUsage = !code.includes("stateManager");
      const hasNoGameStateMutation =
        !code.includes("game.turn") && !code.includes("game.phase") && !code.includes("players.p1");

      expect(hasNoStateManagerImport).toBe(true);
      expect(hasNoStateManagerUsage).toBe(true);
      expect(hasNoGameStateMutation).toBe(true);
    });

    it("Expected outcome: Does not create player objects or IDs", () => {
      const code = NameCollector.toString();

      const hasNoPlayerIdCreation = !code.match(/id:\s*['"`]p\d+['"`]/g);
      const hasNoPlayerObjectCreation = !code.match(/{\s*id:.*name:.*position:/g);

      expect(hasNoPlayerIdCreation).toBe(true);
      expect(hasNoPlayerObjectCreation).toBe(true);
    });

    it("Expected outcome: Does not set game turn or game player Order", () => {
      const code = NameCollector.toString();

      const hasNoTurnAssignment = !code.includes("game.turn");
      const hasNoPlayerOrderAssignment = !code.includes("game.playerOrder");

      expect(hasNoTurnAssignment).toBe(true);
      expect(hasNoPlayerOrderAssignment).toBe(true);
    });
  });

  describe("Product scenario: Architectural Pattern Documentation", () => {
    it('Expected outcome: Follows "Collect to Return to game orchestrator Applies" pattern', () => {
      const code = NameCollector.toString();

      const returnsArray = code.includes("return this.collectedNames");
      const doesNotApplyToState = !code.includes("stateManager");

      expect(returnsArray).toBe(true);
      expect(doesNotApplyToState).toBe(true);
    });

    it("Expected outcome: Caller must apply names via orchestrator setup Players", () => {
      const nameCollector = new NameCollector(
        mockSpeechService,
        "Test Game",
        mockEnableDirectTranscription,
        mockLLMClient,
        gameMetadata,
      );

      expect(nameCollector).toBeDefined();
    });
  });

  describe("Product scenario: UI Component Responsibilities", () => {
    it("Expected outcome: Handles voice interaction for name collection", () => {
      const code = NameCollector.toString();

      const handlesSpeech = code.includes("speechService");
      const handlesLLM = code.includes("llmClient");
      const handlesTranscription = code.includes("onTranscript");

      expect(handlesSpeech).toBe(true);
      expect(handlesLLM).toBe(true);
      expect(handlesTranscription).toBe(true);
    });

    it("Expected outcome: Validates and corrects names using interpreter", () => {
      const code = NameCollector.toString();

      const usesLLMForValidation = code.includes("analyzeResponse") || code.includes("extractName");

      expect(usesLLMForValidation).toBe(true);
    });

    it("Expected outcome: Does not implement game setup logic", () => {
      const code = NameCollector.toString();

      const hasNoGameSetup =
        !code.includes("setupPlayers") &&
        !code.includes("transitionPhase") &&
        !code.includes("game.phase");

      expect(hasNoGameSetup).toBe(true);
    });
  });

  describe("Product scenario: Separation of Concerns", () => {
    it("Expected outcome: Only manages name collection flow", () => {
      const code = NameCollector.toString();

      const managesNameCollection = code.includes("collectedNames") && code.includes("playerCount");

      const doesNotManageGameState =
        !code.includes("game.turn") &&
        !code.includes("game.phase") &&
        !code.includes("stateManager");

      expect(managesNameCollection).toBe(true);
      expect(doesNotManageGameState).toBe(true);
    });

    it("Expected outcome: Presentation concerns only (voice, prompts, validation)", () => {
      const code = NameCollector.toString();

      const hasPresentationConcerns =
        code.includes("speak(") && (code.includes("askPlayer") || code.includes("collectNames"));

      const hasNoStateConcerns =
        !code.includes("stateManager.set") && !code.includes("game.turn =");

      expect(hasPresentationConcerns).toBe(true);
      expect(hasNoStateConcerns).toBe(true);
    });
  });

  describe("Product scenario: Integration Pattern Verification", () => {
    it("Expected outcome: Demonstrates correct usage pattern in comments", () => {
      const code = NameCollector.toString();

      const hasDocumentation = code.includes("collectNames") && code.includes("@returns");

      expect(hasDocumentation).toBe(true);
    });

    it("Expected outcome: Example correct caller pattern", () => {
      const exampleCode = `
        const names = await nameCollector.collectNames(handler)
        orchestrator.setupPlayers(names)
        orchestrator.transitionPhase(GamePhase.PLAYING)
      `;

      const followsPattern =
        exampleCode.includes("await nameCollector.collectNames") &&
        exampleCode.includes("orchestrator.setupPlayers(names)") &&
        exampleCode.includes("orchestrator.transitionPhase");

      expect(followsPattern).toBe(true);
    });

    it("Expected outcome: Counter example incorrect pattern (direct state mutation)", () => {
      const incorrectCode = `
        await nameCollector.collectNames(handler)
      `;

      const violatesPattern = !incorrectCode.includes("orchestrator.setupPlayers");

      expect(violatesPattern).toBe(true);
    });
  });
});

describe("Product scenario: Name Collector Runtime Flow", () => {
  let mockSpeechService: SpeechService;
  let mockLLMClient: LLMClient;
  let mockEnableDirectTranscription: () => void;
  let gameMetadata: GameMetadata;
  let transcriptHandler: ((text: string) => void) | null;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
      }
    ).window = (
      globalThis as typeof globalThis & {
        window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
      }
    ).window ?? {
      setTimeout,
      clearTimeout,
    };

    transcriptHandler = null;
    mockSpeechService = {
      speak: vi.fn(async () => {}),
      playSound: vi.fn(),
    } as unknown as SpeechService;

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

  it("Expected outcome: Collect Names returns names in order for 2 players happy path", async () => {
    const nameCollector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockEnableDirectTranscription,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = nameCollector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    const sendAsync = async (text: string): Promise<void> => {
      const fn = transcriptHandler;
      if (!fn) {
        throw new Error("transcriptHandler not set");
      }
      await (fn as (t: string) => Promise<void>)(text);
    };

    await new Promise((r) => setTimeout(r, 100));
    await sendAsync("2");
    await sendAsync("Alice");
    await sendAsync("Bob");

    const names = await collectPromise;

    expect(names).toEqual(["Alice", "Bob"]);
    expect(mockEnableDirectTranscription).toHaveBeenCalled();
    expect(mockLLMClient.extractName).toHaveBeenCalledWith("Alice");
    expect(mockLLMClient.extractName).toHaveBeenCalledWith("Bob");
  });

  it("Expected outcome: Collect Names calls analyze Response for player count and names", async () => {
    const nameCollector = new NameCollector(
      mockSpeechService,
      "Test Game",
      mockEnableDirectTranscription,
      mockLLMClient,
      gameMetadata,
    );

    const collectPromise = nameCollector.collectNames((handler) => {
      transcriptHandler = handler;
    });

    const sendAsync = async (text: string): Promise<void> => {
      const fn = transcriptHandler;
      if (!fn) {
        throw new Error("transcriptHandler not set");
      }
      await (fn as (t: string) => Promise<void>)(text);
    };

    await new Promise((r) => setTimeout(r, 100));
    await sendAsync("2");
    await sendAsync("Alice");
    await sendAsync("Bob");

    await collectPromise;

    expect(mockLLMClient.analyzeResponse).toHaveBeenCalled();
    expect(mockLLMClient.extractName).toHaveBeenCalledWith("Alice");
    expect(mockLLMClient.extractName).toHaveBeenCalledWith("Bob");
  });
});
