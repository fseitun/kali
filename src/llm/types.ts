/**
 * Configuration options for LLM API calls.
 */
export interface ApiCallOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Result structure from LLM API calls.
 */
export interface ApiCallResult {
  content: string;
}
