const h = require('./helpers/harness');
const { mockingoose, models } = h;
const { ServiceRequest, ServiceProvider, Visitor, Notification } = models;

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
  mockingoose(ServiceRequest).toReturn([], 'find');
});

const job = (over = {}) => {
  const r = h.makeRequest({ resident, vendor, provider, ...over });
  mockingoose(ServiceRequest).toReturn(r, 'findOne');
  return r;
};
const put = (r, action, who, body = {}) => h.api().put(`/api/service-requests/${r._id}/${action}`).set(h.auth(who)).send(body);
const notices = () => h.savedDocs(Notification).map((n) => ({ to: String(n.userId), title: n.title, message: n.message, sms: undefined }));
const noticeTo = (user) => notices().filter((n) => n.to === String(user._id));

describe('vendor accepts', () => {
  test('confirms, opens a gate pass and tells the resident', async () => {
    const r = job();
    const res = await put(r, 'accept', vendor);

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('confirmed');
    expect(r.statusHistory.map((s) => s.status)).toContain('confirmed');

    const [pass] = h.savedDocs(Visitor);
    expect(pass).toMatchObject({ name: 'Ravi Kumar', phone: '9123456780', purpose: 'service', status: 'approved', flatNo: '101', block: 'A' });
    expect(pass.expectedArrival.toISOString()).toBe(r.startAt.toISOString());

    expect(noticeTo(resident)[0]).toMatchObject({ title: 'Booking confirmed' });
    expect(noticeTo(resident)[0].message).toMatch(/Ravi Kumar will come on/);
  });

  test('the vendor never sees the resident\'s start code', async () => {
    const res = await put(job(), 'accept', vendor);
    expect(res.body.request.startOtp).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('4821');
  });

  test('another vendor cannot touch it', async () => {
    const other = h.makeVendor({ name: 'Someone Else' });
    h.knowUsers(resident, vendor, admin, other);
    const res = await put(job(), 'accept', other);
    expect(res.status).toBe(403);
  });

  test('residents cannot accept their own request', async () => {
    const res = await put(job(), 'accept', resident);
    expect(res.status).toBe(403);
  });

  test('cannot accept twice', async () => {
    const res = await put(job({ status: 'confirmed' }), 'accept', vendor);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/confirmed cannot become confirmed/);
  });
});

describe('vendor declines', () => {
  test('frees the slot and explains why', async () => {
    const r = job();
    const res = await put(r, 'decline', vendor, { reason: 'On leave that day' });
    expect(res.status).toBe(200);
    expect(r.status).toBe('declined');
    expect(r.slotActive).toBe(false); // the slot can be booked again
    expect(noticeTo(resident)[0].message).toMatch(/On leave that day/);
  });
});

describe('arrival and start code', () => {
  test('"on the way" notifies the resident', async () => {
    const res = await put(job({ status: 'confirmed' }), 'on-the-way', vendor);
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('on_the_way');
    expect(noticeTo(resident)[0].title).toMatch(/Ravi Kumar is on the way/);
  });

  test('a wrong code is refused and counted', async () => {
    const r = job({ status: 'confirmed' });
    const res = await put(r, 'start', vendor, { otp: '1111' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not right/);
    expect(r.otpAttempts).toBe(1);
    expect(r.status).toBe('confirmed');
  });

  test('a malformed code never reaches the check', async () => {
    const res = await put(job({ status: 'confirmed' }), 'start', vendor, { otp: '12' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/4-digit/);
  });

  test('after five wrong tries even the right code is locked out', async () => {
    const r = job({ status: 'confirmed', otpAttempts: 5 });
    const res = await put(r, 'start', vendor, { otp: '4821' });
    expect(res.status).toBe(429);
    expect(r.status).toBe('confirmed');
  });

  test('the right code starts the work and burns the code', async () => {
    const r = job({ status: 'on_the_way' });
    const res = await put(r, 'start', vendor, { otp: '4821' });
    expect(res.status).toBe(200);
    expect(r.status).toBe('in_progress');
    expect(r.startedAt).toBeInstanceOf(Date);
    expect(r.startOtp).toBeUndefined();
    expect(noticeTo(resident)[0].title).toBe('Work has started');
  });

  test('work cannot start on a request nobody confirmed', async () => {
    const res = await put(job({ status: 'requested' }), 'start', vendor, { otp: '4821' });
    expect(res.status).toBe(409);
  });
});

describe('completion and payment', () => {
  test('needs an amount', async () => {
    const res = await put(job({ status: 'in_progress' }), 'complete', vendor, {});
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/amount/);
  });

  test('"paid" needs a payment method', async () => {
    const res = await put(job({ status: 'in_progress' }), 'complete', vendor, { finalAmount: 450, paymentStatus: 'paid' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cash, UPI or other/);
  });

  test('completes a paid job, counts it for the vendor and asks for a rating', async () => {
    const r = job({ status: 'in_progress' });
    const res = await put(r, 'complete', vendor, { finalAmount: 450, workSummary: 'Replaced washer', paymentStatus: 'paid', paymentMethod: 'upi' });

    expect(res.status).toBe(200);
    expect(r).toMatchObject({ status: 'completed', finalAmount: 450, paymentStatus: 'paid', paymentMethod: 'upi', workSummary: 'Replaced washer' });
    expect(r.completedAt).toBeInstanceOf(Date);
    expect(r.slotActive).toBe(false);
    expect(res.body.request.actions).toMatchObject({ markPaid: false });

    const [bump] = h.updatesTo(ServiceProvider);
    expect(bump.update).toEqual({ $inc: { jobsCompleted: 1 } });
    expect(noticeTo(resident)[0].message).toMatch(/₹450 \(paid\).*rate/);
  });

  test('an unpaid job can be marked paid later, once', async () => {
    const r = job({ status: 'completed', finalAmount: 300, paymentStatus: 'unpaid' });
    const ok = await put(r, 'payment', vendor, { paymentMethod: 'cash' });
    expect(ok.status).toBe(200);
    expect(r).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'cash' });

    const again = await put(r, 'payment', vendor, { paymentMethod: 'cash' });
    expect(again.status).toBe(409);
  });

  test('only the vendor on the job can mark it paid', async () => {
    const res = await put(job({ status: 'completed', paymentStatus: 'unpaid' }), 'payment', admin, { paymentMethod: 'cash' });
    expect(res.status).toBe(403);
  });
});

describe('cancellation', () => {
  test('a resident can cancel with no reason and the vendor is told', async () => {
    const r = job({ status: 'confirmed' });
    const res = await put(r, 'cancel', resident);
    expect(res.status).toBe(200);
    expect(r).toMatchObject({ status: 'cancelled', cancelledBy: 'resident', slotActive: false });
    expect(noticeTo(vendor)[0].message).toMatch(/Asha \(A-101\) cancelled/);
  });

  test('a vendor must say why', async () => {
    const res = await put(job({ status: 'confirmed' }), 'cancel', vendor, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/short reason/);
  });

  test('a vendor who cancels tells the resident, by text too', async () => {
    const r = job({ status: 'confirmed' });
    const res = await put(r, 'cancel', vendor, { reason: 'Truck broke down' });
    expect(res.status).toBe(200);
    expect(r.cancelledBy).toBe('provider');
    expect(noticeTo(resident)[0].message).toMatch(/cancelled by the vendor.*Truck broke down/);
  });

  test('the society office can cancel and both sides hear about it', async () => {
    const r = job({ status: 'requested' });
    const res = await put(r, 'cancel', admin, { reason: 'Duplicate booking' });
    expect(res.status).toBe(200);
    expect(r.cancelledBy).toBe('admin');
    expect(noticeTo(resident)).toHaveLength(1);
    expect(noticeTo(vendor)).toHaveLength(1);
  });

  test('cancelling withdraws the gate pass if the vendor has not arrived', async () => {
    const pass = new Visitor({ residentId: resident._id, societyId: resident.societyId, name: 'Ravi Kumar', phone: '9123456780', purpose: 'service', flatNo: '101', status: 'approved', approved: true });
    mockingoose(Visitor).toReturn(pass, 'findOne');
    const res = await put(job({ status: 'confirmed', visitorId: pass._id }), 'cancel', resident);
    expect(res.status).toBe(200);
    expect(pass).toMatchObject({ status: 'rejected', approved: false, rejected: true });
  });

  test('a vendor who is already inside keeps their pass', async () => {
    const pass = new Visitor({ residentId: resident._id, societyId: resident.societyId, name: 'Ravi Kumar', phone: '9123456780', purpose: 'service', flatNo: '101', status: 'checked_in', approved: true });
    mockingoose(Visitor).toReturn(pass, 'findOne');
    await put(job({ status: 'on_the_way', visitorId: pass._id }), 'cancel', resident);
    expect(pass.status).toBe('checked_in');
  });

  test('work in progress cannot be cancelled', async () => {
    const res = await put(job({ status: 'in_progress' }), 'cancel', resident);
    expect(res.status).toBe(409);
  });
});

describe('rescheduling', () => {
  const move = (r, body) => put(r, 'reschedule', resident, body);

  test('moves a request to a free slot', async () => {
    const r = job();
    const date = h.futureDate(4);
    const res = await move(r, { date, startTime: '14:00' });
    expect(res.status).toBe(200);
    expect(r).toMatchObject({ date, startTime: '14:00', endTime: '15:00', status: 'requested' });
    expect(r.startAt.toISOString()).toBe(`${date}T08:30:00.000Z`); // 14:00 IST
    expect(noticeTo(vendor)[0].message).toMatch(/moved/);
    expect(r.statusHistory.at(-1).note).toMatch(/Moved from/);
  });

  test('a confirmed booking needs the vendor to confirm the new time, and the old gate pass is withdrawn', async () => {
    const pass = new Visitor({ residentId: resident._id, societyId: resident.societyId, name: 'Ravi Kumar', phone: '9123456780', purpose: 'service', flatNo: '101', status: 'approved', approved: true });
    mockingoose(Visitor).toReturn(pass, 'findOne');
    const r = job({ status: 'confirmed', visitorId: pass._id });
    const res = await move(r, { date: h.futureDate(4), startTime: '15:00' });
    expect(res.status).toBe(200);
    expect(r.status).toBe('requested');
    expect(r.visitorId).toBeUndefined();
    expect(pass.status).toBe('rejected');
    expect(res.body.message).toMatch(/needs to confirm/);
  });

  test('with auto-accept the booking stays confirmed and the gate pass moves', async () => {
    mockingoose(ServiceProvider).toReturn(h.makeProvider(vendor, { autoAccept: true }), 'findOne');
    const passId = h.oid();
    const r = job({ status: 'confirmed', visitorId: passId });
    const res = await move(r, { date: h.futureDate(4), startTime: '15:00' });
    expect(res.status).toBe(200);
    expect(r.status).toBe('confirmed');
    const [moved] = h.updatesTo(Visitor);
    expect(String(moved.filter._id)).toBe(String(passId));
    expect(moved.update.$set.expectedArrival.toISOString()).toBe(r.startAt.toISOString());
  });

  test('refuses a slot someone else holds', async () => {
    const date = h.futureDate(4);
    mockingoose(ServiceRequest).toReturn([{ startAt: new Date(`${date}T09:30:00.000Z`), endAt: new Date(`${date}T10:30:00.000Z`) }], 'find'); // 15:00 IST
    const res = await move(job(), { date, startTime: '15:00' });
    expect(res.status).toBe(409);
  });

  test('refuses "moving" to the same slot', async () => {
    const r = job();
    const res = await move(r, { date: r.date, startTime: r.startTime });
    expect(res.status).toBe(400);
  });

  test('is only for bookings that have not started', async () => {
    const res = await move(job({ status: 'in_progress' }), { date: h.futureDate(4), startTime: '15:00' });
    expect(res.status).toBe(409);
  });

  test('only the resident can move it', async () => {
    const res = await put(job(), 'reschedule', vendor, { date: h.futureDate(4), startTime: '15:00' });
    expect(res.status).toBe(403);
  });
});

describe('reviews', () => {
  const rate = (r, who, body) => put(r, 'review', who, body);

  test('only after the job is done', async () => {
    const res = await rate(job({ status: 'confirmed' }), resident, { rating: 5 });
    expect(res.status).toBe(409);
  });

  test('saves the rating and recounts the vendor\'s average from all reviews', async () => {
    mockingoose(ServiceRequest).toReturn([{ _id: null, avg: 4.666, n: 3 }], 'aggregate');
    const r = job({ status: 'completed' });
    const res = await rate(r, resident, { rating: 5, review: 'Quick and tidy' });
    expect(res.status).toBe(200);
    expect(r).toMatchObject({ rating: 5, review: 'Quick and tidy' });

    const [change] = h.updatesTo(ServiceProvider);
    expect(change.update).toEqual({ ratingAvg: 4.7, ratingCount: 3 });
    expect(noticeTo(vendor)[0]).toMatchObject({ title: 'You got 5 stars' });
    expect(res.body.request.actions.review).toBe(false);
  });

  test('only once', async () => {
    const res = await rate(job({ status: 'completed', rating: 4 }), resident, { rating: 1 });
    expect(res.status).toBe(409);
  });

  test('stars must be 1 to 5', async () => {
    for (const rating of [0, 6, 'great']) {
      const res = await rate(job({ status: 'completed' }), resident, { rating });
      expect(res.status).toBe(400);
    }
  });

  test('another resident cannot rate it', async () => {
    const neighbour = h.makeUser({ name: 'Neighbour', flatNo: '202' });
    h.knowUsers(resident, vendor, admin, neighbour);
    const res = await rate(job({ status: 'completed' }), neighbour, { rating: 1 });
    expect(res.status).toBe(403);
  });
});

describe('who sees what', () => {
  const get = (r, who) => h.api().get(`/api/service-requests/${r._id}`).set(h.auth(who));

  test('a resident sees the start code only while it is useful', async () => {
    const confirmed = await get(job({ status: 'confirmed' }), resident);
    expect(confirmed.body.request.startOtp).toBe('4821');

    const started = await get(job({ status: 'in_progress' }), resident);
    expect(started.body.request.startOtp).toBeUndefined();
  });

  test('the vendor learns the resident\'s number only after confirming', async () => {
    const before = await get(job({ status: 'requested' }), vendor);
    expect(before.body.request.resident.phone).toBeUndefined();
    expect(before.body.request.resident.name).toBe('Asha Rao');

    const after = await get(job({ status: 'confirmed' }), vendor);
    expect(after.body.request.resident.phone).toBe('9876543210');
    expect(after.body.request.startOtp).toBeUndefined();
  });

  test('the society office sees everything but the code', async () => {
    const res = await get(job({ status: 'confirmed' }), admin);
    expect(res.status).toBe(200);
    expect(res.body.request.viewerRole).toBe('admin');
    expect(res.body.request.resident.phone).toBe('9876543210');
    expect(res.body.request.provider.phone).toBe('9123456780');
    expect(res.body.request.startOtp).toBeUndefined();
  });

  test('a neighbour cannot read someone else\'s request', async () => {
    const neighbour = h.makeUser({ name: 'Neighbour', flatNo: '202' });
    h.knowUsers(resident, vendor, admin, neighbour);
    const res = await get(job(), neighbour);
    expect(res.status).toBe(403);
  });

  test('a request from another society is out of reach, even for its admin', async () => {
    const foreignAdmin = h.makeUser({ role: 'society_admin', societyId: h.OTHER_SOCIETY_ID, flatNo: undefined });
    h.knowUsers(resident, vendor, foreignAdmin);
    const res = await get(job(), foreignAdmin);
    expect(res.status).toBe(403);
  });
});

describe('listing', () => {
  test('a resident only asks for their own requests, upcoming first', async () => {
    let asked;
    const r = h.makeRequest({ resident, vendor, provider });
    mockingoose(ServiceRequest).toReturn((q) => {
      asked = q.getQuery();
      return [r];
    }, 'find');

    const res = await h.api().get('/api/service-requests?scope=upcoming').set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(String(asked.residentId)).toBe(String(resident._id));
    expect(asked.status.$in.sort()).toEqual(['confirmed', 'in_progress', 'on_the_way', 'requested']);
    expect(res.body.requests[0]).toMatchObject({ title: 'Leaking kitchen tap', viewerRole: 'resident' });
  });

  test('a vendor sees their own jobs, not other vendors\'', async () => {
    let asked;
    mockingoose(ServiceRequest).toReturn((q) => {
      asked = q.getQuery();
      return [];
    }, 'find');
    await h.api().get('/api/service-requests').set(h.auth(vendor));
    expect(String(asked.providerUserId)).toBe(String(vendor._id));
    expect(asked.residentId).toBeUndefined();
  });

  test('an admin sees the whole society', async () => {
    let asked;
    mockingoose(ServiceRequest).toReturn((q) => {
      asked = q.getQuery();
      return [];
    }, 'find');
    await h.api().get('/api/service-requests?status=requested,completed,bogus').set(h.auth(admin));
    expect(String(asked.societyId)).toBe(String(h.SOCIETY_ID));
    expect(asked.status.$in).toEqual(['requested', 'completed']); // unknown values are ignored
  });
});
