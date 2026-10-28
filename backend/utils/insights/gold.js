// Indicative gold rate per gram in rupees, from free sources with no API key:
//   - gold spot price in USD per troy ounce: Gold-API.com (api.gold-api.com/price/XAU)
//   - USD to INR: open.er-api.com, then Frankfurter as a back-up
// This is an INTERNATIONAL spot price converted to rupees. Indian shop rates also include import duty, GST and
// making charges, so the app labels it "indicative". Check Gold-API's current terms before using it commercially.
const { getJson } = require('./http');
const { cached } = require('./cache');

const GOLD_URL = 'https://api.gold-api.com/price/XAU';
const FX_URLS = ['https://open.er-api.com/v6/latest/USD', 'https://api.frankfurter.app/latest?from=USD&to=INR'];
const TTL_MS = 15 * 60 * 1000;
const FX_TTL_MS = 6 * 60 * 60 * 1000;
const GRAMS_PER_TROY_OUNCE = 31.1034768;

const fetchUsdInr = async () => {
  let last;
  for (const url of FX_URLS) {
    try {
      const json = await getJson(url);
      const rate = Number(json.rates && json.rates.INR);
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('No exchange rate available');
};

// Today's date in India, so "change since yesterday" lines up with the Indian day.
const istDate = (ms = Date.now()) => new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// The first and latest rate seen each day (kept in memory). The change shown is against the last rate of the day before.
const day = { date: null, prevClose: null, last: null };
const track = (perGram24, now = Date.now()) => {
  const today = istDate(now);
  if (day.date !== today) {
    day.prevClose = day.last !== null ? day.last : null;
    day.date = today;
  }
  day.last = perGram24;
  return day.prevClose;
};
const resetTracker = () => Object.assign(day, { date: null, prevClose: null, last: null });

const fetchGold = async () => {
  const [gold, fx] = await Promise.all([getJson(GOLD_URL), cached('fx|usd-inr', FX_TTL_MS, fetchUsdInr).then((r) => r.value)]);
  const usdPerOunce = Number(gold.price);
  if (!Number.isFinite(usdPerOunce) || usdPerOunce <= 0) throw new Error('Gold price missing from the answer');
  const perGram24 = (usdPerOunce / GRAMS_PER_TROY_OUNCE) * fx;
  const prev = track(perGram24);
  const k24 = Math.round(perGram24);
  const k22 = Math.round((perGram24 * 22) / 24);
  const change = (now, before) => (before ? { amount: Math.round(now - before), percent: Math.round(((now - before) / before) * 10000) / 100 } : null);
  const prev24 = prev === null ? null : Math.round(prev);
  const prev22 = prev === null ? null : Math.round((prev * 22) / 24);
  return {
    currency: 'INR',
    unit: 'gram',
    k24: { perGram: k24, change: change(k24, prev24) },
    k22: { perGram: k22, change: change(k22, prev22) },
    spot: { usdPerOunce: Math.round(usdPerOunce * 100) / 100, usdInr: Math.round(fx * 100) / 100 },
    sourceUpdatedAt: gold.updatedAt || null,
    note: 'Indicative international rate converted to rupees. Shop rates in your city differ (duty, GST, making charges).',
    sources: ['Gold-API.com', 'open.er-api.com']
  };
};

const getGold = () => cached('gold|inr', TTL_MS, fetchGold);

module.exports = { getGold, fetchGold, resetTracker, GRAMS_PER_TROY_OUNCE };
