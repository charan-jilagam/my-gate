import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// The person's live position (from the phone or laptop), used for weather, alerts, news and nearby help.
// Nothing is asked until the person taps "Use my live location" - unless the browser already has their permission.
// The position stays in memory and is sent only as part of the request for local information; it is never stored.

const LocationContext = createContext(null)
const PREF_KEY = 'nivora.live-location'
const MOVED_DEG = 0.005 // ~500 m: smaller moves do not change the answer, so they do not trigger new requests
const RECHECK_MS = 10 * 60 * 1000

const readPref = () => {
  try {
    return localStorage.getItem(PREF_KEY)
  } catch (e) {
    return null
  }
}
const writePref = (v) => {
  try {
    if (v) localStorage.setItem(PREF_KEY, v)
    else localStorage.removeItem(PREF_KEY)
  } catch (e) {
    /* storage can be blocked; the choice then lasts until the page closes */
  }
}

const round3 = (n) => Math.round(n * 1000) / 1000

// status: 'off' (using the society), 'asking', 'on', 'denied', 'unsupported', 'error'
export const LocationProvider = ({ children }) => {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [coords, setCoords] = useState(null)
  const [status, setStatus] = useState(supported ? 'off' : 'unsupported')
  const timer = useRef(null)
  const wanted = useRef(false)

  const apply = useCallback((pos) => {
    const next = { lat: round3(pos.coords.latitude), lng: round3(pos.coords.longitude), accuracy: Math.round(pos.coords.accuracy || 0) }
    setCoords((prev) => (prev && Math.abs(prev.lat - next.lat) < MOVED_DEG && Math.abs(prev.lng - next.lng) < MOVED_DEG ? prev : next))
    setStatus('on')
  }, [])

  const locate = useCallback(
    (quiet) => {
      if (!supported) return
      if (!quiet) setStatus('asking')
      navigator.geolocation.getCurrentPosition(
        apply,
        (err) => {
          if (err.code === 1) {
            wanted.current = false
            writePref('denied')
            setCoords(null)
            setStatus('denied')
          } else if (!quiet) {
            setStatus('error')
          }
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
      )
    },
    [supported, apply]
  )

  const enable = useCallback(() => {
    wanted.current = true
    writePref('on')
    locate(false)
  }, [locate])

  const disable = useCallback(() => {
    wanted.current = false
    writePref('off')
    setCoords(null)
    setStatus('off')
  }, [])

  // On load: if the person chose it before, or the browser already allows it, use it quietly.
  useEffect(() => {
    if (!supported) return undefined
    let cancelled = false
    const start = () => {
      if (cancelled) return
      wanted.current = true
      locate(true)
    }
    if (readPref() === 'on') {
      start()
    } else if (readPref() !== 'off' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((p) => {
          if (p.state === 'granted') start()
          else if (p.state === 'denied') setStatus('denied')
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [supported, locate])

  // Refresh now and then, and when the app comes back to the front.
  useEffect(() => {
    if (status !== 'on') return undefined
    const again = () => {
      if (wanted.current && document.visibilityState === 'visible') locate(true)
    }
    timer.current = setInterval(again, RECHECK_MS)
    document.addEventListener('visibilitychange', again)
    return () => {
      clearInterval(timer.current)
      document.removeEventListener('visibilitychange', again)
    }
  }, [status, locate])

  const value = useMemo(
    () => ({
      status,
      supported,
      coords,
      // Spread into request params: {} until the position is known.
      params: coords ? { lat: coords.lat, lng: coords.lng } : {},
      enable,
      disable
    }),
    [status, supported, coords, enable, disable]
  )
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export const useLiveLocation = () => {
  const ctx = useContext(LocationContext)
  if (!ctx) throw new Error('useLiveLocation must be used inside LocationProvider')
  return ctx
}
