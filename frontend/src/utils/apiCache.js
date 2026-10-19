// The last answer for each resource, kept while the app is open. Moving between screens shows it at once and
// refreshes it quietly in the background, so a tab never flashes a loader for something we already know.
// It is emptied on sign out, so one person's data is never shown to the next.
const cache = new Map()
const MAX_ENTRIES = 120
const MAX_AGE_MS = 15 * 60 * 1000
export const clearApiCache = () => cache.clear()

export const remembered = (key, enabled) => {
  if (!enabled) return undefined
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > MAX_AGE_MS) {
    cache.delete(key)
    return undefined
  }
  return hit
}

export const remember = (key, raw) => {
  cache.delete(key)
  cache.set(key, { raw, at: Date.now() })
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value)
}

