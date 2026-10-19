const { allocate, buildDemands, isAvailable, dayIntervals } = require('../utils/allocator');
const { distanceM, checkPlace, placeFor } = require('../utils/geo');
const { recommendation, recommendScore } = require('../utils/presentService');

const TZ = 'Asia/Kolkata';
const g = (id, name = id) => ({ id, name });
// 2030-01-07 is a Monday (day 1).
const MON = '2030-01-07';
const TUE = '2030-01-08';
const WED = '2030-01-09';

const demand = (date, start, end, over = {}) => ({ date, start, end, postId: 'p1', postName: 'Main gate', postKind: 'main_gate', label: '', tz: TZ, ...over });
const week = (over = {}) => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, available: true, start: '00:00', end: '23:59', ...(over[day] || {}) }));

describe('availability', () => {
  test('a guard who set nothing is free at any time', () => {
    expect(isAvailable(undefined, { date: MON, start: '22:00', end: '06:00' })).toBe(true);
    expect(isAvailable({ weekly: [], offDates: [] }, { date: MON, start: '08:00', end: '16:00' })).toBe(true);
  });

  test('a shift must sit inside the hours the guard gave', () => {
    const a = { weekly: week({ 1: { start: '08:00', end: '16:00' } }), offDates: [] };
    expect(isAvailable(a, { date: MON, start: '08:00', end: '16:00' })).toBe(true);
    expect(isAvailable(a, { date: MON, start: '07:00', end: '15:00' })).toBe(false);
    expect(isAvailable(a, { date: MON, start: '10:00', end: '18:00' })).toBe(false);
  });

  test('a day marked unavailable and a day off both rule the guard out', () => {
    const a = { weekly: week({ 1: { available: false } }), offDates: [TUE] };
    expect(isAvailable(a, { date: MON, start: '08:00', end: '16:00' })).toBe(false);
    expect(isAvailable(a, { date: TUE, start: '08:00', end: '16:00' })).toBe(false);
    expect(isAvailable(a, { date: WED, start: '08:00', end: '16:00' })).toBe(true);
  });

  test('a night shift needs both evenings and mornings covered', () => {
    const open = { weekly: week(), offDates: [] };
    expect(isAvailable(open, { date: MON, start: '22:00', end: '06:00' })).toBe(true);
    // Tuesday is a day off, so a Monday night shift that runs into Tuesday morning cannot be worked.
    const tuesdayOff = { weekly: week(), offDates: [TUE] };
    expect(isAvailable(tuesdayOff, { date: MON, start: '22:00', end: '06:00' })).toBe(false);
    // A window that itself runs overnight covers the same night shift.
    const nightWindow = { weekly: week({ 1: { start: '20:00', end: '07:00' } }), offDates: [] };
    expect(isAvailable({ ...nightWindow, weekly: week({ 0: { available: false }, 1: { start: '20:00', end: '07:00' }, 2: { available: false } }) }, { date: MON, start: '22:00', end: '06:00' })).toBe(true);
  });

  test('the tail of yesterday\'s overnight window counts for today\'s early hours', () => {
    const a = { weekly: week({ 1: { start: '22:00', end: '06:00' } }), offDates: [] };
    expect(dayIntervals(a, TUE)).toEqual(expect.arrayContaining([[0, 360]]));
  });
});

describe('allocation', () => {
  const people = [g('a', 'Asha'), g('b', 'Bala'), g('c', 'Chitra')];

  test('fills every slot with someone who is free', () => {
    const r = allocate({ guards: people, demands: [demand(MON, '06:00', '14:00'), demand(MON, '14:00', '22:00'), demand(MON, '22:00', '06:00')] });
    expect(r.unfilled).toEqual([]);
    expect(r.assignments).toHaveLength(3);
    // Three guards, three slots: each guard gets exactly one.
    expect(new Set(r.assignments.map((a) => a.userId)).size).toBe(3);
  });

  test('two guards needed in one slot means two different people', () => {
    const r = allocate({ guards: people, demands: [demand(MON, '08:00', '16:00'), demand(MON, '08:00', '16:00')] });
    expect(r.assignments.map((a) => a.userId).sort()).toHaveLength(2);
    expect(new Set(r.assignments.map((a) => a.userId)).size).toBe(2);
  });

  test('work is shared: over a week nobody gets far more hours than the others', () => {
    const days = Array.from({ length: 6 }, (_, i) => new Date(Date.parse(`${MON}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
    const r = allocate({ guards: people, demands: days.map((d) => demand(d, '08:00', '16:00')) });
    expect(r.unfilled).toEqual([]);
    const hours = r.perGuard.map((p) => p.hours);
    expect(Math.max(...hours) - Math.min(...hours)).toBeLessThanOrEqual(8);
  });

  test('never gives someone a day off or hours they did not offer', () => {
    const availability = { a: { weekly: week({ 1: { available: false } }), offDates: [] }, b: { weekly: week({ 1: { start: '14:00', end: '23:59' } }), offDates: [] } };
    const r = allocate({ guards: [g('a'), g('b')], availability, demands: [demand(MON, '08:00', '16:00')] });
    expect(r.assignments).toEqual([]);
    expect(r.unfilled).toHaveLength(1);
    expect(r.unfilled[0].reason).toMatch(/No guard is available/);
  });

  test('a guard is not given two overlapping shifts, and keeps a rest gap', () => {
    const r = allocate({ guards: [g('a')], demands: [demand(MON, '06:00', '14:00'), demand(MON, '14:00', '22:00')] });
    expect(r.assignments).toHaveLength(1);
    expect(r.unfilled).toHaveLength(1);
    expect(r.unfilled[0].reason).toMatch(/rest|already/);
  });

  test('shifts that are already on the roster are respected', () => {
    const startAt = new Date('2030-01-07T02:30:00.000Z'); // 08:00 IST
    const existing = [{ userId: 'a', date: MON, startAt, endAt: new Date(startAt.getTime() + 8 * 3600000) }];
    const r = allocate({ guards: [g('a'), g('b')], existing, demands: [demand(MON, '10:00', '18:00')] });
    expect(r.assignments[0].userId).toBe('b');
  });

  test('a weekly cap stops one guard being given every day', () => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${MON}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
    const r = allocate({ guards: [g('a')], demands: days.map((d) => demand(d, '08:00', '16:00')), options: { maxHoursPerWeek: 40 } });
    expect(r.assignments).toHaveLength(5);
    expect(r.unfilled).toHaveLength(2);
  });

  test('the same input always gives the same plan', () => {
    const input = { guards: people, demands: [demand(MON, '06:00', '14:00'), demand(TUE, '06:00', '14:00'), demand(WED, '06:00', '14:00')] };
    expect(allocate(input).assignments.map((a) => `${a.date}${a.userId}`)).toEqual(allocate(input).assignments.map((a) => `${a.date}${a.userId}`));
  });

  test('real start and end instants come from the society time zone, and a night shift ends the next day', () => {
    const r = allocate({ guards: [g('a')], demands: [demand(MON, '22:00', '06:00')] });
    expect(r.assignments[0].startAt.toISOString()).toBe('2030-01-07T16:30:00.000Z');
    expect(r.assignments[0].endAt.toISOString()).toBe('2030-01-08T00:30:00.000Z');
  });

  test('builds one demand per guard needed, for active posts only', () => {
    const posts = [
      { _id: 'p1', name: 'Main gate', kind: 'main_gate', slots: [{ start: '06:00', end: '14:00', guards: 2 }, { start: '14:00', end: '22:00', guards: 1 }] },
      { _id: 'p2', name: 'Garden', kind: 'garden', isActive: false, slots: [{ start: '06:00', end: '10:00', guards: 1 }] }
    ];
    const d = buildDemands({ posts, dates: [MON, TUE], tz: TZ });
    expect(d).toHaveLength(6);
    expect(d.every((x) => x.postName === 'Main gate')).toBe(true);
  });
});

describe('distance and place checks', () => {
  const gate = { lat: 17.385, lng: 78.4867 };

  test('distance in metres between two points', () => {
    expect(distanceM(gate, gate)).toBe(0);
    const d = distanceM(gate, { lat: 17.386, lng: 78.4867 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
    expect(distanceM(gate, null)).toBeNull();
    expect(distanceM(gate, { lat: 'x', lng: 1 })).toBeNull();
  });

  test('a post\'s own pin wins; otherwise the society pin; otherwise nothing', () => {
    expect(placeFor({ name: 'Tower A', lat: 1, lng: 2, radiusMeters: 80 }, { location: { lat: 3, lng: 4 } })).toMatchObject({ lat: 1, lng: 2, radiusMeters: 80, label: 'Tower A' });
    expect(placeFor({ name: 'Tower A' }, { location: { lat: 3, lng: 4, radiusMeters: 250, label: 'Green Park' } })).toMatchObject({ lat: 3, lng: 4, radiusMeters: 250, label: 'Green Park' });
    expect(placeFor(null, {})).toBeNull();
  });

  test('inside, outside, and a poor GPS fix near the edge is given the benefit of the doubt', () => {
    const place = { ...gate, radiusMeters: 100, label: 'Main gate' };
    expect(checkPlace({ lat: 17.3851, lng: 78.4867 }, place).outside).toBe(false);
    expect(checkPlace({ lat: 17.39, lng: 78.4867 }, place).outside).toBe(true);
    const edge = { lat: 17.3860, lng: 78.4867, accuracy: 60 }; // about 111 m away, but only known to within 60 m
    expect(checkPlace(edge, place).outside).toBe(false);
    expect(checkPlace({ lat: 17.3851, lng: 78.4867 }, null)).toEqual({ distanceM: null, outside: null });
  });
});

describe('recommendations', () => {
  test('recommended has to be earned with enough good reviews', () => {
    expect(recommendation(5, 1)).toBe('new');
    expect(recommendation(4.2, 3)).toBe('recommended');
    expect(recommendation(4.6, 5)).toBe('top_rated');
    expect(recommendation(3.4, 10)).toBeNull();
  });

  test('the recommended order puts top rated, then recommended, then new, then the rest', () => {
    const order = [[3.5, 10], [5, 1], [4.2, 4], [4.8, 8]].sort((a, b) => recommendScore(b[0], b[1]) - recommendScore(a[0], a[1]));
    expect(order).toEqual([[4.8, 8], [4.2, 4], [5, 1], [3.5, 10]]);
  });
});
