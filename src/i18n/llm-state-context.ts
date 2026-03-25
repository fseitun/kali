import {
  type LlmStateContextBundle,
  llmStateContextEnUS,
  llmStateContextEsAR,
} from "./llm-state-context-bundles";
import { getLocale } from "./locale-manager";

export type { LlmStateContextBundle } from "./llm-state-context-bundles";

export function getLlmStateContext(): LlmStateContextBundle {
  return getLocale() === "en-US" ? llmStateContextEnUS : llmStateContextEsAR;
}

/** Replace `{key}` placeholders in template. */
export function substLlmState(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}
