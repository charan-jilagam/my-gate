const h = require('./helpers/harness');
const { mockingoose, models } = h;
const { ServiceRequest, ServiceProvider, Notification } = models;

let resident;
let vendor;
let provider;
let admin;

beforeEach(() => {
  h.reset();
  resident = h.makeUser({ googleId: 'g' });
  vendor = h.makeVendor({ googleId: 'g' });
  provider = h.makeProvider(vendor);
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  h.knowUsers(resident, vendor, admin);
  h.knowSociety();
  mockingoose(ServiceProvider).toReturn(provider, 'findOne');
  mockingoose(ServiceProvider).toReturn([provider], 'find');
  mockingoose(ServiceRequest).toReturn([], 'find');
});

const job = (over = {}) => {
  const r = h.makeRequest({ resident, vendor, provider, ...over });
  mockingoose(ServiceRequest).toReturn(r, 'findOne');
  return r;
};
const rateResident = (r, who, body) => h.api().put(`/api/service-requests/${r._id}/rate-resident`).set(h.auth(who)).send(body);
const notesTo = (user) => h.savedDocs(Notification).filter((n) => String(n.userId) === String(user._id));

describe('the vendor rates the resident', () => {
  test('after the job is done, with stars and a comment; the resident is NOT told', async () => {
    const r = job({ status: 'completed' });
    const res = await rateResident(r, vendor, { rating: 5, review: 'Polite and ready on time' });
    expect(res.status).toBe(200);
    expect(r).toMatchObject({ residentRating: 5, residentReview: 'Polite and ready on time' });
    expect(r.residentRatedAt).toBeInstanceOf(Date);
    expect(res.body.request).toMatchObject({ residentRating: 5, actions: expect.objectContaining({ rateResident: false }) });
    expect(notesTo(resident)).toHaveLength(0);
  });

  test('the resident never sees it, in the job, the list or the average', async () => {
    const r = job({ status: 'completed', residentRating: 2, residentReview: 'Late to pay', residentRatedAt: new Date() });
    const one = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(resident));
    expect(one.status).toBe(200);
    for (const k of ['residentRating', 'residentReview', 'residentRatedAt']) expect(one.body.request[k]).toBeUndefined();
    expect(one.body.request.resident.score).toBeUndefined();
    expect(JSON.stringify(one.body)).not.toMatch(/Late to pay/);
    const mine = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(vendor));
    expect(mine.body.request).toMatchObject({ residentRating: 2, residentReview: 'Late to pay' });
  });

  test('the vendor is offered the button only for a finished job they have not rated', async () => {
    const done = job({ status: 'completed' });
    const res = await h.api().get(`/api/service-requests/${done._id}`).set(h.auth(vendor));
    expect(res.body.request.actions.rateResident).toBe(true);
    const rated = job({ status: 'completed', residentRating: 4 });
    const again = await h.api().get(`/api/service-requests/${rated._id}`).set(h.auth(vendor));
    expect(again.body.request.actions.rateResident).toBe(false);
    const open = job({ status: 'confirmed' });
    expect((await h.api().get(`/api/service-requests/${open._id}`).set(h.auth(vendor))).body.request.actions.rateResident).toBe(false);
  });

  test('only once, only when completed, and only 1 to 5 stars', async () => {
    expect((await rateResident(job({ status: 'confirmed' }), vendor, { rating: 5 })).status).toBe(409);
    expect((await rateResident(job({ status: 'completed', residentRating: 3 }), vendor, { rating: 1 })).status).toBe(409);
    for (const rating of [0, 6, 'great', undefined]) {
      expect((await rateResident(job({ status: 'completed' }), vendor, { rating })).status).toBe(400);
    }
    expect((await rateResident(job({ status: 'completed' }), vendor, { rating: 4, review: 'x'.repeat(301) })).status).toBe(400);
  });

  test('only the vendor of that job can do it; residents and admins cannot', async () => {
    const other = h.makeVendor({ name: 'Other Vendor', googleId: 'g' });
    h.knowUsers(resident, vendor, admin, other);
    const r = job({ status: 'completed' });
    expect((await rateResident(r, other, { rating: 5 })).status).toBe(403);
    expect((await rateResident(r, resident, { rating: 5 })).status).toBe(403);
    expect((await rateResident(r, admin, { rating: 5 })).status).toBe(403);
  });

  test('the vendor sees how other vendors rated this resident, and the resident does not', async () => {
    const r = job({ status: 'requested' });
    mockingoose(ServiceRequest).toReturn([{ _id: resident._id, avg: 4.5, n: 6 }], 'aggregate');
    const asVendor = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(vendor));
    expect(asVendor.body.request.resident.score).toEqual({ avg: 4.5, count: 6 });
    const asResident = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(resident));
    expect(asResident.body.request.resident.score).toBeUndefined();
    const list = await h.api().get('/api/service-requests').set(h.auth(vendor));
    expect(list.status).toBe(200);
  });

  test('a failure in the score lookup never breaks the page', async () => {
    const r = job({ status: 'requested' });
    mockingoose(ServiceRequest).toReturn(new Error('db down'), 'aggregate');
    const res = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(vendor));
    expect(res.status).toBe(200);
    expect(res.body.request.resident.score).toBeUndefined();
  });
});

describe('recommending vendors', () => {
  const vendorWith = (name, ratingAvg, ratingCount, extra = {}) => {
    const user = h.makeVendor({ name, googleId: 'g' });
    return h.makeProvider(user, { ratingAvg, ratingCount, ...extra });
  };

  test('each vendor carries a badge that has to be earned', async () => {
    mockingoose(ServiceProvider).toReturn([vendorWith('Top Tina', 4.8, 9), vendorWith('Good Gopi', 4.2, 4), vendorWith('New Nita', 5, 1), vendorWith('Meh Manu', 3.2, 12)], 'find');
    const res = await h.api().get('/api/services/providers').set(h.auth(resident));
    const badge = Object.fromEntries(res.body.providers.map((p) => [p.name, p.badge]));
    expect(badge).toEqual({ 'Top Tina': 'top_rated', 'Good Gopi': 'recommended', 'New Nita': 'new', 'Meh Manu': null });
  });

  test('the recommended order puts earned praise first, not one friendly review', async () => {
    mockingoose(ServiceProvider).toReturn([vendorWith('New Nita', 5, 1), vendorWith('Meh Manu', 3.2, 12), vendorWith('Good Gopi', 4.2, 4), vendorWith('Top Tina', 4.8, 9)], 'find');
    const res = await h.api().get('/api/services/providers?sort=recommended').set(h.auth(resident));
    expect(res.body.providers.map((p) => p.name)).toEqual(['Top Tina', 'Good Gopi', 'New Nita', 'Meh Manu']);
  });

  test('"book again" marks vendors this resident has already had a finished job with', async () => {
    const used = vendorWith('Used Uma', 4.5, 5);
    const fresh = vendorWith('Fresh Farid', 4.5, 5);
    mockingoose(ServiceProvider).toReturn([used, fresh], 'find');
    mockingoose(ServiceRequest).toReturn((q) => (q.getQuery().status === 'completed' ? [{ providerId: used._id }] : []), 'find');
    const res = await h.api().get('/api/services/providers').set(h.auth(resident));
    const byName = Object.fromEntries(res.body.providers.map((p) => [p.name, p.bookedBefore]));
    expect(byName).toEqual({ 'Used Uma': true, 'Fresh Farid': false });
  });

  test('an unknown sort is refused', async () => {
    expect((await h.api().get('/api/services/providers?sort=magic').set(h.auth(resident))).status).toBe(400);
  });
});

describe('notices reach the whole crew, and never fail the admin', () => {
  const Notice = require('../models/Notice');
  const User = h.models.User;

  const post = (body, io = true) => {
    const app = require('../server').app;
    if (io) app.set('io', { to: () => ({ emit: () => {} }) });
    return h.api().post('/api/notices').set(h.auth(admin)).send({ title: 'Water cut', content: 'No water from 10 to 12 on Sunday.', type: 'notice', ...body });
  };

  let crew;
  beforeEach(() => {
    crew = {
      resident: h.makeUser({ name: 'R1', googleId: 'g' }),
      guard: h.makeUser({ role: 'security', name: 'G1', googleId: 'g', flatNo: undefined, block: undefined }),
      head: h.makeUser({ role: 'guard_admin', name: 'H1', googleId: 'g', flatNo: undefined, block: undefined }),
      staff: h.makeUser({ role: 'staff', name: 'S1', googleId: 'g', flatNo: undefined, block: undefined })
    };
    h.knowUsers(admin, ...Object.values(crew));
    mockingoose(User).toReturn((q) => {
      const r = q.getQuery().role;
      const roles = r && r.$in ? r.$in : [r];
      return Object.values(crew).filter((u) => roles.includes(u.role));
    }, 'find');
  });

  test('a notice for everyone also goes to guards, the guard head and staff, and opens the notice itself', async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    const told = h.savedDocs(Notification);
    expect(told.map((n) => String(n.userId)).sort()).toEqual(Object.values(crew).map((u) => String(u._id)).sort());
    expect(told[0].actionUrl).toMatch(/^\/notices\/[a-f0-9]{24}$/);
  });

  test('a notice for certain flats stays with those residents', async () => {
    const res = await post({ targetAudience: 'specific_flats', targetFlats: ['A-101'] });
    expect(res.status).toBe(201);
    expect(h.savedDocs(Notification).map((n) => String(n.userId))).toEqual([String(crew.resident._id)]);
  });

  test('a failing notification does not turn a saved notice into an error', async () => {
    const real = Notification.create;
    Notification.create = jest.fn().mockRejectedValue(new Error('push service down'));
    try {
      const res = await post({});
      expect(res.status).toBe(201);
      expect(h.savedDocs(Notice)).toHaveLength(1);
    } finally {
      Notification.create = real;
    }
  });
});
