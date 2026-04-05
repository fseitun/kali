import { describe, it, expect, beforeEach, vi } from "vitest";
import { BaseLLMClient } from "./BaseLLMClient";
import { GamePhase } from "@/orchestrator/types";
import type { GameState, PrimitiveAction } from "@/orchestrator/types";

class TestLLMClient extends BaseLLMClient {
  public responseQueue: string[] = [];
  public callCount = 0;
  public throwOnFirstCall?: Error;
  /** Last prompt passed to makeApiCall (for assertions). */
  public lastPrompt = "";

  async makeApiCall(prompt: string): Promise<{ content: string }> {
    this.lastPrompt = prompt;
    this.callCount++;
    if (this.callCount === 1 && this.throwOnFirstCall) {
      const err = this.throwOnFirstCall;
      this.throwOnFirstCall = undefined;
      throw err;
    }
    const response = this.responseQueue.shift() ?? "[]";
    return { content: response };
  }

  // Expose protected method for testing
  public testExtractActions(content: string): PrimitiveAction[] {
    return this.extractActions(content);
  }
}

describe("Product scenario: Interpreter Pure JSON Parsing", () => {
  let client: TestLLMClient;
  let mockState: GameState;

  beforeEach(() => {
    client = new TestLLMClient();
    client.setGameRules("Test game rules");

    mockState = {
      game: {
        name: "Test Game",
        turn: "p1",
        phase: GamePhase.PLAYING,
        playerOrder: ["p1"],
        winner: null,
      },
      players: {
        p1: {
          id: "p1",
          name: "Player 1",
          position: 0,
        },
      },
    };
  });

  describe("Product scenario: Extract Actions", () => {
    it("Expected outcome: Parses valid JSON array", () => {
      const json = '[{"action":"NARRATE","text":"Hello"}]';
      const actions = client.testExtractActions(json);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "NARRATE", text: "Hello" });
    });

    it("Expected outcome: Handles empty array", () => {
      const json = "[]";
      const actions = client.testExtractActions(json);

      expect(actions).toHaveLength(0);
    });

    it("Expected outcome: Parses multiple actions", () => {
      const json = '[{"action":"PLAYER_ROLLED","value":5},{"action":"NARRATE","text":"Moved!"}]';
      const actions = client.testExtractActions(json);

      expect(actions).toHaveLength(2);
      expect(actions[0]).toEqual({ action: "PLAYER_ROLLED", value: 5 });
      expect(actions[1]).toEqual({ action: "NARRATE", text: "Moved!" });
    });

    it("Expected outcome: Coerces PLAYER ANSWERED numeric answer to string", () => {
      const json = '[{"action":"PLAYER_ANSWERED","answer":8}]';
      const actions = client.testExtractActions(json);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "PLAYER_ANSWERED", answer: "8" });
    });

    it("Expected outcome: Rejects markdown wrapped JSON", () => {
      const markdown = '```json\n[{"action":"NARRATE","text":"Hi"}]\n```';

      expect(() => client.testExtractActions(markdown)).toThrow("Invalid JSON");
    });

    it("Expected outcome: Rejects malformed JSON", () => {
      const invalid = '[{"action":"NARRATE","text":"Hi}]';

      expect(() => client.testExtractActions(invalid)).toThrow("Invalid JSON");
    });

    it("Expected outcome: Rejects non array response", () => {
      const notArray = '{"action":"NARRATE","text":"Hi"}';

      expect(() => client.testExtractActions(notArray)).toThrow("Expected array, got object");
    });

    it("Expected outcome: Coalesces two newline separated root objects into an action array", () => {
      const ndjson =
        '{"action":"ASK_RIDDLE","text":"q","options":["a","b","c","d"],"correctOption":"a"}\n{"action":"NARRATE","text":"Asked."}';
      const actions = client.testExtractActions(ndjson);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe("ASK_RIDDLE");
      expect(actions[1]).toEqual({ action: "NARRATE", text: "Asked." });
    });

    it("Expected outcome: Coalesces NDJSON when first NARRATE text contains escaped newline", () => {
      const ndjson = '{"action":"NARRATE","text":"a\\nb"}\n{"action":"PLAYER_ROLLED","value":4}';
      const actions = client.testExtractActions(ndjson);

      expect(actions).toHaveLength(2);
      expect((actions[0] as { text: string }).text).toBe("a\nb");
      expect(actions[1]).toEqual({ action: "PLAYER_ROLLED", value: 4 });
    });
  });

  describe("Product scenario: Get Actions with retry", () => {
    it("Expected outcome: Returns actions on first successful parse", async () => {
      client.responseQueue = ['[{"action":"NARRATE","text":"Hi"}]'];

      const actions = await client.getActions("test", mockState);

      expect(client.callCount).toBe(1);
      expect(actions).toHaveLength(1);
    });

    it("Expected outcome: Retries once on parse error", async () => {
      client.responseQueue = ["invalid json{", '[{"action":"NARRATE","text":"Retry success"}]'];

      const actions = await client.getActions("test", mockState);

      expect(client.callCount).toBe(2);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "NARRATE", text: "Retry success" });
    });

    it("Expected outcome: Returns empty array after retry failure", async () => {
      client.responseQueue = ["invalid json{", "still invalid{"];

      const actions = await client.getActions("test", mockState);

      expect(client.callCount).toBe(2);
      expect(actions).toHaveLength(0);
    });

    it("Expected outcome: Handles empty response from interpreter", async () => {
      client.responseQueue = ["[]"];

      const actions = await client.getActions("test", mockState);

      expect(client.callCount).toBe(1);
      expect(actions).toHaveLength(0);
    });

    it("Expected outcome: Delays before retry for transient errors (429)", async () => {
      vi.useFakeTimers();
      client.throwOnFirstCall = new Error(
        'DeepInfra API error: 429 Too Many Requests\n{"error":{"message":"Model busy, retry later"}}',
      );
      client.responseQueue = ['[{"action":"NARRATE","text":"Retry ok"}]'];

      const promise = client.getActions("test", mockState);
      await vi.runAllTimersAsync();
      const actions = await promise;

      expect(client.callCount).toBe(2);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "NARRATE", text: "Retry ok" });
      vi.useRealTimers();
    });

    it("Expected outcome: No delay before retry for non transient errors", async () => {
      vi.useFakeTimers();
      client.throwOnFirstCall = new Error("Invalid JSON: Unexpected token");
      client.responseQueue = ['[{"action":"NARRATE","text":"Retry ok"}]'];

      const start = Date.now();
      const promise = client.getActions("test", mockState);
      await vi.runAllTimersAsync();
      const actions = await promise;
      const elapsed = Date.now() - start;

      expect(client.callCount).toBe(2);
      expect(actions).toHaveLength(1);
      expect(elapsed).toBe(0);
      vi.useRealTimers();
    });
  });

  describe("Product scenario: Interpreter Client is Pure Interface No Game Logic", () => {
    it("Expected outcome: Extract Actions parses JSON and normalizes PLAYER ANSWERED numeric answer only", () => {
      const invalidAction = '[{"action":"INVALID_TYPE","data":"something"}]';
      const actions = client.testExtractActions(invalidAction);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "INVALID_TYPE", data: "something" });
    });

    it("Expected outcome: Extract Actions accepts malformed action structure", () => {
      const weirdAction = '[{"notAnAction":true,"randomStuff":123}]';
      const actions = client.testExtractActions(weirdAction);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ notAnAction: true, randomStuff: 123 });
    });

    it("Expected outcome: Get Actions passes state context without interpreting it", async () => {
      (mockState.game as Record<string, unknown>).phase = "FINISHED";
      (mockState.game as Record<string, unknown>).winner = "p1";

      client.responseQueue = ['[{"action":"NARRATE","text":"Hi"}]'];

      const actions = await client.getActions("test", mockState);

      expect(actions).toHaveLength(1);
      expect(client.callCount).toBe(1);
    });

    it("Expected outcome: Get Actions includes last Bot Utterance in prompt when provided", async () => {
      client.responseQueue = ['[{"action":"PLAYER_ROLLED","value":3}]'];

      await client.getActions("sí", mockState, "¿Tiraste un 3, Federico?");

      expect(client.lastPrompt).toContain("<last_utterance>");
      expect(client.lastPrompt).toContain("¿Tiraste un 3, Federico?");
      expect(client.lastPrompt).toContain("</last_utterance>");
      expect(client.lastPrompt).toContain("<user_command>");
      expect(client.lastPrompt).toContain("sí");
      expect(client.lastPrompt).toContain("</user_command>");
    });

    it("Expected outcome: Get Actions omits last Bot Utterance line when not provided", async () => {
      client.responseQueue = ['[{"action":"NARRATE","text":"Hi"}]'];

      await client.getActions("hello", mockState);

      expect(client.lastPrompt).not.toContain("<last_utterance>");
      expect(client.lastPrompt).toContain("<game_state>");
      expect(client.lastPrompt).toContain("<user_command>");
      expect(client.lastPrompt).toContain("hello");
    });

    it("Expected outcome: Retry logic uses same state (no mutation)", async () => {
      const originalState = { ...mockState };

      client.responseQueue = ["invalid", '[{"action":"NARRATE","text":"Retry"}]'];

      await client.getActions("test", mockState);

      expect(mockState).toEqual(originalState);
    });

    it("Expected outcome: Deduplication is string based only, no logic", async () => {
      client.responseQueue = [
        '[{"action":"NARRATE","text":"First"}]',
        '[{"action":"NARRATE","text":"Second"}]',
      ];

      await client.getActions("same command", mockState);
      await client.getActions("same command", mockState);

      expect(client.callCount).toBe(1);
    });

    it("Expected outcome: Does not validate turn ownership (orchestrator job)", async () => {
      (mockState.game as Record<string, unknown>).turn = "p1";

      client.responseQueue = ['[{"action":"SET_STATE","path":"players.p2.position","value":99}]'];

      const actions = await client.getActions("modify wrong player", mockState);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        action: "SET_STATE",
        path: "players.p2.position",
        value: 99,
      });
    });

    it("Expected outcome: Does not validate paths (orchestrator job)", async () => {
      client.responseQueue = ['[{"action":"SET_STATE","path":"nonexistent.path","value":1}]'];

      const actions = await client.getActions("invalid path", mockState);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        action: "SET_STATE",
        path: "nonexistent.path",
        value: 1,
      });
    });

    it("Expected outcome: Does not validate action field types (orchestrator job)", async () => {
      client.responseQueue = ['[{"action":"PLAYER_ROLLED","value":"not a number"}]'];

      const actions = await client.getActions("invalid type", mockState);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        action: "PLAYER_ROLLED",
        value: "not a number",
      });
    });

    it("Expected outcome: Does not validate required fields (orchestrator job)", async () => {
      client.responseQueue = ['[{"action":"NARRATE"}]'];

      const actions = await client.getActions("missing field", mockState);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "NARRATE" });
    });

    it("Expected outcome: Propagates parsing errors for orchestrator to handle", async () => {
      client.responseQueue = ["not valid json at all", "still not valid json"];

      const actions = await client.getActions("bad json", mockState);

      expect(actions).toHaveLength(0);
      expect(client.callCount).toBe(2);
    });
  });

  describe("Product scenario: Interpreter Response Format Handling", () => {
    it("Expected outcome: Successfully parses all valid primitive action types", () => {
      const json = `[
        {"action":"NARRATE","text":"Hi"},
        {"action":"SET_STATE","path":"game.phase","value":"PLAYING"},
        {"action":"PLAYER_ROLLED","value":6},
        {"action":"PLAYER_ANSWERED","answer":"A"},
        {"action":"RESET_GAME","keepPlayerNames":true}
      ]`;

      const actions = client.testExtractActions(json);

      expect(actions).toHaveLength(5);
      expect(actions[0].action).toBe("NARRATE");
      expect(actions[1].action).toBe("SET_STATE");
      expect(actions[2].action).toBe("PLAYER_ROLLED");
      expect(actions[3].action).toBe("PLAYER_ANSWERED");
      expect(actions[4].action).toBe("RESET_GAME");
    });

    it("Expected outcome: Parses actions with optional fields", () => {
      const json = '[{"action":"NARRATE","text":"Hi","soundEffect":"chime.mp3"}]';
      const actions = client.testExtractActions(json);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        action: "NARRATE",
        text: "Hi",
        soundEffect: "chime.mp3",
      });
    });

    it("Expected outcome: Parses actions with complex value types", () => {
      const json =
        '[{"action":"SET_STATE","path":"players.p1.inventory","value":{"gold":100,"items":["sword","shield"]}}]';
      const actions = client.testExtractActions(json);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        action: "SET_STATE",
        path: "players.p1.inventory",
        value: { gold: 100, items: ["sword", "shield"] },
      });
    });

    it("Expected outcome: Rejects markdown code blocks (must be pure JSON)", () => {
      const markdown = '```json\n[{"action":"NARRATE","text":"Hi"}]\n```';

      expect(() => client.testExtractActions(markdown)).toThrow("Invalid JSON");
    });

    it("Expected outcome: Rejects explanatory text before JSON", () => {
      const withText = 'Here are the actions:\n[{"action":"NARRATE","text":"Hi"}]';

      expect(() => client.testExtractActions(withText)).toThrow("Invalid JSON");
    });

    it("Expected outcome: Rejects explanatory text after JSON", () => {
      const withText = '[{"action":"NARRATE","text":"Hi"}]\nThose are the actions';

      expect(() => client.testExtractActions(withText)).toThrow("Invalid JSON");
    });
  });
});
