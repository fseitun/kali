import { CONFIG } from "@/config";

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

const VALID_PROVIDERS = ["ollama", "gemini", "groq", "openrouter", "deepinfra", "mock"] as const;

function isProviderValid(p: string): p is (typeof VALID_PROVIDERS)[number] {
  return VALID_PROVIDERS.includes(p as (typeof VALID_PROVIDERS)[number]);
}

function validateProviderApiKey(key: string | undefined, message: string): void {
  if (!key) {
    throw new ConfigValidationError(message);
  }
}

export function validateConfig(): void {
  if (!CONFIG.LLM_PROVIDER) {
    throw new ConfigValidationError(
      'VITE_LLM_PROVIDER environment variable is required. Set it to "gemini", "groq", "openrouter", "deepinfra", "ollama", or "mock".',
    );
  }
  if (!isProviderValid(CONFIG.LLM_PROVIDER)) {
    throw new ConfigValidationError(
      `Invalid VITE_LLM_PROVIDER: "${CONFIG.LLM_PROVIDER}". Must be "gemini", "groq", "openrouter", "deepinfra", "ollama", or "mock".`,
    );
  }

  const provider = CONFIG.LLM_PROVIDER;
  if (provider === "gemini") {
    validateProviderApiKey(
      CONFIG.GEMINI.API_KEY,
      "VITE_GEMINI_API_KEY environment variable is required when using Gemini provider. " +
        "Get your API key from https://aistudio.google.com/app/apikey",
    );
  } else if (provider === "groq") {
    validateProviderApiKey(
      CONFIG.GROQ.API_KEY,
      "VITE_GROQ_API_KEY environment variable is required when using Groq provider. " +
        "Get your API key from https://console.groq.com/keys",
    );
  } else if (provider === "openrouter") {
    validateProviderApiKey(
      CONFIG.OPENROUTER.API_KEY,
      "VITE_OPENROUTER_API_KEY environment variable is required when using OpenRouter provider. " +
        "Get your API key from https://openrouter.ai/keys",
    );
  } else if (provider === "deepinfra") {
    validateProviderApiKey(
      CONFIG.DEEPINFRA.API_KEY,
      "VITE_DEEPINFRA_API_KEY environment variable is required when using DeepInfra provider. " +
        "Get your API key from https://deepinfra.com/dash/api_keys",
    );
  }
}
