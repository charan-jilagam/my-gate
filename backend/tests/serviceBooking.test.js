const h = require('./helpers/harness');
const { mockingoose, models } = h;
const { ServiceRequest, ServiceProvider, Visitor, Notification } = models;

let resident;
let vendor;
let provider;

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  vendor = h.makeVendor();
  provider = h.makeProvider(vendor);
  h.knowUsers(resident, vendor);
  h.knowSociety();
  mockingoose(ServiceProvider).toReturn(provider, 'findOne');
  mockingoose(ServiceRequest).toReturn(0, 'countDocuments');
  mockingoose(ServiceRequest).toReturn([], 'find');
});

const booking = (over = {}) => ({
  providerId: String(provider._id),
  category: 'plumber',
  date: h.futureDate(3),
  startTime: '10:00',
  title: 'Leaking kitchen tap',
  description: 'Drips all night',
  ...over
});

// After a booking is saved, the route reads it back; hand it the saved document.
const readBackLastSaved = () =>
  mockingoose(ServiceRequest).toReturn(() => {
    const docs = h.savedDocs(ServiceRequest);
    const doc = docs[docs.length - 1];
    doc.residentId = resident;
    doc.providerUserId = vendor;
    return doc;
  }, 'findOne');

describe('access', () => {
  test('signed-out callers are turned away', async () => {
    const res = await h.api().get('/api/services/categories');
    expect(res.status).toBe(401);
  });

  test('the catalogue lists the everyday trades', async () => {
    const res = await h.api().get('/api/services/categories').set(h.auth(resident));
    expect(res.status).toBe(200);
    const keys = res.body.categories.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['electrician', 'plumber', 'carpenter']));
  });

  test('vendors cannot book other vendors', async () => {
    const res = await h.api().post('/api/service-requests').set(h.auth(vendor)).send(booking());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/service-requests', () => {
  test('rejects incomplete requests with readable messages', async () => {
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send({ title: 'x', date: 'soon' });
    expect(res.status).toBe(400);
    const messages = res.body.errors.map((e) => e.msg);
    expect(messages).toEqual(expect.arrayContaining(['Choose a vendor', 'Choose a service', 'Pick a valid date', 'Pick a time slot']));
  });

  test('books a free slot; the start code only appears once the vendor confirms', async () => {
    readBackLastSaved();
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking());

    expect(res.status).toBe(201);
    const r = res.body.request;
    expect(r).toMatchObject({ status: 'requested', category: 'plumber', startTime: '10:00', endTime: '11:00', flat: 'A-101', visitCharge: 250, viewerRole: 'resident' });
    expect(r.startOtp).toBeUndefined(); // nothing to read out until the vendor has confirmed
    // The vendor's number stays private until they confirm.
    expect(r.provider.phone).toBeUndefined();
    expect(r.actions).toMatchObject({ cancel: true, reschedule: true, review: false });

    const saved = h.savedDocs(ServiceRequest)[0];
    expect(saved.slotActive).toBe(true);
    // 10:00 India time is 04:30 UTC
    expect(saved.startAt.toISOString()).toBe(`${booking().date}T04:30:00.000Z`);
  });

  test('tells the vendor about the new request', async () => {
    readBackLastSaved();
    await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking());
    const notices = h.savedDocs(Notification);
    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0]).toMatchObject({ title: 'New service request', type: 'service_update' });
    expect(String(notices[0].userId)).toBe(String(vendor._id));
    expect(notices[0].message).toMatch(/Asha \(A-101\) needs plumber: Leaking kitchen tap/);
  });

  test('refuses a slot that is already taken', async () => {
    const date = h.futureDate(3);
    mockingoose(ServiceRequest).toReturn([{ startAt: new Date(`${date}T04:30:00.000Z`), endAt: new Date(`${date}T05:30:00.000Z`) }], 'find');
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking({ date }));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Someone just booked that time/);
    expect(h.savedDocs(ServiceRequest)).toHaveLength(0);
  });

  test('two people racing for one slot: the database unique index decides', async () => {
    const dup = Object.assign(new Error('E11000 duplicate key error collection: serviceRequests'), { code: 11000 });
    mockingoose(ServiceRequest).toReturn(dup, 'save');
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Someone just booked that time/);
  });

  test('refuses a time that is not one of the vendor\'s slots', async () => {
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking({ startTime: '10:30' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not one of the vendor/);
  });

  test('refuses a service the vendor does not offer', async () => {
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking({ category: 'carpenter' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not offer carpenter/);
  });

  test('refuses a vendor from another society', async () => {
    const foreign = h.makeVendor({ societyId: h.OTHER_SOCIETY_ID });
    const theirs = h.makeProvider(foreign, { societyId: h.OTHER_SOCIETY_ID });
    mockingoose(ServiceProvider).toReturn(theirs, 'findOne');
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking({ providerId: String(theirs._id) }));
    expect(res.status).toBe(404);
  });

  test('refuses a vendor the admin has hidden', async () => {
    mockingoose(ServiceProvider).toReturn(h.makeProvider(vendor, { isActive: false }), 'findOne');
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking());
    expect(res.status).toBe(404);
  });

  test('refuses dates past the vendor\'s booking window', async () => {
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking({ date: h.futureDate(40) }));
    expect(res.status).toBe(400);
  });

  test('refuses a slot that is too soon to reach, using a pinned clock', async () => {
    // Monday 19 Oct 2026, 10:00 in India. The vendor wants 60 minutes' notice, so 10:00 is gone and 11:00 is fine.
    const everythingButDate = ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'];
    jest.useFakeTimers({ now: new Date('2026-10-19T04:30:00Z'), doNotFake: everythingButDate });
    try {
      const tooSoon = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking({ date: '2026-10-19', startTime: '10:00' }));
      expect(tooSoon.status).toBe(409);
      expect(tooSoon.body.message).toMatch(/too soon/);

      readBackLastSaved();
      const fine = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking({ date: '2026-10-19', startTime: '11:00' }));
      expect(fine.status).toBe(201);
      expect(fine.body.request.startTime).toBe('11:00');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a resident with too many open requests is stopped', async () => {
    mockingoose(ServiceRequest).toReturn(8, 'countDocuments');
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 open service requests/);
  });

  test('a vendor on auto-accept is confirmed straight away and gets a gate pass', async () => {
    mockingoose(ServiceProvider).toReturn(h.makeProvider(vendor, { autoAccept: true }), 'findOne');
    readBackLastSaved();
    const res = await h.api().post('/api/service-requests').set(h.auth(resident)).send(booking());

    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('confirmed');
    expect(res.body.request.startOtp).toMatch(/^\d{4}$/);
    expect(res.body.request.provider.phone).toBe('9123456780'); // contact opens up on confirmation
    const passes = h.savedDocs(Visitor);
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ name: 'Ravi Kumar', purpose: 'service', status: 'approved', approved: true, flatNo: '101' });
    expect(passes[0].purposeDescription).toMatch(/Plumber: Leaking kitchen tap/);
    // Both sides are told
    expect(h.savedDocs(Notification).map((n) => n.title)).toEqual(expect.arrayContaining(['New booking', 'Booking confirmed']));
  });
});
