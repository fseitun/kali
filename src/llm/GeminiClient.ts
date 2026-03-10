import { CONFIG } from "../config";
import { Logger } from "../utils/logger";
import { BaseLLMClient } from "./BaseLLMClient";
import type { ApiCallOptions, ApiCallResult } from "./types";

const CACHE_TTL_SECONDS = 3600; // 1 hour

export class GeminiClient extends BaseLLMClient {
  private cachedContentName: string | null = null;

  setGameRules(rules: string): void {
    super.setGameRules(rules);
    this.createCache().catch((err) => {
      Logger.warn("Gemini cache creation failed, using uncached requests:", err);
    });
  }

  private async createCache(): Promise<void> {
    if (!this.systemPrompt || this.systemPrompt.length < 1024) {
      return; // Gemini requires min 1024 tokens for caching (Flash)
    }
    const url = `${CONFIG.GEMINI.CACHED_CONTENTS_URL}?key=${CONFIG.GEMINI.API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.GEMINI.MODEL,
        systemInstruction: { parts: [{ text: this.systemPrompt }] },
        ttlSeconds: CACHE_TTL_SECONDS,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini cachedContents error: ${response.status} ${text}`);
    }
    const data = (await response.json()) as { name?: string };
    if (data.name) {
      this.cachedContentName = data.name;
      Logger.info("Gemini prompt cache created:", data.name);
    }
  }

  async makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult> {
    const parts = options.contextParts;
    const useCache = parts && this.cachedContentName && parts.systemPrompt === this.systemPrompt;

    if (useCache) {
      return this.generateWithCache(parts.userMessage, options);
    }
    return this.generateUncached(prompt, options);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.LLM.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Request timeout", { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async generateWithCache(
    userMessage: string,
    options: ApiCallOptions,
  ): Promise<ApiCallResult> {
    const response = await this.fetchWithTimeout(CONFIG.GEMINI.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": CONFIG.GEMINI.API_KEY,
      },
      body: JSON.stringify({
        cachedContent: this.cachedContentName,
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 512,
        },
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}\n${errorText}`);
    }
    const data = await response.json();
    if (!data || typeof data !== "object") {
      throw new Error("Invalid Gemini API response format");
    }
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!content) {
      Logger.error("No content in Gemini response:", data);
    }
    return { content };
  }

  private async generateUncached(prompt: string, options: ApiCallOptions): Promise<ApiCallResult> {
    const response = await this.fetchWithTimeout(CONFIG.GEMINI.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": CONFIG.GEMINI.API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 512,
        },
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}\n${errorText}`);
    }
    const data = await response.json();
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
