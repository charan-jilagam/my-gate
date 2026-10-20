const h = require('./helpers/harness');
const { mockingoose } = h;

jest.mock('../utils/sendEmail', () => {
  const send = jest.fn().mockResolvedValue({});
  send.isEmailConfigured = () => true;
  return send;
});
const sendEmail = require('../utils/sendEmail');

const Visitor = require('../models/Visitor');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const mail = require('../utils/dailyHelpMail');
const codes = require('../utils/dailyHelpCodes');
const { expiryOf, checkPlannedExit } = require('../utils/visitorPass');
const { todayIn, addDays } = require('../utils/timezone');
const Society = h.models.Society;
const User = h.models.User;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
let resident;
let guard;

beforeEach(() => {
  h.reset();
  sendEmail.mockClear();
  resident = h.makeUser();
  guard = h.makeUser({ name: 'Gate Guard', role: 'security', flatNo: undefined, block: undefined });
  h.knowUsers(resident, guard);
  h.knowSociety();
  mockingoose(User).toReturn([], 'find');
});

const QR = '{"visitorId":"abcdef1234567890","residentId":"x"}';
const visit = (over = {}) => new Visitor({ _id: h.oid(), residentId: resident._id, societyId: h.SOCIETY_ID, name: 'Ravi', phone: '9876543210', flatNo: '210', approved: true, approvedBy: resident._id, status: 'approved', qrCode: QR, ...over });
const checkIn = (body) => h.api().put(`/api/visitors/${h.oid()}/check-in`).set(h.auth(guard)).send({ code: 'abcdef12', ...body });
const invite = (extra = {}) => h.api().post('/api/visitors/invite').set(h.auth(resident)).send({ name: 'Ravi', phone: '9876543210', purpose: 'personal', ...extra });

describe('visitor pass: the resident says when the guest leaves', () => {
  test('the QR works until the leaving time', async () => {
    const arrival = new Date(Date.now() + 2 * HOUR);
    const out = new Date(Date.now() + 9 * HOUR);
    const res = await invite({ expectedArrival: arrival.toISOString(), plannedExit: out.toISOString() });
    expect(res.status).toBe(201);
    expect(h.savedDocs(Visitor)[0].plannedExit.getTime()).toBe(out.getTime());
    expect(new Date(res.body.visitor.expiresAt).getTime()).toBe(out.getTime());
  });

  test('without a leaving time it is 24 hours after arrival, as before', () => {
    const arrival = new Date('2026-10-20T10:00:00Z');
    expect(expiryOf({ expectedArrival: arrival }).getTime()).toBe(arrival.getTime() + DAY);
    expect(expiryOf({ expectedArrival: arrival, validForHours: 6 }).getTime()).toBe(arrival.getTime() + 6 * HOUR);
  });

  test('a leaving time before arrival, in the past, or beyond 30 days is refused', async () => {
    const arrival = new Date(Date.now() + 5 * HOUR);
    expect((await invite({ expectedArrival: arrival.toISOString(), plannedExit: new Date(arrival - HOUR).toISOString() })).status).toBe(400);
    expect((await invite({ plannedExit: new Date(Date.now() - HOUR).toISOString() })).status).toBe(400);
    expect((await invite({ plannedExit: new Date(Date.now() + 40 * DAY).toISOString() })).status).toBe(400);
    expect((await invite({ plannedExit: 'tomorrow' })).status).toBe(400);
    expect(checkPlannedExit('', null)).toBe('');
  });

  test('it can be changed while the invitation is unused', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const out = new Date(Date.now() + 6 * HOUR);
    const res = await h.api().put(`/api/visitors/${h.oid()}`).set(h.auth(resident)).send({ plannedExit: out.toISOString() });
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0].plannedExit.getTime()).toBe(out.getTime());
  });

  test('the guard types no exit time: it is filled in from the invitation', async () => {
    const out = new Date(Date.now() + 5 * HOUR);
    mockingoose(Visitor).toReturn(visit({ plannedExit: out }), 'findOne');
    const res = await checkIn({});
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0]).toMatchObject({ status: 'checked_in' });
    expect(h.savedDocs(Visitor)[0].expectedExit.getTime()).toBe(out.getTime());
    expect(new Date(res.body.visitor.expectedExit).getTime()).toBe(out.getTime());
  });

  test('a visit the resident planned for several days is accepted (no 24 hour cap)', async () => {
    const out = new Date(Date.now() + 3 * DAY);
    mockingoose(Visitor).toReturn(visit({ plannedExit: out }), 'findOne');
    expect((await checkIn({})).status).toBe(200);
  });

  test('a stay chosen at the gate is still limited to 24 hours', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const res = await checkIn({ expectedExit: new Date(Date.now() + 30 * HOUR).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/24 hours/);
  });

  test('the guard can still set a different time, and it wins over the invitation', async () => {
    mockingoose(Visitor).toReturn(visit({ plannedExit: new Date(Date.now() + 5 * HOUR) }), 'findOne');
    const res = await checkIn({ stayMinutes: 30 });
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0].expectedExit.getTime() - Date.now()).toBeLessThan(31 * 60000);
  });

  test('after the leaving time the pass is expired', async () => {
    mockingoose(Visitor).toReturn(visit({ plannedExit: new Date(Date.now() - 60000) }), 'findOne');
    const res = await checkIn({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/);
  });

  test('with neither a planned time nor a stay the guard is asked for one', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const res = await checkIn({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expected to leave/);
  });

  test('the guest page uses the same expiry', async () => {
    const out = new Date(Date.now() - 60000);
    mockingoose(Visitor).toReturn(visit({ plannedExit: out, passId: 'a'.repeat(32) }), 'findOne');
    const res = await h.api().get(`/api/public/pass/${'a'.repeat(32)}`);
    expect(res.body.pass).toMatchObject({ expired: true, usable: false, qr: null });
  });
});

describe('daily help: yesterday\'s code still identifies them', () => {
  const today = todayIn('Asia/Kolkata');
  const help = (over = {}) => new DailyHelp({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Lakshmi', kind: 'maid', code: '482913', codeDate: today, prevCode: '111222', prevCodeDate: addDays(today, -1), residents: [{ userId: resident._id, flat: 'A-101' }], ...over });
  // Today's code finds nobody; the old code finds her.
  const knowByOldCode = (doc) => mockingoose(DailyHelp).toReturn((q) => (q.getQuery().prevCode ? doc : null), 'findOne');

  test('lookup with the old code says so and gives the guard today\'s code', async () => {
    knowByOldCode(help());
    mockingoose(HelpAttendance).toReturn(null, 'findOne');
    const res = await h.api().get('/api/daily-help/lookup/111222').set(h.auth(guard));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ oldCode: true, todayCode: '482913', next: 'in', helper: { name: 'Lakshmi' } });
  });

  test('today\'s code does not set the old-code flag or reveal anything', async () => {
    mockingoose(DailyHelp).toReturn(help(), 'findOne');
    mockingoose(HelpAttendance).toReturn(null, 'findOne');
    const res = await h.api().get('/api/daily-help/lookup/482913').set(h.auth(guard));
    expect(res.body.oldCode).toBe(false);
    expect(res.body.todayCode).toBeUndefined();
  });

  test('she can be checked in with the old code, and the guard is handed today\'s code', async () => {
    knowByOldCode(help());
    mockingoose(HelpAttendance).toReturn(null, 'findOne');
    const res = await h.api().post('/api/daily-help/check').set(h.auth(guard)).send({ code: '111222', action: 'in' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ action: 'in', oldCode: true, todayCode: '482913' });
  });

  test('a code from long ago is not recognised', async () => {
    mockingoose(DailyHelp).toReturn((q) => (q.getQuery().prevCode ? (q.getQuery().prevCodeDate.$gte <= addDays(today, -5) ? help({ prevCodeDate: addDays(today, -5) }) : null) : null), 'findOne');
    const res = await h.api().get('/api/daily-help/lookup/111222').set(h.auth(guard));
    expect(res.status).toBe(404);
  });

  test('findByCode asks only for codes from the last two days', async () => {
    const seen = [];
    mockingoose(DailyHelp).toReturn((q) => { seen.push(q.getQuery()); return null; }, 'findOne');
    expect(await codes.findByCode(h.SOCIETY_ID, '111222', 'Asia/Kolkata')).toBeNull();
    expect(seen[1].prevCode).toBe('111222');
    expect(seen[1].prevCodeDate.$gte).toBe(addDays(today, -codes.OLD_CODE_DAYS));
  });

  test('rotating keeps the replaced code as prevCode', async () => {
    const old = help({ codeDate: addDays(today, -1), code: '555666' });
    mockingoose(DailyHelp).toReturn(help({ code: '999000', prevCode: '555666' }), 'findOneAndUpdate');
    await codes.rotate(old, today);
    const call = h.callsTo(DailyHelp, 'findOneAndUpdate')[0];
    expect(call.update.$set).toMatchObject({ codeDate: today, prevCode: '555666', prevCodeDate: addDays(today, -1) });
    expect(call.update.$set.code).toMatch(/^\d{6}$/);
    expect(old.code).toBe('999000');
  });
});

describe('daily help: how long they stayed', () => {
  const day = (d, inH, outH) => new HelpAttendance({ _id: h.oid(), societyId: h.SOCIETY_ID, helpId: h.oid(), date: d, checkIn: new Date(`${d}T0${inH}:00:00Z`), checkOut: outH ? new Date(`${d}T${String(outH).padStart(2, '0')}:30:00Z`) : null, open: !outH });

  test('each visit has minutes inside and the month has a total', async () => {
    mockingoose(DailyHelp).toReturn(new DailyHelp({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Lakshmi', kind: 'maid', code: '482913', residents: [{ userId: resident._id, flat: 'A-101' }] }), 'findOne');
    mockingoose(HelpAttendance).toReturn([day('2026-10-01', 7, 9), day('2026-10-02', 7, 8)], 'find');
    const res = await h.api().get(`/api/daily-help/${h.oid()}/attendance?month=2026-10`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.records.map((r) => r.minutes)).toEqual([150, 90]);
    expect(res.body.totalMinutes).toBe(240);
    expect(res.body.daysPresent).toBe(2);
  });

  test('a visit never closed at the gate counts as 0 minutes, not days', async () => {
    mockingoose(DailyHelp).toReturn(new DailyHelp({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Lakshmi', kind: 'maid', code: '482913', residents: [{ userId: resident._id, flat: 'A-101' }] }), 'findOne');
    mockingoose(HelpAttendance).toReturn([day('2026-10-01', 7, 0)], 'find');
    const res = await h.api().get(`/api/daily-help/${h.oid()}/attendance?month=2026-10`).set(h.auth(resident));
    expect(res.body.records[0]).toMatchObject({ forgotten: true, inside: false, minutes: 0 });
  });

  test('today\'s list shows how long so far for someone inside', async () => {
    const t = todayIn('Asia/Kolkata');
    const helper = new DailyHelp({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Lakshmi', kind: 'maid', code: '482913', codeDate: t, residents: [{ userId: resident._id, flat: 'A-101' }] });
    mockingoose(DailyHelp).toReturn([helper], 'find');
    mockingoose(HelpAttendance).toReturn([new HelpAttendance({ societyId: h.SOCIETY_ID, helpId: helper._id, date: t, checkIn: new Date(Date.now() - 95 * 60000), open: true })], 'find');
    const res = await h.api().get('/api/daily-help').set(h.auth(resident));
    expect(res.body.helpers[0].today.status).toBe('inside');
    expect(res.body.helpers[0].today.minutes).toBeGreaterThanOrEqual(95);
  });
});

describe('daily help: the QR is mailed every morning', () => {
  const morning = new Date('2026-10-20T04:30:00Z'); // 10:00 in India
  const dawn = new Date('2026-10-19T21:30:00Z'); // 03:00 in India
  const society = () => ({ _id: h.SOCIETY_ID, name: 'Green Heights', timezone: 'Asia/Kolkata' });
  const helper = (over = {}) => new DailyHelp({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Lakshmi', code: '482913', codeDate: todayIn('Asia/Kolkata', morning), email: 'lakshmi@example.com', residents: [{ userId: resident._id, flat: 'A-101' }], ...over });

  test('the helper gets the QR code and the code at their own email', async () => {
    mockingoose(Society).toReturn([society()], 'find');
    mockingoose(DailyHelp).toReturn([helper()], 'find');
    mockingoose(DailyHelp).toReturn(helper(), 'findOneAndUpdate');
    expect(await mail.runOnce(morning)).toBe(1);
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.email).toBe('lakshmi@example.com');
    expect(sent.message).toMatch(/482913/);
    expect(sent.message).toMatch(/yesterday's code/);
    expect(sent.attachments[0]).toMatchObject({ filename: 'gate-code.png', cid: 'helperqr' });
    expect(Buffer.isBuffer(sent.attachments[0].content)).toBe(true);
  });

  test('without a helper email it goes to the households', async () => {
    mockingoose(Society).toReturn([society()], 'find');
    mockingoose(DailyHelp).toReturn([helper({ email: undefined })], 'find');
    mockingoose(DailyHelp).toReturn(helper(), 'findOneAndUpdate');
    mockingoose(User).toReturn([{ _id: resident._id, email: resident.email }], 'find');
    expect(await mail.runOnce(morning)).toBe(1);
    expect(sendEmail.mock.calls[0][0].email).toBe(resident.email);
    expect(sendEmail.mock.calls[0][0].message).toMatch(/Today's gate code for Lakshmi/);
  });

  test('nothing is sent before the morning starts', async () => {
    mockingoose(Society).toReturn([society()], 'find');
    mockingoose(DailyHelp).toReturn([helper()], 'find');
    expect(await mail.runOnce(dawn)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('a helper already mailed today (claimed by another run) is skipped', async () => {
    mockingoose(Society).toReturn([society()], 'find');
    mockingoose(DailyHelp).toReturn([helper()], 'find');
    mockingoose(DailyHelp).toReturn(null, 'findOneAndUpdate');
    expect(await mail.runOnce(morning)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('a failed mail is released so the next run tries again', async () => {
    sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    mockingoose(Society).toReturn([society()], 'find');
    mockingoose(DailyHelp).toReturn([helper()], 'find');
    mockingoose(DailyHelp).toReturn(helper(), 'findOneAndUpdate');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await mail.runOnce(morning)).toBe(0);
    console.error.mockRestore();
  });

  test('a resident can add the helper\'s email', async () => {
    mockingoose(DailyHelp).toReturn(helper(), 'findOne');
    const res = await h.api().put(`/api/daily-help/${h.oid()}`).set(h.auth(resident)).send({ email: 'New@Example.com' });
    expect(res.status).toBe(200);
    expect(h.savedDocs(DailyHelp)[0].email).toBe('new@example.com');
    expect((await h.api().put(`/api/daily-help/${h.oid()}`).set(h.auth(resident)).send({ email: 'nope' })).status).toBe(400);
  });

  test('a guard cannot change a helper\'s details', async () => {
    expect((await h.api().put(`/api/daily-help/${h.oid()}`).set(h.auth(guard)).send({ email: 'a@b.co' })).status).toBe(403);
  });
});
