const h = require('./helpers/harness');
const { todayIn, DEFAULT_TZ } = require('../utils/timezone');
const { mockingoose, mongoose } = h;
const EmergencyAlert = require('../models/EmergencyAlert');
const EmergencyContact = require('../models/EmergencyContact');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Notification = h.models.Notification;
const User = h.models.User;

let resident;
let guard;
let admin;

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  guard = h.makeUser({ name: 'Gate Guard', role: 'security', flatNo: undefined, block: undefined, phone: '9000000001' });
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  h.knowUsers(resident, guard, admin);
  h.knowSociety();
});

describe('SOS', () => {
  test('notifies every guard and admin with a text message and high priority', async () => {
    mockingoose(EmergencyAlert).toReturn(null, 'findOne');
    mockingoose(User).toReturn([guard, admin], 'find');
    const res = await h.api().post('/api/emergency/sos').set(h.auth(resident)).send({ type: 'medical', note: 'Father fainted' });
    expect(res.status).toBe(201);
    expect(res.body.notified).toBe(2);
    const notes = h.savedDocs(Notification);
    expect(notes.map((n) => String(n.userId)).sort()).toEqual([String(guard._id), String(admin._id)].sort());
    expect(notes[0]).toMatchObject({ type: 'sos_alert', priority: 'high', relatedModel: 'EmergencyAlert' });
    expect(notes[0].title).toContain('A-101');
    const [alert] = h.savedDocs(EmergencyAlert);
    expect(alert).toMatchObject({ type: 'medical', status: 'active', flatNo: '101' });
  });

  test('a second press within the cooldown does not page everyone again', async () => {
    const first = new EmergencyAlert({ _id: h.oid(), societyId: h.SOCIETY_ID, userId: resident._id, type: 'fire', flatNo: '101', block: 'A' });
    mockingoose(EmergencyAlert).toReturn(first, 'findOne');
    const res = await h.api().post('/api/emergency/sos').set(h.auth(resident)).send({ type: 'fire' });
    expect(res.status).toBe(200);
    expect(res.body.repeated).toBe(true);
    expect(h.savedDocs(Notification)).toHaveLength(0);
  });

  test('says so honestly when nobody is set up to receive it', async () => {
    mockingoose(EmergencyAlert).toReturn(null, 'findOne');
    mockingoose(User).toReturn([], 'find');
    const res = await h.api().post('/api/emergency/sos').set(h.auth(resident)).send({});
    expect(res.status).toBe(201);
    expect(res.body.notified).toBe(0);
    expect(res.body.message).toMatch(/call the numbers/i);
  });

  test('only residents can raise it, and the type is validated', async () => {
    expect((await h.api().post('/api/emergency/sos').set(h.auth(guard)).send({})).status).toBe(403);
    expect((await h.api().post('/api/emergency/sos').set(h.auth(resident)).send({ type: 'prank' })).status).toBe(400);
  });

  const openAlert = (over = {}) => new EmergencyAlert({ _id: h.oid(), societyId: h.SOCIETY_ID, userId: resident._id, type: 'security', flatNo: '101', status: 'active', ...over });

  test('a guard acknowledges once; the resident is told; a second guard gets a conflict', async () => {
    const alert = openAlert();
    const acknowledged = openAlert({ _id: alert._id, status: 'acknowledged', acknowledgedBy: guard._id });
    mockingoose(EmergencyAlert).toReturn(alert, 'findOne');
    mockingoose(EmergencyAlert).toReturn(acknowledged, 'findOneAndUpdate');
    const ok = await h.api().put(`/api/emergency/alerts/${alert._id}/acknowledge`).set(h.auth(guard));
    expect(ok.status).toBe(200);
    expect(h.savedDocs(Notification).map((n) => String(n.userId))).toEqual([String(resident._id)]);
    // The claim is one conditional update: it only applies while the alert is still active.
    const [claim] = h.callsTo(EmergencyAlert, 'findOneAndUpdate');
    expect(claim.filter.status).toEqual({ $in: ['active'] });
    expect(claim.update.$set).toMatchObject({ status: 'acknowledged', acknowledgedBy: String(guard._id) });

    // A second guard arrives a moment later: the conditional update matches nothing.
    mockingoose(EmergencyAlert).toReturn(acknowledged, 'findOne');
    mockingoose(EmergencyAlert).toReturn(null, 'findOneAndUpdate');
    expect((await h.api().put(`/api/emergency/alerts/${alert._id}/acknowledge`).set(h.auth(admin))).status).toBe(409);
  });

  test('residents cannot respond to alerts; resolved alerts cannot be reopened', async () => {
    const alert = openAlert();
    mockingoose(EmergencyAlert).toReturn(alert, 'findOne');
    expect((await h.api().put(`/api/emergency/alerts/${alert._id}/resolve`).set(h.auth(resident))).status).toBe(403);
    const done = openAlert({ status: 'resolved' });
    mockingoose(EmergencyAlert).toReturn(done, 'findOne');
    expect((await h.api().put(`/api/emergency/alerts/${done._id}/resolve`).set(h.auth(guard))).status).toBe(409);
  });

  test('open alerts are fetched separately so a long history cannot push one out of the list', async () => {
    const queries = [];
    mockingoose(EmergencyAlert).toReturn((q) => {
      queries.push({ filter: q.getQuery(), limit: q.getOptions().limit });
      return [];
    }, 'find');
    await h.api().get('/api/emergency/alerts?limit=5').set(h.auth(guard));
    const open = queries.find((x) => x.filter.status && x.filter.status.$ne === 'resolved');
    const done = queries.find((x) => x.filter.status === 'resolved');
    expect(open.limit).toBe(100);
    expect(done.limit).toBe(5);
  });

  test('responders list the society open alerts first; residents only their own', async () => {
    let asked;
    mockingoose(EmergencyAlert).toReturn((q) => {
      asked = q.getQuery();
      return [];
    }, 'find');
    await h.api().get('/api/emergency/alerts?status=open').set(h.auth(guard));
    expect(String(asked.societyId)).toBe(String(h.SOCIETY_ID));
    expect(asked.status).toEqual({ $ne: 'resolved' });
    await h.api().get('/api/emergency/alerts').set(h.auth(resident));
    expect(String(asked.userId)).toBe(String(resident._id));
    expect(asked.societyId).toBeUndefined();
  });
});

describe('emergency contacts', () => {
  test('admins add them, residents cannot', async () => {
    const body = { name: 'City Police', phone: '100', kind: 'police' };
    expect((await h.api().post('/api/emergency/contacts').set(h.auth(resident)).send(body)).status).toBe(403);
    const res = await h.api().post('/api/emergency/contacts').set(h.auth(admin)).send(body);
    expect(res.status).toBe(201);
    expect(h.savedDocs(EmergencyContact)[0]).toMatchObject({ name: 'City Police', kind: 'police' });
  });

  test('validates the phone number and kind', async () => {
    expect((await h.api().post('/api/emergency/contacts').set(h.auth(admin)).send({ name: 'X Y', phone: 'abc' })).status).toBe(400);
    expect((await h.api().post('/api/emergency/contacts').set(h.auth(admin)).send({ name: 'X Y', phone: '100', kind: 'wizard' })).status).toBe(400);
  });
});

describe('daily help', () => {
  const makeHelp = (over = {}) =>
    new DailyHelp({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Lakshmi', kind: 'maid', code: '482913', codeDate: todayIn(DEFAULT_TZ), residents: [{ userId: resident._id, flat: 'A-101' }], ...over });

  test('adding a helper gives a six digit code and links the resident', async () => {
    mockingoose(DailyHelp).toReturn(0, 'countDocuments');
    const res = await h.api().post('/api/daily-help').set(h.auth(resident)).send({ name: 'Lakshmi', kind: 'maid', phone: '9876500000' });
    expect(res.status).toBe(201);
    const [saved] = h.savedDocs(DailyHelp);
    expect(saved.code).toMatch(/^\d{6}$/);
    expect(saved.residents).toHaveLength(1);
    expect(String(saved.residents[0].userId)).toBe(String(resident._id));
    expect(res.body.helper.code).toBe(saved.code);
  });

  test('a new helper gets today\'s code and is stamped with today', async () => {
    mockingoose(DailyHelp).toReturn(0, 'countDocuments');
    await h.api().post('/api/daily-help').set(h.auth(resident)).send({ name: 'Lakshmi' });
    expect(h.savedDocs(DailyHelp)[0].codeDate).toBe(todayIn(DEFAULT_TZ));
  });

  test('a code from an earlier day is replaced with a new one when the resident opens the list', async () => {
    const old = makeHelp({ codeDate: '2020-01-01' });
    mockingoose(DailyHelp).toReturn([old], 'find');
    mockingoose(HelpAttendance).toReturn([], 'find');
    mockingoose(DailyHelp).toReturn(makeHelp({ code: '654321', codeDate: todayIn(DEFAULT_TZ) }), 'findOneAndUpdate');
    const res = await h.api().get('/api/daily-help').set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.helpers[0].code).toBe('654321');
    expect(res.body.helpers[0].code).not.toBe('482913');
  });

  test('a code that is already today\'s is left alone', async () => {
    mockingoose(DailyHelp).toReturn([makeHelp()], 'find');
    mockingoose(HelpAttendance).toReturn([], 'find');
    mockingoose(DailyHelp).toReturn(makeHelp({ code: '999999' }), 'findOneAndUpdate');
    const res = await h.api().get('/api/daily-help').set(h.auth(resident));
    expect(res.body.helpers[0].code).toBe('482913');
  });

  test('the pass says which day the code is for', async () => {
    mockingoose(DailyHelp).toReturn(makeHelp(), 'findOne');
    const res = await h.api().get(`/api/daily-help/${h.oid()}/pass`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: '482913', validOn: todayIn(DEFAULT_TZ) });
  });

  test('yesterday\'s code is refused with a hint that codes change daily', async () => {
    mockingoose(DailyHelp).toReturn(null, 'findOne');
    const res = await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '482913' });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/every day/);
  });

  test('retries when the generated code is already taken', async () => {
    mockingoose(DailyHelp).toReturn(0, 'countDocuments');
    const real = DailyHelp.create;
    let calls = 0;
    DailyHelp.create = jest.fn(async (doc) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('dup'), { code: 11000 });
      return new DailyHelp(doc);
    });
    try {
      const res = await h.api().post('/api/daily-help').set(h.auth(resident)).send({ name: 'Lakshmi' });
      expect(res.status).toBe(201);
      expect(calls).toBe(2);
    } finally {
      DailyHelp.create = real;
    }
  });

  test('guards and admins see helpers without their codes; the resident sees the code', async () => {
    const help = makeHelp();
    mockingoose(DailyHelp).toReturn([help], 'find');
    mockingoose(HelpAttendance).toReturn([], 'find');
    const asGuard = await h.api().get('/api/daily-help').set(h.auth(guard));
    expect(asGuard.body.helpers[0].code).toBeUndefined();
    const asOwner = await h.api().get('/api/daily-help').set(h.auth(resident));
    expect(asOwner.body.helpers[0]).toMatchObject({ code: '482913', today: { status: 'not_arrived' } });
    const stranger = h.makeUser();
    h.knowUsers(resident, stranger, guard);
    const asOther = await h.api().get('/api/daily-help').set(h.auth(stranger));
    expect(asOther.body.helpers[0].code).toBeUndefined();
  });

  test('the first code check of the day checks in and tells the household', async () => {
    mockingoose(DailyHelp).toReturn(makeHelp(), 'findOne');
    mockingoose(HelpAttendance).toReturn(null, 'findOne');
    const res = await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '482913' });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('in');
    expect(h.savedDocs(HelpAttendance)[0]).toMatchObject({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(h.savedDocs(Notification).map((n) => String(n.userId))).toEqual([String(resident._id)]);
    expect(h.savedDocs(Notification)[0].title).toBe('Lakshmi has arrived');
  });

  test('the next check closes the open attendance in one conditional update', async () => {
    const help = makeHelp();
    const closed = new HelpAttendance({ _id: h.oid(), societyId: h.SOCIETY_ID, helpId: help._id, date: '2026-10-19', checkIn: new Date(Date.now() - 3600e3), checkOut: new Date(), open: false });
    mockingoose(DailyHelp).toReturn(help, 'findOne');
    mockingoose(HelpAttendance).toReturn(closed, 'findOneAndUpdate');
    const res = await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '482913' });
    expect(res.body.action).toBe('out');
    const [close] = h.callsTo(HelpAttendance, 'findOneAndUpdate');
    expect(close.filter).toMatchObject({ open: true });
    expect(close.update.$set.open).toBe(false);
    expect(h.savedDocs(HelpAttendance)).toHaveLength(0); // nothing new was created
  });

  test('forgotten visits older than a day are closed so they do not block today', async () => {
    mockingoose(DailyHelp).toReturn(makeHelp(), 'findOne');
    await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '482913' });
    const [stale] = h.callsTo(HelpAttendance, 'updateMany');
    expect(stale.filter.open).toBe(true);
    expect(stale.filter.checkIn.$lt).toBeInstanceOf(Date);
    expect(stale.update.$set).toEqual({ open: false });
  });

  test('a double tap that loses the race for the open visit gets a clear conflict', async () => {
    mockingoose(DailyHelp).toReturn(makeHelp(), 'findOne');
    const real = HelpAttendance.create;
    HelpAttendance.create = jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    try {
      const res = await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '482913' });
      expect(res.status).toBe(409);
    } finally {
      HelpAttendance.create = real;
    }
  });

  test('linking tells the households that already use the helper', async () => {
    const neighbour = h.makeUser({ name: 'Bina Shah', flatNo: '202' });
    h.knowUsers(resident, neighbour);
    mockingoose(DailyHelp).toReturn(makeHelp(), 'findOne');
    await h.api().post('/api/daily-help/link').set(h.auth(neighbour)).send({ code: '482913' });
    const notes = h.savedDocs(Notification);
    expect(notes.map((n) => String(n.userId))).toEqual([String(resident._id)]);
    expect(notes[0].message).toContain('Bina Shah');
  });

  test('a person who keeps entering wrong codes is slowed down', async () => {
    const thief = h.makeUser({ flatNo: '909' });
    h.knowUsers(resident, thief);
    mockingoose(DailyHelp).toReturn(null, 'findOne');
    const statuses = [];
    for (let i = 0; i < 10; i++) statuses.push((await h.api().post('/api/daily-help/link').set(h.auth(thief)).send({ code: String(100000 + i) })).status);
    expect(statuses.slice(0, 8).every((x) => x === 404)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
    // someone else is not affected
    expect((await h.api().post('/api/daily-help/link').set(h.auth(resident)).send({ code: '123456' })).status).toBe(404);
  });

  test('an unknown code is refused, and only gate staff can check', async () => {
    mockingoose(DailyHelp).toReturn(null, 'findOne');
    expect((await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '000000' })).status).toBe(404);
    expect((await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '12' })).status).toBe(400);
    expect((await h.api().post('/api/daily-help/check').set(h.auth(resident)).send({ code: '482913' })).status).toBe(403);
  });

  test('a second household can link a helper by code', async () => {
    const neighbour = h.makeUser({ flatNo: '202' });
    h.knowUsers(resident, neighbour);
    const help = makeHelp();
    mockingoose(DailyHelp).toReturn(help, 'findOne');
    const res = await h.api().post('/api/daily-help/link').set(h.auth(neighbour)).send({ code: '482913' });
    expect(res.status).toBe(200);
    expect(h.savedDocs(DailyHelp)[0].residents).toHaveLength(2);
    const again = await h.api().post('/api/daily-help/link').set(h.auth(resident)).send({ code: '482913' });
    expect(again.status).toBe(409);
  });

  test('removing the last household deactivates the helper', async () => {
    const help = makeHelp();
    mockingoose(DailyHelp).toReturn(help, 'findOne');
    const res = await h.api().delete(`/api/daily-help/${help._id}`).set(h.auth(resident));
    expect(res.status).toBe(200);
    const saved = h.savedDocs(DailyHelp)[0];
    expect(saved.residents).toHaveLength(0);
    expect(saved.isActive).toBe(false);
  });

  test('a resident cannot read another household helper attendance', async () => {
    const help = makeHelp({ residents: [{ userId: h.oid(), flat: 'B-9' }] });
    mockingoose(DailyHelp).toReturn(help, 'findOne');
    const res = await h.api().get(`/api/daily-help/${help._id}/attendance`).set(h.auth(resident));
    expect(res.status).toBe(403);
  });

  test('attendance counts distinct days present', async () => {
    const help = makeHelp();
    mockingoose(DailyHelp).toReturn(help, 'findOne');
    mockingoose(HelpAttendance).toReturn(
      [
        { helpId: help._id, date: '2026-10-01', checkIn: new Date('2026-10-01T04:00:00Z'), checkOut: new Date('2026-10-01T06:00:00Z') },
        { helpId: help._id, date: '2026-10-01', checkIn: new Date('2026-10-01T10:00:00Z'), checkOut: null },
        { helpId: help._id, date: '2026-10-02', checkIn: new Date('2026-10-02T04:00:00Z'), checkOut: null }
      ],
      'find'
    );
    const res = await h.api().get(`/api/daily-help/${help._id}/attendance?month=2026-10`).set(h.auth(resident));
    expect(res.body.daysPresent).toBe(2);
    expect(res.body.records).toHaveLength(3);
    expect((await h.api().get(`/api/daily-help/${help._id}/attendance?month=2026-13`).set(h.auth(resident))).status).toBe(400);
  });
});

describe('expenses', () => {
  const valid = { title: 'Lift service', amount: 12500, date: '2026-10-10', category: 'lift' };

  test('only admins record expenses', async () => {
    expect((await h.api().post('/api/expenses').set(h.auth(resident)).send(valid)).status).toBe(403);
    const res = await h.api().post('/api/expenses').set(h.auth(admin)).send(valid);
    expect(res.status).toBe(201);
    expect(h.savedDocs(Expense)[0]).toMatchObject({ title: 'Lift service', amount: 12500, category: 'lift' });
  });

  test('rejects zero, negative, bad dates and unknown categories', async () => {
    for (const bad of [{ amount: 0 }, { amount: -5 }, { date: '10/10/2026' }, { date: '2026-02-31' }, { category: 'gold' }, { title: '' }]) {
      const res = await h.api().post('/api/expenses').set(h.auth(admin)).send({ ...valid, ...bad });
      expect(res.status).toBe(400);
    }
  });

  test('summary balances what was collected against what was spent, by category', async () => {
    mockingoose(Expense).toReturn([{ _id: 'lift', amount: 12500, count: 1 }, { _id: 'security', amount: 30000, count: 2 }], 'aggregate');
    mockingoose(Payment).toReturn((q) => {
      const first = q.pipeline()[0];
      return first && first.$match && first.$match.status === 'pending' ? [{ _id: null, amount: 8000, count: 4 }] : [{ _id: null, amount: 100000, count: 20 }];
    }, 'aggregate');
    const res = await h.api().get('/api/expenses/summary?month=2026-10').set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ month: '2026-10', collected: 100000, spent: 42500, balance: 57500, pendingDues: 8000 });
    expect(res.body.byCategory).toEqual([{ category: 'lift', amount: 12500, count: 1 }, { category: 'security', amount: 30000, count: 2 }]);
  });

  test('residents see totals but not the itemised list', async () => {
    expect((await h.api().get('/api/expenses').set(h.auth(resident))).status).toBe(403);
  });

  test('a bad month is refused', async () => {
    expect((await h.api().get('/api/expenses/summary?month=2026-1').set(h.auth(admin))).status).toBe(400);
  });
});
