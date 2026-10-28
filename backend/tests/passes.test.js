const h = require('./helpers/harness');
const { mockingoose } = h;

const EntryPass = require('../models/EntryPass');
const MemberLog = require('../models/MemberLog');
const mp = require('../utils/memberPass');
const User = h.models.User;

const CODE = 'a1b2c3d4e5f60718';
let head;
let child;
let guard;
let staff;
let admin;

const passFor = (user, code = CODE) => new EntryPass({ _id: h.oid(), userId: user._id, societyId: user.societyId, code, version: 1 });

// Fake database: users by id, one pass, and the person's latest gate event.
const world = ({ pass, last, users = [head, child, guard, staff, admin] } = {}) => {
  mockingoose(User).toReturn((q) => {
    const id = q.getQuery()._id;
    return users.find((u) => String(u._id) === String(id)) || null;
  }, 'findOne');
  mockingoose(EntryPass).toReturn((q) => {
    const f = q.getQuery();
    if (f.code) return pass && pass.code === f.code && (!f.societyId || String(f.societyId) === String(pass.societyId)) ? pass : null;
    return pass && String(pass.userId) === String(f.userId) ? pass : null;
  }, 'findOne');
  mockingoose(MemberLog).toReturn((q) => {
    const uid = q.getQuery().userId;
    return typeof last === 'function' ? last(uid) : last || null;
  }, 'findOne');
};

beforeEach(() => {
  h.reset();
  head = h.makeUser({ name: 'Asha Rao' });
  child = h.makeUser({ name: 'Kiran Rao', relation: 'Son', householdHeadId: head._id, email: 'kiran@example.com' });
  guard = h.makeUser({ name: 'Gate Guard', role: 'security', flatNo: undefined, block: undefined });
  staff = h.makeUser({ name: 'Lift Tech', role: 'staff', flatNo: undefined, block: undefined });
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  h.knowUsers(head, child, guard, staff, admin);
  h.knowSociety();
});

describe('pass codes', () => {
  test('accept the typed form in any case, with or without dashes', () => {
    expect(mp.display(CODE)).toBe('NV-a1b2-c3d4-e5f6-0718');
    expect(mp.parseCode('NV-A1B2-C3D4-E5F6-0718')).toBe(CODE);
    expect(mp.parseCode(' nv a1b2 c3d4 e5f6 0718 ')).toBe(CODE);
    expect(mp.parseCode(CODE)).toBe(CODE);
  });
  test('refuse anything that is not a member code', () => {
    ['', null, 'abcdef12', '123456', 'NV-zzzz-c3d4-e5f6-0718', `${CODE}00`].forEach((x) => expect(mp.parseCode(x)).toBeNull());
  });
});

describe('who may manage a pass', () => {
  test('me, my head of house, the society admin and the guard head (for guards) yes; neighbours no', () => {
    const guardHead = h.makeUser({ role: 'guard_admin', flatNo: undefined, block: undefined });
    const neighbour = h.makeUser({ flatNo: '102' });
    expect(mp.canManagePass(child, child)).toBe(true);
    expect(mp.canManagePass(head, child)).toBe(true);
    expect(mp.canManagePass(admin, child)).toBe(true);
    expect(mp.canManagePass(guardHead, guard)).toBe(true);
    expect(mp.canManagePass(guardHead, staff)).toBe(false);
    expect(mp.canManagePass(child, head)).toBe(false);
    expect(mp.canManagePass(neighbour, child)).toBe(false);
    expect(mp.canManagePass(h.makeUser({ role: 'society_admin', societyId: h.OTHER_SOCIETY_ID }), child)).toBe(false);
  });
});

describe('my pass', () => {
  test('is made the first time and shows a QR and the typed code', async () => {
    world({ pass: null });
    mockingoose(EntryPass).toReturn(null, 'findOne');
    const res = await h.api().get('/api/passes/me').set(h.auth(head));
    expect(res.status).toBe(200);
    expect(h.savedDocs(EntryPass)).toHaveLength(1);
    expect(res.body.pass.code).toMatch(/^[a-f0-9]{16}$/);
    expect(res.body.pass.displayCode).toMatch(/^NV-/);
    expect(res.body.pass.qrCodeImage).toMatch(/^data:image\/png/);
    expect(res.body.pass.person).toMatchObject({ name: 'Asha Rao', isHead: true, inside: true });
  });

  test('the head of the house can open and regenerate a family member’s pass; the old code stops', async () => {
    const pass = passFor(child);
    world({ pass });
    const open = await h.api().get(`/api/passes/user/${child._id}`).set(h.auth(head));
    expect(open.status).toBe(200);
    expect(open.body.pass.person).toMatchObject({ name: 'Kiran Rao', relation: 'Son', isFamily: true, isHead: false, headName: 'Asha Rao' });

    const res = await h.api().post(`/api/passes/user/${child._id}/regenerate`).set(h.auth(head));
    expect(res.status).toBe(200);
    expect(res.body.pass.code).not.toBe(CODE);
    expect(res.body.pass.version).toBe(2);
    const saved = h.savedDocs(EntryPass).pop();
    expect(saved.code).toBe(res.body.pass.code);
    // the member is told
    expect(h.savedDocs(h.models.Notification).some((n) => String(n.userId) === String(child._id) && /replaced/.test(n.title))).toBe(true);
  });

  test('a neighbour cannot see or replace it', async () => {
    const neighbour = h.makeUser({ flatNo: '102' });
    h.knowUsers(neighbour, child);
    world({ pass: passFor(child), users: [neighbour, child] });
    expect((await h.api().get(`/api/passes/user/${child._id}`).set(h.auth(neighbour))).status).toBe(403);
    expect((await h.api().post(`/api/passes/user/${child._id}/regenerate`).set(h.auth(neighbour))).status).toBe(403);
  });

  test('the society admin can make a pass for a guard or staff member', async () => {
    world({ pass: passFor(guard, 'ffffffffffffffff') });
    const res = await h.api().get(`/api/passes/user/${guard._id}`).set(h.auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.pass.person).toMatchObject({ role: 'security', isFamily: false, inside: false });
  });
});

describe('scanning at the gate', () => {
  const lookup = (who, code = CODE) => h.api().post('/api/passes/lookup').set(h.auth(who)).send({ code });
  const check = (who, body = {}, code = CODE) => h.api().post('/api/passes/check').set(h.auth(who)).send({ code, ...body });

  test('shows the person’s details', async () => {
    world({ pass: passFor(child) });
    const res = await lookup(guard, mp.display(CODE));
    expect(res.status).toBe(200);
    expect(res.body.person).toMatchObject({ name: 'Kiran Rao', relation: 'Son', flat: 'A-101', phone: '9876543210', headName: 'Asha Rao' });
    expect(res.body.next).toBe('out');
  });

  test('a family member starts at home, so the first scan is going out; the next is coming in', async () => {
    world({ pass: passFor(child) });
    const first = await check(guard);
    expect(first.status).toBe(200);
    expect(first.body.action).toBe('out');
    expect(first.body.message).toMatch(/going out/);
    expect(h.savedDocs(MemberLog)[0]).toMatchObject({ action: 'out', flatNo: '101' });

    world({ pass: passFor(child), last: { action: 'out', at: new Date(), userId: child._id } });
    const back = await check(guard);
    expect(back.body.action).toBe('in');
    expect(back.body.message).toMatch(/coming in/);
  });

  test('the head of the house hears when a member goes out, but not about their own scan', async () => {
    world({ pass: passFor(child) });
    await check(guard);
    expect(h.savedDocs(h.models.Notification).some((n) => String(n.userId) === String(head._id) && /Kiran Rao went out/.test(n.title))).toBe(true);

    h.reset();
    h.knowUsers(head, guard);
    h.knowSociety();
    world({ pass: passFor(head, 'bbbbbbbbbbbbbbbb'), users: [head, guard] });
    await check(guard, {}, 'bbbbbbbbbbbbbbbb');
    expect(h.savedDocs(h.models.Notification)).toHaveLength(0);
  });

  test('guards and staff start outside, so the first scan is entry, and their wording is entry and exit', async () => {
    world({ pass: passFor(staff, 'cccccccccccccccc') });
    const res = await check(guard, {}, 'cccccccccccccccc');
    expect(res.body.action).toBe('in');
    expect(res.body.message).toMatch(/has entered/);
    expect(h.savedDocs(h.models.Notification)).toHaveLength(0);
  });

  test('the guard can set the direction by hand', async () => {
    world({ pass: passFor(child) });
    const res = await check(guard, { direction: 'in' });
    expect(res.body.action).toBe('in');
    expect((await check(guard, { direction: 'sideways' })).status).toBe(400);
  });

  test('an unknown or replaced pass is refused, and so is a switched-off account', async () => {
    world({ pass: passFor(child) });
    expect((await lookup(guard, 'ffffffffffffffff')).status).toBe(404);
    expect((await lookup(guard, 'hello world')).status).toBe(404);
    child.isActive = false;
    world({ pass: passFor(child) });
    const res = await check(guard);
    expect(res.status).toBe(403);
    expect(h.savedDocs(MemberLog)).toHaveLength(0);
  });

  test('a pass from another society is not accepted', async () => {
    const stranger = h.makeUser({ societyId: h.OTHER_SOCIETY_ID });
    world({ pass: passFor(stranger), users: [stranger, guard] });
    h.knowUsers(guard, stranger);
    expect((await lookup(guard)).status).toBe(404);
  });

  test('only gate staff and admins can scan', async () => {
    world({ pass: passFor(child) });
    expect((await lookup(head)).status).toBe(403);
    expect((await check(staff)).status).toBe(403);
    expect((await lookup(admin)).status).toBe(200);
  });
});
