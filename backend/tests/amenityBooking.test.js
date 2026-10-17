const h = require('./helpers/harness');
const { mockingoose } = h;
const Booking = require('../models/Booking');
const Society = h.models.Society;
const User = h.models.User;
const Notification = h.models.Notification;
const { todayIn, addDays } = require('../utils/timezone');

let resident;
let admin;
const clubhouseId = h.oid();
const amenity = (over = {}) => ({ _id: clubhouseId, name: 'Clubhouse', capacity: 40, hourlyRate: 500, openTime: '06:00', closeTime: '22:00', slotMinutes: 60, maxSlotsPerBooking: 3, requiresApproval: true, maxAdvanceDays: 30, isActive: true, ...over });
const knowAmenities = (...list) => mockingoose(Society).toReturn({ _id: h.SOCIETY_ID, timezone: h.TZ, amenities: list }, 'findOne');
const day = (n = 3) => addDays(todayIn(h.TZ), n);

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  h.knowUsers(resident, admin);
  knowAmenities(amenity());
  mockingoose(Booking).toReturn(null, 'findOne');
  mockingoose(User).toReturn([admin], 'find');
});

const book = (body, who = resident) => h.api().post('/api/bookings').set(h.auth(who)).send({ amenity: 'Clubhouse', date: day(), startTime: '18:00', endTime: '20:00', numberOfGuests: 5, ...body });

describe('booking an amenity', () => {
  test('prices the booking on the server from the amenity rate', async () => {
    const res = await book({});
    expect(res.status).toBe(201);
    const [saved] = h.savedDocs(Booking);
    expect(saved.amount).toBe(1000); // 2 hours at 500, never taken from the client
    expect(saved.status).toBe('pending');
    expect(saved.startTime.toISOString()).toBe(`${day()}T12:30:00.000Z`); // 18:00 IST
    expect(saved.endTime.toISOString()).toBe(`${day()}T14:30:00.000Z`);
    expect(saved.dateStr).toBe(day());
    expect(String(saved.amenityId)).toBe(String(clubhouseId));
  });

  test('ignores an amount the client tries to send', async () => {
    await book({ amount: 1 });
    expect(h.savedDocs(Booking)[0].amount).toBe(1000);
  });

  test('is confirmed instantly when the amenity needs no approval', async () => {
    knowAmenities(amenity({ requiresApproval: false }));
    const res = await book({});
    expect(res.body.booking.status).toBe('approved');
    expect(res.body.message).toMatch(/confirmed/i);
  });

  test('a free amenity costs nothing', async () => {
    knowAmenities(amenity({ hourlyRate: undefined }));
    await book({});
    expect(h.savedDocs(Booking)[0].amount).toBe(0);
  });

  test('tells the office, with a link that opens', async () => {
    await book({});
    const [note] = h.savedDocs(Notification);
    expect(String(note.userId)).toBe(String(admin._id));
    expect(note).toMatchObject({ type: 'booking_request', actionUrl: '/bookings', relatedModel: 'Booking' });
  });

  test.each([
    ['outside opening hours', { startTime: '21:00', endTime: '23:00' }, /open 06:00 to 22:00/],
    ['before opening', { startTime: '05:00', endTime: '06:00' }, /open/],
    ['not on the slot grid', { startTime: '18:30', endTime: '19:30' }, /60-minute slots/],
    ['a duration that is not whole slots', { startTime: '18:00', endTime: '19:30' }, /60-minute slots/],
    ['end before start', { startTime: '20:00', endTime: '18:00' }, /after the start/],
    ['more slots in a row than allowed', { startTime: '10:00', endTime: '14:00' }, /at most 3 slots/],
    ['a past day', { date: day(-1) }, /passed/],
    ['too far ahead', { date: day(45) }, /30 days/],
    ['more guests than capacity', { numberOfGuests: 60 }, /fits 40/],
    ['an invalid date', { date: '2026-02-30' }, /valid date/],
    ['an unknown amenity', { amenity: 'Helipad' }, /not available/]
  ])('refuses %s', async (_label, over, message) => {
    const res = await book(over);
    expect([400, 404]).toContain(res.status);
    expect(res.body.message).toMatch(message);
    expect(h.savedDocs(Booking)).toHaveLength(0);
  });

  test('refuses a slot earlier today that has already begun, but allows a later one', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'], now: new Date('2026-10-19T09:30:00Z') }); // 15:00 IST
    try {
      const today = todayIn(h.TZ);
      expect(today).toBe('2026-10-19');
      const past = await book({ date: today, startTime: '14:00', endTime: '15:00' });
      expect(past.status).toBe(400);
      expect(past.body.message).toMatch(/already passed/);
      const later = await book({ date: today, startTime: '17:00', endTime: '18:00' });
      expect(later.status).toBe(201);
    } finally {
      jest.useRealTimers();
    }
  });

  test('refuses a time that clashes with an existing booking', async () => {
    mockingoose(Booking).toReturn({ _id: h.oid(), amenity: 'Clubhouse' }, 'findOne');
    const res = await book({});
    expect(res.status).toBe(409);
    expect(h.savedDocs(Booking)).toHaveLength(0);
  });

  test('asks the database for overlapping active bookings of the same amenity only', async () => {
    let asked;
    mockingoose(Booking).toReturn((q) => {
      asked = q.getQuery();
      return null;
    }, 'findOne');
    await book({});
    expect(asked).toMatchObject({ amenity: 'Clubhouse', status: { $in: ['pending', 'approved'] } });
    expect(asked.startTime.$lt.toISOString()).toBe(`${day()}T14:30:00.000Z`);
    expect(asked.endTime.$gt.toISOString()).toBe(`${day()}T12:30:00.000Z`);
  });

  test('holds one key per slot, which the unique index uses to stop double booking', async () => {
    await book({ startTime: '18:00', endTime: '20:00' });
    const [saved] = h.savedDocs(Booking);
    expect(saved.slotKeys).toEqual([`${h.SOCIETY_ID}|Clubhouse|${day()}|18:00`, `${h.SOCIETY_ID}|Clubhouse|${day()}|19:00`]);
  });

  test('two people booking the same slot at once: the database refuses the second and they are told', async () => {
    const real = Booking.create;
    Booking.create = jest.fn().mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    try {
      const res = await book({});
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/just booked/);
    } finally {
      Booking.create = real;
    }
  });

  test('a booking that is no longer active gives its slots back', async () => {
    const b = new Booking({ residentId: resident._id, societyId: h.SOCIETY_ID, amenity: 'Clubhouse', slotDate: new Date(), startTime: new Date(), endTime: new Date(), flatNo: '101', status: 'cancelled', slotKeys: ['a|b|c|d'] });
    await b.validate();
    expect(b.slotKeys).toEqual([]);
    const live = new Booking({ residentId: resident._id, societyId: h.SOCIETY_ID, amenity: 'Clubhouse', slotDate: new Date(), startTime: new Date(), endTime: new Date(), flatNo: '101', status: 'approved', slotKeys: ['a|b|c|d'] });
    await live.validate();
    expect(live.slotKeys).toEqual(['a|b|c|d']);
  });

  test('only residents can book', async () => {
    expect((await book({}, admin)).status).toBe(403);
  });

  test('works with the amenity id too', async () => {
    const res = await h.api().post('/api/bookings').set(h.auth(resident)).send({ amenityId: String(clubhouseId), date: day(), startTime: '07:00', endTime: '08:00' });
    expect(res.status).toBe(201);
    expect(h.savedDocs(Booking)[0].amenity).toBe('Clubhouse');
  });
});

describe('availability', () => {
  test('lists the slots for a day and marks the booked ones', async () => {
    mockingoose(Booking).toReturn([{ startTime: new Date(`${day()}T12:30:00Z`), endTime: new Date(`${day()}T13:30:00Z`) }], 'find');
    const res = await h.api().get(`/api/bookings/availability?amenity=Clubhouse&date=${day()}`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(16); // 06:00 to 22:00 in one-hour slots
    const six = res.body.slots.find((s) => s.start === '18:00');
    expect(six).toMatchObject({ available: false, reason: 'booked' });
    expect(res.body.slots.find((s) => s.start === '19:00').available).toBe(true);
    expect(res.body.amenity).toMatchObject({ name: 'Clubhouse', hourlyRate: 500 });
  });

  test('works with GET query parameters (the old route validated the body)', async () => {
    mockingoose(Booking).toReturn([], 'find');
    expect((await h.api().get('/api/bookings/availability').set(h.auth(resident))).status).toBe(400);
    expect((await h.api().get(`/api/bookings/availability?amenity=Clubhouse&date=${day()}`).set(h.auth(resident))).status).toBe(200);
  });

  test('an amenity that is switched off is not available', async () => {
    knowAmenities(amenity({ isActive: false }));
    const res = await h.api().get(`/api/bookings/availability?amenity=Clubhouse&date=${day()}`).set(h.auth(resident));
    expect(res.status).toBe(404);
  });

  test('lists only active amenities', async () => {
    knowAmenities(amenity(), amenity({ _id: h.oid(), name: 'Old pool', isActive: false }));
    const res = await h.api().get('/api/bookings/amenities').set(h.auth(resident));
    expect(res.body.amenities.map((a) => a.name)).toEqual(['Clubhouse']);
  });
});

describe('approving, rejecting and cancelling', () => {
  const makeBooking = (over = {}) =>
    new Booking({ _id: h.oid(), residentId: resident._id, societyId: h.SOCIETY_ID, amenity: 'Clubhouse', dateStr: day(), slotDate: new Date(), startTime: new Date(Date.now() + 2 * 864e5), endTime: new Date(Date.now() + 2 * 864e5 + 36e5), flatNo: '101', status: 'pending', ...over });

  // findOne is asked three times by approve: the access check, the booking, then "is there a clash".
  const knowBooking = (b, clash = null) => {
    let n = 0;
    mockingoose(Booking).toReturn(() => (n++ < 2 ? b : clash), 'findOne');
  };

  test('approval is one conditional update and tells the resident with a working link', async () => {
    const b = makeBooking();
    knowBooking(b);
    mockingoose(Booking).toReturn(makeBooking({ _id: b._id, status: 'approved' }), 'findOneAndUpdate');
    const res = await h.api().put(`/api/bookings/${b._id}/approve`).set(h.auth(admin));
    expect(res.status).toBe(200);
    const [decision] = h.callsTo(Booking, 'findOneAndUpdate');
    expect(decision.filter.status).toEqual({ $in: ['pending'] });
    expect(decision.update.$set).toMatchObject({ status: 'approved' });
    expect(h.savedDocs(Notification)[0]).toMatchObject({ type: 'booking_approved', actionUrl: '/bookings' });
  });

  test('if the resident cancelled a moment earlier the approval does not win', async () => {
    const b = makeBooking();
    let n = 0;
    mockingoose(Booking).toReturn(() => (n++ < 2 ? b : n === 3 ? null : makeBooking({ _id: b._id, status: 'cancelled' })), 'findOne');
    mockingoose(Booking).toReturn(null, 'findOneAndUpdate'); // the status is no longer pending
    const res = await h.api().put(`/api/bookings/${b._id}/approve`).set(h.auth(admin));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already cancelled/);
    expect(h.savedDocs(Notification)).toHaveLength(0);
  });

  test('a booking that clashes with an approved one cannot be approved', async () => {
    const b = makeBooking();
    knowBooking(b, { _id: h.oid() });
    expect((await h.api().put(`/api/bookings/${b._id}/approve`).set(h.auth(admin))).status).toBe(409);
    expect(h.callsTo(Booking, 'findOneAndUpdate')).toHaveLength(0);
  });

  test('cannot approve something already decided', async () => {
    const b = makeBooking({ status: 'rejected' });
    knowBooking(b);
    expect((await h.api().put(`/api/bookings/${b._id}/approve`).set(h.auth(admin))).status).toBe(409);
  });

  test('rejection releases the slots and carries the reason to the resident', async () => {
    const b = makeBooking();
    mockingoose(Booking).toReturn(b, 'findOne');
    mockingoose(Booking).toReturn(makeBooking({ _id: b._id, status: 'rejected' }), 'findOneAndUpdate');
    await h.api().put(`/api/bookings/${b._id}/reject`).set(h.auth(admin)).send({ reason: 'Society event' });
    const [decision] = h.callsTo(Booking, 'findOneAndUpdate');
    expect(decision.update.$set).toMatchObject({ status: 'rejected', rejectedReason: 'Society event', slotKeys: [] });
    expect(h.savedDocs(Notification)[0].message).toContain('Society event');
  });

  test('a resident cancels their own future booking (and the slot is freed) but not someone else\'s', async () => {
    const b = makeBooking();
    mockingoose(Booking).toReturn(b, 'findOne');
    mockingoose(Booking).toReturn(makeBooking({ _id: b._id, status: 'cancelled' }), 'findOneAndUpdate');
    expect((await h.api().put(`/api/bookings/${b._id}/cancel`).set(h.auth(resident))).status).toBe(200);
    expect(h.callsTo(Booking, 'findOneAndUpdate')[0].update.$set).toMatchObject({ status: 'cancelled', slotKeys: [] });

    const neighbour = h.makeUser({ flatNo: '202' });
    h.knowUsers(resident, neighbour, admin);
    const other = makeBooking();
    mockingoose(Booking).toReturn(other, 'findOne');
    expect((await h.api().put(`/api/bookings/${other._id}/cancel`).set(h.auth(neighbour))).status).toBe(403);
    expect(h.callsTo(Booking, 'findOneAndUpdate')).toHaveLength(1);
  });

  test('a booking that has started cannot be cancelled', async () => {
    const b = makeBooking({ startTime: new Date(Date.now() - 36e5), endTime: new Date(Date.now() + 36e5) });
    mockingoose(Booking).toReturn(b, 'findOne');
    expect((await h.api().put(`/api/bookings/${b._id}/cancel`).set(h.auth(resident))).status).toBe(400);
  });

  test('an admin can cancel a resident\'s booking and the resident is told', async () => {
    const b = makeBooking({ status: 'approved' });
    mockingoose(Booking).toReturn(b, 'findOne');
    mockingoose(Booking).toReturn(makeBooking({ _id: b._id, status: 'cancelled' }), 'findOneAndUpdate');
    const res = await h.api().put(`/api/bookings/${b._id}/cancel`).set(h.auth(admin)).send({ reason: 'Maintenance' });
    expect(res.status).toBe(200);
    expect(String(h.savedDocs(Notification)[0].userId)).toBe(String(resident._id));
  });
});
