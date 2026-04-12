import {
  type LlmStateContextBundle,
  llmStateContextEnUS,
  llmStateContextEsAR,
} from "./llm-state-context-bundles";
import { getLocale } from "./locale-manager";
import { substituteTemplateVars } from "./substitute-template";

export type { LlmStateContextBundle } from "./llm-state-context-bundles";

export function getLlmStateContext(): LlmStateContextBundle {
  return getLocale() === "en-US" ? llmStateContextEnUS : llmStateContextEsAR;
}

/** Replace `{key}` placeholders in template. */
export function substLlmState(template: string, vars: Record<string, string | number>): string {
  return substituteTemplateVars(template, vars);
}
