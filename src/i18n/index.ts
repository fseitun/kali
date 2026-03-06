import { getLocale } from "../locale-manager";
import { enUS } from "./locales/en-US";
import { esAR } from "./locales/es-AR";

type TranslationObject = typeof esAR;
type TranslationKey = string;

const locales: Record<string, TranslationObject> = {
  "es-AR": esAR,
  "en-US": enUS,
};

let currentLocale: TranslationObject = locales[getLocale()] ?? esAR;

export function setLocale(locale: string): void {
  if (locale in locales) {
    currentLocale = locales[locale];
  }
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const keys = key.split(".");
  let value: unknown = currentLocale;

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  let result = typeof value === "string" ? value : key;

  if (params) {
    Object.entries(params).forEach(([param, val]) => {
      result = result.replaceAll(`{${param}}`, String(val));
    });
  }

  return result;
}

export function getNicknames(): string[] {
  return currentLocale.nicknames;
}

export function getNumberWords(): string[] {
  return currentLocale.numberWords;
}

export function getConfirmationWords(): { yes: string[]; no: string[] } {
  return currentLocale.confirmationWords;
}

/** Parses user text for yes/no confirmation. Returns "unclear" when ambiguous. */
export function parseConfirmation(text: string): "yes" | "no" | "unclear" {
  const lower = text.toLowerCase().trim();
  const { yes, no } = getConfirmationWords();
  if (yes.some((word) => lower.includes(word))) return "yes";
  if (no.some((word) => lower.includes(word))) return "no";
  return "unclear";
}
