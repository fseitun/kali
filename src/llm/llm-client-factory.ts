import { DeepInfraClient } from "./DeepInfraClient";
import { GeminiClient } from "./GeminiClient";
import { GroqClient } from "./GroqClient";
import type { LLMClient } from "./LLMClient";
import { MockLLMClient } from "./MockLLMClient";
import { OllamaClient } from "./OllamaClient";
import { OpenRouterClient } from "./OpenRouterClient";
import { CONFIG } from "@/config";

/**
 * Creates an LLM client based on CONFIG.LLM_PROVIDER.
 */
export function createLLMClient(): LLMClient {
  switch (CONFIG.LLM_PROVIDER) {
    case "gemini":
      return new GeminiClient();
    case "groq":
      return new GroqClient();
    case "openrouter":
      return new OpenRouterClient();
    case "deepinfra":
      return new DeepInfraClient();
    case "ollama":
      return new OllamaClient();
    case "mock":
      return new MockLLMClient();
    default:
      throw new Error(`Unknown LLM provider: ${CONFIG.LLM_PROVIDER}`);
  }
}
