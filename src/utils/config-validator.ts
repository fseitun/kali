import { CONFIG } from "../config";

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export function validateConfig(): void {
  if (!CONFIG.LLM_PROVIDER) {
    throw new ConfigValidationError(
      'VITE_LLM_PROVIDER environment variable is required. Set it to "gemini", "groq", "openrouter", "ollama", or "mock".',
    );
  }

  if (
    CONFIG.LLM_PROVIDER !== "ollama" &&
    CONFIG.LLM_PROVIDER !== "gemini" &&
    CONFIG.LLM_PROVIDER !== "groq" &&
    CONFIG.LLM_PROVIDER !== "openrouter" &&
    CONFIG.LLM_PROVIDER !== "mock"
  ) {
    throw new ConfigValidationError(
      `Invalid VITE_LLM_PROVIDER: "${CONFIG.LLM_PROVIDER}". Must be "gemini", "groq", "openrouter", "ollama", or "mock".`,
    );
  }

  if (CONFIG.LLM_PROVIDER === "gemini") {
    if (!CONFIG.GEMINI.API_KEY) {
      throw new ConfigValidationError(
        "VITE_GEMINI_API_KEY environment variable is required when using Gemini provider. " +
          "Get your API key from https://aistudio.google.com/app/apikey",
      );
    }
  }

  if (CONFIG.LLM_PROVIDER === "groq") {
    if (!CONFIG.GROQ.API_KEY) {
      throw new ConfigValidationError(
        "VITE_GROQ_API_KEY environment variable is required when using Groq provider. " +
          "Get your API key from https://console.groq.com/keys",
      );
    }
  }

  if (CONFIG.LLM_PROVIDER === "openrouter") {
    if (!CONFIG.OPENROUTER.API_KEY) {
      throw new ConfigValidationError(
        "VITE_OPENROUTER_API_KEY environment variable is required when using OpenRouter provider. " +
          "Get your API key from https://openrouter.ai/keys",
      );
    }
  }
}
