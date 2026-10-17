const h = require('./helpers/harness');
const { mockingoose } = h;
const Shift = require('../models/Shift');
const User = h.models.User;
const Notification = h.models.Notification;
const { todayIn, addDays } = require('../utils/timezone');

let guard;
let staff;
let resident;
let admin;
const MIN = 60 * 1000;
const today = () => todayIn(h.TZ);

const makeShift = (over = {}) => {
  const who = over.who || guard;
  const doc = new Shift({
    _id: h.oid(),
    societyId: h.SOCIETY_ID,
    userId: who._id,
    date: today(),
    startTime: '08:00',
    endTime: '16:00',
    startAt: new Date(Date.now() - 10 * MIN),
    endAt: new Date(Date.now() + 8 * 60 * MIN),
    post: 'main_gate',
    createdBy: admin._id,
    ...over
  });
  doc.userId = who; // behaves like a populated reference
  return doc;
};

beforeEach(() => {
  h.reset();
  guard = h.makeUser({ role: 'security', name: 'Gopal', flatNo: undefined, block: undefined });
  staff = h.makeUser({ role: 'staff', name: 'Sunil', flatNo: undefined, block: undefined });
  resident = h.makeUser();
  admin = h.makeUser({ role: 'society_admin', name: 'Office', flatNo: undefined, block: undefined });
  h.knowUsers(guard, staff, resident, admin);
  h.knowSociety();
});

describe('planning shifts', () => {
  const plan = (over = {}) => h.api().post('/api/roster').set(h.auth(admin)).send({ userId: String(guard._id), dates: [addDays(today(), 1)], startTime: '08:00', endTime: '16:00', post: 'main_gate', ...over });

  test('creates one shift per day with real start and end times in the society time zone', async () => {
    const d1 = addDays(today(), 1);
    const d2 = addDays(today(), 2);
    const res = await plan({ dates: [d2, d1, d1] });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    const shifts = h.savedDocs(Shift);
    expect(shifts.map((s) => s.date)).toEqual([d1, d2]);
    expect(shifts[0].startAt.toISOString()).toBe(`${d1}T02:30:00.000Z`); // 08:00 in India
    expect(shifts[0].endAt.toISOString()).toBe(`${d1}T10:30:00.000Z`);
  });

  test('a night shift ends the next morning', async () => {
    const d = addDays(today(), 1);
    await plan({ dates: [d], startTime: '22:00', endTime: '06:00' });
    const [s] = h.savedDocs(Shift);
    expect(s.startAt.toISOString()).toBe(`${d}T16:30:00.000Z`);
    expect(s.endAt.toISOString()).toBe(`${addDays(d, 1)}T00:30:00.000Z`);
    expect(s.endAt > s.startAt).toBe(true);
  });

  test('the person is told once, however many shifts', async () => {
    await plan({ dates: [addDays(today(), 1), addDays(today(), 2), addDays(today(), 3)] });
    const notes = h.savedDocs(Notification);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: 'shift', actionUrl: '/my-shifts' });
    expect(String(notes[0].userId)).toBe(String(guard._id));
  });

  test('a shift that already exists is skipped, not duplicated and not an error', async () => {
    const real = Shift.create;
    let n = 0;
    Shift.create = jest.fn(async (doc) => {
      n += 1;
      if (n === 1) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      return new Shift(doc);
    });
    try {
      const res = await plan({ dates: [addDays(today(), 1), addDays(today(), 2)] });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ created: 1, skipped: 1 });
    } finally {
      Shift.create = real;
    }
  });

  test('the shifts collection has a unique index per person, day and start time', () => {
    const idx = Shift.schema.indexes().find(([f]) => f.userId === 1 && f.date === 1 && f.startTime === 1);
    expect(idx && idx[1].unique).toBe(true);
  });

  test('only guards and staff of this society can be rostered', async () => {
    expect((await plan({ userId: String(resident._id) })).status).toBe(400);
    const stranger = h.makeUser({ role: 'security', societyId: h.OTHER_SOCIETY_ID });
    h.knowUsers(guard, stranger, admin);
    expect((await plan({ userId: String(stranger._id) })).status).toBe(400);
    expect(h.savedDocs(Shift)).toHaveLength(0);
  });

  test.each([
    ['no dates', { dates: [] }],
    ['more than 31 dates', { dates: Array.from({ length: 32 }, (_, i) => addDays(today(), i)) }],
    ['a bad date', { dates: ['2026-02-31x'] }],
    ['a bad time', { startTime: '25:00' }],
    ['a zero-length shift', { startTime: '08:00', endTime: '08:00' }],
    ['an unknown post', { post: 'moon base' }]
  ])('refuses %s', async (_n, over) => {
    expect((await plan(over)).status).toBe(400);
  });

  test('guards, staff and residents cannot plan or remove shifts', async () => {
    for (const who of [guard, staff, resident]) {
      expect((await h.api().post('/api/roster').set(h.auth(who)).send({ userId: String(guard._id), dates: [addDays(today(), 1)], startTime: '08:00', endTime: '16:00' })).status).toBe(403);
      expect((await h.api().delete(`/api/roster/${h.oid()}`).set(h.auth(who))).status).toBe(403);
      expect((await h.api().get('/api/roster').set(h.auth(who))).status).toBe(403);
    }
  });

  test('lists a week at most a month wide, with each shift\'s status', async () => {
    const s = makeShift();
    mockingoose(Shift).toReturn([s], 'find');
    const ok = await h.api().get('/api/roster').set(h.auth(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.shifts[0]).toMatchObject({ person: { name: 'Gopal', role: 'security' }, phase: 'scheduled' });
    expect((await h.api().get(`/api/roster?from=${today()}&to=${addDays(today(), 40)}`).set(h.auth(admin))).status).toBe(400);
  });

  test('a shift not clocked into can be removed, and the delete itself checks that', async () => {
    const s = makeShift();
    mockingoose(Shift).toReturn(s, 'findOneAndDelete');
    const res = await h.api().delete(`/api/roster/${s._id}`).set(h.auth(admin));
    expect(res.status).toBe(200);
    const { calls } = require('mongoose').Query.prototype.findOneAndDelete.mock;
    expect(calls[0][0].clockInAt).toEqual({ $exists: false });

    mockingoose(Shift).toReturn(null, 'findOneAndDelete');
    expect((await h.api().delete(`/api/roster/${s._id}`).set(h.auth(admin))).status).toBe(409);
  });
});

describe('my shifts and clocking in', () => {
  test('a guard sees only their own shifts, with what they can do', async () => {
    let asked;
    const soon = makeShift({ startAt: new Date(Date.now() + 20 * MIN), endAt: new Date(Date.now() + 8 * 60 * MIN) });
    mockingoose(Shift).toReturn((q) => { asked = q.getQuery(); return [soon]; }, 'find');
    const res = await h.api().get('/api/roster/mine').set(h.auth(guard));
    expect(String(asked.userId)).toBe(String(guard._id));
    expect(res.body.shifts[0]).toMatchObject({ phase: 'scheduled', canClockIn: true, canClockOut: false });
  });

  test('a shift that is hours away cannot be clocked into yet', async () => {
    const later = makeShift({ startAt: new Date(Date.now() + 5 * 60 * MIN), endAt: new Date(Date.now() + 13 * 60 * MIN) });
    mockingoose(Shift).toReturn([later], 'find');
    const res = await h.api().get('/api/roster/mine').set(h.auth(staff));
    expect(res.body.shifts[0].canClockIn).toBe(false);
  });

  test('residents have no shifts', async () => {
    expect((await h.api().get('/api/roster/mine').set(h.auth(resident))).status).toBe(403);
  });

  test('clock in is a conditional update on my own, unstarted, current shift', async () => {
    const s = makeShift();
    mockingoose(Shift).toReturn(makeShift({ _id: s._id, clockInAt: new Date() }), 'findOneAndUpdate');
    const res = await h.api().post(`/api/roster/${s._id}/clock-in`).set(h.auth(guard));
    expect(res.status).toBe(200);
    expect(res.body.shift.phase).toBe('on_duty');
    const [call] = h.callsTo(Shift, 'findOneAndUpdate');
    expect(String(call.filter.userId)).toBe(String(guard._id));
    expect(call.filter.clockInAt).toEqual({ $exists: false });
    expect(call.filter.endAt.$gte).toBeInstanceOf(Date);
    expect(call.filter.startAt.$lte).toBeInstanceOf(Date);
  });

  test('too early, already clocked in, shift over, and someone else\'s shift each get a clear answer', async () => {
    mockingoose(Shift).toReturn(null, 'findOneAndUpdate');
    const early = makeShift({ startAt: new Date(Date.now() + 5 * 60 * MIN), endAt: new Date(Date.now() + 13 * 60 * MIN) });
    mockingoose(Shift).toReturn(early, 'findOne');
    let res = await h.api().post(`/api/roster/${early._id}/clock-in`).set(h.auth(guard));
    expect([res.status, res.body.message]).toEqual([409, expect.stringMatching(/Too early/)]);

    const started = makeShift({ clockInAt: new Date() });
    mockingoose(Shift).toReturn(started, 'findOne');
    res = await h.api().post(`/api/roster/${started._id}/clock-in`).set(h.auth(guard));
    expect(res.body.message).toMatch(/already clocked in/);

    const over = makeShift({ startAt: new Date(Date.now() - 9 * 60 * MIN * 60), endAt: new Date(Date.now() - 60 * MIN) });
    mockingoose(Shift).toReturn(over, 'findOne');
    res = await h.api().post(`/api/roster/${over._id}/clock-in`).set(h.auth(guard));
    expect(res.body.message).toMatch(/shift is over/);

    const theirs = makeShift({ who: staff });
    mockingoose(Shift).toReturn(theirs, 'findOne');
    res = await h.api().post(`/api/roster/${theirs._id}/clock-in`).set(h.auth(guard));
    expect(res.status).toBe(404);
  });

  test('clock out needs a clock in first, and works once', async () => {
    const s = makeShift({ clockInAt: new Date(Date.now() - 60 * MIN) });
    mockingoose(Shift).toReturn(makeShift({ _id: s._id, clockInAt: s.clockInAt, clockOutAt: new Date() }), 'findOneAndUpdate');
    const ok = await h.api().post(`/api/roster/${s._id}/clock-out`).set(h.auth(guard));
    expect(ok.body.shift.phase).toBe('completed');
    const [call] = h.callsTo(Shift, 'findOneAndUpdate');
    expect(call.filter).toMatchObject({ clockInAt: { $exists: true }, clockOutAt: { $exists: false } });

    mockingoose(Shift).toReturn(null, 'findOneAndUpdate');
    const fresh = makeShift();
    mockingoose(Shift).toReturn(fresh, 'findOne');
    const early = await h.api().post(`/api/roster/${fresh._id}/clock-out`).set(h.auth(guard));
    expect([early.status, early.body.message]).toEqual([409, 'Clock in first.']);
  });

  test('a shift nobody clocked into shows as missed once it is over', () => {
    const over = makeShift({ startAt: new Date(Date.now() - 9 * 60 * MIN * 60), endAt: new Date(Date.now() - 60 * MIN) });
    expect(over.phase()).toBe('missed');
    expect(makeShift({ clockInAt: new Date() }).phase()).toBe('on_duty');
    expect(makeShift({ clockInAt: new Date(), clockOutAt: new Date() }).phase()).toBe('completed');
  });
});
