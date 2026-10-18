const bcrypt = require('bcryptjs');
const h = require('./helpers/harness');
const { mockingoose } = h;
const Visitor = require('../models/Visitor');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const otp = require('../utils/otp');
const { sendOtpSms } = require('../utils/sms');
const Society = h.models.Society;
const User = h.models.User;

let resident;
let guard;
let admin;
const HOUR = 3600 * 1000;

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  guard = h.makeUser({ name: 'Gate Guard', role: 'security', flatNo: undefined, block: undefined });
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  h.knowUsers(resident, guard, admin);
  h.knowSociety();
});

const QR = '{"visitorId":"abcdef1234567890","residentId":"x"}';
const visit = (over = {}) => new Visitor({ _id: h.oid(), residentId: resident._id, societyId: h.SOCIETY_ID, name: 'Ravi', phone: '9876543210', flatNo: '210', approved: true, approvedBy: resident._id, status: 'approved', qrCode: QR, ...over });
const put = (id, action, who, body = {}) => h.api().put(`/api/visitors/${id}/${action}`).set(h.auth(who)).send(body);

describe('check-in needs the pass code', () => {
  test('a click alone is refused', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const res = await put(h.oid(), 'check-in', guard, { stayMinutes: 60 });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Scan the visitor/);
    expect(h.savedDocs(Visitor)).toHaveLength(0);
  });

  test('a wrong code is refused', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const res = await put(h.oid(), 'check-in', guard, { code: '12345678', stayMinutes: 60 });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/does not match/);
  });

  test('a code that is too short to prove anything is refused', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    expect((await put(h.oid(), 'check-in', guard, { code: 'abc', stayMinutes: 60 })).status).toBe(403);
  });

  test('the typed code works in any letter case', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const res = await put(h.oid(), 'check-in', guard, { code: 'ABCDEF12', stayMinutes: 60 });
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0]).toMatchObject({ status: 'checked_in', checkInMethod: 'code' });
  });

  test('the text read from the QR code works too', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    expect((await put(h.oid(), 'check-in', guard, { code: QR, stayMinutes: 60 })).status).toBe(200);
  });

  test('a pass that was already used cannot be used again', async () => {
    mockingoose(Visitor).toReturn(visit({ status: 'checked_out' }), 'findOne');
    const res = await put(h.oid(), 'check-in', guard, { code: 'abcdef12', stayMinutes: 60 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already used/);
  });

  test('an invitation stops working a day after the time it was for', async () => {
    mockingoose(Visitor).toReturn(visit({ expectedArrival: new Date(Date.now() - 30 * HOUR) }), 'findOne');
    const res = await put(h.oid(), 'check-in', guard, { code: 'abcdef12', stayMinutes: 60 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/);
  });

  test('the resident can allow a longer or shorter validity than the 24 hour default', async () => {
    // 30 hours late: expired under the default, still fine when the resident allowed 48 hours
    mockingoose(Visitor).toReturn(visit({ expectedArrival: new Date(Date.now() - 30 * HOUR), validForHours: 48 }), 'findOne');
    expect((await put(h.oid(), 'check-in', guard, { code: 'abcdef12', stayMinutes: 60 })).status).toBe(200);
    // 3 hours late with a 2 hour validity is expired
    mockingoose(Visitor).toReturn(visit({ expectedArrival: new Date(Date.now() - 3 * HOUR), validForHours: 2 }), 'findOne');
    const late = await put(h.oid(), 'check-in', guard, { code: 'abcdef12', stayMinutes: 60 });
    expect(late.status).toBe(400);
    expect(late.body.message).toMatch(/expired/);
  });

  test('an invitation with no arrival time lasts from when it was created', async () => {
    mockingoose(Visitor).toReturn(visit({ createdAt: new Date(Date.now() - 30 * HOUR) }), 'findOne');
    expect((await put(h.oid(), 'check-in', guard, { code: 'abcdef12', stayMinutes: 60 })).status).toBe(400);
  });

  test('a visitor the resident has not approved cannot go in', async () => {
    mockingoose(Visitor).toReturn(visit({ approved: false, status: 'pending', source: 'walk_in' }), 'findOne');
    const res = await put(h.oid(), 'check-in', guard, { stayMinutes: 60 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not approved/);
  });

  test('a walk-in the resident approved is let in by the guard by hand', async () => {
    mockingoose(Visitor).toReturn(visit({ source: 'walk_in' }), 'findOne');
    const res = await put(h.oid(), 'check-in', guard, { stayMinutes: 60 });
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0]).toMatchObject({ status: 'checked_in', checkInMethod: 'manual' });
  });
});

describe('check-out needs the pass code too', () => {
  const inside = (over = {}) => visit({ status: 'checked_in', entryTime: new Date(), expectedExit: new Date(Date.now() + HOUR), ...over });

  test('an invited visitor cannot be checked out with a click', async () => {
    mockingoose(Visitor).toReturn(inside(), 'findOne');
    const res = await put(h.oid(), 'check-out', guard);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/QR code or say their pass code/);
  });

  test('a wrong code is refused', async () => {
    mockingoose(Visitor).toReturn(inside(), 'findOne');
    expect((await put(h.oid(), 'check-out', guard, { code: '00000000' })).status).toBe(403);
  });

  test('the right code checks them out', async () => {
    mockingoose(Visitor).toReturn(inside(), 'findOne');
    const res = await put(h.oid(), 'check-out', guard, { code: 'abcdef12' });
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0]).toMatchObject({ status: 'checked_out', checkOutMethod: 'code' });
  });

  test('a walk-in the guard let in by hand can be checked out by hand', async () => {
    mockingoose(Visitor).toReturn(inside({ source: 'walk_in' }), 'findOne');
    const res = await put(h.oid(), 'check-out', guard);
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0]).toMatchObject({ status: 'checked_out', checkOutMethod: 'manual' });
  });
});

describe('who can see the code and who can approve', () => {
  test('guards never receive the pass code', async () => {
    mockingoose(Visitor).toReturn([visit()], 'find');
    const res = await h.api().get('/api/visitors').set(h.auth(guard));
    expect(res.body.visitors[0].qrCode).toBeUndefined();
    expect(res.body.visitors[0].requiresCode).toBe(true);
  });

  test('the admin does not receive it either', async () => {
    mockingoose(Visitor).toReturn([visit()], 'find');
    expect((await h.api().get('/api/visitors').set(h.auth(admin))).body.visitors[0].qrCode).toBeUndefined();
  });

  test('the resident keeps the code for their own visitors', async () => {
    mockingoose(Visitor).toReturn([visit()], 'find');
    expect((await h.api().get('/api/visitors').set(h.auth(resident))).body.visitors[0].qrCode).toBe(QR);
  });

  test('a guard looking someone up by code sees details but not the code', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const res = await h.api().get('/api/visitors/lookup/abcdef12').set(h.auth(guard));
    expect(res.status).toBe(200);
    expect(res.body.visitor.qrCode).toBeUndefined();
  });

  test('lookup wants the full eight characters', async () => {
    expect((await h.api().get('/api/visitors/lookup/abcdef').set(h.auth(guard))).status).toBe(400);
  });

  test('walk-ins are marked as walk-ins', async () => {
    mockingoose(User).toReturn([resident], 'find');
    const res = await h.api().post('/api/visitors/walk-in').set(h.auth(guard)).send({ name: 'Meena', phone: '9000000001', flatNo: '101' });
    expect(res.status).toBe(201);
    expect(h.savedDocs(Visitor)[0]).toMatchObject({ source: 'walk_in', status: 'pending', approved: false });
  });

  test('only the resident can approve a walk-in, not a guard or the office', async () => {
    mockingoose(Visitor).toReturn(visit({ approved: false, status: 'pending', source: 'walk_in' }), 'findOne');
    expect((await put(h.oid(), 'approve', guard)).status).toBe(403);
    expect((await put(h.oid(), 'approve', admin)).status).toBe(403);
    expect((await put(h.oid(), 'approve', resident)).status).toBe(200);
  });
});

describe('daily help at the gate', () => {
  const help = () => new DailyHelp({ _id: h.oid(), societyId: h.SOCIETY_ID, name: 'Lakshmi', kind: 'maid', code: '482913', residents: [{ userId: resident._id, flat: 'A-101' }] });
  const check = (body) => h.api().post('/api/daily-help/check').set(h.auth(guard)).send(body);

  test('the admin does not get to read the gate code', async () => {
    mockingoose(DailyHelp).toReturn([help()], 'find');
    mockingoose(HelpAttendance).toReturn([], 'find');
    expect((await h.api().get('/api/daily-help').set(h.auth(admin))).body.helpers[0].code).toBeUndefined();
  });

  test('lookup says what the next step is: check in', async () => {
    mockingoose(DailyHelp).toReturn(help(), 'findOne');
    mockingoose(HelpAttendance).toReturn(null, 'findOne');
    const res = await h.api().get('/api/daily-help/lookup/482913').set(h.auth(guard));
    expect(res.body).toMatchObject({ inside: false, next: 'in', helper: { name: 'Lakshmi' } });
    expect(res.body.helper.code).toBeUndefined();
  });

  test('lookup says what the next step is: check out', async () => {
    mockingoose(DailyHelp).toReturn(help(), 'findOne');
    mockingoose(HelpAttendance).toReturn(new HelpAttendance({ societyId: h.SOCIETY_ID, helpId: h.oid(), date: '2026-10-19', checkIn: new Date(), open: true }), 'findOne');
    expect((await h.api().get('/api/daily-help/lookup/482913').set(h.auth(guard))).body).toMatchObject({ inside: true, next: 'out' });
  });

  test('check out with a helper who is not inside is refused clearly', async () => {
    mockingoose(DailyHelp).toReturn(help(), 'findOne');
    mockingoose(HelpAttendance).toReturn(null, 'findOneAndUpdate');
    const res = await check({ code: '482913', action: 'out' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not inside/);
  });

  test('check in for a helper who is already inside is refused clearly', async () => {
    mockingoose(DailyHelp).toReturn(help(), 'findOne');
    mockingoose(HelpAttendance).toReturn({ _id: h.oid(), open: true }, 'findOne');
    const res = await check({ code: '482913', action: 'in' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already inside/);
  });

  test('an explicit check out closes the open visit', async () => {
    const open = new HelpAttendance({ _id: h.oid(), societyId: h.SOCIETY_ID, helpId: h.oid(), date: '2026-10-19', checkIn: new Date(Date.now() - HOUR), checkOut: new Date(), open: false });
    mockingoose(DailyHelp).toReturn(help(), 'findOne');
    mockingoose(HelpAttendance).toReturn(open, 'findOneAndUpdate');
    const res = await check({ code: '482913', action: 'out' });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('out');
  });

  test('a resident can fetch the QR for their own helper only', async () => {
    mockingoose(DailyHelp).toReturn(help(), 'findOne');
    const res = await h.api().get(`/api/daily-help/${h.oid()}/pass`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.qrCodeImage).toMatch(/^data:image\/png/);
    const stranger = h.makeUser();
    h.knowUsers(resident, stranger, guard);
    expect((await h.api().get(`/api/daily-help/${h.oid()}/pass`).set(h.auth(stranger))).status).toBe(403);
  });
});

describe('verifying an email and a mobile number', () => {
  const body = { name: 'New Person', email: 'new@example.com', password: 'Passw0rd123', phone: '9876500001', role: 'resident', societyId: String(h.SOCIETY_ID), flatNo: '305' };
  const logs = () => jest.spyOn(console, 'log').mockImplementation(() => {});
  afterEach(() => jest.restoreAllMocks());

  test('signing up creates an unverified account, sends codes and gives no token', async () => {
    const spy = logs();
    mockingoose(Society).toReturn({ _id: h.SOCIETY_ID, name: 'Green Heights' }, 'findOne');
    mockingoose(User).toReturn(null, 'findOne');
    const res = await h.api().post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ needsVerification: true, email: 'new@example.com', channels: ['email', 'phone'] });
    expect(res.body.token).toBeUndefined();
    const saved = h.savedDocs(User)[0];
    expect(saved).toMatchObject({ emailVerified: false, phoneVerified: false, isApproved: false });
    expect(spy.mock.calls.flat().join('\n')).toMatch(/Verification code for new@example.com: \d{6}/);
  });

  test('the sign-up response never contains a code', async () => {
    logs();
    mockingoose(Society).toReturn({ _id: h.SOCIETY_ID, name: 'Green Heights' }, 'findOne');
    mockingoose(User).toReturn(null, 'findOne');
    const res = await h.api().post('/api/auth/register').send(body);
    expect(JSON.stringify(res.body)).not.toMatch(/"\d{6}"/);
  });

  test('an unverified account cannot sign in and gets fresh codes', async () => {
    const spy = logs();
    const user = h.makeUser({ email: 'new@example.com', emailVerified: false, phoneVerified: false });
    user.password = bcrypt.hashSync('Passw0rd123', 4);
    mockingoose(User).toReturn(user, 'findOne');
    const res = await h.api().post('/api/auth/login').send({ email: 'new@example.com', password: 'Passw0rd123' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ needsVerification: true, channels: ['email', 'phone'] });
    expect(res.body.token).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  test('a wrong password still looks like a wrong password, not a verification prompt', async () => {
    const user = h.makeUser({ email: 'new@example.com', emailVerified: false });
    user.password = bcrypt.hashSync('Passw0rd123', 4);
    mockingoose(User).toReturn(user, 'findOne');
    expect((await h.api().post('/api/auth/login').send({ email: 'new@example.com', password: 'nope-nope-1' })).status).toBe(401);
  });

  test('accounts from before verification existed still sign in', async () => {
    const user = h.makeUser({ email: 'old@example.com' });
    user.password = bcrypt.hashSync('Passw0rd123', 4);
    mockingoose(User).toReturn(user, 'findOne');
    const res = await h.api().post('/api/auth/login').send({ email: 'old@example.com', password: 'Passw0rd123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  const pending = (code = '123456', over = {}) => {
    const u = h.makeUser({ email: 'new@example.com', emailVerified: false, phoneVerified: false, password: 'hashed-in-real-life', ...over });
    u.verifyOtp = { email: { hash: otp.digest(u._id, 'email', code), expires: new Date(Date.now() + HOUR), tries: 0, sentAt: new Date(Date.now() - 60000) }, phone: { hash: otp.digest(u._id, 'phone', '654321'), expires: new Date(Date.now() + HOUR), tries: 0, sentAt: new Date(Date.now() - 60000) } };
    return u;
  };

  test('the right email code verifies the email and asks for the mobile code', async () => {
    mockingoose(User).toReturn(pending(), 'findOne');
    const res = await h.api().post('/api/auth/otp/verify').send({ email: 'new@example.com', emailCode: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, pending: ['phone'], done: false });
    expect(h.savedDocs(User)[0].emailVerified).toBe(true);
  });

  test('both codes together finish verification', async () => {
    mockingoose(User).toReturn(pending(), 'findOne');
    const res = await h.api().post('/api/auth/otp/verify').send({ email: 'new@example.com', emailCode: '123456', phoneCode: '654321' });
    expect(res.body).toMatchObject({ success: true, pending: [], done: true });
  });

  test('a wrong code is refused and counted', async () => {
    mockingoose(User).toReturn(pending(), 'findOne');
    const res = await h.api().post('/api/auth/otp/verify').send({ email: 'new@example.com', emailCode: '111111' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not right\. 4 tries left/);
  });

  test('after five wrong tries even the right code is refused', async () => {
    const u = pending();
    u.verifyOtp.email.tries = 5;
    mockingoose(User).toReturn(u, 'findOne');
    const res = await h.api().post('/api/auth/otp/verify').send({ email: 'new@example.com', emailCode: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Too many wrong tries/);
  });

  test('an expired code is refused', async () => {
    const u = pending();
    u.verifyOtp.email.expires = new Date(Date.now() - 1000);
    mockingoose(User).toReturn(u, 'findOne');
    expect((await h.api().post('/api/auth/otp/verify').send({ email: 'new@example.com', emailCode: '123456' })).body.message).toMatch(/expired/);
  });

  test('asking again straight away is refused, later it works', async () => {
    logs();
    const u = pending();
    u.verifyOtp.email.sentAt = new Date();
    mockingoose(User).toReturn(u, 'findOne');
    expect((await h.api().post('/api/auth/otp/send').send({ email: 'new@example.com', channel: 'email' })).status).toBe(429);
    h.reset();
    mockingoose(User).toReturn(pending(), 'findOne');
    expect((await h.api().post('/api/auth/otp/send').send({ email: 'new@example.com', channel: 'email' })).status).toBe(200);
  });

  test('asking for a code for an unknown email gives the same answer as a known one', async () => {
    mockingoose(User).toReturn(null, 'findOne');
    const res = await h.api().post('/api/auth/otp/send').send({ email: 'nobody@example.com', channel: 'email' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If this account needs verification/);
  });

  test('codes are stored hashed', () => {
    const u = pending('123456');
    expect(JSON.stringify(u.verifyOtp)).not.toContain('123456');
  });
});

describe('sending the mobile code', () => {
  afterEach(() => { delete process.env.SMS_PROVIDER; delete process.env.TWOFACTOR_API_KEY; delete process.env.FAST2SMS_API_KEY; delete process.env.TEXTBEE_API_KEY; delete process.env.TEXTBEE_DEVICE_ID; delete process.env.OTP_REQUIRE_PHONE; jest.restoreAllMocks(); delete global.fetch; });

  test('without a gateway the code is printed, not sent', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(await sendOtpSms('9876543210', '123456')).toEqual({ sent: false, via: 'console' });
    expect(spy.mock.calls.flat().join('')).toContain('123456');
  });

  test('2Factor gets the number and the code', async () => {
    process.env.SMS_PROVIDER = '2factor';
    process.env.TWOFACTOR_API_KEY = 'KEY';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ Status: 'Success' }) }));
    expect(await sendOtpSms('+919876543210', '123456')).toEqual({ sent: true, via: '2factor' });
    expect(global.fetch.mock.calls[0][0]).toBe('https://2factor.in/API/V1/KEY/SMS/9876543210/123456');
  });

  test('2Factor refusing the message is an error', async () => {
    process.env.SMS_PROVIDER = '2factor';
    process.env.TWOFACTOR_API_KEY = 'KEY';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ Status: 'Error', Details: 'Insufficient balance' }) }));
    await expect(sendOtpSms('9876543210', '123456')).rejects.toThrow(/Insufficient balance/);
  });

  test('Fast2SMS uses the OTP route', async () => {
    process.env.SMS_PROVIDER = 'fast2sms';
    process.env.FAST2SMS_API_KEY = 'K2';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ return: true }) }));
    expect(await sendOtpSms('9876543210', '123456')).toEqual({ sent: true, via: 'fast2sms' });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://www.fast2sms.com/dev/bulkV2');
    expect(JSON.parse(init.body)).toEqual({ route: 'otp', variables_values: '123456', numbers: '9876543210' });
  });

  test('TextBee sends the code from your own phone', async () => {
    process.env.SMS_PROVIDER = 'textbee';
    process.env.TEXTBEE_API_KEY = 'txb_key';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: { success: true } }) }));
    expect(await sendOtpSms('9876543210', '123456')).toEqual({ sent: true, via: 'textbee' });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.textbee.dev/api/v1/gateway/send-sms');
    expect(init.headers['x-api-key']).toBe('txb_key');
    const body = JSON.parse(init.body);
    expect(body.recipients).toEqual(['+919876543210']);
    expect(body.message).toContain('123456');
  });

  test('TextBee uses the chosen device when one is set', async () => {
    process.env.SMS_PROVIDER = 'textbee';
    process.env.TEXTBEE_API_KEY = 'txb_key';
    process.env.TEXTBEE_DEVICE_ID = 'dev123';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    await sendOtpSms('9876543210', '123456');
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.textbee.dev/api/v1/gateway/devices/dev123/send-sms');
  });

  test('TextBee refusing the message is an error that says why', async () => {
    process.env.SMS_PROVIDER = 'textbee';
    process.env.TEXTBEE_API_KEY = 'txb_key';
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ message: 'No enabled device found' }) }));
    await expect(sendOtpSms('9876543210', '123456')).rejects.toThrow(/No enabled device found/);
  });

  test('ordinary alerts and pass links also go through TextBee', async () => {
    process.env.SMS_PROVIDER = 'textbee';
    process.env.TEXTBEE_API_KEY = 'txb_key';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    expect(await require('../utils/sms').sendSms('9876543210', 'Nivora: hello')).toBe(true);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).message).toBe('Nivora: hello');
    expect(require('../utils/sms').isSmsConfigured()).toBe(true);
  });

  test('a mobile code is only required in production when a gateway exists', () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(otp.requiredChannels()).toEqual(['email']);
    process.env.SMS_PROVIDER = '2factor';
    process.env.TWOFACTOR_API_KEY = 'KEY';
    expect(otp.requiredChannels()).toEqual(['email', 'phone']);
    process.env.NODE_ENV = was;
  });
});

describe('invitation validity set by the resident', () => {
  beforeEach(() => mockingoose(User).toReturn([], 'find'));
  const invite = (extra = {}) => h.api().post('/api/visitors/invite').set(h.auth(resident)).send({ name: 'Ravi', phone: '9876543210', purpose: 'personal', ...extra });

  test('defaults to 24 hours', async () => {
    const res = await invite();
    expect(res.status).toBe(201);
    expect(h.savedDocs(Visitor)[0].validForHours).toBe(24);
    expect(res.body.visitor.validForHours).toBe(24);
  });

  test('the resident can choose how long it stays valid', async () => {
    const arrival = new Date(Date.now() + 2 * HOUR);
    const res = await invite({ expectedArrival: arrival.toISOString(), validForHours: 6 });
    expect(res.status).toBe(201);
    expect(h.savedDocs(Visitor)[0].validForHours).toBe(6);
    expect(new Date(res.body.visitor.expiresAt).getTime()).toBe(arrival.getTime() + 6 * HOUR);
  });

  test('nonsense validity is refused', async () => {
    expect((await invite({ validForHours: 0.5 })).status).toBe(400);
    expect((await invite({ validForHours: 100000 })).status).toBe(400);
    expect((await invite({ validForHours: 'abc' })).status).toBe(400);
  });

  test('can be changed while the invitation is unused', async () => {
    mockingoose(Visitor).toReturn(visit(), 'findOne');
    const res = await h.api().put(`/api/visitors/${h.oid()}`).set(h.auth(resident)).send({ validForHours: 72 });
    expect(res.status).toBe(200);
    expect(h.savedDocs(Visitor)[0].validForHours).toBe(72);
  });

  test('an expired pass is flagged for the resident', async () => {
    mockingoose(Visitor).toReturn([visit({ expectedArrival: new Date(Date.now() - 30 * HOUR) })], 'find');
    mockingoose(Visitor).toReturn(1, 'countDocuments');
    const res = await h.api().get('/api/visitors').set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.visitors[0].expired).toBe(true);
  });
});
