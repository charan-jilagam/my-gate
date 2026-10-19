// Finding places around the society (shops, hospitals, petrol bunks, places of worship and so on).
// The search runs in the person's browser against OpenStreetMap's free Overpass service and address search,
// so the server never needs a paid map key. Everything here fails soft: a slow or blocked service gives a clear
// message and a retry, never a broken page.

// One entry per kind of place. `match` is a list of OpenStreetMap tag filters; a place is included when any one fits.
export const CATEGORIES = [
  { key: 'supermarket', label: 'Supermarkets', short: 'Shops', emoji: '🛒', tone: 'brand', match: ['["shop"="supermarket"]', '["shop"="convenience"]', '["shop"="grocery"]', '["shop"="mall"]', '["shop"="department_store"]'] },
  { key: 'hospital', label: 'Hospitals', short: 'Hospitals', emoji: '🏥', tone: 'danger', match: ['["amenity"="hospital"]', '["amenity"="clinic"]', '["healthcare"="hospital"]'] },
  { key: 'pharmacy', label: 'Medical shops', short: 'Medicines', emoji: '💊', tone: 'danger', match: ['["amenity"="pharmacy"]', '["shop"="chemist"]'] },
  { key: 'fuel', label: 'Petrol bunks', short: 'Petrol', emoji: '⛽', tone: 'warn', match: ['["amenity"="fuel"]'] },
  { key: 'temple', label: 'Temples', short: 'Temples', emoji: '🛕', tone: 'warn', match: ['["amenity"="place_of_worship"]["religion"="hindu"]'] },
  { key: 'church', label: 'Churches', short: 'Churches', emoji: '⛪', tone: 'muted', match: ['["amenity"="place_of_worship"]["religion"="christian"]'] },
  { key: 'mosque', label: 'Mosques', short: 'Mosques', emoji: '🕌', tone: 'brand', match: ['["amenity"="place_of_worship"]["religion"="muslim"]'] },
  { key: 'gurudwara', label: 'Gurudwaras', short: 'Gurudwaras', emoji: '🙏', tone: 'warn', match: ['["amenity"="place_of_worship"]["religion"="sikh"]'] },
  { key: 'bank', label: 'Banks and ATMs', short: 'Banks, ATMs', emoji: '🏧', tone: 'brand', match: ['["amenity"="atm"]', '["amenity"="bank"]'] },
  { key: 'food', label: 'Restaurants and cafes', short: 'Food', emoji: '🍽️', tone: 'warn', match: ['["amenity"="restaurant"]', '["amenity"="cafe"]', '["amenity"="fast_food"]'] },
  { key: 'school', label: 'Schools', short: 'Schools', emoji: '🏫', tone: 'brand', match: ['["amenity"="school"]', '["amenity"="kindergarten"]', '["amenity"="college"]'] },
  { key: 'police', label: 'Police and fire stations', short: 'Police, fire', emoji: '🚓', tone: 'danger', match: ['["amenity"="police"]', '["amenity"="fire_station"]'] },
  { key: 'transport', label: 'Bus stops and stations', short: 'Transport', emoji: '🚌', tone: 'muted', match: ['["highway"="bus_stop"]', '["railway"="station"]', '["railway"="subway_entrance"]', '["amenity"="bus_station"]'] },
  { key: 'park', label: 'Parks', short: 'Parks', emoji: '🌳', tone: 'brand', match: ['["leisure"="park"]', '["leisure"="playground"]'] },
  { key: 'ev', label: 'EV charging', short: 'EV charging', emoji: '🔌', tone: 'brand', match: ['["amenity"="charging_station"]'] }
]

export const categoryOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[0]

export const DISTANCES = [
  { m: 1000, label: '1 km' },
  { m: 2000, label: '2 km' },
  { m: 5000, label: '5 km' }
]

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

const toRad = (d) => (d * Math.PI) / 180
// Straight-line distance in metres.
export const metresBetween = (a, b) => {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h))))
}

export const distanceLabel = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m / 10) * 10 || m} m` : `${(m / 1000).toFixed(1)} km`)

export const buildQuery = (category, centre, radius) => {
  const parts = category.match.map((m) => `nwr${m}(around:${radius},${centre.lat},${centre.lng});`).join('')
  return `[out:json][timeout:25];(${parts});out center tags 80;`
}

// Turn Overpass elements into a tidy list, nearest first. Unnamed places get a generic name so they are still shown.
export const parsePlaces = (elements, category, centre) => {
  const seen = new Set()
  const out = []
  for (const el of elements || []) {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    const tags = el.tags || {}
    const name = (tags.name || tags['name:en'] || tags.brand || tags.operator || '').trim() || `${category.short === 'Hospitals' ? 'Hospital' : category.label.replace(/s$/, '')} (no name on map)`
    const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:city']].filter(Boolean).join(', ')
    out.push({
      id: `${el.type}${el.id}`,
      name,
      lat,
      lng,
      address,
      phone: tags.phone || tags['contact:phone'] || '',
      hours: tags.opening_hours || '',
      open24: /^24\/7$/.test(tags.opening_hours || ''),
      distanceM: metresBetween(centre, { lat, lng })
    })
  }
  return out.sort((a, b) => a.distanceM - b.distanceM)
}

const cache = new Map()
const TTL = 10 * 60 * 1000

export const findPlaces = async (category, centre, radius, { signal } = {}) => {
  const key = `${category.key}|${centre.lat.toFixed(4)}|${centre.lng.toFixed(4)}|${radius}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.places
  const body = `data=${encodeURIComponent(buildQuery(category, centre, radius))}`
  let lastError
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const json = await res.json()
      const places = parsePlaces(json.elements, category, centre)
      cache.set(key, { at: Date.now(), places })
      return places
    } catch (e) {
      if (e.name === 'AbortError') throw e
      lastError = e
    }
  }
  const err = new Error('The map service is busy right now. Please try again in a moment.')
  err.cause = lastError
  throw err
}

// Turn-by-turn directions open in the phone's maps app (Google Maps), from the person's place to the destination.
export const directionsUrl = (to, from, mode = 'driving') => {
  const params = new URLSearchParams({ api: '1', destination: `${to.lat},${to.lng}`, travelmode: mode })
  if (from && typeof from.lat === 'number') params.set('origin', `${from.lat},${from.lng}`)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

// "Walk" is offered as the main choice for short trips, "Drive" for longer ones.
export const bestMode = (m) => (m != null && m <= 1200 ? 'walking' : 'driving')

// Look up an address and return the best match, or null. Used by the admin to place the society pin from a typed address.
export const geocode = async (text, { signal } = {}) => {
  const q = String(text || '').trim()
  if (q.length < 4) return null
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('The address search is busy right now. Please try again, or tap the map to place the pin.')
  const list = await res.json()
  const hit = list?.[0]
  return hit ? { lat: Number(Number(hit.lat).toFixed(6)), lng: Number(Number(hit.lon).toFixed(6)), name: hit.display_name } : null
}
