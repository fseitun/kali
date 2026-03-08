import { CONFIG } from "../config";
import type { PrimitiveAction } from "../orchestrator/types";
import { Logger } from "../utils/logger";
import { BaseLLMClient } from "./BaseLLMClient";
import type { ApiCallOptions, ApiCallResult } from "./types";

/**
 * DeepInfra LLM client using the OpenAI-compatible chat completions API.
 * Supports many models via https://deepinfra.com
 *
 * Uses system + user messages when contextParts is present so the system prompt
 * is byte-identical across requests and DeepInfra can apply cached-input pricing.
 * Some models return JSON wrapped in markdown code blocks; this client strips them.
 */
export class DeepInfraClient extends BaseLLMClient {
  protected override extractActions(content: string): PrimitiveAction[] {
    return super.extractActions(this.stripMarkdownIfPresent(content));
  }

  private stripMarkdownIfPresent(content: string): string {
    const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    return m ? m[1].trim() : content;
  }

  async makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult> {
    const messages =
      options.contextParts != null
        ? [
            { role: "system" as const, content: options.contextParts.systemPrompt },
            { role: "user" as const, content: options.contextParts.userMessage },
          ]
        : [{ role: "user" as const, content: prompt }];

    const response = await fetch(CONFIG.DEEPINFRA.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.DEEPINFRA.API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.DEEPINFRA.MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.responseFormatJson && { response_format: { type: "json_object" } }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DeepInfra API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }

    const data = await response.json();

    if (!data || typeof data !== "object") {
      throw new Error("Invalid DeepInfra API response format");
    }

    const content = data.choices?.[0]?.message?.content ?? "";

    if (!content) {
      Logger.error("No content in DeepInfra response:", data);
    }

    return { content };
  }
}
