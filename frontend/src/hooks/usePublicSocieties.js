import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

const KEY = 'publicSocieties'
const saved = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

/**
 * The society list on the sign-up form. It used to give up silently on the first failed request (a sleeping server,
 * a weak signal), which left the list empty. Now it retries, shows the last known list meanwhile, and says so
 * when it really cannot load, with a way to try again.
 */
const usePublicSocieties = () => {
  const [societies, setSocieties] = useState(saved)
  const [state, setState] = useState('loading') // loading | ready | failed
  const run = useRef(0)

  const load = useCallback(async () => {
    const mine = ++run.current
    setState('loading')
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await api.get('/societies/public', { timeout: 15000 })
        if (mine !== run.current) return
        const list = res.data.societies || []
        setSocieties(list)
        try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* private mode */ }
        setState('ready')
        return
      } catch {
        if (mine !== run.current) return
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      }
    }
    if (mine === run.current) setState('failed')
  }, [])

  useEffect(() => {
    load()
    const wake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', load)
    return () => {
      run.current++
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', load)
    }
  }, [load])

  return { societies, state, retry: load }
}

export default usePublicSocieties
