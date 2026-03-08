import { CONFIG } from "../config";
import type { PrimitiveAction } from "../orchestrator/types";
import { Logger } from "../utils/logger";
import { BaseLLMClient } from "./BaseLLMClient";
import type { ApiCallOptions, ApiCallResult } from "./types";

/**
 * OpenRouter LLM client using the OpenAI-compatible chat completions API.
 * Supports many models via https://openrouter.ai
 *
 * OpenRouter models often return JSON wrapped in markdown code blocks (```json ... ```).
 * This client strips markdown before parsing.
 */
export class OpenRouterClient extends BaseLLMClient {
  protected override extractActions(content: string): PrimitiveAction[] {
    return super.extractActions(this.stripMarkdownIfPresent(content));
  }

  private stripMarkdownIfPresent(content: string): string {
    const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    return m ? m[1].trim() : content;
  }

  async makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult> {
    const response = await fetch(CONFIG.OPENROUTER.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.OPENROUTER.API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.OPENROUTER.MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.responseFormatJson && { response_format: { type: "json_object" } }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }

    const data = await response.json();

    // Validate response structure (OpenAI-compatible)
    if (!data || typeof data !== "object") {
      throw new Error("Invalid OpenRouter API response format");
    }

    const content = data.choices?.[0]?.message?.content ?? "";

    if (!content) {
      Logger.error("No content in OpenRouter response:", data);
    }

    return { content };
  }
}
