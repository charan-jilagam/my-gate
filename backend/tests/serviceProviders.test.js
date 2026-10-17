const h = require('./helpers/harness');
const { mockingoose, models } = h;
const { ServiceRequest, ServiceProvider, Notification } = models;

let resident;
let vendor;
let provider;
let admin;

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  vendor = h.makeVendor();
  provider = h.makeProvider(vendor);
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  h.knowUsers(resident, vendor, admin);
  h.knowSociety();
  mockingoose(ServiceProvider).toReturn(provider, 'findOne');
  mockingoose(ServiceProvider).toReturn([provider], 'find');
  mockingoose(ServiceRequest).toReturn([], 'find');
});

describe('browsing vendors', () => {
  test('lists vendors with their next free slot and no contact details', async () => {
    const res = await h.api().get('/api/services/providers?category=plumber').set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    const [p] = res.body.providers;
    expect(p).toMatchObject({ name: 'Ravi Kumar', categories: ['plumber', 'electrician'], visitCharge: 250, isVerified: false, rating: { avg: 0, count: 0 } });
    expect(p.nextAvailable).toMatchObject({ start: expect.stringMatching(/^\d\d:00$/), available: true });
    expect(JSON.stringify(p)).not.toMatch(/9123456780|phone|email/);
  });

  test('filters the query by category', async () => {
    let asked;
    mockingoose(ServiceProvider).toReturn((q) => {
      asked = q.getQuery();
      return [provider];
    }, 'find');
    await h.api().get('/api/services/providers?category=plumber').set(h.auth(resident));
    expect(String(asked.societyId)).toBe(String(h.SOCIETY_ID));
    expect(asked.categories).toBe('plumber');
    expect(asked.isActive).toBe(true);
  });

  test('rejects an unknown category', async () => {
    const res = await h.api().get('/api/services/providers?category=astrologer').set(h.auth(resident));
    expect(res.status).toBe(400);
  });

  test('hides vendors whose account is not approved', async () => {
    const pending = h.makeVendor({ isApproved: false });
    mockingoose(ServiceProvider).toReturn([h.makeProvider(pending)], 'find');
    const res = await h.api().get('/api/services/providers').set(h.auth(resident));
    expect(res.body.count).toBe(0);
  });

  test('searches by name and by trade', async () => {
    const carpenterUser = h.makeVendor({ name: 'Mohan Singh' });
    const carpenter = h.makeProvider(carpenterUser, { categories: ['carpenter'] });
    mockingoose(ServiceProvider).toReturn([provider, carpenter], 'find');

    const byName = await h.api().get('/api/services/providers?q=mohan').set(h.auth(resident));
    expect(byName.body.providers.map((p) => p.name)).toEqual(['Mohan Singh']);
    const byTrade = await h.api().get('/api/services/providers?q=carpent').set(h.auth(resident));
    expect(byTrade.body.providers.map((p) => p.name)).toEqual(['Mohan Singh']);
  });

  test('sorts by rating or by price when asked', async () => {
    const cheap = h.makeProvider(h.makeVendor({ name: 'Cheap Chandra' }), { visitCharge: 100, ratingAvg: 3.2, ratingCount: 4 });
    const loved = h.makeProvider(h.makeVendor({ name: 'Loved Lakshmi' }), { visitCharge: 500, ratingAvg: 4.9, ratingCount: 40 });
    mockingoose(ServiceProvider).toReturn([cheap, loved], 'find');

    const byRating = await h.api().get('/api/services/providers?sort=rating').set(h.auth(resident));
    expect(byRating.body.providers.map((p) => p.name)).toEqual(['Loved Lakshmi', 'Cheap Chandra']);
    const byPrice = await h.api().get('/api/services/providers?sort=price').set(h.auth(resident));
    expect(byPrice.body.providers.map((p) => p.name)).toEqual(['Cheap Chandra', 'Loved Lakshmi']);
  });

  test('a vendor who paused bookings has no next slot', async () => {
    mockingoose(ServiceProvider).toReturn([h.makeProvider(vendor, { acceptingJobs: false })], 'find');
    const res = await h.api().get('/api/services/providers').set(h.auth(resident));
    expect(res.body.providers[0].nextAvailable).toBeNull();
    expect(res.body.providers[0].acceptingJobs).toBe(false);
  });

  test('vendors are not allowed to browse the marketplace', async () => {
    const res = await h.api().get('/api/services/providers').set(h.auth(vendor));
    expect(res.status).toBe(403);
  });
});

describe('a vendor\'s day', () => {
  test('lists every slot and marks the taken one', async () => {
    const date = h.futureDate(3);
    mockingoose(ServiceRequest).toReturn([{ startAt: new Date(`${date}T05:30:00.000Z`), endAt: new Date(`${date}T06:30:00.000Z`) }], 'find'); // 11:00 IST
    const res = await h.api().get(`/api/services/providers/${provider._id}/slots?date=${date}`).set(h.auth(resident));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date, closed: false, timezone: 'Asia/Kolkata' });
    expect(res.body.slots).toHaveLength(9); // 09:00 to 18:00, hourly
    const taken = res.body.slots.filter((s) => !s.available);
    expect(taken).toEqual([expect.objectContaining({ start: '11:00', reason: 'booked' })]);
  });

  test('a day off says why', async () => {
    const date = h.futureDate(3);
    mockingoose(ServiceProvider).toReturn(h.makeProvider(vendor, { timeOff: [{ date, reason: 'Family function' }] }), 'findOne');
    const res = await h.api().get(`/api/services/providers/${provider._id}/slots?date=${date}`).set(h.auth(resident));
    expect(res.body).toMatchObject({ closed: true, reason: 'time_off', note: 'Family function', slots: [] });
  });

  test('rejects a nonsense date', async () => {
    const res = await h.api().get(`/api/services/providers/${provider._id}/slots?date=tomorrow`).set(h.auth(resident));
    expect(res.status).toBe(400);
  });

  test('summarises the next two weeks for a date picker', async () => {
    const res = await h.api().get(`/api/services/providers/${provider._id}/availability?days=7`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(7);
    expect(res.body.days.every((d) => typeof d.free === 'number' && typeof d.total === 'number')).toBe(true);
    expect(res.body.days[2]).toMatchObject({ closed: false, total: 9, free: 9 });
  });

  test('profile shows recent reviews with first names only', async () => {
    const reviewed = h.makeRequest({ resident, vendor, provider, status: 'completed', rating: 5, review: 'Excellent work', reviewedAt: new Date() });
    mockingoose(ServiceRequest).toReturn([reviewed], 'find');
    const res = await h.api().get(`/api/services/providers/${provider._id}`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.reviews[0]).toMatchObject({ rating: 5, review: 'Excellent work', by: 'Asha, A-101' });
    expect(JSON.stringify(res.body)).not.toMatch(/Asha Rao|9876543210/);
  });

  test('a hidden vendor looks like a missing one to residents but not to admins', async () => {
    mockingoose(ServiceProvider).toReturn(h.makeProvider(vendor, { isActive: false }), 'findOne');
    const asResident = await h.api().get(`/api/services/providers/${provider._id}`).set(h.auth(resident));
    expect(asResident.status).toBe(404);
    const asAdmin = await h.api().get(`/api/services/providers/${provider._id}`).set(h.auth(admin));
    expect(asAdmin.status).toBe(200);
  });
});

describe('vendor profile', () => {
  test('a new vendor has no profile yet', async () => {
    mockingoose(ServiceProvider).toReturn(null, 'findOne');
    const res = await h.api().get('/api/services/me').set(h.auth(vendor));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ profile: null, stats: null });
  });

  test('home-screen numbers come from their jobs', async () => {
    mockingoose(ServiceRequest).toReturn(2, 'countDocuments');
    mockingoose(ServiceRequest).toReturn([{ _id: null, jobs: 5, amount: 4200 }], 'aggregate');
    const res = await h.api().get('/api/services/me').set(h.auth(vendor));
    expect(res.body.stats).toEqual({ today: 2, awaiting: 2, upcoming: 2, monthJobs: 5, monthEarnings: 4200 });
    expect(res.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.timezone).toBe('Asia/Kolkata');
  });

  test('setting up needs at least one trade', async () => {
    mockingoose(ServiceProvider).toReturn(null, 'findOne');
    const res = await h.api().put('/api/services/me').set(h.auth(vendor)).send({ bio: 'hello' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least one service/);
  });

  test('creates a profile with sensible default hours', async () => {
    mockingoose(ServiceProvider).toReturn(null, 'findOne');
    const res = await h.api().put('/api/services/me').set(h.auth(vendor)).send({ categories: ['plumber'], bio: 'Fifteen years of experience', visitCharge: 300, experienceYears: 15 });
    expect(res.status).toBe(200);
    const [saved] = h.savedDocs(ServiceProvider);
    expect(saved).toMatchObject({ bio: 'Fifteen years of experience', visitCharge: 300, slotMinutes: 60, isVerified: false, isActive: true });
    expect(String(saved.userId)).toBe(String(vendor._id));
    expect(String(saved.societyId)).toBe(String(vendor.societyId));
    expect(saved.weeklySchedule).toHaveLength(7);
  });

  test('vendors cannot verify themselves or change their rating', async () => {
    const res = await h.api().put('/api/services/me').set(h.auth(vendor)).send({ isVerified: true, isActive: false, ratingAvg: 5, ratingCount: 999, jobsCompleted: 999, societyId: String(h.OTHER_SOCIETY_ID) });
    expect(res.status).toBe(200);
    expect(provider).toMatchObject({ isVerified: false, isActive: true, ratingAvg: 0, ratingCount: 0, jobsCompleted: 0 });
    expect(String(provider.societyId)).toBe(String(h.SOCIETY_ID));
  });

  test.each([
    ['closing before opening', { weeklySchedule: [{ day: 1, enabled: true, start: '18:00', end: '09:00' }] }, /after opening/],
    ['an odd slot length', { slotMinutes: 45 }, /Slot length/],
    ['a backwards break', { breakTime: { enabled: true, start: '15:00', end: '14:00' } }, /break/],
    ['an impossible day off', { timeOff: [{ date: '2026-02-30' }] }, /valid date/]
  ])('refuses %s', async (_name, body, message) => {
    const res = await h.api().put('/api/services/me').set(h.auth(vendor)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  test('saves hours, a lunch break and future days off; drops days already gone', async () => {
    const future = h.futureDate(10);
    const res = await h.api().put('/api/services/me').set(h.auth(vendor)).send({
      slotMinutes: 90,
      weeklySchedule: [{ day: 1, enabled: true, start: '10:00', end: '19:00' }, { day: 0, enabled: false }],
      breakTime: { enabled: true, start: '13:00', end: '14:00' },
      timeOff: [{ date: '2020-01-01', reason: 'ancient' }, { date: future, reason: 'Wedding' }, { date: future, reason: 'duplicate' }],
      autoAccept: true,
      acceptingJobs: false
    });
    expect(res.status).toBe(200);
    expect(provider).toMatchObject({ slotMinutes: 90, autoAccept: true, acceptingJobs: false });
    expect(provider.breakTime).toMatchObject({ enabled: true, start: '13:00', end: '14:00' });
    expect(provider.timeOff.map((t) => [t.date, t.reason])).toEqual([[future, 'Wedding']]);
    expect(provider.weeklySchedule.find((d) => d.day === 1)).toMatchObject({ start: '10:00', end: '19:00' });
  });

  test('residents have no vendor profile', async () => {
    const res = await h.api().get('/api/services/me').set(h.auth(resident));
    expect(res.status).toBe(403);
  });
});

describe('society admin controls', () => {
  test('verifying a vendor tells them', async () => {
    const res = await h.api().put(`/api/services/providers/${provider._id}/verify`).set(h.auth(admin)).send({ isVerified: true });
    expect(res.status).toBe(200);
    expect(provider.isVerified).toBe(true);
    expect(h.savedDocs(Notification)[0]).toMatchObject({ title: 'You are now a verified vendor' });
  });

  test('hiding a vendor removes them from the marketplace and tells them', async () => {
    const res = await h.api().put(`/api/services/providers/${provider._id}/status`).set(h.auth(admin)).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(provider.isActive).toBe(false);
    expect(h.savedDocs(Notification)[0]).toMatchObject({ title: 'Your service listing is paused', priority: 'high' });
  });

  test('residents and vendors cannot do either', async () => {
    for (const who of [resident, vendor]) {
      const v = await h.api().put(`/api/services/providers/${provider._id}/verify`).set(h.auth(who)).send({ isVerified: true });
      const s = await h.api().put(`/api/services/providers/${provider._id}/status`).set(h.auth(who)).send({ isActive: false });
      expect([v.status, s.status]).toEqual([403, 403]);
    }
  });

  test('needs a real true/false', async () => {
    const res = await h.api().put(`/api/services/providers/${provider._id}/verify`).set(h.auth(admin)).send({ isVerified: 'maybe' });
    expect(res.status).toBe(400);
  });

  test('an admin from another society cannot manage this vendor', async () => {
    const foreign = h.makeUser({ role: 'society_admin', societyId: h.OTHER_SOCIETY_ID, flatNo: undefined });
    h.knowUsers(resident, vendor, admin, foreign);
    const res = await h.api().put(`/api/services/providers/${provider._id}/verify`).set(h.auth(foreign)).send({ isVerified: true });
    expect(res.status).toBe(403);
  });

  test('the admin list includes hidden vendors, with contact details and open job counts', async () => {
    mockingoose(ServiceProvider).toReturn([h.makeProvider(vendor, { isActive: false })], 'find');
    mockingoose(ServiceRequest).toReturn([{ _id: { provider: provider._id, status: 'confirmed' }, n: 2 }, { _id: { provider: provider._id, status: 'completed' }, n: 9 }], 'aggregate');
    const res = await h.api().get('/api/services/admin/providers').set(h.auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.providers[0]).toMatchObject({ name: 'Ravi Kumar', isActive: false, phone: '9123456780', accountApproved: true });
  });
});
