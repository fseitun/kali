/**
 * Debug-only options. Used by debug UI to control logging behavior.
 * Users can enable/disable log categories independently (state, brain, llm, etc.).
 */

export const LOG_CATEGORIES = [
  { id: "state", label: "State", icon: "📊" },
  { id: "brain", label: "Brain", icon: "🧠" },
  { id: "llm", label: "LLM", icon: "🤖" },
  { id: "actions", label: "Actions", icon: "✏️" },
  { id: "user", label: "User input", icon: "👤" },
  { id: "transcription", label: "Transcription", icon: "📝" },
  { id: "narration", label: "Narration", icon: "🔊" },
  { id: "voice", label: "Voice pipeline", icon: "🎤" },
  { id: "init", label: "Init", icon: "🚀" },
] as const;

export type LogCategoryId = (typeof LOG_CATEGORIES)[number]["id"];

const enabledCategories = new Set<string>();
const categoryChangeListeners: Array<() => void> = [];

export function isLogCategoryEnabled(category: string): boolean {
  return enabledCategories.has(category);
}

export function getEnabledCategories(): Set<string> {
  return new Set(enabledCategories);
}

export function setLogCategoryEnabled(category: string, enabled: boolean): void {
  if (enabled) {
    enabledCategories.add(category);
  } else {
    enabledCategories.delete(category);
  }
  for (const cb of categoryChangeListeners) {
    cb();
  }
}

export function subscribeToCategoryChanges(callback: () => void): () => void {
  categoryChangeListeners.push(callback);
  return () => {
    const i = categoryChangeListeners.indexOf(callback);
    if (i >= 0) categoryChangeListeners.splice(i, 1);
  };
}

export function getLogCategories(): ReadonlyArray<{
  id: string;
  label: string;
  icon?: string;
}> {
  return LOG_CATEGORIES;
}

export function getCategoryIcon(categoryId: string): string {
  const cat = LOG_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.icon ?? "📋";
}
