import { DeepInfraClient } from "./DeepInfraClient";
import type { LLMClient } from "./LLMClient";
import { MockLLMClient } from "./MockLLMClient";
import { CONFIG } from "@/config";

/**
 * Creates an LLM client based on CONFIG.LLM_PROVIDER.
 */
export function createLLMClient(): LLMClient {
  switch (CONFIG.LLM_PROVIDER) {
    case "deepinfra":
      return new DeepInfraClient();
    case "mock":
      return new MockLLMClient();
    default:
      throw new Error(`Unknown LLM provider: ${CONFIG.LLM_PROVIDER}`);
  }
}
