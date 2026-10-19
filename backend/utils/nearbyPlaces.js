// Finds shops, hospitals, petrol bunks, temples and so on around a point, using OpenStreetMap data (no API key).
// It asks the public Overpass servers one after another (they are free but sometimes busy), falls back to the
// Nominatim search, and remembers answers for a while so busy times and repeat searches cost nothing.
const { distanceM } = require('./geo');

const CATEGORIES = {
  supermarket: { label: 'Supermarkets', match: ['["shop"="supermarket"]', '["shop"="convenience"]', '["shop"="grocery"]', '["shop"="mall"]', '["shop"="department_store"]'], search: ['supermarket', 'grocery store'] },
  hospital: { label: 'Hospitals', match: ['["amenity"="hospital"]', '["amenity"="clinic"]', '["healthcare"="hospital"]'], search: ['hospital', 'clinic'] },
  pharmacy: { label: 'Medical shops', match: ['["amenity"="pharmacy"]', '["shop"="chemist"]'], search: ['pharmacy', 'medical store'] },
  fuel: { label: 'Petrol bunks', match: ['["amenity"="fuel"]'], search: ['petrol pump', 'fuel station'] },
  temple: { label: 'Temples', match: ['["amenity"="place_of_worship"]["religion"="hindu"]'], search: ['temple'] },
  church: { label: 'Churches', match: ['["amenity"="place_of_worship"]["religion"="christian"]'], search: ['church'] },
  mosque: { label: 'Mosques', match: ['["amenity"="place_of_worship"]["religion"="muslim"]'], search: ['mosque'] },
  gurudwara: { label: 'Gurudwaras', match: ['["amenity"="place_of_worship"]["religion"="sikh"]'], search: ['gurudwara'] },
  bank: { label: 'Banks and ATMs', match: ['["amenity"="atm"]', '["amenity"="bank"]'], search: ['ATM', 'bank'] },
  food: { label: 'Restaurants and cafes', match: ['["amenity"="restaurant"]', '["amenity"="cafe"]', '["amenity"="fast_food"]'], search: ['restaurant', 'cafe'] },
  school: { label: 'Schools', match: ['["amenity"="school"]', '["amenity"="kindergarten"]', '["amenity"="college"]'], search: ['school'] },
  police: { label: 'Police and fire stations', match: ['["amenity"="police"]', '["amenity"="fire_station"]'], search: ['police station', 'fire station'] },
  transport: { label: 'Bus stops and stations', match: ['["highway"="bus_stop"]', '["railway"="station"]', '["railway"="subway_entrance"]', '["amenity"="bus_station"]'], search: ['bus stop', 'metro station'] },
  park: { label: 'Parks', match: ['["leisure"="park"]', '["leisure"="playground"]'], search: ['park'] },
  ev: { label: 'EV charging', match: ['["amenity"="charging_station"]'], search: ['EV charging station'] }
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Nivora-society-app/1.0 (nearby places)';
const FETCH_TIMEOUT_MS = 12000;
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE = 500;
const MAX_RESULTS = 40;
const RADII = [500, 1000, 2000, 5000];

const cache = new Map();
const inflight = new Map();

const withTimeout = async (url, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(options && options.headers) } });
  } finally {
    clearTimeout(timer);
  }
};

const buildQuery = (category, lat, lng, radius) => {
  const parts = category.match.map((m) => `nwr${m}(around:${radius},${lat},${lng});`).join('');
  return `[out:json][timeout:20];(${parts});out center tags ${MAX_RESULTS * 2};`;
};

const nameFor = (tags, category) => (tags.name || tags['name:en'] || tags.brand || tags.operator || '').trim() || `${category.label.replace(/s$/, '')} (no name on map)`;

const addressFrom = (tags) => [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:city']].filter(Boolean).join(', ');

// Overpass answer -> tidy list, nearest first, without repeats.
const fromOverpass = (elements, category, centre) => {
  const seen = new Set();
  const out = [];
  for (const el of elements || []) {
    const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
    const lng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const tags = el.tags || {};
    const name = nameFor(tags, category);
    const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${el.type}${el.id}`,
      name,
      lat,
      lng,
      address: addressFrom(tags),
      phone: tags.phone || tags['contact:phone'] || '',
      hours: tags.opening_hours || '',
      distanceM: distanceM(centre, { lat, lng })
    });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_RESULTS);
};

const viewbox = (centre, radius) => {
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.2));
  return `${centre.lng - dLng},${centre.lat + dLat},${centre.lng + dLng},${centre.lat - dLat}`;
};

const askOverpass = async (category, centre, radius) => {
  const body = `data=${encodeURIComponent(buildQuery(category, centre.lat, centre.lng, radius))}`;
  let last;
  for (const url of ENDPOINTS) {
    try {
      const res = await withTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      const json = await res.json();
      return fromOverpass(json.elements, category, centre);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('overpass failed');
};

// Second source, used only when every Overpass server failed.
const askNominatim = async (category, centre, radius) => {
  const seen = new Set();
  const out = [];
  for (const term of category.search) {
    const url = `${NOMINATIM}?format=jsonv2&limit=40&bounded=1&addressdetails=0&viewbox=${viewbox(centre, radius)}&q=${encodeURIComponent(term)}`;
    const res = await withTimeout(url, {});
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const list = await res.json();
    for (const hit of list || []) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const key = `${hit.osm_type}${hit.osm_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = distanceM(centre, { lat, lng });
      if (d > radius) continue;
      out.push({ id: key, name: hit.name || (hit.display_name || '').split(',')[0] || category.label, lat, lng, address: (hit.display_name || '').split(',').slice(1, 3).join(',').trim(), phone: '', hours: '', distanceM: d });
    }
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_RESULTS);
};

// Distances are always from the exact point asked for, even when the list came from a nearby cached search.
const measured = (places, centre) => places.map((p) => ({ ...p, distanceM: distanceM(centre, p) })).sort((a, b) => a.distanceM - b.distanceM);

const snapRadius = (r) => RADII.find((x) => x >= Number(r)) || RADII[RADII.length - 1];

// places: [{ id, name, lat, lng, address, phone, hours, distanceM }] nearest first. Throws when no source answered.
const findNearby = async ({ category: key, lat, lng, radius }) => {
  const category = CATEGORIES[key];
  if (!category) throw Object.assign(new Error('Unknown kind of place'), { status: 400 });
  const centre = { lat: Number(lat), lng: Number(lng) };
  const r = snapRadius(radius || 1000);
  const cacheKey = `${key}|${centre.lat.toFixed(3)}|${centre.lng.toFixed(3)}|${r}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return { places: measured(hit.places, centre), cached: true, radius: r };
  if (inflight.has(cacheKey)) return inflight.get(cacheKey).then((x) => ({ ...x, places: measured(x.places, centre) }));

  const job = (async () => {
    let places;
    try {
      places = await askOverpass(category, centre, r);
      // The nearest places are measured from the exact point asked for, not the rounded cache cell.
    } catch (e) {
      places = await askNominatim(category, centre, r);
    }
    cache.delete(cacheKey);
    cache.set(cacheKey, { at: Date.now(), places });
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return { places: measured(places, centre), cached: false, radius: r };
  })().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, job);
  return job;
};

const clearCache = () => cache.clear();

module.exports = { CATEGORIES, findNearby, fromOverpass, buildQuery, snapRadius, clearCache };
