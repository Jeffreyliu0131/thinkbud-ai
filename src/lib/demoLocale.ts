import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { EN } from './demoTranslations'

export type DemoLocale = 'zh' | 'en'
export type LanguagePreference = DemoLocale | 'system'
export const DEMO_LANGUAGE_KEY = 'thinkbud.demo.language'
const CHANGE_EVENT = 'thinkbud-language-change'
let storageFallback: LanguagePreference = 'system'
let transientPreference: LanguagePreference | null = null

export function resolveDemoLocale(languages: readonly string[]): DemoLocale {
  for (const language of languages) {
    const primary = language.trim().toLowerCase().split(/[-_]/)[0]
    if (primary === 'zh' || primary === 'en') return primary
  }
  return 'en'
}

function preference(): LanguagePreference {
  if (transientPreference !== null) return transientPreference
  try {
    const value = window.localStorage.getItem(DEMO_LANGUAGE_KEY)
    return value === 'zh' || value === 'en' ? value : 'system'
  } catch { return storageFallback }
}

function snapshot(): string {
  const chosen = preference()
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']
  return `${chosen}:${chosen === 'system' ? resolveDemoLocale(languages) : chosen}`
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === DEMO_LANGUAGE_KEY) notify() }
  window.addEventListener(CHANGE_EVENT, notify)
  window.addEventListener('languagechange', notify)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify)
    window.removeEventListener('languagechange', notify)
    window.removeEventListener('storage', onStorage)
  }
}

export function setDemoLanguage(value: LanguagePreference) {
  storageFallback = value
  try {
    if (value === 'system') window.localStorage.removeItem(DEMO_LANGUAGE_KEY)
    else window.localStorage.setItem(DEMO_LANGUAGE_KEY, value)
    transientPreference = null
  } catch { transientPreference = value }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function translateDemo(key: string, locale: DemoLocale, values: Record<string, string | number> = {}) {
  const copy = locale === 'en' && Object.hasOwn(EN, key) ? EN[key] : key
  return copy.replace(/\{\{(\w+)\}\}/g, (token, name: string) => values[name] === undefined ? token : String(values[name]))
}

export function useDemoLocale() {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'system:en')
  const [chosen, locale] = state.split(':') as [LanguagePreference, DemoLocale]
  const t = useCallback((key: string, values?: Record<string, string | number>) => translateDemo(key, locale, values), [locale])
  const date = useCallback((time: number) => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-SG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(time), [locale])
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = locale === 'zh' ? 'ThinkBud · 思考教练' : 'ThinkBud · Thinking coach'
  }, [locale])
  return { locale, preference: chosen, t, date, setLanguage: setDemoLanguage }
}
