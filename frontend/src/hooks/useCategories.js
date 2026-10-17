import { useEffect, useState } from 'react'
import api from '../services/api'

// The list of trades never changes during a session, so it is fetched once and shared.
let cache = null
let inflight = null

const load = () => {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = api
      .get('/services/categories')
      .then(({ data }) => {
        cache = data
        return cache
      })
      .catch(() => {
        inflight = null
        return { categories: [], slotLengths: [30, 60, 90, 120, 180] }
      })
  }
  return inflight
}

const useCategories = () => {
  const [value, setValue] = useState(cache)
  useEffect(() => {
    let alive = true
    load().then((v) => alive && setValue(v))
    return () => {
      alive = false
    }
  }, [])
  const categories = value?.categories || []
  return {
    categories,
    slotLengths: value?.slotLengths || [30, 60, 90, 120, 180],
    loading: !value,
    labelOf: (key) => categories.find((c) => c.key === key)?.label || key
  }
}

export default useCategories
