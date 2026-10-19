const h = require('./helpers/harness');
const { mockingoose } = h;
const Shift = require('../models/Shift');
const GuardPost = require('../models/GuardPost');
const GuardAvailability = require('../models/GuardAvailability');
const GuardLocation = require('../models/GuardLocation');
const SwapRequest = require('../models/SwapRequest');
const User = h.models.User;
const Society = h.models.Society;
const Notification = h.models.Notification;
const Delivery = require('../models/Delivery');
const Vehicle = require('../models/Vehicle');
const Visitor = require('../models/Visitor');
const { todayIn, addDays } = require('../utils/timezone');

const HOUR = 3600 * 1000;
const today = () => todayIn(h.TZ);

let admin;
let head;
let guard;
let guard2;
let staff;
let resident;
let team;

// Answers User.find() by applying the role filter the route asked for, like the real database would.
const knowTeam = () => {
  team = [admin, head, guard, guard2, staff, resident];
  h.knowUsers(...team);
  mockingoose(User).toReturn((q) => {
    const r = q.getQuery().role;
    const roles = r && r.$in ? r.$in : r ? [r] : null;
    return team.filter((u) => String(u.societyId) === String(h.SOCIETY_ID) && (!roles || roles.includes(u.role)));
  }, 'find');
};

const makeShift = (who, over = {}) => {
  const startAt = over.startAt || new Date(Date.now() + 24 * HOUR);
  const doc = new Shift({
    _id: h.oid(),
    societyId: h.SOCIETY_ID,
    userId: who._id,
    date: today(),
    startTime: '08:00',
    endTime: '16:00',
    startAt,
    endAt: over.endAt || new Date(startAt.getTime() + 8 * HOUR),
    post: 'main_gate',
    createdBy: admin._id,
    ...over
  });
  doc.userId = who; // behaves like a populated reference
  return doc;
};

beforeEach(() => {
  h.reset();
  admin = h.makeUser({ role: 'society_admin', name: 'Office Admin', googleId: 'g', flatNo: undefined, block: undefined });
  head = h.makeUser({ role: 'guard_admin', googleId: 'g', name: 'Hari Head', phone: '9000000001', flatNo: undefined, block: undefined });
  guard = h.makeUser({ role: 'security', googleId: 'g', name: 'Gopal Guard', phone: '9000000002', flatNo: undefined, block: undefined });
  guard2 = h.makeUser({ role: 'security', googleId: 'g', name: 'Gita Guard', phone: '9000000003', flatNo: undefined, block: undefined });
  staff = h.makeUser({ role: 'staff', name: 'Sunil Staff', flatNo: undefined, block: undefined });
  resident = h.makeUser({ name: 'Asha Resident', googleId: 'g' });
  knowTeam();
  h.knowSociety();
});

const notesTo = (user) => h.savedDocs(Notification).filter((n) => String(n.userId) === String(user._id));

describe('the guard head role', () => {
  test('can plan the roster, see attendance and live guards; an ordinary guard cannot', async () => {
    mockingoose(Shift).toReturn([], 'find');
    expect((await h.api().get('/api/guards/attendance').set(h.auth(head))).status).toBe(200);
    expect((await h.api().get('/api/guards/live').set(h.auth(head))).status).toBe(200);
    expect((await h.api().get('/api/roster').set(h.auth(head))).status).toBe(200);
    for (const who of [guard, staff, resident]) {
      expect((await h.api().get('/api/guards/attendance').set(h.auth(who))).status).toBe(403);
      expect((await h.api().get('/api/guards/live').set(h.auth(who))).status).toBe(403);
    }
  });

  test('can use the gate like a guard (visitors, deliveries, vehicles)', async () => {
    [Visitor, Delivery, Vehicle].forEach((M) => mockingoose(M).toReturn([], 'find'));
    for (const path of ['/api/visitors', '/api/deliveries', '/api/vehicles']) {
      expect((await h.api().get(path).set(h.auth(head))).status).toBe(200);
    }
  });

  test('can sign in to the API once approved, and an unapproved head is held back like any guard', async () => {
    const waiting = h.makeUser({ role: 'guard_admin', isApproved: false, flatNo: undefined, block: undefined });
    h.knowUsers(waiting);
    expect((await h.api().get('/api/roster/mine').set(h.auth(waiting))).status).toBe(403);
  });

  test('the admin makes a guard the head, and back', async () => {
    const res = await h.api().put(`/api/users/${guard._id}/guard-head`).set(h.auth(admin)).send({ isHead: true });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('guard_admin');
    expect(h.savedDocs(User).find((u) => String(u._id) === String(guard._id)).role).toBe('guard_admin');
    expect(notesTo(guard)[0]).toMatchObject({ title: 'You are now the head of the guards' });
  });

  test('only a guard of the same society can be made head, and only by an admin', async () => {
    expect((await h.api().put(`/api/users/${resident._id}/guard-head`).set(h.auth(admin)).send({ isHead: true })).status).toBe(400);
    expect((await h.api().put(`/api/users/${guard._id}/guard-head`).set(h.auth(guard2)).send({ isHead: true })).status).toBe(403);
    expect((await h.api().put(`/api/users/${guard._id}/guard-head`).set(h.auth(head)).send({ isHead: true })).status).toBe(403);
    const stranger = h.makeUser({ role: 'security', societyId: h.OTHER_SOCIETY_ID, flatNo: undefined, block: undefined });
    team.push(stranger);
    h.knowUsers(...team);
    expect((await h.api().put(`/api/users/${stranger._id}/guard-head`).set(h.auth(admin)).send({ isHead: true })).status).toBe(403);
    expect((await h.api().put(`/api/users/${guard._id}/guard-head`).set(h.auth(admin)).send({ isHead: 'maybe' })).status).toBe(400);
  });

  test('nobody can sign up as the head of the guards', async () => {
    const res = await h.api().post('/api/auth/register').send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'Passw0rd1', phone: '9876543210', role: 'guard_admin', societyId: String(h.SOCIETY_ID) });
    expect(res.status).toBe(400);
  });
});

describe('society location and guard posts', () => {
  test('the admin pins the society on the map', async () => {
    mockingoose(Society).toReturn({
      _id: h.SOCIETY_ID, name: 'Green Park', timezone: h.TZ, address: { street: 'Road 1', city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
      totalFlats: 100, contactNumber: '9999999999', createdBy: admin._id
    }, 'findOne');
    const res = await h.api().put('/api/guards/location').set(h.auth(admin)).send({ lat: 17.385, lng: 78.4867, radiusMeters: 250, label: 'Main entrance' });
    expect(res.status).toBe(200);
    const saved = h.savedDocs(Society)[0];
    expect(saved.location).toMatchObject({ lat: 17.385, lng: 78.4867, radiusMeters: 250, label: 'Main entrance' });
  });

  test.each([
    ['a latitude off the map', { lat: 91, lng: 10 }],
    ['a longitude off the map', { lat: 10, lng: 200 }],
    ['a tiny radius', { lat: 10, lng: 10, radiusMeters: 5 }],
    ['text instead of numbers', { lat: 'north', lng: 'east' }]
  ])('refuses %s', async (_n, body) => {
    expect((await h.api().put('/api/guards/location').set(h.auth(admin)).send(body)).status).toBe(400);
  });

  test('guards and residents cannot move the society', async () => {
    for (const who of [guard, head, resident]) {
      expect((await h.api().put('/api/guards/location').set(h.auth(who)).send({ lat: 10, lng: 10 })).status).toBe(403);
    }
  });

  test('the admin adds a post with slots; the guard head and guards can read it', async () => {
    const body = { name: 'Main gate', kind: 'main_gate', lat: 17.385, lng: 78.4867, radiusMeters: 120, slots: [{ label: 'Morning', start: '06:00', end: '14:00', guards: 2 }, { start: '22:00', end: '06:00', guards: 1 }] };
    const res = await h.api().post('/api/guards/posts').set(h.auth(admin)).send(body);
    expect(res.status).toBe(201);
    const saved = h.savedDocs(GuardPost)[0];
    expect(saved.slots).toHaveLength(2);
    expect(saved.slots[0]).toMatchObject({ start: '06:00', end: '14:00', guards: 2 });
    mockingoose(GuardPost).toReturn([saved], 'find');
    expect((await h.api().get('/api/guards/posts').set(h.auth(guard))).status).toBe(200);
    expect((await h.api().get('/api/guards/posts').set(h.auth(head))).status).toBe(200);
    expect((await h.api().get('/api/guards/posts').set(h.auth(resident))).status).toBe(403);
  });

  test.each([
    ['no name', { name: '' }],
    ['an unknown kind', { name: 'X', kind: 'moon' }],
    ['a slot with the same start and end', { name: 'X', slots: [{ start: '08:00', end: '08:00', guards: 1 }] }],
    ['a bad time', { name: 'X', slots: [{ start: '8am', end: '16:00' }] }],
    ['too many guards in a slot', { name: 'X', slots: [{ start: '08:00', end: '16:00', guards: 99 }] }],
    ['a pin off the map', { name: 'X', lat: 200, lng: 10 }]
  ])('refuses a post with %s', async (_n, body) => {
    expect((await h.api().post('/api/guards/posts').set(h.auth(admin)).send(body)).status).toBe(400);
  });

  test('only the admin edits or removes posts', async () => {
    const post = new GuardPost({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Tower A', kind: 'tower_gate', slots: [] });
    mockingoose(GuardPost).toReturn(post, 'findOne');
    expect((await h.api().put(`/api/guards/posts/${post._id}`).set(h.auth(head)).send({ name: 'Tower B' })).status).toBe(403);
    expect((await h.api().delete(`/api/guards/posts/${post._id}`).set(h.auth(guard))).status).toBe(403);
    const ok = await h.api().put(`/api/guards/posts/${post._id}`).set(h.auth(admin)).send({ name: 'Tower B', slots: [{ start: '08:00', end: '20:00', guards: 1 }] });
    expect(ok.status).toBe(200);
    expect(h.savedDocs(GuardPost)[0].name).toBe('Tower B');
  });

  test('a post of another society is out of reach', async () => {
    const other = new GuardPost({ _id: h.oid(), societyId: h.OTHER_SOCIETY_ID, name: 'Elsewhere', slots: [] });
    mockingoose(GuardPost).toReturn(other, 'findOne');
    expect((await h.api().delete(`/api/guards/posts/${other._id}`).set(h.auth(admin))).status).toBe(403);
  });
});

describe('guard availability', () => {
  test('a guard saves their days, hours and days off; past days off are dropped', async () => {
    mockingoose(GuardAvailability).toReturn({ userId: guard._id }, 'findOneAndUpdate');
    const weekly = [1, 2, 3].map((day) => ({ day, available: true, start: '08:00', end: '16:00' })).concat([{ day: 0, available: false }]);
    const res = await h.api().put('/api/guards/availability/me').set(h.auth(guard)).send({ weekly, offDates: [addDays(today(), 3), addDays(today(), -4), addDays(today(), 3)], note: 'Exam week' });
    expect(res.status).toBe(200);
    const [call] = h.callsTo(GuardAvailability, 'findOneAndUpdate');
    expect(String(call.filter.userId)).toBe(String(guard._id));
    expect(call.update.$set.offDates).toEqual([addDays(today(), 3)]);
    expect(call.update.$set.weekly).toHaveLength(4);
    expect(String(call.update.$set.societyId)).toBe(String(h.SOCIETY_ID));
  });

  test.each([
    ['no days', { weekly: [] }],
    ['an unknown day', { weekly: [{ day: 9, available: true }] }],
    ['a bad time', { weekly: [{ day: 1, available: true, start: '25:00', end: '16:00' }] }],
    ['a bad date off', { weekly: [{ day: 1, available: true }], offDates: ['tomorrow'] }]
  ])('refuses %s', async (_n, body) => {
    expect((await h.api().put('/api/guards/availability/me').set(h.auth(guard)).send(body)).status).toBe(400);
  });

  test('residents cannot set availability; a guard with none saved sees "any time"', async () => {
    expect((await h.api().put('/api/guards/availability/me').set(h.auth(resident)).send({ weekly: [{ day: 1, available: true }] })).status).toBe(403);
    mockingoose(GuardAvailability).toReturn(null, 'findOne');
    const res = await h.api().get('/api/guards/availability/me').set(h.auth(guard));
    expect(res.body).toMatchObject({ isSet: false });
    expect(res.body.weekly).toHaveLength(7);
    expect(res.body.weekly.every((d) => d.available)).toBe(true);
  });

  test('the office sees everyone\'s availability', async () => {
    const res = await h.api().get('/api/guards/availability').set(h.auth(head));
    expect(res.status).toBe(200);
    expect(res.body.people.map((p) => p.name)).toEqual(expect.arrayContaining(['Gopal Guard', 'Gita Guard']));
    expect((await h.api().get('/api/guards/availability').set(h.auth(guard))).status).toBe(403);
  });
});

describe('automatic shift allocation', () => {
  const tomorrow = () => addDays(today(), 1);
  const post = () => new GuardPost({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Main gate', kind: 'main_gate', slots: [{ label: 'Day', start: '08:00', end: '16:00', guards: 1 }, { label: 'Night', start: '22:00', end: '06:00', guards: 1 }] });
  const plan = (who, over = {}) => h.api().post('/api/guards/allocate').set(h.auth(who)).send({ from: tomorrow(), to: tomorrow(), ...over });

  beforeEach(() => {
    mockingoose(GuardPost).toReturn([post()], 'find');
    mockingoose(GuardAvailability).toReturn([], 'find');
    mockingoose(Shift).toReturn([], 'find');
  });

  test('shows a plan without saving anything', async () => {
    const res = await plan(admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ applied: false, planned: 2, unfilledCount: 0, unfilled: [] });
    expect(res.body.assignments.map((a) => a.postName)).toEqual(['Main gate', 'Main gate']);
    expect(new Set(res.body.assignments.map((a) => a.userId)).size).toBe(2);
    expect(h.savedDocs(Shift)).toHaveLength(0);
    expect(h.savedDocs(Notification)).toHaveLength(0);
  });

  test('applying creates the shifts, marks them automatic, and tells each guard once and the office once', async () => {
    const res = await plan(admin, { apply: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ applied: true, created: 2 });
    const shifts = h.savedDocs(Shift);
    expect(shifts).toHaveLength(2);
    expect(shifts.every((s) => s.autoAllocated && s.postName === 'Main gate' && s.post === 'main_gate')).toBe(true);
    expect(notesTo(guard)).toHaveLength(1);
    expect(notesTo(guard2)).toHaveLength(1);
    expect(notesTo(head)).toHaveLength(1);
    expect(notesTo(resident)).toHaveLength(0);
  });

  test('the guard head can plan too, an ordinary guard cannot', async () => {
    expect((await plan(head)).status).toBe(200);
    expect((await plan(guard)).status).toBe(403);
    expect((await plan(resident)).status).toBe(403);
  });

  test('reports slots it could not fill, and why', async () => {
    mockingoose(GuardAvailability).toReturn([{ userId: guard._id, weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, available: false })), offDates: [] }, { userId: guard2._id, weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, available: false })), offDates: [] }], 'find');
    const res = await plan(admin);
    expect(res.body).toMatchObject({ planned: 0, unfilledCount: 2 });
    expect(res.body.unfilled[0].reason).toMatch(/No guard is available/);
  });

  test('refuses without posts, with bad dates, in the past, or for too long a range', async () => {
    mockingoose(GuardPost).toReturn([], 'find');
    expect((await plan(admin)).status).toBe(400);
    mockingoose(GuardPost).toReturn([post()], 'find');
    expect((await plan(admin, { from: 'soon' })).status).toBe(400);
    expect((await plan(admin, { from: tomorrow(), to: today() })).status).toBe(400);
    expect((await plan(admin, { from: addDays(today(), -10), to: addDays(today(), -5) })).status).toBe(400);
    expect((await plan(admin, { from: tomorrow(), to: addDays(tomorrow(), 40) })).status).toBe(400);
    expect((await plan(admin, { options: { maxHoursPerDay: 99 } })).status).toBe(400);
  });

  test('already planned shifts are respected', async () => {
    // The first guard already works tomorrow 06:00 to 14:00.
    const startAt = new Date(`${tomorrow()}T00:30:00.000Z`);
    mockingoose(Shift).toReturn([{ userId: guard._id, date: tomorrow(), startAt, endAt: new Date(startAt.getTime() + 8 * HOUR) }], 'find');
    const res = await plan(admin);
    const day = res.body.assignments.find((a) => a.startTime === '08:00');
    expect(String(day.userId)).toBe(String(guard2._id));
  });
});

describe('shift swaps', () => {
  let mine;
  let theirs;
  const ask = (who = guard, over = {}) => h.api().post('/api/guards/swaps').set(h.auth(who)).send({ myShiftId: String(mine._id), theirShiftId: String(theirs._id), reason: 'Family function', ...over });

  beforeEach(() => {
    mine = makeShift(guard, { date: addDays(today(), 1), startAt: new Date(Date.now() + 24 * HOUR) });
    theirs = makeShift(guard2, { date: addDays(today(), 2), startAt: new Date(Date.now() + 48 * HOUR) });
    mockingoose(Shift).toReturn((q) => {
      const id = String(q.getQuery()._id);
      return [mine, theirs].find((s) => String(s._id) === id) || null;
    }, 'findOne');
    mockingoose(SwapRequest).toReturn(null, 'findOne');
  });

  test('guard 1 asks guard 2: nothing moves yet, guard 2 and the office are told, residents are not', async () => {
    const res = await ask();
    expect(res.status).toBe(201);
    const [swap] = h.savedDocs(SwapRequest);
    expect(swap).toMatchObject({ status: 'pending', reason: 'Family function' });
    expect(String(swap.requesterId)).toBe(String(guard._id));
    expect(String(swap.targetId)).toBe(String(guard2._id));
    expect(h.callsTo(Shift, 'findOneAndUpdate')).toHaveLength(0);
    expect(notesTo(guard2)[0]).toMatchObject({ type: 'shift_swap', actionUrl: '/swaps', priority: 'high' });
    expect(notesTo(admin)).toHaveLength(1);
    expect(notesTo(head)).toHaveLength(1);
    expect(notesTo(resident)).toHaveLength(0);
    expect(notesTo(guard)).toHaveLength(0);
  });

  test('refuses a shift that is not yours, the same shift twice, a resident, and a swap with yourself', async () => {
    expect((await ask(guard2)).status).toBe(403);
    expect((await ask(guard, { theirShiftId: String(mine._id) })).status).toBe(400);
    expect((await ask(resident)).status).toBe(403);
    const own = makeShift(guard, { date: addDays(today(), 3), startAt: new Date(Date.now() + 72 * HOUR) });
    mockingoose(Shift).toReturn((q) => ([mine, theirs, own].find((s) => String(s._id) === String(q.getQuery()._id)) || null), 'findOne');
    expect((await ask(guard, { theirShiftId: String(own._id) })).status).toBe(400);
  });

  test('refuses shifts that are about to start or already running', async () => {
    const soon = makeShift(guard, { startAt: new Date(Date.now() + 20 * 60000) });
    mockingoose(Shift).toReturn((q) => ([soon, theirs].find((s) => String(s._id) === String(q.getQuery()._id)) || null), 'findOne');
    const res = await ask(guard, { myShiftId: String(soon._id) });
    expect([res.status, res.body.message]).toEqual([409, expect.stringMatching(/at least 60 minutes/)]);
  });

  test('a guard cannot swap with someone who does a different kind of work', async () => {
    const staffShift = makeShift(staff, { startAt: new Date(Date.now() + 48 * HOUR) });
    mockingoose(Shift).toReturn((q) => ([mine, staffShift].find((s) => String(s._id) === String(q.getQuery()._id)) || null), 'findOne');
    expect((await ask(guard, { theirShiftId: String(staffShift._id) })).status).toBe(400);
  });

  test('refuses when it would double-book either person, or when a request is already waiting', async () => {
    // The clash query (Shift.findOne with a time overlap) finds something.
    mockingoose(Shift).toReturn((q) => (q.getQuery().startAt ? makeShift(guard2) : ([mine, theirs].find((s) => String(s._id) === String(q.getQuery()._id)) || null)), 'findOne');
    expect((await ask()).status).toBe(409);
    mockingoose(Shift).toReturn((q) => ([mine, theirs].find((s) => String(s._id) === String(q.getQuery()._id)) || null), 'findOne');
    mockingoose(SwapRequest).toReturn({ _id: h.oid() }, 'findOne');
    const res = await ask();
    expect([res.status, res.body.message]).toEqual([409, expect.stringMatching(/already has a swap request/)]);
  });

  const pending = () => {
    const swap = new SwapRequest({ _id: h.oid(), societyId: h.SOCIETY_ID, requesterId: guard._id, targetId: guard2._id, requesterShiftId: mine._id, targetShiftId: theirs._id, status: 'pending' });
    swap.requesterId = guard;
    swap.targetId = guard2;
    swap.requesterShiftId = mine;
    swap.targetShiftId = theirs;
    mockingoose(SwapRequest).toReturn(swap, 'findOne');
    return swap;
  };

  test('guard 2 accepts: the two shifts change hands, and the requester, office and other guards are told, not residents', async () => {
    const swap = pending();
    mockingoose(Shift).toReturn((q) => (q.getQuery().startAt && q.getQuery().startAt.$lt ? null : (q.getQuery()._id ? mine : null)), 'findOne');
    mockingoose(Shift).toReturn(mine, 'findOneAndUpdate');
    const res = await h.api().put(`/api/guards/swaps/${swap._id}/accept`).set(h.auth(guard2));
    expect(res.status).toBe(200);
    const updates = h.callsTo(Shift, 'findOneAndUpdate');
    expect(updates).toHaveLength(2);
    expect(String(updates[0].filter._id)).toBe(String(mine._id));
    expect(String(updates[0].filter.userId)).toBe(String(guard._id));
    expect(String(updates[0].update.$set.userId)).toBe(String(guard2._id));
    expect(String(updates[1].filter._id)).toBe(String(theirs._id));
    expect(String(updates[1].update.$set.userId)).toBe(String(guard._id));
    expect(updates[0].filter.clockInAt).toEqual({ $exists: false });
    expect(h.savedDocs(SwapRequest)[0].status).toBe('accepted');
    expect(notesTo(guard)[0]).toMatchObject({ title: 'Swap accepted' });
    expect(notesTo(admin)[0]).toMatchObject({ title: 'Shift swap agreed' });
    expect(notesTo(head)[0]).toMatchObject({ title: 'Shift swap agreed' });
    expect(notesTo(staff)[0]).toMatchObject({ title: 'Roster changed', priority: 'low' });
    expect(notesTo(resident)).toHaveLength(0);
  });

  test('if the second shift changed meanwhile, the first is put back and nothing is swapped', async () => {
    const swap = pending();
    mockingoose(Shift).toReturn((q) => null, 'findOne');
    let calls = 0;
    mockingoose(Shift).toReturn(() => (calls++ === 0 ? mine : null), 'findOneAndUpdate');
    const res = await h.api().put(`/api/guards/swaps/${swap._id}/accept`).set(h.auth(guard2));
    expect(res.status).toBe(409);
    const undo = h.updatesTo(Shift).find((u) => String(u.filter._id) === String(mine._id));
    expect(String(undo.update.$set.userId)).toBe(String(guard._id));
    expect(h.savedDocs(SwapRequest)).toHaveLength(0);
  });

  test('only the guard who was asked can accept or decline, and only the asker can cancel', async () => {
    const swap = pending();
    for (const who of [guard, staff, head]) {
      expect((await h.api().put(`/api/guards/swaps/${swap._id}/accept`).set(h.auth(who))).status).toBe(who === staff || who === head || who === guard ? 403 : 200);
    }
    expect((await h.api().put(`/api/guards/swaps/${swap._id}/decline`).set(h.auth(guard))).status).toBe(403);
    expect((await h.api().put(`/api/guards/swaps/${swap._id}/cancel`).set(h.auth(guard2))).status).toBe(403);
    expect((await h.api().put(`/api/guards/swaps/${swap._id}/accept`).set(h.auth(resident))).status).toBe(403);
  });

  test('declining leaves the roster alone and tells the asker and the office', async () => {
    const swap = pending();
    const res = await h.api().put(`/api/guards/swaps/${swap._id}/decline`).set(h.auth(guard2)).send({ note: 'I am away' });
    expect(res.status).toBe(200);
    expect(h.callsTo(Shift, 'findOneAndUpdate')).toHaveLength(0);
    expect(h.savedDocs(SwapRequest)[0]).toMatchObject({ status: 'declined', declineNote: 'I am away' });
    expect(notesTo(guard)[0].message).toMatch(/I am away/);
    expect(notesTo(head)).toHaveLength(1);
    expect(notesTo(resident)).toHaveLength(0);
  });

  test('the asker can withdraw a waiting request', async () => {
    const swap = pending();
    const res = await h.api().put(`/api/guards/swaps/${swap._id}/cancel`).set(h.auth(guard));
    expect(res.status).toBe(200);
    expect(h.savedDocs(SwapRequest)[0].status).toBe('cancelled');
    expect(notesTo(guard2)[0]).toMatchObject({ title: 'Swap request withdrawn' });
  });

  test('a request that was already answered cannot be answered again', async () => {
    const swap = pending();
    swap.status = 'accepted';
    expect((await h.api().put(`/api/guards/swaps/${swap._id}/accept`).set(h.auth(guard2))).status).toBe(409);
    expect((await h.api().put(`/api/guards/swaps/${swap._id}/decline`).set(h.auth(guard2))).status).toBe(409);
  });

  test('a request whose shift has since started is closed instead of swapped', async () => {
    const swap = pending();
    mine.startAt = new Date(Date.now() - HOUR);
    const res = await h.api().put(`/api/guards/swaps/${swap._id}/accept`).set(h.auth(guard2));
    expect(res.status).toBe(409);
    expect(h.callsTo(Shift, 'findOneAndUpdate')).toHaveLength(0);
    expect(h.savedDocs(SwapRequest)[0].status).toBe('expired');
  });

  test('guards see their own requests with what they can do; the office sees all; residents see none', async () => {
    const swap = pending();
    mockingoose(SwapRequest).toReturn([swap], 'find');
    const asked = await h.api().get('/api/guards/swaps').set(h.auth(guard2));
    expect(asked.body.swaps[0]).toMatchObject({ status: 'pending', canAccept: true, canDecline: true, canCancel: false });
    const sent = await h.api().get('/api/guards/swaps').set(h.auth(guard));
    expect(sent.body.swaps[0]).toMatchObject({ canAccept: false, canCancel: true });
    const office = await h.api().get('/api/guards/swaps').set(h.auth(head));
    expect(office.body.swaps).toHaveLength(1);
    expect((await h.api().get('/api/guards/swaps').set(h.auth(resident))).status).toBe(403);
  });

  test('swap options list my shifts and colleagues\' shifts of the same kind of work, not ones already in a request', async () => {
    const taken = makeShift(guard2, { startAt: new Date(Date.now() + 72 * HOUR) });
    const staffShift = makeShift(staff, { startAt: new Date(Date.now() + 50 * HOUR) });
    mockingoose(SwapRequest).toReturn([{ requesterShiftId: taken._id, targetShiftId: h.oid() }], 'find');
    mockingoose(Shift).toReturn([mine, theirs, taken, staffShift], 'find');
    const res = await h.api().get('/api/guards/swaps/options').set(h.auth(guard));
    expect(res.status).toBe(200);
    expect(res.body.mine).toHaveLength(1);
    expect(res.body.others).toHaveLength(1);
    expect(res.body.others[0].name).toBe('Gita Guard');
    expect(res.body.others[0].shifts).toHaveLength(1);
  });
});

describe('who is on duty now, and the emergency numbers', () => {
  const live = (who, over = {}) => makeShift(who, { startAt: new Date(Date.now() - HOUR), endAt: new Date(Date.now() + 7 * HOUR), clockInAt: new Date(Date.now() - 30 * 60000), ...over });

  test('residents see the guards on duty, the checked-in one first, with phone numbers', async () => {
    mockingoose(Shift).toReturn([live(guard2, { clockInAt: undefined, post: 'patrol' }), live(guard)], 'find');
    const res = await h.api().get('/api/guards/on-duty').set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.onDuty.map((p) => p.name)).toEqual(['Gopal Guard', 'Gita Guard']);
    expect(res.body.desk).toMatchObject({ name: 'Gopal Guard', phone: '9000000002', checkedIn: true });
    expect(res.body.head).toMatchObject({ name: 'Hari Head' });
  });

  test('housekeeping staff on a shift are not shown as security', async () => {
    mockingoose(Shift).toReturn([live(staff), live(guard)], 'find');
    const res = await h.api().get('/api/guards/on-duty').set(h.auth(resident));
    expect(res.body.onDuty.map((p) => p.name)).toEqual(['Gopal Guard']);
  });

  test('vendors cannot ask who is on duty', async () => {
    const vendor = h.makeVendor();
    h.knowUsers(...team, vendor);
    expect((await h.api().get('/api/guards/on-duty').set(h.auth(vendor))).status).toBe(403);
  });

  test('the security desk number is the guard on duty, and replaces the fixed one', async () => {
    const EmergencyContact = require('../models/EmergencyContact');
    mockingoose(EmergencyContact).toReturn([
      { _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Society security desk', kind: 'security', phone: '1111111111' },
      { _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Police', kind: 'police', phone: '100' }
    ], 'find');
    mockingoose(Shift).toReturn([live(guard)], 'find');
    const res = await h.api().get('/api/emergency/contacts').set(h.auth(resident));
    const names = res.body.contacts.map((c) => c.name);
    expect(names[0]).toBe('Security desk: Gopal Guard');
    expect(res.body.contacts[0]).toMatchObject({ phone: '9000000002', dynamic: true });
    expect(names).toContain('Head of security: Hari Head');
    expect(names).toContain('Police');
    expect(names).not.toContain('Society security desk');
  });

  test('when nobody is on duty the fixed security number stays', async () => {
    const EmergencyContact = require('../models/EmergencyContact');
    mockingoose(EmergencyContact).toReturn([{ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Society security desk', kind: 'security', phone: '1111111111' }], 'find');
    mockingoose(Shift).toReturn([], 'find');
    const res = await h.api().get('/api/emergency/contacts').set(h.auth(resident));
    expect(res.body.contacts.map((c) => c.name)).toContain('Society security desk');
    expect(res.body.contacts.find((c) => c.dynamic && c._id === 'on-duty')).toBeUndefined();
  });

  test('a resident sees their own emergency contacts with the numbers', async () => {
    resident.emergencyContacts = [{ name: 'Ravi', phone: '9111111111', relation: 'Brother', notify: true }];
    mockingoose(Shift).toReturn([], 'find');
    const res = await h.api().get('/api/emergency/contacts').set(h.auth(resident));
    expect(res.body.personal).toHaveLength(1);
    expect(res.body.personal[0]).toMatchObject({ name: 'Ravi', phone: '9111111111', relation: 'Brother' });
    const g = await h.api().get('/api/emergency/contacts').set(h.auth(guard));
    expect(g.body.personal).toEqual([]);
  });
});

describe('personal emergency contacts', () => {
  const save = (contacts, who = resident) => h.api().put('/api/users/emergency-contacts').set(h.auth(who)).send({ contacts });

  test('a user saves their own list', async () => {
    const res = await save([{ name: 'Ravi', phone: '9111111111', relation: 'Brother' }, { name: 'Mina', phone: '+91 92222 22222', notify: false }]);
    expect(res.status).toBe(200);
    const saved = h.savedDocs(User).find((u) => String(u._id) === String(resident._id));
    expect(saved.emergencyContacts.map((c) => c.name)).toEqual(['Ravi', 'Mina']);
    expect(saved.emergencyContacts[0].notify).toBe(true);
    expect(saved.emergencyContacts[1].notify).toBe(false);
  });

  test('the same number twice is kept once, and the list can be emptied', async () => {
    await save([{ name: 'Ravi', phone: '9111111111' }, { name: 'Ravi again', phone: '+91 9111111111' }]);
    expect(h.savedDocs(User).find((u) => String(u._id) === String(resident._id)).emergencyContacts).toHaveLength(1);
    const res = await save([]);
    expect(res.body.message).toMatch(/cleared/);
  });

  test.each([
    ['more than five', Array.from({ length: 6 }, (_, i) => ({ name: `P${i}x`, phone: `91111111${i}0` }))],
    ['a missing name', [{ name: '', phone: '9111111111' }]],
    ['a bad phone number', [{ name: 'Ravi', phone: 'call me' }]]
  ])('refuses %s', async (_n, contacts) => {
    expect((await save(contacts)).status).toBe(400);
  });

  test('SOS texts the contacts the resident chose and says how many were reached', async () => {
    resident.emergencyContacts = [{ name: 'Ravi', phone: '9111111111', notify: true }, { name: 'Mina', phone: '9222222222', notify: false }];
    h.knowUsers(...team);
    const sms = require('../utils/sms');
    const spy = jest.spyOn(sms, 'sendSms').mockResolvedValue(true);
    mockingoose(Shift).toReturn([], 'find');
    const EmergencyAlert = require('../models/EmergencyAlert');
    mockingoose(EmergencyAlert).toReturn(null, 'findOne');
    const res = await h.api().post('/api/emergency/sos').set(h.auth(resident)).send({ type: 'medical' });
    expect(res.status).toBe(201);
    expect(res.body.textedContacts).toBe(1);
    expect(spy).toHaveBeenCalledWith('9111111111', expect.stringContaining('Asha Resident'));
    expect(res.body.message).toMatch(/emergency contact was texted/);
    spy.mockRestore();
  });
});

describe('location while on duty', () => {
  const onDuty = (over = {}) => makeShift(guard, { startAt: new Date(Date.now() - HOUR), endAt: new Date(Date.now() + 7 * HOUR), clockInAt: new Date(Date.now() - 30 * 60000), ...over });
  const ping = (body, who = guard) => h.api().post('/api/guards/ping').set(h.auth(who)).send(body);

  test('is recorded only while clocked in', async () => {
    mockingoose(Shift).toReturn(null, 'findOne');
    const res = await ping({ lat: 17.385, lng: 78.4867 });
    expect([res.status, res.body.message]).toEqual([409, expect.stringMatching(/not on duty/)]);
    expect(h.savedDocs(GuardLocation)).toHaveLength(0);
  });

  test('a point is saved and the shift remembers the latest one', async () => {
    h.knowSociety({ location: { lat: 17.385, lng: 78.4867, radiusMeters: 200 } });
    mockingoose(Shift).toReturn(onDuty(), 'findOne');
    const res = await ping({ lat: 17.3851, lng: 78.4867, accuracy: 12 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ recorded: true, outside: false });
    expect(h.savedDocs(GuardLocation)[0]).toMatchObject({ lat: 17.3851, lng: 78.4867, accuracy: 12 });
    expect(h.updatesTo(Shift)[0].update.$set.lastLocation).toMatchObject({ lat: 17.3851 });
  });

  test('says when the guard is outside the allowed distance', async () => {
    h.knowSociety({ location: { lat: 17.385, lng: 78.4867, radiusMeters: 100 } });
    mockingoose(Shift).toReturn(onDuty(), 'findOne');
    const res = await ping({ lat: 17.395, lng: 78.4867 });
    expect(res.body.outside).toBe(true);
    expect(res.body.distanceM).toBeGreaterThan(1000);
  });

  test('points that come in too quickly are not all stored', async () => {
    mockingoose(Shift).toReturn(onDuty({ lastLocation: { lat: 1, lng: 1, at: new Date() } }), 'findOne');
    const res = await ping({ lat: 17.385, lng: 78.4867 });
    expect(res.body.recorded).toBe(false);
    expect(h.savedDocs(GuardLocation)).toHaveLength(0);
  });

  test('refuses nonsense and non-guards', async () => {
    expect((await ping({ lat: 200, lng: 10 })).status).toBe(400);
    expect((await ping({ lat: 'a', lng: 'b' })).status).toBe(400);
    expect((await ping({ lat: 10, lng: 10 }, resident)).status).toBe(403);
  });

  test('the live map is for the admin and the guard head, and shows who is where', async () => {
    h.knowSociety({ name: 'Green Park', location: { lat: 17.385, lng: 78.4867, radiusMeters: 150 } });
    const near = onDuty({ lastLocation: { lat: 17.3851, lng: 78.4867, accuracy: 10, at: new Date(Date.now() - 60000) } });
    const far = makeShift(guard2, { startAt: new Date(Date.now() - HOUR), endAt: new Date(Date.now() + 7 * HOUR), clockInAt: new Date(Date.now() - 50 * 60000), lastLocation: { lat: 17.4, lng: 78.5, at: new Date(Date.now() - 20 * 60000) } });
    mockingoose(Shift).toReturn((q) => (q.getQuery().clockInAt && q.getQuery().clockInAt.$exists ? [near, far] : [makeShift(staff, { startAt: new Date(Date.now() - 20 * 60000), endAt: new Date(Date.now() + 8 * HOUR) })]), 'find');
    mockingoose(GuardPost).toReturn([], 'find');
    const res = await h.api().get('/api/guards/live').set(h.auth(head));
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.guards.map((g) => [g.name, g]));
    expect(byName['Gopal Guard']).toMatchObject({ outside: false, stale: false });
    expect(byName['Gita Guard']).toMatchObject({ outside: true, stale: true });
    expect(res.body.location).toMatchObject({ lat: 17.385 });
    expect(res.body.missing.map((m) => m.name)).toEqual(['Sunil Staff']);
    expect((await h.api().get('/api/guards/live').set(h.auth(admin))).status).toBe(200);
    expect((await h.api().get('/api/guards/live').set(h.auth(resident))).status).toBe(403);
    expect((await h.api().get('/api/guards/live').set(h.auth(guard))).status).toBe(403);
  });

  test('the trail of a guard is for the office only', async () => {
    mockingoose(GuardLocation).toReturn([{ lat: 1, lng: 2, at: new Date() }], 'find');
    expect((await h.api().get(`/api/guards/live/${guard._id}/trail`).set(h.auth(head))).body.points).toHaveLength(1);
    expect((await h.api().get(`/api/guards/live/${guard._id}/trail`).set(h.auth(guard2))).status).toBe(403);
    expect((await h.api().get('/api/guards/live/not-an-id/trail').set(h.auth(head))).status).toBe(404);
  });

  test('clocking in records where the guard was and warns the office when far from the post', async () => {
    h.knowSociety({ location: { lat: 17.385, lng: 78.4867, radiusMeters: 100 } });
    const s = makeShift(guard, { startAt: new Date(Date.now() - 5 * 60000), endAt: new Date(Date.now() + 8 * HOUR) });
    mockingoose(Shift).toReturn(s, 'findOne');
    mockingoose(Shift).toReturn(makeShift(guard, { _id: s._id, startAt: s.startAt, endAt: s.endAt, clockInAt: new Date() }), 'findOneAndUpdate');
    const res = await h.api().post(`/api/roster/${s._id}/clock-in`).set(h.auth(guard)).send({ lat: 17.4, lng: 78.5, accuracy: 20 });
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ outside: true, known: true });
    expect(res.body.message).toMatch(/office can see this/);
    const [call] = h.callsTo(Shift, 'findOneAndUpdate');
    expect(call.update.$set.clockInLocation).toMatchObject({ lat: 17.4, outside: true });
    expect(notesTo(head)[0]).toMatchObject({ type: 'attendance' });
    expect(notesTo(admin)[0]).toMatchObject({ title: 'Clocked in away from the post' });
  });

  test('clocking in without sharing a location still works', async () => {
    const s = makeShift(guard, { startAt: new Date(Date.now() - 5 * 60000), endAt: new Date(Date.now() + 8 * HOUR) });
    mockingoose(Shift).toReturn(makeShift(guard, { _id: s._id, clockInAt: new Date(), startAt: s.startAt, endAt: s.endAt }), 'findOneAndUpdate');
    const res = await h.api().post(`/api/roster/${s._id}/clock-in`).set(h.auth(guard)).send({});
    expect(res.status).toBe(200);
    expect(h.callsTo(Shift, 'findOneAndUpdate')[0].update.$set.clockInLocation).toBeUndefined();
    expect(res.body.location).toBeUndefined();
  });
});

describe('attendance', () => {
  test('counts present, late, missed and hours for each person', async () => {
    const d = today();
    const base = { startAt: new Date(Date.now() - 20 * HOUR), endAt: new Date(Date.now() - 12 * HOUR) };
    const onTime = makeShift(guard, { ...base, clockInAt: new Date(base.startAt.getTime() + 2 * 60000), clockOutAt: base.endAt, date: d });
    const late = makeShift(guard, { startAt: new Date(Date.now() - 10 * HOUR), endAt: new Date(Date.now() - 2 * HOUR), clockInAt: new Date(Date.now() - 10 * HOUR + 25 * 60000), clockOutAt: new Date(Date.now() - 2 * HOUR), startTime: '10:00', endTime: '18:00', date: d });
    const missed = makeShift(guard2, { ...base, date: d });
    const later = makeShift(guard2, { date: addDays(d, 1) });
    mockingoose(Shift).toReturn([onTime, late, missed, later], 'find');
    const res = await h.api().get('/api/guards/attendance').set(h.auth(head));
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.people.map((p) => [p.name, p]));
    expect(byName['Gopal Guard']).toMatchObject({ scheduled: 2, present: 2, late: 1, missed: 0, attendancePct: 100 });
    expect(byName['Gopal Guard'].hoursWorked).toBeGreaterThan(14);
    expect(byName['Gita Guard']).toMatchObject({ scheduled: 2, due: 1, present: 0, missed: 1, attendancePct: 0 });
    expect(res.body.totals).toMatchObject({ missed: 1, late: 1 });
    expect(byName['Gopal Guard'].shifts.find((s) => s.lateMinutes > 0).lateMinutes).toBe(25);
  });

  test('a clock-in a few minutes after the start is still on time', async () => {
    const s = makeShift(guard, { startAt: new Date(Date.now() - 3 * HOUR), endAt: new Date(Date.now() + 5 * HOUR), clockInAt: new Date(Date.now() - 3 * HOUR + 8 * 60000) });
    mockingoose(Shift).toReturn([s], 'find');
    const res = await h.api().get('/api/guards/attendance').set(h.auth(admin));
    expect(res.body.people[0].shifts[0]).toMatchObject({ lateMinutes: 0, status: 'on_duty' });
  });

  test('a guard sees their own record; others\' records and wide ranges are refused', async () => {
    mockingoose(Shift).toReturn([makeShift(guard, { startAt: new Date(Date.now() - 20 * HOUR), endAt: new Date(Date.now() - 12 * HOUR) })], 'find');
    const res = await h.api().get('/api/guards/attendance/me').set(h.auth(guard));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ scheduled: 1, missed: 1 });
    expect((await h.api().get('/api/guards/attendance/me').set(h.auth(resident))).status).toBe(403);
    expect((await h.api().get(`/api/guards/attendance?from=${addDays(today(), -200)}&to=${today()}`).set(h.auth(head))).status).toBe(400);
    expect((await h.api().get(`/api/guards/attendance?from=${today()}&to=${addDays(today(), -2)}`).set(h.auth(head))).status).toBe(400);
  });
});

describe('roster with posts, for the guard head', () => {
  test('the head plans a shift at a named post', async () => {
    const post = new GuardPost({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Tower A gate', kind: 'tower_gate', slots: [] });
    mockingoose(GuardPost).toReturn(post, 'findOne');
    const res = await h.api().post('/api/roster').set(h.auth(head)).send({ userId: String(guard._id), dates: [addDays(today(), 1)], startTime: '08:00', endTime: '16:00', postId: String(post._id) });
    expect(res.status).toBe(201);
    expect(h.savedDocs(Shift)[0]).toMatchObject({ postName: 'Tower A gate', post: 'tower_gate' });
  });

  test('a post that does not exist is refused', async () => {
    mockingoose(GuardPost).toReturn(null, 'findOne');
    const res = await h.api().post('/api/roster').set(h.auth(admin)).send({ userId: String(guard._id), dates: [addDays(today(), 1)], startTime: '08:00', endTime: '16:00', postId: String(h.oid()) });
    expect(res.status).toBe(400);
  });

  test('the guard head can be given shifts too, and clock in', async () => {
    const res = await h.api().post('/api/roster').set(h.auth(admin)).send({ userId: String(head._id), dates: [addDays(today(), 1)], startTime: '08:00', endTime: '16:00' });
    expect(res.status).toBe(201);
    mockingoose(Shift).toReturn([], 'find');
    expect((await h.api().get('/api/roster/mine').set(h.auth(head))).status).toBe(200);
  });
});
