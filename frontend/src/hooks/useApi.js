import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useSocket } from '../contexts/SocketContext'

/**
 * GET data with loading and error state.
 * - Keeps showing the old data while reloading, so lists do not flash.
 * - Reloads when a live notification arrives, so pages update without a manual refresh.
 */
const useApi = (path, { params, select = (d) => d, enabled = true, live = true } = {}) => {
  const { lastNotification } = useSocket()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const selectRef = useRef(select)
  selectRef.current = select
  const paramsKey = JSON.stringify(params || {})

  // Switching to a different resource (say, opening another complaint) must not show the previous one's data.
  const resourceKey = `${path}?${paramsKey}`
  const lastResource = useRef(resourceKey)
  if (lastResource.current !== resourceKey) {
    lastResource.current = resourceKey
    setData(null)
    setLoading(enabled)
  }

  const load = useCallback(
    async (signal) => {
      try {
        const res = await api.get(path, { params: JSON.parse(paramsKey), signal })
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
  return { data, loading, error, reload, setData }
}

export default useApi
