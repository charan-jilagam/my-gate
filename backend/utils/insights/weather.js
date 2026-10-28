// Weather from Open-Meteo (free, no API key). Forecast numbers also feed the "derived" weather advisories.
// Note for production: Open-Meteo's free service is for non-commercial use. If Nivora is sold as a paid
// service, either take their commercial plan or switch this one file to another provider.
const { getJson } = require('./http');
const { cached } = require('./cache');

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const TTL_MS = 20 * 60 * 1000; // the model updates hourly, so 20 minutes is plenty

// WMO weather codes -> words and an icon name the app draws.
const CODES = {
  0: ['Clear sky', 'sun'],
  1: ['Mainly clear', 'sun'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'],
  48: ['Fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'heavy-rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'heavy-rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'],
  81: ['Showers', 'rain'],
  82: ['Heavy showers', 'heavy-rain'],
  85: ['Snow showers', 'snow'],
  86: ['Snow showers', 'snow'],
  95: ['Thunderstorms', 'storm'],
  96: ['Thunderstorms with hail', 'storm'],
  99: ['Thunderstorms with hail', 'storm']
};
const describe = (code) => CODES[code] || ['Unknown', 'cloud'];

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => (Number.isFinite(deg) ? COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] : '');

const round = (n, d = 0) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
const uvLabel = (uv) => (uv === null ? '' : uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme');

// Open-Meteo answer -> the compact shape the app uses.
const shape = (raw) => {
  const c = raw.current || {};
  const h = raw.hourly || {};
  const d = raw.daily || {};
  const times = h.time || [];
  // The hour that "now" falls in, e.g. 2026-10-28T15
  let now = times.findIndex((t) => String(t).slice(0, 13) === String(c.time || '').slice(0, 13));
  if (now < 0) now = 0;
  const at = (arr, i) => (Array.isArray(arr) ? arr[i] : undefined);

  const [condition, icon] = describe(c.weather_code);
  const uv = round(at(h.uv_index, now));
  const visibilityM = at(h.visibility, now);

  const hourly = times.slice(now, now + 24).map((time, i) => {
    const [cond, ic] = describe(at(h.weather_code, now + i));
    return {
      time,
      temp: round(at(h.temperature_2m, now + i)),
      rainChance: round(at(h.precipitation_probability, now + i)),
      code: at(h.weather_code, now + i),
      condition: cond,
      icon: ic,
      isDay: at(h.is_day, now + i) === 1
    };
  });

  const daily = (d.time || []).map((date, i) => {
    const [cond, ic] = describe(at(d.weather_code, i));
    return {
      date,
      code: at(d.weather_code, i),
      condition: cond,
      icon: ic,
      max: round(at(d.temperature_2m_max, i)),
      min: round(at(d.temperature_2m_min, i)),
      rainChance: round(at(d.precipitation_probability_max, i)),
      rainMm: round(at(d.precipitation_sum, i), 1),
      gustMax: round(at(d.wind_gusts_10m_max, i)),
      windMax: round(at(d.wind_speed_10m_max, i)),
      uvMax: round(at(d.uv_index_max, i)),
      sunrise: at(d.sunrise, i),
      sunset: at(d.sunset, i)
    };
  });

  return {
    timezone: raw.timezone || 'Asia/Kolkata',
    observedAt: c.time || null,
    today: String(c.time || '').slice(0, 10) || (daily[0] && daily[0].date) || null,
    current: {
      temp: round(c.temperature_2m),
      feelsLike: round(c.apparent_temperature),
      humidity: round(c.relative_humidity_2m),
      windKmh: round(c.wind_speed_10m),
      windDir: compass(c.wind_direction_10m),
      gustKmh: round(c.wind_gusts_10m),
      pressure: round(c.surface_pressure),
      uv,
      uvLabel: uvLabel(uv),
      visibilityKm: visibilityM === undefined || visibilityM === null ? null : round(visibilityM / 1000, visibilityM >= 10000 ? 0 : 1),
      rainChance: round(at(h.precipitation_probability, now)),
      code: c.weather_code,
      condition,
      icon,
      isDay: c.is_day === 1
    },
    hourly,
    daily
  };
};

const fetchWeather = async ({ lat, lng }) => {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day,uv_index,visibility',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7'
  });
  return shape(await getJson(`${FORECAST}?${q}`));
};

// Cached per ~1 km cell, shared by every resident nearby.
const getWeather = (place) => cached(`weather|${place.key}`, TTL_MS, () => fetchWeather(place));

module.exports = { getWeather, shape, describe, compass, TTL_MS };
