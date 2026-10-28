// Small fetch helpers for the free public APIs behind the "live info" screens.
// Every call has a timeout and a clear User-Agent (several free services ask for one).
const USER_AGENT = 'Nivora-society-app/1.0 (+live info)';
const DEFAULT_TIMEOUT_MS = 10000;

const request = async (url, { timeout = DEFAULT_TIMEOUT_MS, headers } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, ...headers } });
    if (!res.ok) throw Object.assign(new Error(`${new URL(url).host} answered ${res.status}`), { status: res.status });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

const getJson = async (url, options = {}) => (await request(url, { ...options, headers: { Accept: 'application/json', ...options.headers } })).json();

const getText = async (url, options = {}) => (await request(url, options)).text();

module.exports = { getJson, getText, USER_AGENT };
