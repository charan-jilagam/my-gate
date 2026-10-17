import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, DICTIONARIES, LANGUAGES, TEMPLATES } from '../i18n/translations'
import { makePatterns } from '../i18n/patterns'
import { makeTranslator, startAutoTranslate } from '../i18n/autoTranslate'

const KEY = 'lang'
const known = (code) => LANGUAGES.some((l) => l.code === code)

const readStored = () => {
  try {
    const stored = localStorage.getItem(KEY)
    return known(stored) ? stored : DEFAULT_LANGUAGE
  } catch (e) {
    return DEFAULT_LANGUAGE // storage can be blocked; English is a safe default
  }
}

// Without a provider (tests, isolated screens) text simply stays in English.
const LanguageContext = createContext({ lang: DEFAULT_LANGUAGE, setLang: () => {}, t: (s) => s })

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(readStored)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Everything that is not wrapped in t() (table headings, buttons, tags, dates) is translated after it is drawn.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return undefined
    const dict = DICTIONARIES[lang] || {}
    const lookup = makeTranslator(dict, makePatterns(lang, TEMPLATES))
    return startAutoTranslate(document.body, lookup, lang !== 'en')
  }, [lang])

  const setLang = useCallback((code) => {
    if (!known(code)) return
    setLangState(code)
    try {
      localStorage.setItem(KEY, code)
    } catch (e) {
      /* storage unavailable: the choice lasts until the page is closed */
    }
  }, [])

  const value = useMemo(() => {
    const dict = DICTIONARIES[lang] || {}
    // Looks the English text up; unknown text (names, numbers, long sentences) is returned unchanged.
    const t = (text) => (typeof text === 'string' && dict[text] ? dict[text] : text)
    return { lang, setLang, t }
  }, [lang, setLang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useT = () => useContext(LanguageContext)
