const tz = require('../utils/timezone');

describe('zonedToUtc', () => {
  test('Asia/Kolkata is UTC+5:30 all year', () => {
    expect(tz.zonedToUtc('2026-10-20', '14:30', 'Asia/Kolkata').toISOString()).toBe('2026-10-20T09:00:00.000Z');
    expect(tz.zonedToUtc('2026-01-05', '00:00', 'Asia/Kolkata').toISOString()).toBe('2026-01-04T18:30:00.000Z');
  });

  test('follows daylight saving in other zones', () => {
    expect(tz.zonedToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z'); // EDT
    expect(tz.zonedToUtc('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z'); // EST
    expect(tz.zonedToUtc('2026-03-08', '03:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z'); // just after spring forward
    expect(tz.zonedToUtc('2026-11-01', '12:00', 'America/New_York').toISOString()).toBe('2026-11-01T17:00:00.000Z'); // after fall back
  });

  test('defaults to Asia/Kolkata', () => {
    expect(tz.zonedToUtc('2026-10-20', '09:00').toISOString()).toBe('2026-10-20T03:30:00.000Z');
  });
});

describe('todayIn', () => {
  test('rolls over at local midnight, not UTC midnight', () => {
    const instant = new Date('2026-10-17T20:00:00Z'); // 01:30 on the 18th in India
    expect(tz.todayIn('Asia/Kolkata', instant)).toBe('2026-10-18');
    expect(tz.todayIn('UTC', instant)).toBe('2026-10-17');
    expect(tz.todayIn('America/Los_Angeles', instant)).toBe('2026-10-17');
  });
});

describe('date helpers', () => {
  test('isValidDate accepts real dates only', () => {
    expect(tz.isValidDate('2026-10-17')).toBe(true);
    expect(tz.isValidDate('2028-02-29')).toBe(true); // leap year
    expect(tz.isValidDate('2026-02-29')).toBe(false);
    expect(tz.isValidDate('2026-02-30')).toBe(false);
    expect(tz.isValidDate('2026-13-01')).toBe(false);
    expect(tz.isValidDate('17-10-2026')).toBe(false);
    expect(tz.isValidDate(undefined)).toBe(false);
    expect(tz.isValidDate(20261017)).toBe(false);
  });

  test('isValidTime', () => {
    ['00:00', '09:30', '23:59'].forEach((t) => expect(tz.isValidTime(t)).toBe(true));
    ['24:00', '9:30', '12:60', '', null, '12:3'].forEach((t) => expect(tz.isValidTime(t)).toBe(false));
  });

  test('addDays crosses months and years', () => {
    expect(tz.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(tz.addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(tz.addDays('2026-10-17', 14)).toBe('2026-10-31');
  });

  test('weekdayOf', () => {
    expect(tz.weekdayOf('2026-10-17')).toBe(6); // Saturday
    expect(tz.weekdayOf('2026-10-18')).toBe(0); // Sunday
    expect(tz.weekdayOf('2026-10-19')).toBe(1); // Monday
  });

  test('minute conversions round-trip', () => {
    expect(tz.toMinutes('09:30')).toBe(570);
    expect(tz.toHM(570)).toBe('09:30');
    expect(tz.toHM(0)).toBe('00:00');
  });

  test('isValidTimeZone', () => {
    expect(tz.isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(tz.isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(tz.isValidTimeZone('')).toBe(false);
  });
});
