import { BaseLLMClient } from "./BaseLLMClient";
import { parseOpenAIResponse } from "./parse-openai-response";
import type { ApiCallOptions, ApiCallResult } from "./types";
import { CONFIG } from "@/config";

/**
 * Groq LLM client using the OpenAI-compatible chat completions API.
 */
export class GroqClient extends BaseLLMClient {
  async makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? CONFIG.LLM.REQUEST_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(CONFIG.GROQ.API_URL, {
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
          ...(options.responseFormatJson && { response_format: { type: "json_object" } }),
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
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    const content = parseOpenAIResponse(data, "Groq");
    return { content };
  }
}
