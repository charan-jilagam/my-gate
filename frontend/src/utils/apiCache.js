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


// "Something changed" counter. Every successful save/approve/delete bumps it, and every open list reloads,
// so nobody has to refresh by hand after an action. A burst of changes is merged into one reload.
const listeners = new Set()
let version = 0
let timer = null
export const dataVersion = () => version
export const onDataChange = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const markStale = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    version += 1
    listeners.forEach((fn) => fn(version))
  }, 120)
}
