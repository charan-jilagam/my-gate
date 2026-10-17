const { buildDaySlots, summarizeDays, nextAvailableSlot, validateAvailability, defaultWeek } = require('../utils/slots');

const TZ = 'Asia/Kolkata';
// Saturday 17 Oct 2026, 10:30 in India
const SAT_MORNING = new Date('2026-10-17T05:00:00Z');

const provider = (over = {}) => ({
  weeklySchedule: defaultWeek(), // Mon-Sat 09:00-18:00, Sunday off
  slotMinutes: 60,
  breakTime: { enabled: true, start: '13:00', end: '14:00' },
  timeOff: [],
  minNoticeMinutes: 60,
  maxAdvanceDays: 14,
  acceptingJobs: true,
  ...over
});

const starts = (day) => day.slots.map((s) => s.start);

describe('buildDaySlots', () => {
  test('a normal working day skips the break', () => {
    const day = buildDaySlots({ date: '2026-10-19', provider: provider(), now: SAT_MORNING, tz: TZ }); // Monday
    expect(day.closed).toBe(false);
    expect(starts(day)).toEqual(['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']);
    expect(day.slots.every((s) => s.available)).toBe(true);
  });

  test('slot instants are in UTC but computed from society time', () => {
    const day = buildDaySlots({ date: '2026-10-19', provider: provider(), now: SAT_MORNING, tz: TZ });
    expect(day.slots[0].startAt).toBe('2026-10-19T03:30:00.000Z'); // 09:00 IST
    expect(day.slots[0].endAt).toBe('2026-10-19T04:30:00.000Z');
  });

  test('Sunday is closed by default', () => {
    const day = buildDaySlots({ date: '2026-10-18', provider: provider(), now: SAT_MORNING, tz: TZ });
    expect(day).toMatchObject({ closed: true, reason: 'day_off', slots: [] });
  });

  test('slots that start before the minimum notice are not offered today', () => {
    const now = new Date('2026-10-19T04:30:00Z'); // Monday 10:00 IST, 60 min notice -> earliest 11:00
    const day = buildDaySlots({ date: '2026-10-19', provider: provider(), now, tz: TZ });
    const by = Object.fromEntries(day.slots.map((s) => [s.start, s]));
    expect(by['09:00']).toMatchObject({ available: false, reason: 'too_soon' });
    expect(by['10:00']).toMatchObject({ available: false, reason: 'too_soon' });
    expect(by['11:00']).toMatchObject({ available: true, reason: null });
  });

  test('an existing booking blocks exactly its slot', () => {
    const bookings = [{ startAt: '2026-10-19T04:30:00.000Z', endAt: '2026-10-19T05:30:00.000Z' }]; // 10:00-11:00 IST
    const day = buildDaySlots({ date: '2026-10-19', provider: provider(), bookings, now: SAT_MORNING, tz: TZ });
    const booked = day.slots.filter((s) => !s.available);
    expect(booked.map((s) => [s.start, s.reason])).toEqual([['10:00', 'booked']]);
  });

  test('a booking made with a different slot length still blocks every slot it overlaps', () => {
    // 10:30-11:30 touches both the 10:00 and the 11:00 slot
    const bookings = [{ startAt: '2026-10-19T05:00:00.000Z', endAt: '2026-10-19T06:00:00.000Z' }];
    const day = buildDaySlots({ date: '2026-10-19', provider: provider(), bookings, now: SAT_MORNING, tz: TZ });
    expect(day.slots.filter((s) => !s.available).map((s) => s.start)).toEqual(['10:00', '11:00']);
  });

  test('back-to-back bookings do not block each other (end is exclusive)', () => {
    const bookings = [{ startAt: '2026-10-19T03:30:00.000Z', endAt: '2026-10-19T04:30:00.000Z' }]; // 09:00-10:00
    const day = buildDaySlots({ date: '2026-10-19', provider: provider(), bookings, now: SAT_MORNING, tz: TZ });
    expect(day.slots.find((s) => s.start === '10:00').available).toBe(true);
  });

  test('a day off closes the day and carries the reason', () => {
    const p = provider({ timeOff: [{ date: '2026-10-20', reason: 'Diwali' }] });
    const day = buildDaySlots({ date: '2026-10-20', provider: p, now: SAT_MORNING, tz: TZ });
    expect(day).toMatchObject({ closed: true, reason: 'time_off', note: 'Diwali' });
  });

  test('paused providers show nothing', () => {
    const day = buildDaySlots({ date: '2026-10-19', provider: provider({ acceptingJobs: false }), now: SAT_MORNING, tz: TZ });
    expect(day).toMatchObject({ closed: true, reason: 'paused' });
  });

  test('past dates and dates beyond the booking window are closed', () => {
    expect(buildDaySlots({ date: '2026-10-16', provider: provider(), now: SAT_MORNING, tz: TZ }).reason).toBe('past');
    // today is the 17th, window 14 days -> the 31st is the last bookable day
    expect(buildDaySlots({ date: '2026-10-31', provider: provider(), now: SAT_MORNING, tz: TZ }).closed).toBe(false);
    expect(buildDaySlots({ date: '2026-11-01', provider: provider(), now: SAT_MORNING, tz: TZ }).reason).toBe('too_far');
  });

  test('"today" is decided by society time, not UTC', () => {
    const now = new Date('2026-10-18T20:00:00Z'); // 01:30 Monday 19th in India
    expect(buildDaySlots({ date: '2026-10-18', provider: provider(), now, tz: TZ }).reason).toBe('past');
    expect(buildDaySlots({ date: '2026-10-19', provider: provider(), now, tz: TZ }).closed).toBe(false);
  });

  test('90-minute slots keep their grid and skip any that touch the break', () => {
    const day = buildDaySlots({ date: '2026-10-19', provider: provider({ slotMinutes: 90 }), now: SAT_MORNING, tz: TZ });
    expect(starts(day)).toEqual(['09:00', '10:30', '15:00', '16:30']);
  });

  test('without a break every hour is offered', () => {
    const day = buildDaySlots({ date: '2026-10-19', provider: provider({ breakTime: { enabled: false } }), now: SAT_MORNING, tz: TZ });
    expect(day.slots).toHaveLength(9);
  });

  test('a working day shorter than one slot gives no slots', () => {
    const week = defaultWeek().map((d) => (d.day === 1 ? { ...d, start: '09:00', end: '09:30' } : d));
    const day = buildDaySlots({ date: '2026-10-19', provider: provider({ weeklySchedule: week }), now: SAT_MORNING, tz: TZ });
    expect(day).toMatchObject({ closed: true, reason: 'no_slots' });
  });

  test('rejects malformed dates', () => {
    expect(buildDaySlots({ date: 'soon', provider: provider(), now: SAT_MORNING, tz: TZ }).reason).toBe('invalid_date');
  });
});

describe('summarizeDays and nextAvailableSlot', () => {
  test('summarizes free slots per day and flags closed days', () => {
    const list = summarizeDays({ from: '2026-10-17', days: 3, provider: provider(), now: SAT_MORNING, tz: TZ });
    expect(list.map((d) => d.date)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
    expect(list[1]).toMatchObject({ closed: true, reason: 'day_off', free: 0 });
    expect(list[2]).toMatchObject({ closed: false, free: 8, total: 8 });
    // Saturday 10:30 with 60 min notice: 09:00..11:00 are gone, 12:00 onwards remain
    expect(list[0].free).toBeLessThan(list[0].total);
  });

  test('next available slot skips closed and fully booked days', () => {
    // Saturday afternoon: nothing left today, Sunday off, so Monday 09:00
    const late = new Date('2026-10-17T11:30:00Z'); // 17:00 IST
    const next = nextAvailableSlot({ provider: provider(), now: late, tz: TZ });
    expect(next).toMatchObject({ date: '2026-10-19', start: '09:00' });
  });

  test('returns null when the provider is paused', () => {
    expect(nextAvailableSlot({ provider: provider({ acceptingJobs: false }), now: SAT_MORNING, tz: TZ })).toBeNull();
  });

  test('still offers the rest of today when slots remain', () => {
    const next = nextAvailableSlot({ provider: provider(), now: SAT_MORNING, tz: TZ }); // Saturday 10:30, 60 min notice
    expect(next).toMatchObject({ date: '2026-10-17', start: '12:00' });
  });

  test('looks past a fully booked day', () => {
    const late = new Date('2026-10-17T11:30:00Z'); // Saturday 17:00 IST: today is over, Sunday is off
    const monday = buildDaySlots({ date: '2026-10-19', provider: provider(), now: late, tz: TZ });
    const bookings = monday.slots.map((s) => ({ startAt: s.startAt, endAt: s.endAt }));
    const next = nextAvailableSlot({ provider: provider(), bookings, now: late, tz: TZ });
    expect(next).toMatchObject({ date: '2026-10-20', start: '09:00' });
  });
});

describe('validateAvailability', () => {
  test('accepts a sensible setup', () => {
    expect(validateAvailability({ weeklySchedule: defaultWeek(), breakTime: { enabled: true, start: '13:00', end: '14:00' }, slotMinutes: 60, timeOff: [{ date: '2026-12-25' }] })).toEqual([]);
  });

  test('flags problems in plain language', () => {
    expect(validateAvailability({ slotMinutes: 45 })[0]).toMatch(/Slot length/);
    expect(validateAvailability({ weeklySchedule: [{ day: 1, enabled: true, start: '18:00', end: '09:00' }] })[0]).toMatch(/after opening/);
    expect(validateAvailability({ weeklySchedule: [{ day: 9, enabled: true, start: '09:00', end: '10:00' }] })[0]).toMatch(/Sunday and Saturday/);
    expect(validateAvailability({ weeklySchedule: [{ day: 1, enabled: true, start: '09:00', end: '10:00' }, { day: 1, enabled: true, start: '09:00', end: '10:00' }] })[0]).toMatch(/twice/);
    expect(validateAvailability({ weeklySchedule: [{ day: 1, enabled: true, start: '9am', end: '10:00' }] })[0]).toMatch(/start and an end/);
    expect(validateAvailability({ breakTime: { enabled: true, start: '14:00', end: '13:00' } })[0]).toMatch(/break/);
    expect(validateAvailability({ timeOff: [{ date: 'tomorrow' }] })[0]).toMatch(/valid date/);
    expect(validateAvailability({ weeklySchedule: [{ day: 1, enabled: true, start: '09:00', end: '09:30' }], slotMinutes: 60 })[0]).toMatch(/shorter/);
  });

  test('disabled days are not checked for times', () => {
    expect(validateAvailability({ weeklySchedule: [{ day: 0, enabled: false }] })).toEqual([]);
  });
});
