import { CONFIG } from "../config";
import { Logger } from "../utils/logger";
import { BaseLLMClient } from "./BaseLLMClient";
import type { ApiCallOptions, ApiCallResult } from "./types";

/**
 * Groq LLM client using the OpenAI-compatible chat completions API.
 */
export class GroqClient extends BaseLLMClient {
  async makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult> {
    const response = await fetch(CONFIG.GROQ.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.GROQ.API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.GROQ.MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();

    // Validate response structure (OpenAI-compatible)
    if (!data || typeof data !== "object") {
      throw new Error("Invalid Groq API response format");
    }

    const content = data.choices?.[0]?.message?.content ?? "";

    if (!content) {
      Logger.error("No content in Groq response:", data);
    }

    return { content };
  }
}
