import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiMapPin, FiAlertTriangle } from 'react-icons/fi'
import api from '../services/api'
import useApi from '../hooks/useApi'
import { getPosition, locationSupported } from '../utils/location'

// While a guard is clocked in, this sends the phone's position to the office every so often, on every screen of the app.
// It stops the moment they clock out. It is honest about its limits: a web page can only share while the app is open
// on screen, so the bar below says so instead of promising more.
const EVERY_MS = 45000

export const keepAwakePreferred = () => {
  try {
    return localStorage.getItem('keepAwake') === '1'
  } catch (e) {
    return false
  }
}

const DutyTracker = () => {
  const { data } = useApi('/roster/mine')
  const active = (data?.shifts || []).find((s) => s.phase === 'on_duty')
  const activeId = active?._id
  const [state, setState] = useState('idle') // idle | searching | sharing | blocked | unsupported
  const [outside, setOutside] = useState(null)
  const lock = useRef(null)

  useEffect(() => {
    if (!activeId) {
      setState('idle')
      return undefined
    }
    if (!locationSupported()) {
      setState('unsupported')
      return undefined
    }
    let stopped = false
    setState('searching')

    const tick = async () => {
      try {
        const pos = await getPosition({ timeout: 20000 })
        if (stopped) return
        try {
          const { data: res } = await api.post('/guards/ping', pos)
          if (!stopped) {
            setState('sharing')
            setOutside(res.outside === true ? res.distanceM : null)
          }
        } catch (e) {
          // 409 means the shift ended (clocked out elsewhere); the next refresh of the shift list stops us.
          if (!stopped && e.response?.status !== 409) setState('searching')
        }
      } catch (e) {
        if (!stopped) setState(/switched off/.test(e.message) ? 'blocked' : 'searching')
      }
    }
    tick()
    const timer = setInterval(tick, EVERY_MS)
    // Share again right away when the person comes back to the app (the phone may have paused it).
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [activeId])

  // Optionally keep the screen awake so sharing is not paused by the phone sleeping.
  useEffect(() => {
    if (!activeId || !keepAwakePreferred() || !navigator.wakeLock?.request) return undefined
    let cancelled = false
    const grab = async () => {
      try {
        lock.current = await navigator.wakeLock.request('screen')
      } catch (e) {
        /* not allowed right now; nothing to do */
      }
    }
    grab()
    const onVisible = () => document.visibilityState === 'visible' && !cancelled && grab()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock.current?.release?.().catch(() => {})
      lock.current = null
    }
  }, [activeId])

  if (!activeId) return null

  const bad = state === 'blocked' || state === 'unsupported'
  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm ${bad ? 'border-amber bg-amber-soft' : 'border-ok/40 bg-ok-soft'}`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${bad ? 'bg-amber text-[#1b1400]' : 'bg-ok text-on-solid'}`}>
        {bad ? <FiAlertTriangle size={16} /> : <FiMapPin size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {state === 'blocked'
            ? 'You are on duty, but your location is off'
            : state === 'unsupported'
              ? 'You are on duty, but this browser cannot share location'
              : state === 'searching'
                ? 'You are on duty. Finding your location…'
                : 'You are on duty. Your location is shared with the office.'}
        </p>
        <p className="text-xs text-muted">
          {state === 'blocked'
            ? 'Turn on location for this website in your phone settings so the office can see you are at your post.'
            : outside
              ? `You seem to be about ${outside} m from your post. Please return to it.`
              : 'Sharing works while the app is open on your screen. It stops when you clock out.'}
        </p>
      </div>
      <Link to="/my-shifts" className="btn-secondary btn-sm">Open my shift</Link>
    </div>
  )
}

export default DutyTracker
