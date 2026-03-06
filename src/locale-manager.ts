import { CONFIG } from "./config";

const STORAGE_KEY = "kali-locale";
const SUPPORTED_LOCALES = ["es-AR", "en-US"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const TTS_LANG_MAP: Record<SupportedLocale, string> = {
  "es-AR": "es-AR",
  "en-US": "en-US",
};

let runtimeLocale: SupportedLocale = loadStoredLocale();

function loadStoredLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
      return stored as SupportedLocale;
    }
  } catch {
    // localStorage unavailable
  }
  return CONFIG.LOCALE ?? "es-AR";
}

/**
 * Returns the current runtime locale. Use this instead of CONFIG.LOCALE
 * when the value can change at runtime (e.g. after user changes language).
 */
export function getLocale(): SupportedLocale {
  return runtimeLocale;
}

/**
 * Returns the TTS (SpeechSynthesis) language code for the current locale.
 */
export function getTtsLang(): string {
  return TTS_LANG_MAP[runtimeLocale] ?? "es-AR";
}

/**
 * Sets the runtime locale and persists to localStorage.
 * Callers must also update i18n, SpeechService expectations, and LLM system prompt.
 */
export function setLocale(locale: string): boolean {
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    return false;
  }
  runtimeLocale = locale as SupportedLocale;
  try {
    localStorage.setItem(STORAGE_KEY, runtimeLocale);
  } catch {
    // localStorage unavailable
  }
  return true;
}

export function getSupportedLocales(): SupportedLocale[] {
  return [...SUPPORTED_LOCALES];
}
