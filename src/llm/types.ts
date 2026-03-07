/**
 * Optional context parts for providers that support prompt caching.
 * When provided, the caller splits system prompt from user message.
 */
export interface ContextParts {
  systemPrompt: string;
  userMessage: string;
}

/**
 * Configuration options for LLM API calls.
 */
export interface ApiCallOptions {
  temperature?: number;
  maxTokens?: number;
  /** When set, provider may use cached system prompt and send only userMessage */
  contextParts?: ContextParts;
}

/**
 * Result structure from LLM API calls.
 */
export interface ApiCallResult {
  content: string;
}
