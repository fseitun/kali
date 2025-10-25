import { CONFIG } from "../config";
import { BaseLLMClient } from "./BaseLLMClient";
import type { ApiCallOptions, ApiCallResult } from "./types";

/**
 * Ollama LLM client implementation that communicates with a local Ollama instance.
 */
export class OllamaClient extends BaseLLMClient {
  async makeApiCall(
    prompt: string,
    options: ApiCallOptions,
  ): Promise<ApiCallResult> {
    const response = await fetch(CONFIG.OLLAMA.API_URL, {
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
    });

    if (!response.ok) {
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}`,
      );
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
