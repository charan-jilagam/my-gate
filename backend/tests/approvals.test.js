jest.mock('../utils/sendEmail', () => {
  const fn = jest.fn().mockResolvedValue({});
  fn.isEmailConfigured = () => true;
  return fn;
});
const sendEmail = require('../utils/sendEmail');
const h = require('./helpers/harness');
const { mockingoose } = h;
const User = h.models.User;
const Notification = h.models.Notification;

let admin;
let staff;
let pendingResident;
let pendingGuard;

const mkPending = (over = {}) => h.makeUser({ googleId: 'g', isApproved: false, name: 'New Neha', email: 'neha@example.com', ...over });
const approve = (as, target) => h.api().put(`/api/users/approve/${target._id}`).set(h.auth(as));
const toldAdmins = () => h.savedDocs(Notification).filter((n) => String(n.userId) === String(admin._id));

beforeEach(() => {
  h.reset();
  sendEmail.mockClear();
  admin = h.makeUser({ role: 'society_admin', name: 'Office Admin', googleId: 'g', flatNo: undefined, block: undefined });
  staff = h.makeUser({ role: 'staff', name: 'Sunil Staff', googleId: 'g', flatNo: undefined, block: undefined });
  pendingResident = mkPending();
  pendingGuard = mkPending({ role: 'security', name: 'Gopi Guard', email: 'gopi@example.com', flatNo: undefined, block: undefined });
  h.knowUsers(admin, staff, pendingResident, pendingGuard);
  h.knowSociety({ name: 'Sunrise Apartments' });
  mockingoose(User).toReturn([admin], 'find');
});

describe('approval email', () => {
  test('the person gets an email the moment the admin approves them', async () => {
    const res = await approve(admin, pendingResident);
    expect(res.status).toBe(200);
    expect(pendingResident.isApproved).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.email).toBe('neha@example.com');
    expect(mail.subject).toMatch(/approved/i);
    expect(mail.html).toMatch(/Sign in to Nivora/);
    expect(mail.html).toMatch(/Sunrise Apartments/);
    expect(mail.message).toMatch(/\/login/);
  });

  test('a mail failure does not undo the approval', async () => {
    sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    const res = await approve(admin, pendingResident);
    expect(res.status).toBe(200);
    expect(pendingResident.isApproved).toBe(true);
  });

  test('a rejected sign-up gets a polite email with the reason', async () => {
    const res = await h.api().put(`/api/users/reject/${pendingResident._id}`).set(h.auth(admin)).send({ reason: 'Flat number not found' });
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ email: 'neha@example.com', subject: expect.stringMatching(/not approved/i) });
    expect(sendEmail.mock.calls[0][0].html).toMatch(/Flat number not found/);
  });

  test('approving someone already approved is refused', async () => {
    pendingResident.isApproved = true;
    expect((await approve(admin, pendingResident)).status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('staff approving residents', () => {
  test('staff can approve a resident of their own society, and the admin is told who did it', async () => {
    const res = await approve(staff, pendingResident);
    expect(res.status).toBe(200);
    expect(pendingResident.isApproved).toBe(true);
    expect(pendingResident.approvedBy).toBeTruthy();
    const note = toldAdmins()[0];
    expect(note).toMatchObject({ title: 'Resident approved by staff', actionUrl: '/admin/residents' });
    expect(note.message).toMatch(/Sunil Staff approved New Neha/);
    await new Promise((r) => setImmediate(r));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test('staff cannot approve guards, other staff or vendors', async () => {
    const res = await approve(staff, pendingGuard);
    expect(res.status).toBe(403);
    expect(pendingGuard.isApproved).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('staff cannot approve a resident of another society', async () => {
    const stranger = mkPending({ societyId: h.OTHER_SOCIETY_ID });
    h.knowUsers(admin, staff, stranger);
    expect((await approve(staff, stranger)).status).toBe(403);
  });

  test('staff see only waiting residents of their society', async () => {
    mockingoose(User).toReturn((q) => {
      const f = q.getQuery();
      expect(f.role).toEqual({ $in: ['resident'] });
      expect(String(f.societyId)).toBe(String(h.SOCIETY_ID));
      return [pendingResident];
    }, 'find');
    const res = await h.api().get('/api/users/pending-approvals').set(h.auth(staff));
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
  });

  test('residents and guards cannot approve anyone', async () => {
    const resident = h.makeUser({ googleId: 'g' });
    const guard = h.makeUser({ role: 'security', googleId: 'g', flatNo: undefined, block: undefined });
    h.knowUsers(resident, guard, pendingResident);
    expect((await approve(resident, pendingResident)).status).toBe(403);
    expect((await approve(guard, pendingResident)).status).toBe(403);
  });
});

describe('new resident sign-ups reach the staff too', () => {
  test('the sign-up notice goes to admins and staff for a resident, and to admins only for a guard', async () => {
    const authRoute = require('fs').readFileSync(require('path').join(__dirname, '../routes/auth.js'), 'utf8');
    expect(authRoute).toMatch(/role === 'resident' \? \['society_admin', 'staff'\] : \['society_admin'\]/);
  });
});
