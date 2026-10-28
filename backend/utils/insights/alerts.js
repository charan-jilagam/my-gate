// Disaster and weather alerts, all from free public sources:
//   1. Official warnings: NDMA SACHET public CAP feeds (state feed first, then the national feed).
//   2. Forecast advisories worked out from the Open-Meteo forecast (heavy rain, wind, storms, heat).
//   3. Earthquakes near the society from the USGS feed.
// Any one source can be down; the others still show, and the answer says which ones answered.
const { getJson, getText } = require('./http');
const { cached } = require('./cache');
const { blocks, text, stripTags } = require('./xml');
const { distanceM } = require('../geo');

const SACHET_BASE = 'https://sachet.ndma.gov.in/cap_public_website/rss';
const USGS = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const OFFICIAL_TTL_MS = 15 * 60 * 1000;
const QUAKE_TTL_MS = 10 * 60 * 1000;
const MAX_CAP_FILES = 12;
const QUAKE_RADIUS_KM = 500;
const QUAKE_MIN_MAG = 3.5;

const SEVERITY_RANK = { danger: 4, warning: 3, watch: 2, info: 1 };
const CAP_SEVERITY = { extreme: 'danger', severe: 'warning', moderate: 'watch', minor: 'info', unknown: 'info' };

const slugOf = (state) => String(state || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
const norm = (s) => String(s || '').toLowerCase();
const toMs = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

// ---------- 1. Official SACHET warnings ----------

// One CAP file -> a plain alert, or null when it cannot be read. Prefers the English block.
const parseCap = (xml, link) => {
  const infos = blocks(xml, 'info');
  if (!infos.length) return null;
  const info = infos.find((i) => /^en/i.test(text(i.inner, 'language'))) || infos[0];
  const event = text(info.inner, 'event');
  const severity = norm(text(info.inner, 'severity'));
  const areas = blocks(info.inner, 'area').map((a) => text(a.inner, 'areaDesc')).filter(Boolean);
  return {
    id: text(xml, 'identifier') || link,
    kind: 'official',
    severity: CAP_SEVERITY[severity] || 'info',
    title: text(info.inner, 'headline') || event || 'Official alert',
    event,
    message: stripTags(text(info.inner, 'description') || text(info.inner, 'instruction')).slice(0, 400),
    area: areas.join(', ').slice(0, 300),
    effective: text(info.inner, 'effective') || text(info.inner, 'onset') || text(xml, 'sent'),
    expires: text(info.inner, 'expires'),
    source: text(info.inner, 'senderName') || 'NDMA SACHET',
    url: link
  };
};

const parseRss = (xml) =>
  blocks(xml, 'item').map((i) => ({
    title: text(i.inner, 'title'),
    link: text(i.inner, 'link'),
    description: text(i.inner, 'description'),
    pubDate: text(i.inner, 'pubDate')
  }));

const loadFeed = async (url) => parseRss(await getText(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } }));

const loadCap = (link) =>
  cached(`cap|${link}`, 6 * 60 * 60 * 1000, async () => parseCap(await getText(link, { headers: { Accept: 'application/xml, text/xml' } }), link)).then((r) => r.value);

const fetchOfficial = async (place) => {
  const slug = slugOf(place.state);
  let items = [];
  let scoped = false;
  if (slug) {
    try {
      items = await loadFeed(`${SACHET_BASE}/rss_${slug}.xml`);
      scoped = true;
    } catch (e) {
      items = [];
    }
  }
  if (!items.length) items = await loadFeed(`${SACHET_BASE}/rss_india.xml`);

  const words = [place.city, place.state].filter(Boolean).map(norm);
  const newest = items
    .filter((i) => i.link)
    .sort((a, b) => (toMs(b.pubDate) || 0) - (toMs(a.pubDate) || 0))
    // The national feed covers the whole country: keep what mentions this place. A state feed is already local.
    .filter((i) => scoped || words.some((w) => norm(`${i.title} ${i.description}`).includes(w)))
    .slice(0, MAX_CAP_FILES);

  const parsed = await Promise.allSettled(newest.map(async (i) => (await loadCap(i.link)) || { id: i.link, kind: 'official', severity: 'info', title: i.title, message: stripTags(i.description).slice(0, 400), area: '', effective: i.pubDate, expires: '', source: 'NDMA SACHET', url: i.link }));
  const now = Date.now();
  const cityWords = [place.city].filter(Boolean).map(norm);
  return parsed
    .filter((p) => p.status === 'fulfilled' && p.value)
    .map((p) => p.value)
    .filter((a) => {
      const end = toMs(a.expires);
      return end === null || end > now;
    })
    .map((a) => ({ ...a, local: cityWords.some((w) => norm(`${a.area} ${a.title} ${a.message}`).includes(w)) }));
};

// ---------- 2. Advisories from the forecast ----------

const IMD_HEAVY_MM = 64.5; // IMD calls 64.5 mm in 24 h "heavy rain"
const IMD_MODERATE_MM = 15.6;

const deriveFromForecast = (weather) => {
  const out = [];
  const days = (weather.daily || []).slice(0, 4);
  for (const day of days) {
    const base = { kind: 'forecast', date: day.date, source: 'Forecast (Open-Meteo)' };
    if (day.rainMm >= IMD_HEAVY_MM || ((day.code === 65 || day.code === 82) && day.rainChance >= 60)) {
      out.push({ ...base, id: `rain-${day.date}`, subtype: 'rain', severity: day.rainMm >= IMD_HEAVY_MM * 1.8 ? 'danger' : 'warning', title: 'Heavy Rain Alert', message: `Heavy rainfall expected${day.rainMm ? ` (about ${Math.round(day.rainMm)} mm)` : ''}. Be prepared.` });
    } else if (day.rainMm >= IMD_MODERATE_MM && day.rainChance >= 60) {
      out.push({ ...base, id: `rain-${day.date}`, subtype: 'rain', severity: 'watch', title: 'Rain Advisory', message: `Moderate rain likely${day.rainMm ? ` (about ${Math.round(day.rainMm)} mm)` : ''}. Carry an umbrella.` });
    }
    if (day.code >= 95 && day.rainChance >= 40) {
      out.push({ ...base, id: `storm-${day.date}`, subtype: 'storm', severity: 'warning', title: 'Thunderstorm Advisory', message: 'Thunderstorms likely. Stay indoors during lightning and keep away from trees and open ground.' });
    }
    if (day.gustMax >= 50) {
      out.push({ ...base, id: `wind-${day.date}`, subtype: 'wind', severity: day.gustMax >= 70 ? 'warning' : 'watch', title: 'Strong Winds Advisory', message: `Wind gusts may reach ${day.gustMax} km/h. Secure loose items on balconies.` });
    }
    if (day.max >= 40) {
      out.push({ ...base, id: `heat-${day.date}`, subtype: 'heat', severity: day.max >= 45 ? 'danger' : 'warning', title: 'Heat Advisory', message: `Temperature may reach ${day.max}°C. Drink water often and avoid going out in the afternoon.` });
    }
  }
  return out;
};

// ---------- 3. Earthquakes (USGS) ----------

const impactNote = (mag) => (mag < 5 ? 'No major impact expected' : mag < 6 ? 'May be felt strongly nearby. Check official updates' : 'Strong earthquake. Follow official guidance');

const fetchQuakes = async (place) => {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const q = new URLSearchParams({
    format: 'geojson',
    latitude: String(place.lat),
    longitude: String(place.lng),
    maxradiuskm: String(QUAKE_RADIUS_KM),
    minmagnitude: String(QUAKE_MIN_MAG),
    starttime: since,
    orderby: 'time',
    limit: '10'
  });
  const json = await getJson(`${USGS}?${q}`);
  return (json.features || [])
    .map((f) => {
      const [lng, lat, depth] = (f.geometry && f.geometry.coordinates) || [];
      const p = f.properties || {};
      const km = Math.round((distanceM({ lat: place.lat, lng: place.lng }, { lat, lng }) || 0) / 1000);
      const mag = Math.round(Number(p.mag) * 10) / 10;
      if (!Number.isFinite(mag)) return null;
      return {
        id: f.id,
        kind: 'quake',
        severity: mag >= 6 ? 'danger' : mag >= 5 ? 'warning' : 'info',
        title: 'Earthquake Update',
        message: `M ${mag.toFixed(1)} · ${km} km from ${place.city || 'your area'}`,
        note: impactNote(mag),
        magnitude: mag,
        depthKm: Number.isFinite(depth) ? Math.round(depth) : null,
        distanceKm: km,
        place: p.place || '',
        at: p.time ? new Date(p.time).toISOString() : null,
        source: 'USGS',
        url: p.url || ''
      };
    })
    .filter(Boolean);
};

// ---------- everything together ----------

const settle = (result) => (result.status === 'fulfilled' ? { ok: true, value: result.value } : { ok: false, value: [] });

// weather: the shaped forecast, when we have it. Returns { alerts, sources, headline }.
const getAlerts = async (place, weather) => {
  const [official, quakes] = await Promise.allSettled([
    cached(`official|${slugOf(place.state)}|${norm(place.city)}`, OFFICIAL_TTL_MS, () => fetchOfficial(place)).then((r) => r.value),
    cached(`quakes|${place.key}`, QUAKE_TTL_MS, () => fetchQuakes(place)).then((r) => r.value)
  ]);
  const o = settle(official);
  const qk = settle(quakes);
  const derived = weather ? deriveFromForecast(weather) : [];

  const alerts = [...o.value, ...derived, ...qk.value].sort((a, b) => {
    const rank = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (rank) return rank;
    return (b.local ? 1 : 0) - (a.local ? 1 : 0);
  });
  return {
    alerts,
    sources: { official: o.ok, forecast: Boolean(weather), earthquakes: qk.ok }
  };
};

module.exports = { getAlerts, parseCap, parseRss, deriveFromForecast, fetchQuakes, fetchOfficial, impactNote, slugOf };
