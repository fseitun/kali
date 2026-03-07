/**
 * Debug-only options. Used by debug UI to control logging behavior.
 * Users can enable/disable log categories independently (state, brain, llm, etc.).
 */

export const LOG_CATEGORIES = [
  { id: "state", label: "State" },
  { id: "brain", label: "Brain" },
  { id: "llm", label: "LLM" },
  { id: "actions", label: "Actions" },
  { id: "user", label: "User input" },
  { id: "transcription", label: "Transcription" },
  { id: "narration", label: "Narration" },
  { id: "voice", label: "Voice pipeline" },
  { id: "init", label: "Init" },
] as const;

export type LogCategoryId = (typeof LOG_CATEGORIES)[number]["id"];

const enabledCategories = new Set<string>();

export function isLogCategoryEnabled(category: string): boolean {
  return enabledCategories.has(category);
}

export function setLogCategoryEnabled(category: string, enabled: boolean): void {
  if (enabled) {
    enabledCategories.add(category);
  } else {
    enabledCategories.delete(category);
  }
}

export function getLogCategories(): ReadonlyArray<{ id: string; label: string }> {
  return LOG_CATEGORIES;
}
