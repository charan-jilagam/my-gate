// Turns a provider's weekly working hours into bookable slots for a given day.
// Pure functions: no database, no clock. Callers pass in the provider's settings, the existing bookings
// and the current time, which keeps this easy to test.

const {
  DEFAULT_TZ,
  isValidDate,
  isValidTime,
  zonedToUtc,
  todayIn,
  addDays,
  weekdayOf,
  toMinutes,
  toHM
} = require('./timezone');

const SLOT_LENGTHS = [30, 60, 90, 120, 180];

// Monday to Saturday, 9 to 6. Sunday off.
const defaultWeek = () =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: day !== 0, start: '09:00', end: '18:00' }));

const ms = (value) => new Date(value).getTime();

/**
 * Slots for one calendar day.
 *
 * @param {object} args
 * @param {string} args.date        YYYY-MM-DD in the society's time zone
 * @param {object} args.provider    { weeklySchedule, slotMinutes, breakTime, timeOff, minNoticeMinutes, maxAdvanceDays, acceptingJobs }
 * @param {Array}  args.bookings    active bookings, each with startAt and endAt
 * @param {Date}   args.now
 * @param {string} args.tz
 * @returns {{date, closed, reason, note, slots: Array<{start, end, startAt, endAt, available, reason}>}}
 */
const buildDaySlots = ({ date, provider, bookings = [], now = new Date(), tz = DEFAULT_TZ }) => {
  const out = { date, closed: false, reason: null, note: null, slots: [] };
  const close = (reason, note) => {
    out.closed = true;
    out.reason = reason;
    out.note = note || null;
    return out;
  };

  if (!isValidDate(date)) return close('invalid_date');

  const today = todayIn(tz, now);
  if (date < today) return close('past');
  if (date > addDays(today, provider.maxAdvanceDays ?? 14)) return close('too_far');
  if (provider.acceptingJobs === false) return close('paused');

  const off = (provider.timeOff || []).find((t) => t.date === date);
  if (off) return close('time_off', off.reason);

  const week = provider.weeklySchedule && provider.weeklySchedule.length ? provider.weeklySchedule : defaultWeek();
  const day = week.find((d) => d.day === weekdayOf(date));
  if (!day || !day.enabled) return close('day_off');

  const step = provider.slotMinutes || 60;
  const opens = toMinutes(day.start);
  const closes = toMinutes(day.end);
  const brk = provider.breakTime && provider.breakTime.enabled
    ? { from: toMinutes(provider.breakTime.start), to: toMinutes(provider.breakTime.end) }
    : null;
  const notBefore = now.getTime() + (provider.minNoticeMinutes ?? 60) * 60000;
  const busy = bookings.map((b) => [ms(b.startAt), ms(b.endAt)]);

  for (let from = opens; from + step <= closes; from += step) {
    const to = from + step;
    if (brk && from < brk.to && to > brk.from) continue; // inside the break

    const startAt = zonedToUtc(date, toHM(from), tz);
    const endAt = zonedToUtc(date, toHM(to), tz);
    let available = true;
    let reason = null;

    if (startAt.getTime() < notBefore) {
      available = false;
      reason = 'too_soon';
    } else if (busy.some(([bs, be]) => bs < endAt.getTime() && be > startAt.getTime())) {
      available = false;
      reason = 'booked';
    }

    out.slots.push({
      start: toHM(from),
      end: toHM(to),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      available,
      reason
    });
  }

  if (!out.slots.length) return close('no_slots');
  return out;
};

// One line per day for a date strip: how many slots are free, or why the day is closed.
const summarizeDays = ({ from, days, provider, bookings = [], now = new Date(), tz = DEFAULT_TZ }) => {
  const list = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const day = buildDaySlots({ date, provider, bookings, now, tz });
    list.push({
      date,
      closed: day.closed,
      reason: day.reason,
      total: day.slots.length,
      free: day.slots.filter((s) => s.available).length
    });
  }
  return list;
};

// The earliest free slot in the next few days, or null.
const nextAvailableSlot = ({ provider, bookings = [], now = new Date(), tz = DEFAULT_TZ, searchDays = 14 }) => {
  const today = todayIn(tz, now);
  for (let i = 0; i <= searchDays; i++) {
    const date = addDays(today, i);
    const day = buildDaySlots({ date, provider, bookings, now, tz });
    if (day.reason === 'too_far' || day.reason === 'paused') return null;
    const slot = day.slots.find((s) => s.available);
    if (slot) return { date, ...slot };
  }
  return null;
};

// Checks a provider's working-hours settings. Returns a list of plain-language problems (empty when fine).
const validateAvailability = ({ weeklySchedule, breakTime, slotMinutes, timeOff }) => {
  const errors = [];

  if (slotMinutes !== undefined && !SLOT_LENGTHS.includes(Number(slotMinutes))) {
    errors.push(`Slot length must be one of ${SLOT_LENGTHS.join(', ')} minutes.`);
  }

  if (weeklySchedule !== undefined) {
    if (!Array.isArray(weeklySchedule) || weeklySchedule.length > 7) {
      errors.push('Working hours must list at most seven days.');
    } else {
      const seen = new Set();
      weeklySchedule.forEach((d) => {
        if (!Number.isInteger(d.day) || d.day < 0 || d.day > 6) return errors.push('Each working day must be between Sunday and Saturday.');
        if (seen.has(d.day)) return errors.push('A day is listed twice in the working hours.');
        seen.add(d.day);
        if (!d.enabled) return undefined;
        if (!isValidTime(d.start) || !isValidTime(d.end)) return errors.push('Working hours need a start and an end time like 09:00.');
        if (toMinutes(d.end) <= toMinutes(d.start)) return errors.push('Closing time must be after opening time.');
        if (slotMinutes && toMinutes(d.end) - toMinutes(d.start) < Number(slotMinutes)) {
          return errors.push('A working day is shorter than one slot.');
        }
        return undefined;
      });
    }
  }

  if (breakTime && breakTime.enabled) {
    if (!isValidTime(breakTime.start) || !isValidTime(breakTime.end)) errors.push('The break needs a start and an end time.');
    else if (toMinutes(breakTime.end) <= toMinutes(breakTime.start)) errors.push('The break must end after it starts.');
  }

  if (timeOff !== undefined) {
    if (!Array.isArray(timeOff) || timeOff.length > 120) errors.push('Too many days off listed.');
    else if (timeOff.some((t) => !isValidDate(t && t.date))) errors.push('Each day off needs a valid date.');
  }

  return errors;
};

module.exports = {
  SLOT_LENGTHS,
  defaultWeek,
  buildDaySlots,
  summarizeDays,
  nextAvailableSlot,
  validateAvailability
};
