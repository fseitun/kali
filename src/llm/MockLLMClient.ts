import type { GameState, PrimitiveAction } from "../orchestrator/types";
import { Logger } from "../utils/logger";
import type { LLMClient } from "./LLMClient";

export type MockScenario = "happy-path" | "scripted";

/**
 * Mock LLM client for development (no API key) and tests.
 * - happy-path: Returns valid actions for local demo
 * - scripted: Uses scriptedResponses array in sequence (integration/E2E tests)
 */
export class MockLLMClient implements LLMClient {
  private callCount = 0;
  private scriptedResponses: PrimitiveAction[][];

  constructor(
    private scenario: MockScenario = "happy-path",
    scriptedResponses: PrimitiveAction[][] = [],
  ) {
    this.scriptedResponses = scriptedResponses;
    Logger.info(`MockLLMClient initialized with scenario: ${scenario}`);
  }

  setGameRules(_rules: string): void {
    Logger.info("MockLLMClient: Game rules set (ignored)");
  }

  async getActions(transcript: string, state: GameState): Promise<PrimitiveAction[]> {
    this.callCount++;
    Logger.info(`MockLLMClient call #${this.callCount}: "${transcript}"`);
    Logger.state("Current state:", state);

    // Small delay to simulate network/processing (skip for scripted to speed up tests)
    if (this.scenario !== "scripted") {
      await this.sleep(100);
    }

    const response = this.getResponseForScenario();
    Logger.info(`MockLLMClient response:`, response);

    return response;
  }

  async extractName(transcript: string): Promise<string | null> {
    Logger.info(`MockLLMClient.extractName: "${transcript}"`);

    // Simple pattern matching for common name phrases
    const patterns = [
      /(?:call me|my name is|llámame|me llamo|i am|soy)\s+(\w+)/i,
      /^(\w+)$/i, // Just a single word
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    // Default test names based on call count
    const defaultNames = ["Alice", "Bob", "Charlie", "Diana"];
    return defaultNames[this.callCount % defaultNames.length] || "Player";
  }

  async analyzeResponse(
    transcript: string,
    expectedContext: string,
  ): Promise<{ isOnTopic: boolean; urgentMessage?: string }> {
    Logger.info(`MockLLMClient.analyzeResponse: "${transcript}" (context: ${expectedContext})`);

    // Simple heuristic: if transcript mentions help, emergency, hurt, etc., flag it
    const urgentKeywords = ["help", "emergency", "hurt", "injured", "stop", "quit"];
    const isUrgent = urgentKeywords.some((keyword) => transcript.toLowerCase().includes(keyword));

    if (isUrgent) {
      return {
        isOnTopic: false,
        urgentMessage: `User needs attention: ${transcript}`,
      };
    }

    return { isOnTopic: true };
  }

  private getResponseForScenario(): PrimitiveAction[] {
    switch (this.scenario) {
      case "happy-path":
        return this.getHappyPathResponse();
      case "scripted":
        return this.getScriptedResponse();
      default:
        Logger.warn(`Unknown scenario: ${this.scenario}, using empty response`);
        return [];
    }
  }

  private getScriptedResponse(): PrimitiveAction[] {
    if (this.scriptedResponses.length === 0) {
      Logger.warn("Scripted scenario selected but no scripted responses provided");
      return [];
    }

    const index = Math.min(this.callCount - 1, this.scriptedResponses.length - 1);
    return this.scriptedResponses[index];
  }

  private getHappyPathResponse(): PrimitiveAction[] {
    const responses: PrimitiveAction[][] = [
      // Call 1: Welcome
      [
        {
          action: "NARRATE",
          text: "Welcome! Ready to play.",
        },
      ],
      // Call 2: User says "I rolled a 3"
      [
        {
          action: "PLAYER_ROLLED",
          value: 3,
        },
        {
          action: "NARRATE",
          text: "Moving 3 spaces!",
        },
      ],
      // Call 3: Orchestrator may inject square effect - respond with encounter
      [
        {
          action: "NARRATE",
          text: "You encountered an animal! Fight or flee?",
        },
      ],
      // Call 4: User answers "fight"
      [
        {
          action: "PLAYER_ANSWERED",
          answer: "fight",
        },
        {
          action: "NARRATE",
          text: "You chose to fight!",
        },
      ],
      // Call 5+: Generic continuation
      [
        {
          action: "NARRATE",
          text: "What would you like to do?",
        },
      ],
    ];

    const index = Math.min(this.callCount - 1, responses.length - 1);
    return responses[index];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset the call counter (useful for testing)
   */
  reset(): void {
    this.callCount = 0;
    Logger.info("MockLLMClient: Call counter reset");
  }

  /**
   * Get current call count (useful for testing)
   */
  getCallCount(): number {
    return this.callCount;
  }
}
