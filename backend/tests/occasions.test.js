const h = require('./helpers/harness');
const { mockingoose } = h;
const Occasion = require('../models/Occasion');
const User = h.models.User;
const Notification = h.models.Notification;

let resident;
let guard;
let vendor;
let admin;
let staff;

const photo = (n) => ({ url: `/uploads/p${n}.jpg`, caption: `Photo ${n}` });
const make = (over = {}) => new Occasion({ _id: h.oid(), societyId: h.SOCIETY_ID, title: 'Diwali Night', kind: 'festival', date: '2026-11-08', venue: 'Clubhouse lawn', hostedBy: 'Cultural committee', photos: [photo(1), photo(2), photo(3), photo(4), photo(5)], createdBy: staff._id, ...over });
const body = (over = {}) => ({ title: 'Diwali Night', kind: 'festival', date: '2026-11-08', venue: 'Clubhouse lawn', hostedBy: 'Cultural committee', attendees: 180, description: 'Lamps, sweets and a cracker-free evening.', highlights: ['Rangoli won by Block B'], photos: [photo(1), photo(2)], ...over });
const post = (who, b) => h.api().post('/api/occasions').set(h.auth(who)).send(b);

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  guard = h.makeUser({ role: 'security', name: 'Gopal' });
  vendor = h.makeVendor();
  admin = h.makeUser({ role: 'society_admin', name: 'Office', flatNo: undefined, block: undefined });
  staff = h.makeUser({ role: 'staff', name: 'Sunil Staff', flatNo: undefined, block: undefined });
  h.knowUsers(resident, guard, vendor, admin, staff);
  h.knowSociety();
  mockingoose(User).toReturn([{ _id: resident._id }, { _id: guard._id }, { _id: staff._id }], 'find');
});

describe('who can add occasions', () => {
  test('the society office and staff can; residents, guards and vendors cannot', async () => {
    expect((await post(admin, body())).status).toBe(201);
    expect((await post(staff, body())).status).toBe(201);
    for (const who of [resident, guard, vendor]) expect((await post(who, body())).status).toBe(403);
  });

  test('it is saved in the adder\'s society with who added it', async () => {
    const res = await post(staff, body());
    expect(res.status).toBe(201);
    const saved = h.savedDocs(Occasion)[0];
    expect(String(saved.societyId)).toBe(String(h.SOCIETY_ID));
    expect(String(saved.createdBy)).toBe(String(staff._id));
    expect(saved).toMatchObject({ title: 'Diwali Night', kind: 'festival', date: '2026-11-08', attendees: 180 });
    expect(saved.photos.map((p) => p.url)).toEqual(['/uploads/p1.jpg', '/uploads/p2.jpg']);
    expect(res.body.occasion.highlights).toEqual(['Rangoli won by Block B']);
  });
});

describe('what is accepted', () => {
  test('a name and a real date are required', async () => {
    expect((await post(admin, body({ title: '' }))).status).toBe(400);
    expect((await post(admin, body({ title: 'x' }))).status).toBe(400);
    expect((await post(admin, body({ date: undefined }))).status).toBe(400);
    expect((await post(admin, body({ date: '2026-02-31' }))).status).toBe(400);
    expect((await post(admin, body({ date: '8 Nov' }))).status).toBe(400);
  });

  test('the last day cannot be before the first', async () => {
    const res = await post(admin, body({ endDate: '2026-11-07' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/last day/);
    expect((await post(admin, body({ endDate: '2026-11-10' }))).status).toBe(201);
  });

  test('only uploaded files or https links are accepted as photos, and not too many', async () => {
    expect((await post(admin, body({ photos: [{ url: 'javascript:alert(1)' }] }))).status).toBe(400);
    expect((await post(admin, body({ photos: [{ url: 'data:image/png;base64,AAAA' }] }))).status).toBe(400);
    expect((await post(admin, body({ photos: [{ url: '/uploads/../secret' }] }))).status).toBe(400);
    expect((await post(admin, body({ photos: [{ url: 'https://res.cloudinary.com/x/a.jpg', caption: 'ok' }] }))).status).toBe(201);
    expect((await post(admin, body({ photos: Array.from({ length: 25 }, (_, i) => photo(i)) }))).status).toBe(400);
    expect((await post(admin, body({ photos: Array.from({ length: 24 }, (_, i) => photo(i)) }))).status).toBe(201);
  });

  test('unknown type, long text, too many highlights and a negative crowd are refused', async () => {
    expect((await post(admin, body({ kind: 'party' }))).status).toBe(400);
    expect((await post(admin, body({ description: 'x'.repeat(2001) }))).status).toBe(400);
    expect((await post(admin, body({ highlights: Array.from({ length: 9 }, (_, i) => `h${i}`) }))).status).toBe(400);
    expect((await post(admin, body({ highlights: ['x'.repeat(141)] }))).status).toBe(400);
    expect((await post(admin, body({ attendees: -5 }))).status).toBe(400);
    expect((await post(admin, body({ photos: [{ url: '/uploads/a.jpg', caption: 'x'.repeat(141) }] }))).status).toBe(400);
  });

  test('blank highlights are dropped and text is trimmed', async () => {
    await post(admin, body({ title: '  Holi  ', highlights: ['  Colours  ', '   ', ''] }));
    expect(h.savedDocs(Occasion)[0]).toMatchObject({ title: 'Holi' });
    expect(h.savedDocs(Occasion)[0].highlights).toEqual(['Colours']);
  });
});

describe('telling people', () => {
  test('residents, guards and staff are notified, but not the person who added it', async () => {
    await post(staff, body());
    const notes = h.savedDocs(Notification);
    const to = notes.map((n) => String(n.userId));
    expect(to).toContain(String(resident._id));
    expect(to).toContain(String(guard._id));
    expect(to).not.toContain(String(staff._id));
    expect(notes[0]).toMatchObject({ type: 'occasion', title: 'New occasion photos', relatedModel: 'Occasion' });
    expect(notes[0].actionUrl).toMatch(/^\/occasions\/[0-9a-f]{24}$/);
    expect(notes[0].message).toMatch(/with 2 photos/);
  });

  test('notify:false stays quiet', async () => {
    await post(admin, body({ notify: false }));
    expect(h.savedDocs(Notification)).toHaveLength(0);
  });

  test('a failed notice does not fail the save', async () => {
    mockingoose(User).toReturn(new Error('db down'), 'find');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post(admin, body())).status).toBe(201);
    console.error.mockRestore();
  });
});

describe('looking at occasions', () => {
  test('everyone in the society can list them; vendors cannot', async () => {
    mockingoose(Occasion).toReturn([make()], 'find');
    for (const who of [resident, guard, staff, admin]) expect((await h.api().get('/api/occasions').set(h.auth(who))).status).toBe(200);
    expect((await h.api().get('/api/occasions').set(h.auth(vendor))).status).toBe(403);
  });

  test('the list is limited to the society and can be filtered', async () => {
    let asked;
    mockingoose(Occasion).toReturn((q) => { asked = q.getQuery(); return []; }, 'find');
    await h.api().get('/api/occasions?kind=sports&year=2026').set(h.auth(resident));
    expect(String(asked.societyId)).toBe(String(h.SOCIETY_ID));
    expect(asked.kind).toBe('sports');
    expect(asked.date.$regex).toBe('^2026-');
    expect((await h.api().get('/api/occasions?kind=party').set(h.auth(resident))).status).toBe(400);
    expect((await h.api().get('/api/occasions?year=26').set(h.auth(resident))).status).toBe(400);
  });

  test('a card has the cover, a few more pictures and the count, not the whole gallery', async () => {
    mockingoose(Occasion).toReturn([make()], 'find');
    const res = await h.api().get('/api/occasions').set(h.auth(resident));
    const card = res.body.occasions[0];
    expect(card).toMatchObject({ title: 'Diwali Night', cover: '/uploads/p1.jpg', photoCount: 5, venue: 'Clubhouse lawn' });
    expect(card.preview).toEqual(['/uploads/p2.jpg', '/uploads/p3.jpg', '/uploads/p4.jpg']);
    expect(card.photos).toBeUndefined();
    expect(res.body.canAdd).toBe(false);
    mockingoose(Occasion).toReturn([], 'find');
    expect((await h.api().get('/api/occasions').set(h.auth(staff))).body.canAdd).toBe(true);
  });

  test('opening one gives every photo with its caption and the details', async () => {
    mockingoose(Occasion).toReturn(make({ description: 'A long evening', highlights: ['Rangoli'] }), 'findOne');
    const res = await h.api().get(`/api/occasions/${h.oid()}`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.occasion.photos).toHaveLength(5);
    expect(res.body.occasion.photos[0]).toEqual({ url: '/uploads/p1.jpg', caption: 'Photo 1' });
    expect(res.body.occasion).toMatchObject({ description: 'A long evening', highlights: ['Rangoli'], hostedBy: 'Cultural committee' });
    expect(res.body.canChange).toBe(false);
  });

  test('another society\'s occasion is not reachable', async () => {
    mockingoose(Occasion).toReturn({ _id: h.oid(), societyId: h.oid() }, 'findOne');
    expect((await h.api().get(`/api/occasions/${h.oid()}`).set(h.auth(resident))).status).toBe(403);
  });
});

describe('changing and removing', () => {
  test('staff can change what they added, the office can change anything', async () => {
    mockingoose(Occasion).toReturn(make({ createdBy: staff._id }), 'findOne');
    const mine = await h.api().put(`/api/occasions/${h.oid()}`).set(h.auth(staff)).send(body({ title: 'Diwali Night 2026' }));
    expect(mine.status).toBe(200);
    expect(h.savedDocs(Occasion)[0].title).toBe('Diwali Night 2026');
    h.reset(); h.knowUsers(resident, guard, vendor, admin, staff); h.knowSociety();
    mockingoose(Occasion).toReturn(make({ createdBy: admin._id }), 'findOne');
    expect((await h.api().put(`/api/occasions/${h.oid()}`).set(h.auth(staff)).send(body())).status).toBe(403);
    expect((await h.api().put(`/api/occasions/${h.oid()}`).set(h.auth(admin)).send(body())).status).toBe(200);
  });

  test('residents cannot change or remove', async () => {
    mockingoose(Occasion).toReturn(make(), 'findOne');
    expect((await h.api().put(`/api/occasions/${h.oid()}`).set(h.auth(resident)).send(body())).status).toBe(403);
    expect((await h.api().delete(`/api/occasions/${h.oid()}`).set(h.auth(resident))).status).toBe(403);
  });

  test('photos can be replaced and reordered (the first is the cover)', async () => {
    const o = make({ createdBy: admin._id });
    mockingoose(Occasion).toReturn(o, 'findOne');
    await h.api().put(`/api/occasions/${h.oid()}`).set(h.auth(admin)).send(body({ photos: [photo(9), photo(1)] }));
    expect(h.savedDocs(Occasion)[0].photos.map((p) => p.url)).toEqual(['/uploads/p9.jpg', '/uploads/p1.jpg']);
  });

  test('removing: the owner staff and the office; not another staff member', async () => {
    mockingoose(Occasion).toReturn(make({ createdBy: staff._id }), 'findOne');
    expect((await h.api().delete(`/api/occasions/${h.oid()}`).set(h.auth(staff))).status).toBe(200);
    const other = h.makeUser({ role: 'staff', name: 'Other Staff', flatNo: undefined, block: undefined });
    h.knowUsers(resident, guard, vendor, admin, staff, other);
    mockingoose(Occasion).toReturn(make({ createdBy: staff._id }), 'findOne');
    expect((await h.api().delete(`/api/occasions/${h.oid()}`).set(h.auth(other))).status).toBe(403);
    expect((await h.api().delete(`/api/occasions/${h.oid()}`).set(h.auth(admin))).status).toBe(200);
  });

  test('the end date is checked against the existing start date on edit', async () => {
    mockingoose(Occasion).toReturn(make({ createdBy: admin._id }), 'findOne');
    const res = await h.api().put(`/api/occasions/${h.oid()}`).set(h.auth(admin)).send(body({ date: '2026-11-08', endDate: '2026-11-01' }));
    expect(res.status).toBe(400);
  });
});
