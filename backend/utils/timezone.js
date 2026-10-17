// Society-local time handling without a date library. It uses Intl, so it follows the IANA time zone database.
//
// Slots are described the way people say them: a calendar date ("2026-10-20") and a wall-clock time ("14:30")
// in the society's time zone. These helpers turn that into a real instant (a UTC Date) and back.

const DEFAULT_TZ = 'Asia/Kolkata';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const formatters = new Map();
const formatterFor = (tz) => {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    );
  }
  return formatters.get(tz);
};

const isValidTimeZone = (tz) => {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    formatterFor(tz);
    return true;
  } catch (e) {
    return false;
  }
};

// A real calendar date in YYYY-MM-DD form. Rejects things like 2026-02-30.
const isValidDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
};

const isValidTime = (value) => typeof value === 'string' && TIME_RE.test(value);

// How far the zone is ahead of UTC at a given instant, in milliseconds.
const offsetMs = (instantMs, tz) => {
  const parts = formatterFor(tz).formatToParts(new Date(instantMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const hour = get('hour') === 24 ? 0 : get('hour');
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
};

// "2026-10-20" + "14:30" in the given zone -> the matching UTC instant.
const zonedToUtc = (dateStr, timeStr, tz = DEFAULT_TZ) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, h, min);
  const first = naive - offsetMs(naive, tz);
  // The offset can differ at the corrected instant around a daylight-saving change, so settle it once more.
  const second = naive - offsetMs(first, tz);
  return new Date(second);
};

// The calendar date it is right now in the zone, as YYYY-MM-DD.
const todayIn = (tz = DEFAULT_TZ, now = new Date()) => {
  const parts = formatterFor(tz).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const addDays = (dateStr, days) => new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// 0 = Sunday ... 6 = Saturday, for a calendar date (the same everywhere on Earth).
const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

const toMinutes = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

const toHM = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

module.exports = {
  DEFAULT_TZ,
  DATE_RE,
  TIME_RE,
  isValidTimeZone,
  isValidDate,
  isValidTime,
  zonedToUtc,
  todayIn,
  addDays,
  weekdayOf,
  toMinutes,
  toHM
};
