// Back-up weather from MET Norway (free, no API key; asks only for a clear User-Agent, which http.js sends).
// Used when Open-Meteo does not answer, for example when it limits a shared server address.
// It is turned into the same raw shape Open-Meteo gives, so weather.js `shape()` works unchanged.
// Some numbers are estimates (rain chance, feels-like, sunrise), good enough to keep the screen useful.
const { getJson } = require('./http');

const MET = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

// Hours ahead of UTC for a point: India is +5:30; elsewhere the nearest whole hour from longitude.
const offsetHours = (lat, lng) => (lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 98 ? 5.5 : Math.round(lng / 15));

// UTC ISO -> 'YYYY-MM-DDTHH:MM' on the clock at that offset.
const local = (iso, off) => new Date(new Date(iso).getTime() + off * 3600000).toISOString().slice(0, 16);

// MET symbol (clearsky_day, lightrainshowers_night, heavyrainandthunder ...) -> WMO code and whether it is day.
const wmo = (symbol = '') => {
  const s = String(symbol).replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 95;
  const heavy = s.startsWith('heavy');
  const light = s.startsWith('light');
  if (s.includes('snow')) return heavy ? 75 : light ? 71 : 73;
  if (s.includes('sleet')) return 66;
  if (s.includes('showers')) return heavy ? 82 : light ? 80 : 81;
  if (s.includes('rain')) return heavy ? 65 : light ? 61 : 63;
  if (s === 'clearsky') return 0;
  if (s === 'fair') return 1;
  if (s === 'partlycloudy') return 2;
  if (s === 'cloudy') return 3;
  if (s === 'fog') return 45;
  return 3;
};
const isDayFrom = (symbol) => (/_night$/.test(symbol || '') ? 0 : 1);

// Rain chance is not in the compact feed: estimate it from the symbol and the amount of rain.
const chanceOf = (symbol, mm) => {
  const wet = /rain|shower|sleet|snow|thunder/.test(symbol || '');
  if (!wet && !(mm >= 0.2)) return 5;
  if (mm >= 2) return 85;
  if (mm >= 0.5) return 65;
  return wet ? 40 : 20;
};

// Steadman's "feels like" from temperature (C), humidity (%) and wind (m/s).
const feels = (t, rh, ws) => {
  if (![t, rh, ws].every(Number.isFinite)) return t;
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return t + 0.33 * e - 0.7 * ws - 4;
};

// Sunrise and sunset (local 'YYYY-MM-DDTHH:MM') with the standard solar formula, within a few minutes.
const sunTimes = (date, lat, lng, off) => {
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+date.slice(0, 4), 0, 0)) / 86400000);
  const g = (2 * Math.PI / 365) * (day - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH > 1 || cosH < -1) return { sunrise: undefined, sunset: undefined };
  const h = Math.acos(cosH) / rad;
  const at = (minutesUtc) => {
    const m = Math.round(minutesUtc + off * 60);
    const wrapped = ((m % 1440) + 1440) % 1440;
    return `${date}T${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  };
  return { sunrise: at(720 - 4 * (lng + h) - eqt), sunset: at(720 - 4 * (lng - h) - eqt) };
};

const toOpenMeteoShape = (json, { lat, lng }) => {
  const series = (json.properties && json.properties.timeseries) || [];
  if (!series.length) throw new Error('MET Norway sent no forecast');
  const off = offsetHours(lat, lng);
  const first = series[0];
  const d0 = first.data.instant.details;
  const sym0 = (first.data.next_1_hours || first.data.next_6_hours || {}).summary;
  const symbol0 = sym0 && sym0.symbol_code;

  const hourlyRows = series.filter((s) => s.data.next_1_hours).slice(0, 48);
  const hourly = { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [], is_day: [], uv_index: [], visibility: [] };
  hourlyRows.forEach((s) => {
    const symbol = s.data.next_1_hours.summary.symbol_code;
    const mm = (s.data.next_1_hours.details || {}).precipitation_amount || 0;
    hourly.time.push(local(s.time, off));
    hourly.temperature_2m.push(s.data.instant.details.air_temperature);
    hourly.precipitation_probability.push(chanceOf(symbol, mm));
    hourly.weather_code.push(wmo(symbol));
    hourly.is_day.push(isDayFrom(symbol));
    hourly.uv_index.push(s.data.instant.details.ultraviolet_index_clear_sky);
    hourly.visibility.push(undefined);
  });

  // Daily numbers from every entry, grouped by local date. Rain uses the shortest period each entry offers.
  const days = new Map();
  series.forEach((s) => {
    const date = local(s.time, off).slice(0, 10);
    const day = days.get(date) || { temps: [], rain: 0, wind: [], gust: [], uv: [], codes: [], chance: 0 };
    const det = s.data.instant.details;
    day.temps.push(det.air_temperature);
    day.wind.push((det.wind_speed || 0) * 3.6);
    day.gust.push((det.wind_speed_of_gust !== undefined ? det.wind_speed_of_gust : det.wind_speed || 0) * 3.6);
    if (det.ultraviolet_index_clear_sky !== undefined) day.uv.push(det.ultraviolet_index_clear_sky);
    const p = s.data.next_1_hours || s.data.next_6_hours;
    if (p) {
      const mm = (p.details || {}).precipitation_amount || 0;
      day.rain += mm;
      day.codes.push(wmo(p.summary.symbol_code));
      day.chance = Math.max(day.chance, chanceOf(p.summary.symbol_code, mm));
    }
    days.set(date, day);
  });
  const dates = [...days.keys()].slice(0, 7);
  const daily = {
    time: dates, weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], precipitation_sum: [],
    wind_speed_10m_max: [], wind_gusts_10m_max: [], uv_index_max: [], sunrise: [], sunset: []
  };
  dates.forEach((date) => {
    const d = days.get(date);
    // The worst weather of the day stands for the day.
    const code = d.codes.length ? d.codes.reduce((a, b) => (b > a ? b : a), 0) : 3;
    const sun = sunTimes(date, lat, lng, off);
    daily.weather_code.push(code);
    daily.temperature_2m_max.push(Math.max(...d.temps));
    daily.temperature_2m_min.push(Math.min(...d.temps));
    daily.precipitation_probability_max.push(d.chance);
    daily.precipitation_sum.push(d.rain);
    daily.wind_speed_10m_max.push(Math.max(...d.wind));
    daily.wind_gusts_10m_max.push(Math.max(...d.gust));
    daily.uv_index_max.push(d.uv.length ? Math.max(...d.uv) : undefined);
    daily.sunrise.push(sun.sunrise);
    daily.sunset.push(sun.sunset);
  });

  return {
    timezone: off === 5.5 ? 'Asia/Kolkata' : `UTC${off >= 0 ? '+' : ''}${off}`,
    current: {
      time: local(first.time, off),
      temperature_2m: d0.air_temperature,
      relative_humidity_2m: d0.relative_humidity,
      apparent_temperature: feels(d0.air_temperature, d0.relative_humidity, d0.wind_speed),
      is_day: isDayFrom(symbol0),
      weather_code: wmo(symbol0),
      surface_pressure: d0.air_pressure_at_sea_level,
      wind_speed_10m: (d0.wind_speed || 0) * 3.6,
      wind_direction_10m: d0.wind_from_direction,
      wind_gusts_10m: (d0.wind_speed_of_gust !== undefined ? d0.wind_speed_of_gust : d0.wind_speed || 0) * 3.6
    },
    hourly,
    daily
  };
};

const fetchFallback = async ({ lat, lng }) => {
  const url = `${MET}?lat=${Number(lat).toFixed(4)}&lon=${Number(lng).toFixed(4)}`;
  return toOpenMeteoShape(await getJson(url), { lat, lng });
};

module.exports = { fetchFallback, toOpenMeteoShape, wmo, sunTimes, feels, offsetHours };
