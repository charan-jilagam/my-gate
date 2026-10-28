const express = require('express');
const { query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { fail, invalid, societyFor } = require('../utils/routeKit');
const { resolvePlace, placeFromCoords } = require('../utils/insights/place');
const { getWeather } = require('../utils/insights/weather');
const { getAlerts } = require('../utils/insights/alerts');
const { getGold } = require('../utils/insights/gold');
const { getNews, LANGS } = require('../utils/insights/news');
const { findNearby } = require('../utils/nearbyPlaces');

const router = express.Router();

// Free public data for the home screen: weather, alerts, gold, news and nearby emergency help.
// Everything is cached on the server and shared by all residents of the same area, so it costs nothing to run.

const langQuery = query('lang').optional().isIn(Object.keys(LANGS)).withMessage('Unknown language');

// The phone's live position, sent as ?lat=&lng=. When both are valid, data is for where the person is right now;
// otherwise it is for the society.
const liveQuery = [
  query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude is not valid'),
  query('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude is not valid')
];

// Finds the place (live position first, then the society) or answers 409. Returns the place, or undefined when a reply has been sent.
const placeOr409 = async (req, res) => {
  const lat = req.query.lat === undefined ? NaN : Number(req.query.lat);
  const lng = req.query.lng === undefined ? NaN : Number(req.query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    const live = await placeFromCoords(lat, lng, societyFor(req));
    if (live) return live;
  }
  const place = await resolvePlace(societyFor(req));
  if (!place) {
    fail(res, 409, 'The society is not on the map yet. Ask the office to add its address.');
    return undefined;
  }
  return place;
};

const publicPlace = (p) => ({ label: p.label, city: p.city, state: p.state, pinned: p.pinned, live: Boolean(p.live) });
const meta = (r) => ({ updatedAt: new Date(r.at).toISOString(), stale: r.stale });

// An upstream service being down is not our error: say so plainly and let the app show what it has.
const upstreamDown = (res, what, error) => {
  console.error(`${what} failed:`, error.message);
  return fail(res, 502, `${what} is not available right now. Please try again in a little while.`);
};

// @route   GET /api/insights/weather
router.get('/weather', protect, liveQuery, async (req, res) => {
  if (invalid(req, res)) return undefined;
  const place = await placeOr409(req, res);
  if (!place) return undefined;
  try {
    const r = await getWeather(place);
    return res.json({ success: true, place: publicPlace(place), ...meta(r), weather: r.value });
  } catch (error) {
    return upstreamDown(res, 'Weather', error);
  }
});

// @route   GET /api/insights/alerts
// @desc    Official warnings, forecast advisories and nearby earthquakes, worst first.
router.get('/alerts', protect, liveQuery, async (req, res) => {
  if (invalid(req, res)) return undefined;
  const place = await placeOr409(req, res);
  if (!place) return undefined;
  try {
    const weather = await getWeather(place).then((r) => r.value, () => null);
    const { alerts, sources } = await getAlerts(place, weather);
    return res.json({ success: true, place: publicPlace(place), today: weather && weather.today, alerts, sources });
  } catch (error) {
    return upstreamDown(res, 'Alerts', error);
  }
});

// @route   GET /api/insights/gold
router.get('/gold', protect, async (req, res) => {
  try {
    const r = await getGold();
    return res.json({ success: true, ...meta(r), gold: r.value });
  } catch (error) {
    return upstreamDown(res, 'Gold rates', error);
  }
});

// @route   GET /api/insights/news?lang=en|hi|te
router.get('/news', protect, [langQuery, ...liveQuery], async (req, res) => {
  if (invalid(req, res)) return undefined;
  const place = await placeOr409(req, res);
  if (!place) return undefined;
  try {
    const r = await getNews({ city: place.city || place.label, lang: req.query.lang });
    return res.json({ success: true, place: publicPlace(place), ...meta(r), news: r.value });
  } catch (error) {
    return upstreamDown(res, 'News', error);
  }
});

const HELPLINES = [
  { label: 'All emergencies (112)', number: '112' },
  { label: 'Police', number: '100' },
  { label: 'Fire', number: '101' },
  { label: 'Ambulance', number: '108' },
  { label: 'Women helpline', number: '1091' },
  { label: 'Childline', number: '1098' }
];

const slim = (p, kind) => ({
  id: p.id,
  kind,
  name: p.name,
  address: p.address,
  phone: String(p.phone || '').split(/[;,]/)[0].trim(),
  open24: String(p.hours || '').trim() === '24/7',
  hours: p.hours || '',
  distanceM: p.distanceM,
  lat: p.lat,
  lng: p.lng
});

// @route   GET /api/insights/emergency
// @desc    Nearest police station and hospital (from OpenStreetMap) plus the national helpline numbers.
router.get('/emergency', protect, liveQuery, async (req, res) => {
  if (invalid(req, res)) return undefined;
  const place = await placeOr409(req, res);
  if (!place) return undefined;
  const nearest = async (category, kind) => (await findNearby({ category, lat: place.lat, lng: place.lng, radius: 5000 })).places.slice(0, 2).map((p) => slim(p, kind));
  const [police, hospitals] = await Promise.allSettled([nearest('police', 'police'), nearest('hospital', 'hospital')]);
  return res.json({
    success: true,
    helplines: HELPLINES,
    police: police.status === 'fulfilled' ? police.value : [],
    hospitals: hospitals.status === 'fulfilled' ? hospitals.value : [],
    nearbyAvailable: police.status === 'fulfilled' || hospitals.status === 'fulfilled'
  });
});

// @route   GET /api/insights/overview?lang=
// @desc    What the home screen needs in one call: weather, the few most important alerts, and top headlines.
//          Each part can fail on its own; the rest still comes back.
router.get('/overview', protect, [langQuery, ...liveQuery], async (req, res) => {
  if (invalid(req, res)) return undefined;
  const place = await placeOr409(req, res);
  if (!place) return undefined;
  const [weatherR, newsR] = await Promise.allSettled([getWeather(place), getNews({ city: place.city || place.label, lang: req.query.lang })]);
  const weather = weatherR.status === 'fulfilled' ? weatherR.value.value : null;
  let alerts = [];
  try {
    alerts = (await getAlerts(place, weather)).alerts.slice(0, 5);
  } catch (e) {
    alerts = [];
  }
  return res.json({
    success: true,
    place: publicPlace(place),
    today: weather && weather.today,
    weather,
    weatherUpdatedAt: weatherR.status === 'fulfilled' ? new Date(weatherR.value.at).toISOString() : null,
    alerts,
    news: newsR.status === 'fulfilled' ? newsR.value.value.slice(0, 5) : []
  });
});

module.exports = router;
