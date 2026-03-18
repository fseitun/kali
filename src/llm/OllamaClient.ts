import { CONFIG } from "../config";
import { BaseLLMClient } from "./BaseLLMClient";
import type { ApiCallOptions, ApiCallResult } from "./types";

/**
 * Ollama LLM client implementation that communicates with a local Ollama instance.
 */
export class OllamaClient extends BaseLLMClient {
  async makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? CONFIG.LLM.REQUEST_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(CONFIG.OLLAMA.API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CONFIG.OLLAMA.MODEL,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 1024,
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Request timeout", { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data || typeof data !== "object") {
      throw new Error("Invalid Ollama API response format");
    }

    const content = data.message?.content ?? "";

    return { content };
  }
}
