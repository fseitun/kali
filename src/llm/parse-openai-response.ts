import { Logger } from "@/utils/logger";

/**
 * Parses OpenAI-compatible chat completion response (DeepInfra).
 */
export function parseOpenAIResponse(data: unknown, providerName: string): string {
  if (!data || typeof data !== "object") {
    throw new Error(`Invalid ${providerName} API response format`);
  }
  const obj = data as { choices?: Array<{ message?: { content?: unknown } }> };
  const raw = obj.choices?.[0]?.message?.content;
  const content = typeof raw === "string" ? raw : "";
  if (!content) {
    Logger.error(`No content in ${providerName} response:`, data);
  }
  return content;
}
