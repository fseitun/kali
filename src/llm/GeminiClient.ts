import { CONFIG } from "../config";
import { Logger } from "../utils/logger";
import { BaseLLMClient } from "./BaseLLMClient";
import type { ApiCallOptions, ApiCallResult } from "./types";

export class GeminiClient extends BaseLLMClient {
  async makeApiCall(
    prompt: string,
    options: ApiCallOptions,
  ): Promise<ApiCallResult> {
    const response = await fetch(CONFIG.GEMINI.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": CONFIG.GEMINI.API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }

    const data = await response.json();

    // Validate response structure
    if (!data || typeof data !== "object") {
      throw new Error("Invalid Gemini API response format");
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!content) {
      Logger.error("No content in Gemini response:", data);
    }

    return { content };
  }
}
