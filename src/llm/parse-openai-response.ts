import { Logger } from "@/utils/logger";

/**
 * Parses OpenAI-compatible chat completion response (Groq, DeepInfra, OpenRouter).
 */
export function parseOpenAIResponse(data: unknown, providerName: string): string {
  if (!data || typeof data !== "object") {
    throw new Error(`Invalid ${providerName} API response format`);
  }
  const obj = data as { choices?: Array<{ message?: { content?: string } }> };
  const content = obj.choices?.[0]?.message?.content ?? "";
  if (!content) {
    Logger.error(`No content in ${providerName} response:`, data);
  }
  return content;
}
