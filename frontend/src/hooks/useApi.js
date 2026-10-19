import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useSocket } from '../contexts/SocketContext'
import { remember, remembered } from '../utils/apiCache'

/**
 * GET data with loading and error state.
 * - Shows the last known data straight away (and refreshes it in the background), so moving between screens does not flash.
 * - Keeps showing the old data while reloading, so lists do not flash.
 * - Reloads when a live notification arrives, so pages update without a manual refresh.
 */
const useApi = (path, { params, select = (d) => d, enabled = true, live = true } = {}) => {
  const { lastNotification } = useSocket()
  const selectRef = useRef(select)
  selectRef.current = select
  const paramsKey = JSON.stringify(params || {})
  const resourceKey = `${path}?${paramsKey}`

  const [data, setData] = useState(() => {
    const hit = remembered(resourceKey, enabled)
    return hit ? select(hit.raw) : null
  })
  const [loading, setLoading] = useState(() => enabled && !remembered(resourceKey, enabled))
  const [error, setError] = useState('')

  // Switching to a different resource (say, opening another complaint) must not show the previous one's data.
  const lastResource = useRef(resourceKey)
  // React re-renders right after a state update made while rendering, but this pass still runs to the end.
  // So this pass must also *return* the reset values, or a caller could read old data (or null) with a stale loading flag.
  const switched = lastResource.current !== resourceKey
  let fresh = null
  if (switched) {
    lastResource.current = resourceKey
    const hit = remembered(resourceKey, enabled)
    fresh = { data: hit ? select(hit.raw) : null, loading: enabled && !hit }
    setData(fresh.data)
    setLoading(fresh.loading)
    setError('')
  }

  const load = useCallback(
    async (signal) => {
      try {
        const res = await api.get(path, { params: JSON.parse(paramsKey), signal })
        remember(`${path}?${paramsKey}`, res.data)
        setData(selectRef.current(res.data))
        setError('')
      } catch (err) {
        if (err.code === 'ERR_CANCELED') return
        setError(err.response?.data?.message || 'Check your connection and try again.')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [path, paramsKey]
  )

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, enabled, live ? lastNotification : null])

  const reload = useCallback(() => load(), [load])
  return switched ? { data: fresh.data, loading: fresh.loading, error: '', reload, setData } : { data, loading, error, reload, setData }
}

export default useApi
