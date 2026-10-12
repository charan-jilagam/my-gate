// Stops MongoDB operator injection: removes keys that start with "$" or contain "."
// from request bodies, query strings and params (for example ?status[$ne]=x).
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      const cleaned = clean(v);
      // An operator object like { $ne: 'x' } is dropped entirely rather than left as {}.
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length && !Object.keys(cleaned).length) continue;
      out[key] = cleaned;
    }
    return out;
  }
  return value;
};

module.exports = (req, res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) {
    const q = clean(req.query);
    Object.keys(req.query).forEach((k) => delete req.query[k]);
    Object.assign(req.query, q);
  }
  if (req.params) req.params = clean(req.params);
  next();
};
