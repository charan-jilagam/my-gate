// Works out where a society is, for weather, alerts and news.
// Uses the pin the admin saved; if there is none, finds the city on the free Open-Meteo geocoder.
const Society = require('../../models/Society');
const { isCoord } = require('../geo');
const { getJson } = require('./http');
const { cached } = require('./cache');

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const geocodeCity = async (city, state) => {
  if (!city) return null;
  const { value } = await cached(`geo|${city}|${state || ''}`.toLowerCase(), MONTH_MS, async () => {
    const json = await getJson(`${GEOCODE}?name=${encodeURIComponent(city)}&count=5&language=en&format=json&countryCode=IN`);
    const list = json.results || [];
    const wanted = String(state || '').toLowerCase();
    const best = list.find((r) => wanted && String(r.admin1 || '').toLowerCase() === wanted) || list[0];
    return best ? { lat: best.latitude, lng: best.longitude } : null;
  });
  return value;
};

// Round to ~1 km so neighbouring societies share cached answers and the cache stays small.
const roundCoord = (n) => Math.round(n * 100) / 100;

// { lat, lng, city, state, district, label, pinned, timezone } or null when the society cannot be placed.
const resolvePlace = async (societyId) => {
  if (!societyId) return null;
  const society = await Society.findById(societyId).select('name address location timezone').lean();
  if (!society) return null;
  const a = society.address || {};
  const loc = society.location || {};
  let lat;
  let lng;
  let pinned = false;
  if (isCoord(loc.lat, loc.lng)) {
    ({ lat, lng } = loc);
    pinned = true;
  } else {
    try {
      const found = await geocodeCity(a.city, a.state);
      if (found && isCoord(found.lat, found.lng)) ({ lat, lng } = found);
    } catch (e) {
      console.error('Geocoding failed:', e.message);
    }
  }
  if (!isCoord(lat, lng)) return null;
  return {
    lat,
    lng,
    key: `${roundCoord(lat).toFixed(2)},${roundCoord(lng).toFixed(2)}`,
    city: a.city || '',
    state: a.state || '',
    label: [a.city, a.state].filter(Boolean).join(', ') || society.name,
    pinned,
    timezone: society.timezone || 'Asia/Kolkata'
  };
};

module.exports = { resolvePlace, geocodeCity, roundCoord };
