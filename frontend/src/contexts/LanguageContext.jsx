import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, DICTIONARIES, LANGUAGES } from '../i18n/translations'

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
