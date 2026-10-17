const h = require('./helpers/harness');
const { mockingoose } = h;
const FacilityTask = require('../models/FacilityTask');
const User = h.models.User;
const Notification = h.models.Notification;
const { todayIn, addDays } = require('../utils/timezone');

let resident;
let guard;
let staff;
let admin;
let vendor;
const today = () => todayIn(h.TZ);

const makeTask = (over = {}) =>
  new FacilityTask({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Clean water tanks', category: 'water_tank', intervalDays: 90, nextDue: addDays(today(), 30), contractor: 'Aqua Clean', contractorPhone: '9000000001', notes: 'Block B terrace', createdBy: admin._id, ...over });

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  guard = h.makeUser({ role: 'security', name: 'Gopal' });
  staff = h.makeUser({ role: 'staff', name: 'Sunil' });
  vendor = h.makeVendor();
  admin = h.makeUser({ role: 'society_admin', name: 'Office', flatNo: undefined, block: undefined });
  h.knowUsers(resident, guard, staff, vendor, admin);
  h.knowSociety();
});

describe('upkeep schedule', () => {
  test('marks jobs overdue, due soon or ok, and counts them', async () => {
    mockingoose(FacilityTask).toReturn([
      makeTask({ name: 'Tank', nextDue: addDays(today(), -3) }),
      makeTask({ name: 'Lift', nextDue: addDays(today(), 7) }),
      makeTask({ name: 'Fire', nextDue: addDays(today(), 8) }),
      makeTask({ name: 'Today', nextDue: today() })
    ], 'find');
    const res = await h.api().get('/api/facility').set(h.auth(admin));
    const by = Object.fromEntries(res.body.tasks.map((t) => [t.name, t]));
    expect(by.Tank).toMatchObject({ status: 'overdue', daysLeft: -3 });
    expect(by.Lift).toMatchObject({ status: 'due_soon', daysLeft: 7 });
    expect(by.Fire).toMatchObject({ status: 'ok', daysLeft: 8 });
    expect(by.Today).toMatchObject({ status: 'due_soon', daysLeft: 0 });
    expect(res.body.counts).toEqual({ overdue: 1, due_soon: 2, ok: 1 });
  });

  test('residents see the schedule but not contractors, notes or costs', async () => {
    const t = makeTask({ history: [{ doneOn: addDays(today(), -60), byName: 'Sunil', note: 'Done', cost: 12000 }] });
    mockingoose(FacilityTask).toReturn([t], 'find');
    const seen = await h.api().get('/api/facility').set(h.auth(resident));
    const text = JSON.stringify(seen.body);
    expect(seen.status).toBe(200);
    expect(text).not.toMatch(/Aqua Clean|9000000001|Block B terrace|12000/);
    expect(seen.body.tasks[0]).toMatchObject({ canComplete: false, canManage: false });

    const office = await h.api().get('/api/facility').set(h.auth(staff));
    expect(JSON.stringify(office.body)).toMatch(/Aqua Clean/);
    expect(office.body.tasks[0].history[0].cost).toBe(12000);
  });

  test('residents only see active jobs; the office sees switched-off ones too', async () => {
    let asked = [];
    mockingoose(FacilityTask).toReturn((q) => { asked.push(q.getQuery()); return []; }, 'find');
    await h.api().get('/api/facility').set(h.auth(resident));
    await h.api().get('/api/facility').set(h.auth(admin));
    expect(asked[0].active).toBe(true);
    expect(asked[1].active).toBeUndefined();
  });

  test('vendors cannot see it', async () => {
    expect((await h.api().get('/api/facility').set(h.auth(vendor))).status).toBe(403);
  });
});

describe('managing jobs', () => {
  test('the office adds one; the first due date counts from today by default', async () => {
    const res = await h.api().post('/api/facility').set(h.auth(admin)).send({ name: 'Service the lifts', category: 'lift', intervalDays: 30 });
    expect(res.status).toBe(201);
    expect(h.savedDocs(FacilityTask)[0]).toMatchObject({ name: 'Service the lifts', intervalDays: 30, nextDue: addDays(today(), 30) });
  });

  test.each([['resident', () => resident], ['guard', () => guard], ['staff', () => staff]])('%s cannot add, edit or delete', async (_n, who) => {
    const t = makeTask();
    mockingoose(FacilityTask).toReturn(t, 'findOne');
    const u = who();
    expect((await h.api().post('/api/facility').set(h.auth(u)).send({ name: 'Something', intervalDays: 10 })).status).toBe(403);
    expect((await h.api().put(`/api/facility/${t._id}`).set(h.auth(u)).send({ name: 'Renamed', intervalDays: 10 })).status).toBe(403);
    expect((await h.api().delete(`/api/facility/${t._id}`).set(h.auth(u))).status).toBe(403);
  });

  test.each([[{ intervalDays: 0 }], [{ intervalDays: 5000 }], [{ intervalDays: 'x' }], [{ name: 'x' }], [{ category: 'spaceship' }], [{ nextDue: '2026-13-45' }], [{ contractorPhone: 'call me' }]])('refuses bad input %j', async (over) => {
    const res = await h.api().post('/api/facility').set(h.auth(admin)).send({ name: 'Valid name', intervalDays: 30, ...over });
    expect(res.status).toBe(400);
  });

  test('another society\'s job cannot be touched', async () => {
    const foreign = makeTask({ societyId: h.OTHER_SOCIETY_ID });
    mockingoose(FacilityTask).toReturn(foreign, 'findOne');
    expect((await h.api().delete(`/api/facility/${foreign._id}`).set(h.auth(admin))).status).toBe(403);
    expect((await h.api().post(`/api/facility/${foreign._id}/complete`).set(h.auth(staff)).send({})).status).toBe(403);
  });
});

describe('recording that a job was done', () => {
  const done = (t, who, body = {}) => h.api().post(`/api/facility/${t._id}/complete`).set(h.auth(who)).send(body);
  const setup = (t) => {
    mockingoose(FacilityTask).toReturn(t, 'findOne');
    mockingoose(FacilityTask).toReturn(t, 'findOneAndUpdate');
  };

  test('moves the next due date forward by the repeat interval and keeps a history entry', async () => {
    const t = makeTask({ nextDue: addDays(today(), -2) });
    setup(t);
    const res = await done(t, staff, { note: 'Cleaned and disinfected' });
    expect(res.status).toBe(200);
    const [call] = h.callsTo(FacilityTask, 'findOneAndUpdate');
    expect(call.update.$set).toEqual({ lastDone: today(), nextDue: addDays(today(), 90) });
    expect(call.update.$push.history.$slice).toBe(-40);
    expect(call.update.$push.history.$each[0]).toMatchObject({ doneOn: today(), byName: 'Sunil', note: 'Cleaned and disinfected' });
  });

  test('is only applied when it is newer than the last record (no double counting)', async () => {
    const t = makeTask();
    setup(t);
    await done(t, guard);
    const [call] = h.callsTo(FacilityTask, 'findOneAndUpdate');
    expect(call.filter.$or).toEqual([{ lastDone: { $exists: false } }, { lastDone: { $lt: today() } }]);
    expect(call.filter.active).toBe(true);
  });

  test('a second press for the same day is refused', async () => {
    const t = makeTask();
    mockingoose(FacilityTask).toReturn(t, 'findOne');
    mockingoose(FacilityTask).toReturn(null, 'findOneAndUpdate');
    const res = await done(t, staff);
    expect(res.status).toBe(409);
  });

  test('staff cannot record a cost; the office can', async () => {
    const t = makeTask();
    setup(t);
    await done(t, staff, { cost: 5000 });
    await done(t, admin, { cost: 5000 });
    const [byStaff, byAdmin] = h.callsTo(FacilityTask, 'findOneAndUpdate');
    expect(byStaff.update.$push.history.$each[0].cost).toBeUndefined();
    expect(byAdmin.update.$push.history.$each[0].cost).toBe(5000);
  });

  test('a date in the future, or far in the past, is refused', async () => {
    const t = makeTask();
    setup(t);
    expect((await done(t, staff, { doneOn: addDays(today(), 1) })).status).toBe(400);
    expect((await done(t, staff, { doneOn: addDays(today(), -61) })).status).toBe(400);
    expect((await done(t, staff, { doneOn: addDays(today(), -10) })).status).toBe(200);
  });

  test('residents and vendors cannot mark a job done', async () => {
    const t = makeTask();
    setup(t);
    expect((await done(t, resident)).status).toBe(403);
    expect((await done(t, vendor)).status).toBe(403);
  });

  test('a switched-off job cannot be marked done', async () => {
    const t = makeTask({ active: false });
    setup(t);
    expect((await done(t, staff)).status).toBe(409);
  });

  test('the society admin is told when staff or a guard record work, but not when the office does', async () => {
    const t = makeTask();
    setup(t);
    mockingoose(User).toReturn([admin], 'find');
    await done(t, staff);
    expect(h.savedDocs(Notification).map((n) => String(n.userId))).toEqual([String(admin._id)]);
    expect(h.savedDocs(Notification)[0]).toMatchObject({ type: 'facility', actionUrl: '/upkeep' });
    h.reset();
    h.knowUsers(admin, staff);
    h.knowSociety();
    setup(t);
    mockingoose(User).toReturn([admin], 'find');
    await done(t, admin);
    expect(h.savedDocs(Notification)).toHaveLength(0);
  });
});
