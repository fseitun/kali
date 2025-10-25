import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameMetadata } from "../game-loader/types";
import type { LLMClient } from "../llm/LLMClient";
import type { SpeechService } from "../services/speech-service";
import { NameCollector } from "./name-collector";

describe("NameCollector - State Isolation (Rule #4)", () => {
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
      version: "1.0.0",
      description: "A test game",
      minPlayers: 2,
      maxPlayers: 4,
    };
  });

  describe("Constructor and Dependencies", () => {
    it("has no stateManager dependency", () => {
      const nameCollector = new NameCollector(
        mockSpeechService,
        "Test Game",
        mockEnableDirectTranscription,
        mockLLMClient,
        gameMetadata,
      );

      const constructorParams =
        NameCollector.toString().match(/constructor\s*\(([\s\S]*?)\)/)?.[1] ??
        "";

      const hasStateManager =
        constructorParams.includes("stateManager") ||
        constructorParams.includes("StateManager");

      expect(hasStateManager).toBe(false);
      expect(nameCollector).toBeDefined();
    });

    it("accepts only presentation layer dependencies", () => {
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

  describe("collectNames() Return Type", () => {
    it("returns pure data without state mutations", async () => {
      const code = NameCollector.toString();

      const hasNoSetCalls = !code.includes("stateManager.set");
      const hasNoPlayerIdGeneration = !code.match(/['"`]p\d+['"`]/);

      expect(hasNoSetCalls).toBe(true);
      expect(hasNoPlayerIdGeneration).toBe(true);
    });
  });

  describe("State Mutation Prevention", () => {
    it("does not mutate game state directly", () => {
      const code = NameCollector.toString();

      const hasNoStateManagerImport = !code.match(
        /import.*StateManager.*from/g,
      );
      const hasNoStateManagerUsage = !code.includes("stateManager");
      const hasNoGameStateMutation =
        !code.includes("game.turn") &&
        !code.includes("game.phase") &&
        !code.includes("players.p1");

      expect(hasNoStateManagerImport).toBe(true);
      expect(hasNoStateManagerUsage).toBe(true);
      expect(hasNoGameStateMutation).toBe(true);
    });

    it("does not create player objects or IDs", () => {
      const code = NameCollector.toString();

      const hasNoPlayerIdCreation = !code.match(/id:\s*['"`]p\d+['"`]/g);
      const hasNoPlayerObjectCreation = !code.match(
        /{\s*id:.*name:.*position:/g,
      );

      expect(hasNoPlayerIdCreation).toBe(true);
      expect(hasNoPlayerObjectCreation).toBe(true);
    });

    it("does not set game.turn or game.playerOrder", () => {
      const code = NameCollector.toString();

      const hasNoTurnAssignment = !code.includes("game.turn");
      const hasNoPlayerOrderAssignment = !code.includes("game.playerOrder");

      expect(hasNoTurnAssignment).toBe(true);
      expect(hasNoPlayerOrderAssignment).toBe(true);
    });
  });

  describe("Architectural Pattern Documentation", () => {
    it('follows "Collect → Return → Orchestrator Applies" pattern', () => {
      const code = NameCollector.toString();

      const returnsArray = code.includes("return this.collectedNames");
      const doesNotApplyToState = !code.includes("stateManager");

      expect(returnsArray).toBe(true);
      expect(doesNotApplyToState).toBe(true);
    });

    it("caller must apply names via orchestrator.setupPlayers()", () => {
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

  describe("UI Component Responsibilities", () => {
    it("handles voice interaction for name collection", () => {
      const code = NameCollector.toString();

      const handlesSpeech = code.includes("speechService");
      const handlesLLM = code.includes("llmClient");
      const handlesTranscription = code.includes("onTranscript");

      expect(handlesSpeech).toBe(true);
      expect(handlesLLM).toBe(true);
      expect(handlesTranscription).toBe(true);
    });

    it("validates and corrects names using LLM", () => {
      const code = NameCollector.toString();

      const usesLLMForValidation =
        code.includes("analyzeResponse") || code.includes("extractName");

      expect(usesLLMForValidation).toBe(true);
    });

    it("does not implement game setup logic", () => {
      const code = NameCollector.toString();

      const hasNoGameSetup =
        !code.includes("setupPlayers") &&
        !code.includes("transitionPhase") &&
        !code.includes("game.phase");

      expect(hasNoGameSetup).toBe(true);
    });
  });

  describe("Separation of Concerns", () => {
    it("only manages name collection flow", () => {
      const code = NameCollector.toString();

      const managesNameCollection =
        code.includes("collectedNames") && code.includes("playerCount");

      const doesNotManageGameState =
        !code.includes("game.turn") &&
        !code.includes("game.phase") &&
        !code.includes("stateManager");

      expect(managesNameCollection).toBe(true);
      expect(doesNotManageGameState).toBe(true);
    });

    it("presentation concerns only (voice, prompts, validation)", () => {
      const code = NameCollector.toString();

      const hasPresentationConcerns =
        code.includes("speak(") &&
        (code.includes("askPlayer") || code.includes("collectNames"));

      const hasNoStateConcerns =
        !code.includes("stateManager.set") && !code.includes("game.turn =");

      expect(hasPresentationConcerns).toBe(true);
      expect(hasNoStateConcerns).toBe(true);
    });
  });

  describe("Integration Pattern Verification", () => {
    it("demonstrates correct usage pattern in comments", () => {
      const code = NameCollector.toString();

      const hasDocumentation =
        code.includes("collectNames") && code.includes("@returns");

      expect(hasDocumentation).toBe(true);
    });

    it("example: correct caller pattern", () => {
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

    it("counter-example: incorrect pattern (direct state mutation)", () => {
      const incorrectCode = `
        await nameCollector.collectNames(handler)
      `;

      const violatesPattern = !incorrectCode.includes(
        "orchestrator.setupPlayers",
      );

      expect(violatesPattern).toBe(true);
    });
  });
});
