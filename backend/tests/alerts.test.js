jest.mock('../utils/sms', () => ({
  sendSms: jest.fn().mockResolvedValue(true),
  sendOtpSms: jest.fn().mockResolvedValue({ sent: false, via: 'console' }),
  isSmsConfigured: () => true,
  isOtpSmsLive: () => false,
  smsProvider: () => 'console'
}));
jest.mock('../utils/sendEmail', () => {
  const fn = jest.fn().mockResolvedValue({ messageId: 'x' });
  fn.isEmailConfigured = jest.fn(() => true);
  return fn;
});

const h = require('./helpers/harness');
const { mockingoose } = h;
const { sendSms } = require('../utils/sms');
const sendEmail = require('../utils/sendEmail');
const { sendPassLink } = require('../utils/passLink');
const Booking = require('../models/Booking');
const { ServiceRequest, ServiceProvider, Visitor, Society, User } = h.models;
const { todayIn, addDays } = require('../utils/timezone');

const settle = () => new Promise((resolve) => setTimeout(resolve, 60)); // notifications are delivered after the response
const smsTo = (phone) => sendSms.mock.calls.filter((c) => c[0] === phone);
const mailTo = (email) => sendEmail.mock.calls.filter((c) => c[0].email === email);

let resident;
let vendor;
let admin;
const PASS_ID = 'abcdef1234567890abcdef1234567890';

beforeEach(() => {
  h.reset();
  sendSms.mockClear();
  sendEmail.mockClear();
  sendEmail.isEmailConfigured.mockReturnValue(true);
  resident = h.makeUser({ email: 'asha@example.com', phone: '9876543210' });
  vendor = h.makeVendor({ email: 'ravi@example.com' });
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', phone: '9000000001', email: 'office@example.com', flatNo: undefined, block: undefined });
  h.knowUsers(resident, vendor, admin);
  h.knowSociety({ name: 'Green Meadows' });
});

describe('the entry pass link sent to a guest', () => {
  const visitor = (over = {}) => new Visitor({ _id: h.oid(), residentId: resident._id, societyId: h.SOCIETY_ID, name: 'Ravi', phone: '9812345678', email: 'ravi.guest@example.com', flatNo: '210', block: 'A', passId: PASS_ID, qrCode: JSON.stringify({ visitorId: PASS_ID }), status: 'approved', ...over });

  test('goes by text message with the link and the pass code, saying it is from Nivora', async () => {
    const out = await sendPassLink({ visitor: visitor(), resident });
    expect(out).toEqual({ sms: true, email: true });
    const [phone, text] = sendSms.mock.calls[0];
    expect(phone).toBe('9812345678');
    expect(text).toMatch(/^Nivora: You have an entry pass/);
    expect(text).toContain('Green Meadows');
    expect(text).toContain(`/pass/${PASS_ID}`);
    expect(text).toContain('ABCDEF12');
  });

  test('goes by email with the QR code attached and the link', async () => {
    await sendPassLink({ visitor: visitor(), resident });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.email).toBe('ravi.guest@example.com');
    expect(mail.subject).toMatch(/Your Nivora entry pass/);
    expect(mail.html).toContain(`/pass/${PASS_ID}`);
    expect(mail.html).toContain('ABCDEF12');
    expect(mail.html).toContain('cid:passqr');
    expect(mail.attachments[0]).toMatchObject({ cid: 'passqr', filename: 'entry-pass.png' });
    expect(Buffer.isBuffer(mail.attachments[0].content)).toBe(true);
  });

  test('without an email address only the text message is sent', async () => {
    const out = await sendPassLink({ visitor: visitor({ email: undefined }), resident });
    expect(out).toEqual({ sms: true, email: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('a failing provider never throws', async () => {
    sendSms.mockRejectedValueOnce(new Error('gateway down'));
    sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(sendPassLink({ visitor: visitor(), resident })).resolves.toEqual({ sms: false, email: false });
  });

  test('when email is not set up on the server it is skipped', async () => {
    sendEmail.isEmailConfigured.mockReturnValue(false);
    const out = await sendPassLink({ visitor: visitor(), resident });
    expect(out.email).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('inviting a guest', () => {
  const invite = (extra = {}) => h.api().post('/api/visitors/invite').set(h.auth(resident)).send({ name: 'Ravi', phone: '9812345678', purpose: 'personal', ...extra });
  beforeEach(() => mockingoose(User).toReturn([], 'find'));

  test('sends the pass to the guest and tells the resident what was sent', async () => {
    const res = await invite({ email: 'ravi.guest@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.visitor.delivery).toEqual({ sms: true, email: true });
    expect(res.body.visitor.passLink).toMatch(/\/pass\/[0-9a-f]{32}$/);
    expect(smsTo('9812345678')).toHaveLength(1);
    expect(mailTo('ravi.guest@example.com')).toHaveLength(1);
    expect(h.savedDocs(Visitor)[0].passId).toMatch(/^[0-9a-f]{32}$/);
  });

  test('works with only a phone number', async () => {
    const res = await invite();
    expect(res.status).toBe(201);
    expect(res.body.visitor.delivery).toEqual({ sms: true, email: false });
  });

  test('a mistyped email address is refused', async () => {
    expect((await invite({ email: 'not-an-email' })).status).toBe(400);
    expect(sendSms).not.toHaveBeenCalled();
  });

  test('the invitation still works when the message cannot be sent', async () => {
    sendSms.mockRejectedValueOnce(new Error('down'));
    const res = await invite();
    expect(res.status).toBe(201);
    expect(res.body.visitor.delivery.sms).toBe(false);
  });
});

describe('the public pass page', () => {
  const v = (over = {}) => new Visitor({ _id: h.oid(), residentId: resident._id, societyId: h.SOCIETY_ID, name: 'Ravi', phone: '9812345678', flatNo: '210', block: 'A', passId: PASS_ID, qrCode: JSON.stringify({ visitorId: PASS_ID }), status: 'approved', expectedArrival: new Date(Date.now() + 3600e3), ...over });
  const open = (id = PASS_ID) => h.api().get(`/api/public/pass/${id}`);

  test('shows the QR code, pass code and basic details without signing in', async () => {
    mockingoose(Visitor).toReturn(v(), 'findOne');
    const res = await open();
    expect(res.status).toBe(200);
    expect(res.body.pass).toMatchObject({ name: 'Ravi', society: 'Green Meadows', flat: 'A-210', usable: true, code: 'ABCDEF12' });
    expect(JSON.parse(res.body.pass.qr).visitorId).toBe(PASS_ID);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  test('never reveals the guest phone number or the resident id', async () => {
    mockingoose(Visitor).toReturn(v(), 'findOne');
    const body = JSON.stringify((await open()).body);
    expect(body).not.toContain('9812345678');
    expect(body).not.toContain(String(resident._id));
  });

  test('a used pass shows no QR code or code', async () => {
    mockingoose(Visitor).toReturn(v({ status: 'checked_out' }), 'findOne');
    const { pass } = (await open()).body;
    expect(pass).toMatchObject({ usable: false, qr: null, code: null, status: 'checked_out' });
  });

  test('an expired pass says so and hides the QR code', async () => {
    mockingoose(Visitor).toReturn(v({ expectedArrival: new Date(Date.now() - 30 * 3600e3) }), 'findOne');
    const { pass } = (await open()).body;
    expect(pass).toMatchObject({ expired: true, usable: false, qr: null });
  });

  test('a link that does not exist or is malformed is a 404', async () => {
    mockingoose(Visitor).toReturn(null, 'findOne');
    expect((await open()).status).toBe(404);
    expect((await open('12345')).status).toBe(404);
  });
});

describe('a service is booked', () => {
  let provider;
  beforeEach(() => {
    provider = h.makeProvider(vendor, { autoAccept: true });
    mockingoose(ServiceProvider).toReturn(provider, 'findOne');
    mockingoose(ServiceRequest).toReturn(0, 'countDocuments');
    mockingoose(ServiceRequest).toReturn([], 'find');
    mockingoose(ServiceRequest).toReturn(() => {
      const docs = h.savedDocs(ServiceRequest);
      const doc = docs[docs.length - 1];
      doc.residentId = resident;
      doc.providerUserId = vendor;
      return doc;
    }, 'findOne');
  });
  const book = () => h.api().post('/api/service-requests').set(h.auth(resident)).send({ providerId: String(provider._id), category: 'plumber', date: h.futureDate(3), startTime: '10:00', title: 'Leaking kitchen tap' });

  test('the vendor and the resident both get a text and an email', async () => {
    expect((await book()).status).toBe(201);
    await settle();
    expect(smsTo('9123456780').length).toBeGreaterThan(0); // vendor
    expect(mailTo('ravi@example.com').length).toBeGreaterThan(0);
    expect(smsTo('9876543210').length).toBeGreaterThan(0); // resident
    expect(mailTo('asha@example.com').length).toBeGreaterThan(0);
    expect(mailTo('ravi@example.com')[0][0].subject).toMatch(/New booking/);
  });

  test('a vendor who confirms by hand: the resident still gets a receipt by email', async () => {
    mockingoose(ServiceProvider).toReturn(h.makeProvider(vendor, { autoAccept: false }), 'findOne');
    expect((await book()).status).toBe(201);
    await settle();
    expect(mailTo('asha@example.com')[0][0].subject).toMatch(/Request sent/);
    expect(mailTo('ravi@example.com')[0][0].subject).toMatch(/New service request/);
    expect(smsTo('9123456780').length).toBeGreaterThan(0);
  });

  test('someone who turned email off is not emailed, but is still told in the app', async () => {
    const quiet = h.makeUser({ _id: resident._id, email: 'asha@example.com', phone: '9876543210', notificationPrefs: { push: true, sms: true, email: false } });
    h.knowUsers(quiet, vendor, admin);
    expect((await book()).status).toBe(201);
    await settle();
    expect(mailTo('asha@example.com')).toHaveLength(0);
    expect(mailTo('ravi@example.com').length).toBeGreaterThan(0);
  });
});

describe('amenity bookings and payments', () => {
  const clubhouseId = h.oid();
  const amenity = (over = {}) => ({ _id: clubhouseId, name: 'Clubhouse', capacity: 40, hourlyRate: 0, openTime: '06:00', closeTime: '22:00', slotMinutes: 60, maxSlotsPerBooking: 3, requiresApproval: true, maxAdvanceDays: 30, isActive: true, ...over });
  const day = () => addDays(todayIn(h.TZ), 3);
  const book = () => h.api().post('/api/bookings').set(h.auth(resident)).send({ amenity: 'Clubhouse', date: day(), startTime: '18:00', endTime: '20:00', numberOfGuests: 5 });
  beforeEach(() => {
    mockingoose(Booking).toReturn(null, 'findOne');
    mockingoose(User).toReturn([admin], 'find');
  });

  test('a booking that needs approval texts and emails the office and gives the resident a receipt', async () => {
    mockingoose(Society).toReturn({ _id: h.SOCIETY_ID, timezone: h.TZ, amenities: [amenity()] }, 'findOne');
    expect((await book()).status).toBe(201);
    await settle();
    expect(smsTo('9000000001').length).toBe(1);
    expect(mailTo('office@example.com')[0][0].subject).toMatch(/needs approval/);
    expect(mailTo('asha@example.com')[0][0].subject).toMatch(/Booking request sent/);
    expect(smsTo('9876543210')).toHaveLength(0); // a receipt is not worth a text
  });

  test('an instant booking only emails the resident; the office is not texted', async () => {
    mockingoose(Society).toReturn({ _id: h.SOCIETY_ID, timezone: h.TZ, amenities: [amenity({ requiresApproval: false })] }, 'findOne');
    expect((await book()).status).toBe(201);
    await settle();
    expect(smsTo('9000000001')).toHaveLength(0);
    expect(mailTo('office@example.com')).toHaveLength(0);
    expect(mailTo('asha@example.com')[0][0].subject).toMatch(/Amenity booked/);
  });
});

describe('notification preferences', () => {
  test('the email switch can be turned off and on', async () => {
    const res = await h.api().put('/api/push/prefs').set(h.auth(resident)).send({ email: false });
    expect(res.status).toBe(200);
    expect(h.updatesTo(User)[0].update.$set['notificationPrefs.email']).toBe(false);
  });

  test('the settings call says whether text and email are available', async () => {
    const res = await h.api().get('/api/push/config').set(h.auth(resident));
    expect(res.body).toMatchObject({ smsEnabled: true, emailEnabled: true });
    expect(res.body.prefs.email).toBe(true);
  });
});
