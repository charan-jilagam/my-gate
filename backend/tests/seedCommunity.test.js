// The seed script cannot run without a database, so check what it would write: every document must pass its schema,
// and the sample data must obey the same rules as real data (no two active bookings in one slot, unique gate codes).
const mongoose = require('mongoose');
const { buildCommunitySeed, vendorUserData, VENDORS } = require('../scripts/seedCommunity');
const User = require('../models/User');
const { isActive } = require('../utils/serviceFlow');

const oid = () => new mongoose.Types.ObjectId();
const society = { _id: oid(), timezone: 'Asia/Kolkata', contactNumber: '9876543210' };
const user = (over) => new User({ _id: oid(), name: 'Resident', email: `${oid()}@x.com`, phone: '9000000000', password: 'pw12345678', societyId: society._id, isApproved: true, ...over });

const build = (now = new Date('2026-10-17T09:00:00Z')) => {
  const residents = [0, 1, 2, 3, 4].map((i) => user({ name: `Resident ${i}`, role: 'resident', flatNo: `10${i}`, block: 'A Block' }));
  const admin = user({ name: 'Admin', role: 'society_admin' });
  const vendorUsers = VENDORS.map((_, i) => new User({ _id: oid(), ...vendorUserData(society, i) }));
  return { vendorUsers, residents, ...buildCommunitySeed({ society, vendorUsers, residents, admin, now }) };
};

describe('seed data for services and community', () => {
  test('every document passes its schema', async () => {
    const s = build();
    const docs = [...s.providers, ...s.requests, ...s.posts, ...s.contacts, ...s.helpers, ...s.attendance, ...s.expenses, ...s.vendorUsers];
    expect(docs.length).toBeGreaterThan(60);
    for (const doc of docs) {
      await expect(doc.validate()).resolves.toBeUndefined();
    }
  });

  const EVERY_WEEKDAY = [12, 13, 14, 15, 16, 17, 18].map((d) => new Date(`2026-10-${d}T09:00:00Z`));

  test.each(EVERY_WEEKDAY)('no two active bookings share a vendor and start time, whatever day the seed runs (%s)', (now) => {
    const { requests } = build(now);
    const keys = requests.filter((r) => isActive(r.status)).map((r) => `${r.providerId}|${r.startAt.toISOString()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test.each(EVERY_WEEKDAY)('bookings fall inside each vendor weekly hours and on the slot grid, whatever day the seed runs (%s)', (now) => {
    const { requests, providers } = build(now);
    requests.forEach((r) => {
      const p = providers.find((x) => String(x._id) === String(r.providerId));
      const [h, m] = r.startTime.split(':').map(Number);
      const day = new Date(`${r.date}T00:00:00Z`).getUTCDay();
      const sched = p.weeklySchedule.find((d) => d.day === day);
      expect(sched.enabled).toBe(true);
      const mins = h * 60 + m;
      const from = Number(sched.start.slice(0, 2)) * 60;
      const to = Number(sched.end.slice(0, 2)) * 60;
      expect(mins).toBeGreaterThanOrEqual(from);
      expect(mins + p.slotMinutes).toBeLessThanOrEqual(to);
      expect((mins - from) % p.slotMinutes).toBe(0);
    });
  });

  test('vendor ratings and job counts match the completed bookings', () => {
    const { providers, requests } = build();
    const ravi = providers[0];
    const done = requests.filter((r) => String(r.providerId) === String(ravi._id) && r.status === 'completed');
    expect(ravi.jobsCompleted).toBe(done.length);
    expect(ravi.ratingCount).toBe(done.filter((r) => r.rating).length);
    expect(ravi.ratingAvg).toBe(5);
  });

  test('gate codes are unique and six digits', () => {
    const { helpers } = build();
    const codes = helpers.map((h) => h.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c) => expect(c).toMatch(/^\d{6}$/));
  });

  test('vendor accounts never clash across societies', () => {
    const other = { _id: oid() };
    const a = VENDORS.map((_, i) => vendorUserData(society, i));
    const b = VENDORS.map((_, i) => vendorUserData(other, i));
    const all = [...a, ...b];
    expect(new Set(all.map((u) => u.email)).size).toBe(all.length);
    expect(new Set(all.map((u) => u.phone)).size).toBe(all.length);
    all.forEach((u) => expect(u.phone).toMatch(/^\d{10}$/));
  });

  test('a society with no approved residents gets nothing', () => {
    const out = buildCommunitySeed({ society, vendorUsers: [], residents: [], admin: user({ role: 'society_admin' }) });
    expect(out.requests).toHaveLength(0);
  });
});
