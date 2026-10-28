// A tiny shared cache so the free APIs are called once for everyone, not once per resident.
//  - fresh answers are served for `ttlMs`;
//  - concurrent requests for the same key share one upstream call;
//  - when the upstream fails, the last good answer is served (marked stale) for up to `staleMs`.
const store = new Map();
const inflight = new Map();
const MAX_ENTRIES = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

// Resolves to { value, at, stale }. Throws only when there is nothing at all to show.
const cached = async (key, ttlMs, loader, { staleMs = DAY_MS } = {}) => {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return { value: hit.value, at: hit.at, stale: false };
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    try {
      const value = await loader();
      const entry = { value, at: Date.now() };
      store.delete(key);
      store.set(key, entry);
      if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
      return { value, at: entry.at, stale: false };
    } catch (error) {
      if (hit && Date.now() - hit.at < staleMs) return { value: hit.value, at: hit.at, stale: true };
      throw error;
    }
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
};

const clearCache = () => {
  store.clear();
  inflight.clear();
};

module.exports = { cached, clearCache, DAY_MS };
