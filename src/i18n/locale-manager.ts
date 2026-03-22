import { CONFIG } from "../config";

const STORAGE_KEY = "kali-locale";
const SUPPORTED_LOCALES = ["es-AR", "en-US"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const TTS_LANG_MAP: Record<SupportedLocale, string> = {
  "es-AR": "es-AR",
  "en-US": "en-US",
};

const runtimeLocale: SupportedLocale = loadStoredLocale();

function loadStoredLocale(): SupportedLocale {
  const envLocale = import.meta.env.VITE_LOCALE;
  if (envLocale != null && String(envLocale).trim() !== "") {
    return CONFIG.LOCALE;
  }
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
 * Returns the current runtime locale: env (VITE_LOCALE) if set, else localStorage, else CONFIG default.
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
