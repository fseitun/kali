import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaClient } from "./OllamaClient";

// Mock CONFIG
vi.mock("../config", () => ({
  CONFIG: {
    LLM: { RETRY_DELAY_MS: 1500, REQUEST_TIMEOUT_MS: 20000 },
    OLLAMA: {
      API_URL: "http://localhost:11434/api/generate",
      MODEL: "llama2",
    },
  },
}));

describe("Product scenario: Ollama Client", () => {
  let client: OllamaClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new OllamaClient();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Product scenario: Make Api Call", () => {
    it("Expected outcome: Should make successful API call", async () => {
      const mockResponse = {
        message: {
          content: "Test response from Ollama",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.makeApiCall("Test prompt", {
        temperature: 0.7,
        maxTokens: 1000,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/generate",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama2",
            messages: [{ role: "user", content: "Test prompt" }],
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: 1000,
            },
          }),
        }),
      );

      expect(result).toEqual({ content: "Test response from Ollama" });
    });

    it("Expected outcome: Should use default temperature and max Tokens", async () => {
      const mockResponse = {
        message: {
          content: "Default response",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.makeApiCall("Test prompt", {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: "llama2",
            messages: [{ role: "user", content: "Test prompt" }],
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: 1024,
            },
          }),
        }),
      );
    });

    it("Expected outcome: Should handle API error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(client.makeApiCall("Test prompt", {})).rejects.toThrow(
        "Ollama API error: 500 Internal Server Error",
      );
    });

    it("Expected outcome: Should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      await expect(client.makeApiCall("Test prompt", {})).rejects.toThrow("Connection refused");
    });

    it("Expected outcome: Should handle empty response content", async () => {
      const mockResponse = {
        message: {
          content: "",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.makeApiCall("Test prompt", {});

      expect(result).toEqual({ content: "" });
    });

    it("Expected outcome: Should handle missing message", async () => {
      const mockResponse = {};

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.makeApiCall("Test prompt", {});

      expect(result).toEqual({ content: "" });
    });

    it("Expected outcome: Should handle missing content in message", async () => {
      const mockResponse = {
        message: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.makeApiCall("Test prompt", {});

      expect(result).toEqual({ content: "" });
    });

    it("Expected outcome: Should handle custom temperature and max Tokens", async () => {
      const mockResponse = {
        message: {
          content: "Custom response",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.makeApiCall("Test prompt", {
        temperature: 0.9,
        maxTokens: 2048,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: "llama2",
            messages: [{ role: "user", content: "Test prompt" }],
            stream: false,
            options: {
              temperature: 0.9,
              num_predict: 2048,
            },
          }),
        }),
      );
    });

    it("Expected outcome: Should handle timeout errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Request timeout"));

      await expect(client.makeApiCall("Test prompt", {})).rejects.toThrow("Request timeout");
    });

    it("Expected outcome: Should handle JSON parsing errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      await expect(client.makeApiCall("Test prompt", {})).rejects.toThrow("Invalid JSON");
    });

    it("Expected outcome: Should handle server unavailable", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(client.makeApiCall("Test prompt", {})).rejects.toThrow(
        "Ollama API error: 503 Service Unavailable",
      );
    });

    it("Expected outcome: Should handle model not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(client.makeApiCall("Test prompt", {})).rejects.toThrow(
        "Ollama API error: 404 Not Found",
      );
    });
  });
});
