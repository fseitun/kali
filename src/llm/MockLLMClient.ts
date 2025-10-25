import type { GameState, PrimitiveAction } from "../orchestrator/types";
import { Logger } from "../utils/logger";
import type { LLMClient } from "./LLMClient";

export type MockScenario =
  | "happy-path"
  | "invalid-actions"
  | "chaos"
  | "empty"
  | "custom"
  | "scripted";

/**
 * Mock LLM client for testing orchestrator validation without real LLM calls.
 * Returns predefined responses based on scenario to prove orchestrator supremacy.
 *
 * Scenarios:
 * - happy-path: Always returns valid actions
 * - invalid-actions: Returns structurally broken actions (missing fields, wrong types, etc.)
 * - chaos: Random mix of valid and invalid actions
 * - empty: Always returns empty arrays
 * - custom: Use provided custom responses
 * - scripted: Use scriptedResponses array in sequence (for integration tests)
 */
export class MockLLMClient implements LLMClient {
  private callCount = 0;
  private customResponses: string[];
  private scriptedResponses: PrimitiveAction[][];

  constructor(
    private scenario: MockScenario = "happy-path",
    customResponses: string[] = [],
    scriptedResponses: PrimitiveAction[][] = [],
  ) {
    this.customResponses = customResponses;
    this.scriptedResponses = scriptedResponses;
    Logger.info(`MockLLMClient initialized with scenario: ${scenario}`);
  }

  setGameRules(_rules: string): void {
    Logger.info("MockLLMClient: Game rules set (ignored)");
  }

  async getActions(
    transcript: string,
    state: GameState,
  ): Promise<PrimitiveAction[]> {
    this.callCount++;
    Logger.info(`MockLLMClient call #${this.callCount}: "${transcript}"`);
    Logger.debug("Current state:", state);

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
    Logger.info(
      `MockLLMClient.analyzeResponse: "${transcript}" (context: ${expectedContext})`,
    );

    // Simple heuristic: if transcript mentions help, emergency, hurt, etc., flag it
    const urgentKeywords = [
      "help",
      "emergency",
      "hurt",
      "injured",
      "stop",
      "quit",
    ];
    const isUrgent = urgentKeywords.some((keyword) =>
      transcript.toLowerCase().includes(keyword),
    );

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

      case "invalid-actions":
        return this.getInvalidActionsResponse();

      case "chaos":
        return this.getChaosResponse();

      case "empty":
        return [];

      case "custom":
        return this.getCustomResponse();

      case "scripted":
        return this.getScriptedResponse();

      default:
        Logger.warn(`Unknown scenario: ${this.scenario}, using empty response`);
        return [];
    }
  }

  private getScriptedResponse(): PrimitiveAction[] {
    if (this.scriptedResponses.length === 0) {
      Logger.warn(
        "Scripted scenario selected but no scripted responses provided",
      );
      return [];
    }

    const index = Math.min(
      this.callCount - 1,
      this.scriptedResponses.length - 1,
    );
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

  private getInvalidActionsResponse(): PrimitiveAction[] {
    const invalidResponses: unknown[][] = [
      // Wrong action types
      [{ action: "INVALID_ACTION", foo: "bar" }],
      [{ action: "ADD_STATE", path: "test", value: 5 }], // OLD action type
      [{ action: "ROLL_DICE", die: "d6" }], // OLD action type

      // Missing required fields
      [{ action: "SET_STATE" }], // missing path and value
      [{ action: "SET_STATE", path: "test" }], // missing value
      [{ action: "NARRATE" }], // missing text
      [{ action: "PLAYER_ROLLED" }], // missing value
      [{ action: "PLAYER_ANSWERED" }], // missing answer

      // Wrong field types
      [{ action: "SET_STATE", path: 123, value: "test" }], // path should be string
      [{ action: "NARRATE", text: 123 }], // text should be string
      [{ action: "PLAYER_ROLLED", value: "not-a-number" }], // value should be number
      [{ action: "PLAYER_ANSWERED", answer: 123 }], // answer should be string

      // Invalid values
      [{ action: "SET_STATE", path: "", value: "test" }], // empty path
      [{ action: "PLAYER_ROLLED", value: 0 }], // value must be positive
      [{ action: "PLAYER_ROLLED", value: -5 }], // value must be positive
      [{ action: "PLAYER_ANSWERED", answer: "" }], // empty answer

      // Extra unexpected fields (should be tolerated by orchestrator)
      [{ action: "NARRATE", text: "Hello", extraField: "unexpected" }],

      // Completely malformed objects
      [{}], // empty object - no action field
      [{ foo: "bar", baz: "qux" }], // no action field
      [{ action: null }], // null action
      [{ action: "" }], // empty string action

      // Multiple actions with some invalid
      [
        { action: "NARRATE", text: "Valid first" },
        { action: "INVALID_TYPE" }, // invalid
        { action: "NARRATE", text: "Valid third" },
      ],
    ];

    const index = this.callCount % invalidResponses.length;
    return invalidResponses[index] as PrimitiveAction[];
  }

  private getChaosResponse(): PrimitiveAction[] {
    // Truly random mix - orchestrator must handle anything
    const chaosResponses: unknown[][] = [
      // Valid
      [{ action: "NARRATE", text: "Chaos mode active!" }],
      // Invalid action type
      [{ action: "CHAOS_ACTION", data: "random" }],
      [{ action: "ADD_STATE", path: "test", value: 5 }], // OLD action
      // Missing fields
      [{ action: "SET_STATE" }],
      [{ action: "PLAYER_ROLLED" }],
      // Multiple actions, some valid, some invalid
      [
        { action: "NARRATE", text: "First is valid" },
        { action: "INVALID" },
        { action: "NARRATE", text: "Third is valid too" },
      ],
      // Empty object
      [{}],
      // Empty array
      [],
      // Wrong types
      [{ action: "PLAYER_ROLLED", value: "not-a-number" }],
      [{ action: "PLAYER_ANSWERED", answer: 123 }],
      // Valid actions
      [{ action: "SET_STATE", path: "test.value", value: 42 }],
      [{ action: "PLAYER_ROLLED", value: 5 }],
      // Null action
      [{ action: null }],
      // Multiple valid actions
      [
        { action: "NARRATE", text: "All valid here" },
        { action: "PLAYER_ROLLED", value: this.callCount },
      ],
      // Missing fields
      [{ action: "NARRATE" }],
      // Valid with sound effect
      [{ action: "NARRATE", text: "With sound!", soundEffect: "test_sound" }],
      // Invalid values
      [{ action: "PLAYER_ROLLED", value: 0 }],
      [{ action: "PLAYER_ANSWERED", answer: "" }],
      // Valid reset
      [{ action: "RESET_GAME", keepPlayerNames: true }],
    ];

    const index = this.callCount % chaosResponses.length;
    return chaosResponses[index] as PrimitiveAction[];
  }

  private getCustomResponse(): PrimitiveAction[] {
    if (this.customResponses.length === 0) {
      Logger.warn("Custom scenario selected but no custom responses provided");
      return [];
    }

    const index = Math.min(this.callCount - 1, this.customResponses.length - 1);
    const responseString = this.customResponses[index];

    try {
      return JSON.parse(responseString);
    } catch (error) {
      Logger.error("Failed to parse custom response:", error);
      return [];
    }
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
