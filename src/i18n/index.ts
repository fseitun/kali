import { CONFIG } from '../config'
import { esAR } from './locales/es-AR'
import { enUS } from './locales/en-US'

type TranslationObject = typeof esAR
type TranslationKey = string

const locales: Record<string, TranslationObject> = {
  'es-AR': esAR,
  'en-US': enUS,
}

let currentLocale: TranslationObject = locales[CONFIG.LOCALE] || esAR

export function setLocale(locale: string): void {
  if (locales[locale]) {
    currentLocale = locales[locale]
  }
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const keys = key.split('.')
  let value: unknown = currentLocale

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k]
    } else {
      return key
    }
  }

  let result = typeof value === 'string' ? value : key

  if (params) {
    Object.entries(params).forEach(([param, val]) => {
      result = result.replace(`{${param}}`, String(val))
    })
  }

  return result
}

export function getNicknames(): string[] {
  return currentLocale.nicknames || []
}

export function getNumberWords(): string[] {
  return currentLocale.numberWords || []
}

export function getConfirmationWords(): { yes: string[]; no: string[] } {
  return currentLocale.confirmationWords || { yes: [], no: [] }
}
