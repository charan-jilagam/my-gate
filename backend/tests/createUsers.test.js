jest.mock('../utils/sendEmail', () => {
  const fn = jest.fn().mockResolvedValue({});
  fn.isEmailConfigured = () => true;
  return fn;
});
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const h = require('./helpers/harness');
const { mockingoose } = h;
const User = h.models.User;
const Society = h.models.Society;
const Notification = h.models.Notification;

let admin;
let superAdmin;
const body = (over = {}) => ({ name: 'Gopi Head', email: 'gopi@example.com', phone: '9876500011', role: 'guard_admin', ...over });
const create = (as, data) => h.api().post('/api/users/create').set(h.auth(as)).send(data);
const lastUser = () => h.savedDocs(User).filter((u) => u.email === 'gopi@example.com').pop();

beforeEach(() => {
  h.reset();
  sendEmail.mockClear();
  admin = h.makeUser({ role: 'society_admin', name: 'Office Admin', flatNo: undefined, block: undefined });
  superAdmin = h.makeUser({ role: 'super_admin', name: 'Platform Owner', societyId: undefined, flatNo: undefined, block: undefined });
  h.knowUsers(admin, superAdmin);
  mockingoose(Society).toReturn({ _id: h.SOCIETY_ID, name: 'Sunrise Apartments', timezone: h.TZ }, 'findOne');
  mockingoose(User).toReturn([admin], 'find');
});

describe('a society admin adds people', () => {
  test.each(['resident', 'security', 'guard_admin', 'staff', 'vendor'])('can add a %s', async (role) => {
    const res = await create(admin, body({ role, flatNo: '204', block: 'B' }));
    expect(res.status).toBe(201);
    const u = lastUser();
    expect(u).toMatchObject({ role, isApproved: true, isActive: true, emailVerified: true, phoneVerified: true });
    expect(String(u.societyId)).toBe(String(h.SOCIETY_ID));
    expect(String(u.approvedBy)).toBe(String(admin._id));
  });

  test('nobody is told a password; the person gets a link to choose their own', async () => {
    const res = await create(admin, body());
    expect(JSON.stringify(res.body)).not.toMatch(/"password"/);
    const { setupUrl, emailSent, days } = res.body.invite;
    expect(emailSent).toBe(true);
    expect(days).toBe(7);
    expect(setupUrl).toMatch(/\/reset-password\/[a-f0-9]{40}\?welcome=1$/);
    const token = setupUrl.match(/reset-password\/([a-f0-9]+)/)[1];
    expect(lastUser().resetPasswordToken).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(lastUser().resetPasswordExpire.getTime()).toBeGreaterThan(Date.now() + 6 * 864e5);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ email: 'gopi@example.com', subject: expect.stringMatching(/Welcome to Nivora/) });
    expect(mail.html).toMatch(/guard head/);
    expect(mail.html).toContain(setupUrl);
  });

  test('the link they receive lets them choose a password', async () => {
    const res = await create(admin, body());
    const token = res.body.invite.setupUrl.match(/reset-password\/([a-f0-9]+)/)[1];
    const created = lastUser();
    mockingoose(User).toReturn(created, 'findOne');
    const set = await h.api().put(`/api/auth/reset-password/${token}`).send({ password: 'Chosen123' });
    expect(set.status).toBe(200);
    expect(set.body.token).toBeTruthy();
  });

  test('a failed email still creates the account and hands over the link', async () => {
    sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    const res = await create(admin, body());
    expect(res.status).toBe(201);
    expect(res.body.invite.emailSent).toBe(false);
    expect(res.body.invite.setupUrl).toMatch(/reset-password/);
    expect(res.body.message).toMatch(/share the setup link/);
  });

  test('a resident needs a flat number', async () => {
    const res = await create(admin, body({ role: 'resident' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/flat number/);
  });

  test('cannot add a society admin, and cannot choose another society', async () => {
    expect((await create(admin, body({ role: 'society_admin' }))).status).toBe(403);
    await create(admin, body({ societyId: String(h.OTHER_SOCIETY_ID) }));
    expect(String(lastUser().societyId)).toBe(String(h.SOCIETY_ID));
  });

  test.each([
    ['a bad email', { email: 'nope' }],
    ['a short phone number', { phone: '12345' }],
    ['no name', { name: '' }],
    ['an unknown role', { role: 'super_admin' }]
  ])('refuses %s', async (_, over) => {
    expect((await create(admin, body(over))).status).toBe(400);
  });

  test('refuses an email that already has an account', async () => {
    mockingoose(User).toReturn((q) => (q.getQuery().email ? h.makeUser({ email: 'gopi@example.com' }) : admin), 'findOne');
    const res = await create(admin, body());
    expect(res.status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('residents, guards and staff cannot create accounts', async () => {
    for (const role of ['resident', 'security', 'staff', 'guard_admin', 'vendor']) {
      const who = h.makeUser({ role, ...(role === 'resident' ? {} : { flatNo: undefined, block: undefined }) });
      h.knowUsers(who);
      expect((await create(who, body())).status).toBe(403);
    }
  });
});

describe('the super admin adds people to any society', () => {
  test('can add a society admin to a chosen society', async () => {
    const res = await create(superAdmin, body({ role: 'society_admin', societyId: String(h.OTHER_SOCIETY_ID) }));
    expect(res.status).toBe(201);
    expect(lastUser()).toMatchObject({ role: 'society_admin', isApproved: true });
    expect(String(lastUser().societyId)).toBe(String(h.OTHER_SOCIETY_ID));
    expect(sendEmail.mock.calls[0][0].html).toMatch(/society admin/);
  });

  test.each(['staff', 'guard_admin'])('can add a %s, and that society\'s admins are told', async (role) => {
    const res = await create(superAdmin, body({ role, societyId: String(h.SOCIETY_ID) }));
    expect(res.status).toBe(201);
    const told = h.savedDocs(Notification).find((n) => String(n.userId) === String(admin._id));
    expect(told).toMatchObject({ title: 'New person added', actionUrl: '/admin/residents' });
    expect(told.message).toMatch(/Platform Owner added Gopi Head/);
  });

  test('must say which society', async () => {
    const res = await create(superAdmin, body({ role: 'staff' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Choose which society/);
  });

  test('an unknown society is refused', async () => {
    mockingoose(Society).toReturn(null, 'findOne');
    expect((await create(superAdmin, body({ societyId: String(h.OTHER_SOCIETY_ID) }))).status).toBe(404);
  });
});

describe('sending the setup link again', () => {
  const invite = (as, target) => h.api().post(`/api/users/${target._id}/invite`).set(h.auth(as));

  test('works for someone who has never signed in', async () => {
    const waiting = h.makeUser({ role: 'staff', flatNo: undefined, block: undefined, email: 'w@example.com', password: 'hashed-placeholder' });
    mockingoose(User).toReturn((q) => (String(q.getQuery()._id) === String(waiting._id) ? waiting : admin), 'findOne');
    const res = await invite(admin, waiting);
    expect(res.status).toBe(200);
    expect(res.body.invite.setupUrl).toMatch(/reset-password/);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test('is refused once they have signed in, or for another society, or for an admin', async () => {
    const active = h.makeUser({ role: 'staff', flatNo: undefined, block: undefined, lastLogin: new Date() });
    const stranger = h.makeUser({ role: 'staff', flatNo: undefined, block: undefined, societyId: h.OTHER_SOCIETY_ID });
    const other = h.makeUser({ role: 'society_admin', flatNo: undefined, block: undefined });
    mockingoose(User).toReturn((q) => [active, stranger, other, admin].find((u) => String(u._id) === String(q.getQuery()._id)) || null, 'findOne');
    expect((await invite(admin, active)).status).toBe(409);
    expect((await invite(admin, stranger)).status).toBe(403);
    expect((await invite(admin, other)).status).toBe(403);
  });
});

describe('switching accounts on and off', () => {
  test('the super admin can deactivate a society admin, a society admin cannot', async () => {
    const other = h.makeUser({ role: 'society_admin', flatNo: undefined, block: undefined, password: 'hashed-placeholder' });
    mockingoose(User).toReturn((q) => [other, admin, superAdmin].find((u) => String(u._id) === String(q.getQuery()._id)) || null, 'findOne');
    expect((await h.api().put(`/api/users/${other._id}/active`).set(h.auth(superAdmin)).send({ active: false })).status).toBe(200);
    expect((await h.api().put(`/api/users/${other._id}/active`).set(h.auth(admin)).send({ active: false })).status).toBe(400);
  });

  test('a guard head can be deactivated by the admin', async () => {
    const head = h.makeUser({ role: 'guard_admin', flatNo: undefined, block: undefined, password: 'hashed-placeholder' });
    mockingoose(User).toReturn((q) => [head, admin].find((u) => String(u._id) === String(q.getQuery()._id)) || null, 'findOne');
    expect((await h.api().put(`/api/users/${head._id}/active`).set(h.auth(admin)).send({ active: false })).status).toBe(200);
  });
});
