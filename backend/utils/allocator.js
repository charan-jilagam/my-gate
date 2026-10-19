// Automatic shift allocation. Pure functions: give it the guards, when each can work, what is already planned
// and what each post needs; it says who should work what, and which slots it could not fill.
//
// Rules, in plain words:
//  - a guard is only given a shift inside the hours they said they can work, and never on a day off;
//  - a guard never gets two shifts that overlap, and always gets a rest gap between shifts;
//  - nobody works more than a set number of hours in a day or in a week;
//  - when several guards qualify, the one with the fewest hours so far gets it, so work is shared fairly;
//  - the hardest slots (fewest guards able to take them) are filled first.

const { addDays, weekdayOf, toMinutes, zonedToUtc } = require('./timezone');

const DAY = 1440;
const DEFAULTS = { maxHoursPerDay: 12, maxHoursPerWeek: 60, minRestHours: 8 };

// What a guard can do on one calendar day, as minute ranges [from, to] within that day.
// A window that runs past midnight counts to the end of this day, and its rest counts from 00:00 on the next.
const dayIntervals = (availability, date) => {
  if (!availability) return [[0, DAY]]; // nothing set up: free at any time
  if ((availability.offDates || []).includes(date)) return [];
  const weekly = availability.weekly || [];
  if (!weekly.length) return [[0, DAY]];
  const out = [];
  const own = weekly.find((w) => w.day === weekdayOf(date));
  if (own && own.available !== false) {
    const s = toMinutes(own.start || '00:00');
    let e = toMinutes(own.end || '23:59');
    if (e >= 23 * 60 + 59) e = DAY; // "until 23:59" means until the end of the day
    out.push(e > s ? [s, e] : [s, DAY]);
  }
  // The tail of yesterday's overnight window lands on the start of today.
  const prevDate = addDays(date, -1);
  const prev = weekly.find((w) => w.day === weekdayOf(prevDate));
  if (prev && prev.available !== false && !(availability.offDates || []).includes(prevDate)) {
    const s = toMinutes(prev.start || '00:00');
    const e = toMinutes(prev.end || '23:59');
    if (e < 23 * 60 + 59 && e <= s && e > 0) out.push([0, e]);
  }
  return out;
};

const covers = (intervals, from, to) => {
  // merge touching intervals first (a window ending at midnight joins the one starting at 00:00)
  const sorted = intervals.map((i) => [...i]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i[0] <= last[1]) last[1] = Math.max(last[1], i[1]);
    else merged.push(i);
  }
  return merged.some(([a, b]) => from >= a && to <= b);
};

// Can this guard work this slot, going by what they said they can do? `slot` has date, start, end ("HH:MM").
const isAvailable = (availability, slot) => {
  const s = toMinutes(slot.start);
  const e = toMinutes(slot.end);
  const overnight = e <= s;
  if (!overnight) return covers(dayIntervals(availability, slot.date), s, e);
  const next = addDays(slot.date, 1);
  const firstPart = covers(dayIntervals(availability, slot.date), s, DAY);
  const secondPart = e === 0 || covers(dayIntervals(availability, next), 0, e);
  return firstPart && secondPart;
};

const overlaps = (a, b) => a.startAt < b.endAt && b.startAt < a.endAt;
const hours = (x) => (x.endAt - x.startAt) / 3600000;

/**
 * @param guards        [{ id, name }]
 * @param availability  { [guardId]: { weekly, offDates } }
 * @param existing      shifts already on the roster: [{ userId, startAt, endAt, date }]
 * @param demands       what must be covered: [{ date, start, end, postId, postName, postKind, label, tz }] with one entry per guard needed
 * @param options       { maxHoursPerDay, maxHoursPerWeek, minRestHours }
 * @returns { assignments, unfilled, perGuard }
 */
const allocate = ({ guards, availability = {}, existing = [], demands, options = {} }) => {
  const opt = { ...DEFAULTS, ...options };
  const restMs = opt.minRestHours * 3600000;

  // Everything each guard already has, including what we hand out as we go.
  const load = new Map(guards.map((g) => [String(g.id), existing.filter((s) => String(s.userId) === String(g.id)).map((s) => ({ ...s }))]));
  const totalHours = new Map(guards.map((g) => [String(g.id), 0]));

  // Give each demand real instants once.
  const slots = demands.map((d, index) => {
    const s = toMinutes(d.start);
    const e = toMinutes(d.end);
    const startAt = zonedToUtc(d.date, d.start, d.tz);
    const endAt = zonedToUtc(e <= s ? addDays(d.date, 1) : d.date, d.end, d.tz);
    return { ...d, index, startAt, endAt };
  });

  const fits = (guard, slot) => {
    const key = String(guard.id);
    if (!isAvailable(availability[key], slot)) return false;
    const mine = load.get(key);
    // No overlap, and a rest gap before and after.
    for (const s of mine) {
      if (s.startAt < new Date(slot.endAt.getTime() + restMs) && slot.startAt < new Date(s.endAt.getTime() + restMs)) return false;
    }
    // Hours that day (by start date) and in the 7 days ending on this date.
    const sameDay = mine.filter((s) => s.date === slot.date).reduce((n, s) => n + hours(s), 0);
    if (sameDay + hours(slot) > opt.maxHoursPerDay) return false;
    const from = addDays(slot.date, -6);
    const week = mine.filter((s) => s.date >= from && s.date <= slot.date).reduce((n, s) => n + hours(s), 0);
    return week + hours(slot) <= opt.maxHoursPerWeek;
  };

  // Hardest first: slots few guards can take, then earliest.
  const hardness = new Map(slots.map((slot) => [slot.index, guards.filter((g) => isAvailable(availability[String(g.id)], slot)).length]));
  const order = [...slots].sort((a, b) => hardness.get(a.index) - hardness.get(b.index) || a.startAt - b.startAt || a.index - b.index);

  const assignments = [];
  const unfilled = [];
  for (const slot of order) {
    const candidates = guards.filter((g) => fits(g, slot));
    if (!candidates.length) {
      unfilled.push({ date: slot.date, start: slot.start, end: slot.end, postId: slot.postId, postName: slot.postName, label: slot.label, reason: hardness.get(slot.index) === 0 ? 'No guard is available at this time.' : 'Every available guard already has a shift, would not get enough rest, or would work too many hours.' });
      continue;
    }
    candidates.sort((a, b) => totalHours.get(String(a.id)) - totalHours.get(String(b.id)) || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
    const pick = candidates[0];
    const key = String(pick.id);
    load.get(key).push({ userId: pick.id, date: slot.date, startAt: slot.startAt, endAt: slot.endAt });
    totalHours.set(key, totalHours.get(key) + hours(slot));
    assignments.push({ userId: pick.id, name: pick.name, date: slot.date, startTime: slot.start, endTime: slot.end, startAt: slot.startAt, endAt: slot.endAt, postId: slot.postId, postName: slot.postName, post: slot.postKind, label: slot.label });
  }

  assignments.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || String(a.postName).localeCompare(String(b.postName)));
  unfilled.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const perGuard = guards.map((g) => ({ userId: g.id, name: g.name, shifts: assignments.filter((a) => String(a.userId) === String(g.id)).length, hours: Math.round(totalHours.get(String(g.id)) * 10) / 10 }));
  return { assignments, unfilled, perGuard };
};

// The list of slots to cover for each date, from the posts the admin set up. One entry per guard needed.
const buildDemands = ({ posts, dates, tz }) => {
  const out = [];
  for (const date of dates) {
    for (const post of posts) {
      if (post.isActive === false) continue;
      for (const slot of post.slots || []) {
        for (let n = 0; n < (slot.guards || 1); n += 1) {
          out.push({ date, start: slot.start, end: slot.end, label: slot.label || '', postId: post._id, postName: post.name, postKind: post.kind, tz });
        }
      }
    }
  }
  return out;
};

module.exports = { allocate, buildDemands, isAvailable, dayIntervals, DEFAULTS };
