const h = require('./helpers/harness');
const { mockingoose } = h;
const SocietyDocument = require('../models/SocietyDocument');
const User = h.models.User;
const Notification = h.models.Notification;

let resident;
let guard;
let vendor;
let admin;

const makeDoc = (over = {}) => new SocietyDocument({ _id: h.oid(), societyId: h.SOCIETY_ID, title: 'Bylaws 2026', category: 'bylaws', url: '/uploads/abc.pdf', uploadedBy: admin._id, ...over });

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  guard = h.makeUser({ role: 'security', name: 'Gopal' });
  vendor = h.makeVendor();
  admin = h.makeUser({ role: 'society_admin', name: 'Office', flatNo: undefined, block: undefined });
  h.knowUsers(resident, guard, vendor, admin);
  h.knowSociety();
});

describe('document library', () => {
  test('residents see only documents meant for everyone, scoped to their society', async () => {
    let asked;
    mockingoose(SocietyDocument).toReturn((q) => { asked = q.getQuery(); return [makeDoc()]; }, 'find');
    const res = await h.api().get('/api/documents?category=bylaws').set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.documents[0]).toMatchObject({ title: 'Bylaws 2026', url: '/uploads/abc.pdf' });
    expect(String(asked.societyId)).toBe(String(h.SOCIETY_ID));
    expect(asked.visibility).toBe('all');
    expect(asked.category).toBe('bylaws');
  });

  test('the office also sees office-only documents', async () => {
    let asked;
    mockingoose(SocietyDocument).toReturn((q) => { asked = q.getQuery(); return []; }, 'find');
    await h.api().get('/api/documents').set(h.auth(admin));
    expect(asked.visibility).toBeUndefined();
  });

  test('guards can read, vendors cannot', async () => {
    mockingoose(SocietyDocument).toReturn([], 'find');
    expect((await h.api().get('/api/documents').set(h.auth(guard))).status).toBe(200);
    expect((await h.api().get('/api/documents').set(h.auth(vendor))).status).toBe(403);
  });

  test('a search word is escaped, not run as a pattern', async () => {
    let asked;
    mockingoose(SocietyDocument).toReturn((q) => { asked = q.getQuery(); return []; }, 'find');
    await h.api().get('/api/documents').query({ q: '(a+)+$' }).set(h.auth(resident));
    expect(asked.title.$regex).toBe('\\(a\\+\\)\\+\\$');
  });

  test('the office adds a document; residents cannot', async () => {
    const body = { title: 'AGM minutes', category: 'minutes', url: '/uploads/min.pdf', fileName: 'min.pdf' };
    expect((await h.api().post('/api/documents').set(h.auth(resident)).send(body)).status).toBe(403);
    const res = await h.api().post('/api/documents').set(h.auth(admin)).send(body);
    expect(res.status).toBe(201);
    const [saved] = h.savedDocs(SocietyDocument);
    expect(saved).toMatchObject({ title: 'AGM minutes', visibility: 'all' });
    expect(String(saved.uploadedBy)).toBe(String(admin._id));
  });

  test.each(['javascript:alert(1)', 'data:text/html,hi', 'http://insecure.example/a.pdf', '/uploads/../etc/passwd', 'ftp://x/y'])('refuses an unsafe link: %s', async (url) => {
    const res = await h.api().post('/api/documents').set(h.auth(admin)).send({ title: 'Bad link', url });
    expect(res.status).toBe(400);
    expect(h.savedDocs(SocietyDocument)).toHaveLength(0);
  });

  test('needs a title and a known category', async () => {
    expect((await h.api().post('/api/documents').set(h.auth(admin)).send({ title: 'x', url: '/uploads/a.pdf' })).status).toBe(400);
    expect((await h.api().post('/api/documents').set(h.auth(admin)).send({ title: 'Fine title', category: 'memes', url: '/uploads/a.pdf' })).status).toBe(400);
  });

  test('"tell residents" notifies approved residents, but never for an office-only document', async () => {
    mockingoose(User).toReturn([resident], 'find');
    await h.api().post('/api/documents').set(h.auth(admin)).send({ title: 'Circular', url: '/uploads/c.pdf', notify: true });
    expect(h.savedDocs(Notification).map((n) => String(n.userId))).toEqual([String(resident._id)]);
    expect(h.savedDocs(Notification)[0]).toMatchObject({ type: 'document', actionUrl: '/documents' });

    h.reset();
    h.knowUsers(resident, admin);
    h.knowSociety();
    mockingoose(User).toReturn([resident], 'find');
    await h.api().post('/api/documents').set(h.auth(admin)).send({ title: 'Audit', url: '/uploads/c.pdf', visibility: 'admins', notify: true });
    expect(h.savedDocs(Notification)).toHaveLength(0);
  });

  test('a document from another society cannot be changed or deleted', async () => {
    const foreign = makeDoc({ societyId: h.OTHER_SOCIETY_ID });
    mockingoose(SocietyDocument).toReturn(foreign, 'findOne');
    expect((await h.api().delete(`/api/documents/${foreign._id}`).set(h.auth(admin))).status).toBe(403);
    expect((await h.api().put(`/api/documents/${foreign._id}`).set(h.auth(admin)).send({ title: 'Hijack', url: '/uploads/a.pdf' })).status).toBe(403);
  });

  test('the office edits and deletes their own document', async () => {
    const doc = makeDoc();
    mockingoose(SocietyDocument).toReturn(doc, 'findOne');
    const edit = await h.api().put(`/api/documents/${doc._id}`).set(h.auth(admin)).send({ title: 'Bylaws (revised)', url: '/uploads/abc.pdf', visibility: 'admins' });
    expect(edit.status).toBe(200);
    expect(doc).toMatchObject({ title: 'Bylaws (revised)', visibility: 'admins' });
    expect((await h.api().delete(`/api/documents/${doc._id}`).set(h.auth(admin))).status).toBe(200);
  });
});

describe('PDF upload', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

  test('residents cannot upload documents', async () => {
    const res = await h.api().post('/api/uploads/document').set(h.auth(resident)).attach('file', pdf, 'a.pdf');
    expect(res.status).toBe(403);
  });

  test('refuses a file that only looks like a PDF by its name', async () => {
    const res = await h.api().post('/api/uploads/document').set(h.auth(admin)).attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only PDF/);
  });

  test('accepts a real PDF from the office and stores it under a random name', async () => {
    const fs = require('fs');
    const path = require('path');
    const res = await h.api().post('/api/uploads/document').set(h.auth(admin)).attach('file', pdf, { filename: '../../evil name.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.pdf$/);
    expect(res.body.name).not.toMatch(/[\\/]/);
    const file = path.join(__dirname, '..', res.body.url);
    expect(fs.readFileSync(file).slice(0, 5).toString()).toBe('%PDF-');
    fs.unlinkSync(file);
  });

  test('asks for a file when none is sent', async () => {
    const res = await h.api().post('/api/uploads/document').set(h.auth(admin));
    expect(res.status).toBe(400);
  });
});
