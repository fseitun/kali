import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterClient } from "./OpenRouterClient";
import { GamePhase } from "@/orchestrator/types";
import type { GameState } from "@/orchestrator/types";

vi.mock("../config", () => ({
  CONFIG: {
    LLM: { RETRY_DELAY_MS: 1500, REQUEST_TIMEOUT_MS: 20000 },
    OPENROUTER: {
      API_URL: "https://openrouter.ai/api/v1/chat/completions",
      API_KEY: "test-key",
      MODEL: "google/gemini-2.0-flash-001",
    },
  },
}));

describe("OpenRouterClient", () => {
  let client: OpenRouterClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockState: GameState;

  beforeEach(() => {
    client = new OpenRouterClient();
    client.setGameRules("Test game rules");
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractActions - markdown stripping", () => {
    it("parses markdown-wrapped JSON from getActions", async () => {
      const markdownResponse = '```json\n[{"action":"NARRATE","text":"Hi from OpenRouter"}]\n```';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: markdownResponse } }],
          }),
      });

      const actions = await client.getActions("test", mockState);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "NARRATE", text: "Hi from OpenRouter" });
    });

    it("parses pure JSON when no markdown present", async () => {
      const pureJson = '[{"action":"NARRATE","text":"Pure JSON works too"}]';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: pureJson } }],
          }),
      });

      const actions = await client.getActions("test", mockState);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ action: "NARRATE", text: "Pure JSON works too" });
    });
  });

  describe("makeApiCall - cache-friendly messages", () => {
    it("sends system + user messages when contextParts is provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '[{"action":"NARRATE","text":"OK"}]' } }],
          }),
      });

      await client.getActions("roll dice", mockState);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("Test game rules");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toContain("<user_command>");
      expect(body.messages[1].content).toContain("roll dice");
    });
  });
});
