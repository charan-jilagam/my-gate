const h = require('./helpers/harness');
const { mockingoose } = h;

jest.mock('../utils/sendEmail', () => {
  const send = jest.fn().mockResolvedValue({});
  send.isEmailConfigured = () => true;
  return send;
});

const EntryPass = require('../models/EntryPass');
const MemberLog = require('../models/MemberLog');
const Visitor = require('../models/Visitor');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const User = h.models.User;

let head;
let son;
let neighbour;

const world = ({ members = [son], count = members.length, logs = [] } = {}) => {
  mockingoose(User).toReturn((q) => {
    const f = q.getQuery();
    if (q.op === 'findOne') {
      if (f.email) return null;
      return [head, son, neighbour].find((u) => String(u._id) === String(f._id)) || null;
    }
    return members;
  }, 'findOne');
  mockingoose(User).toReturn(members, 'find');
  mockingoose(User).toReturn(count, 'countDocuments');
  mockingoose(MemberLog).toReturn(logs, 'find');
};

beforeEach(() => {
  h.reset();
  head = h.makeUser({ name: 'Asha Rao', password: 'secret123' });
  son = h.makeUser({ password: 'secret123', name: 'Kiran Rao', relation: 'Son', householdHeadId: head._id, email: 'kiran@example.com' });
  neighbour = h.makeUser({ name: 'Neighbour', flatNo: '102' });
  h.knowUsers(head, son, neighbour);
  h.knowSociety();
});

const add = (over = {}, who = head) => h.api().post('/api/household/members').set(h.auth(who)).send({ name: 'Meera Rao', phone: '9876500000', relation: 'Wife', email: 'meera@example.com', ...over });

describe('adding family', () => {
  test('creates a resident login in the same flat with a pass, and emails the setup link', async () => {
    world({ members: [], count: 0 });
    const res = await add({ profilePic: '/uploads/meera.jpg' });
    expect(res.status).toBe(201);
    const created = h.savedDocs(User).find((u) => u.email === 'meera@example.com');
    expect(created).toMatchObject({ role: 'resident', flatNo: '101', block: 'A', profilePic: '/uploads/meera.jpg', isApproved: true, relation: 'Wife' });
    expect(String(created.householdHeadId)).toBe(String(head._id));
    expect(h.savedDocs(EntryPass)).toHaveLength(1);
    expect(res.body.invite.setupUrl).toMatch(/reset-password\//);
    expect(res.body.member.hasLogin).toBe(true);
  });

  test('without an email it is a pass-only member: no login, no invite', async () => {
    world({ members: [], count: 0 });
    const res = await add({ email: undefined, name: 'Little Tara', relation: 'Daughter' });
    expect(res.status).toBe(201);
    expect(res.body.invite).toBeNull();
    expect(res.body.member).toMatchObject({ hasLogin: false, email: '' });
    expect(h.savedDocs(EntryPass)).toHaveLength(1);
  });

  test('only the head of the house can add, and the list is capped', async () => {
    world();
    expect((await add({}, son)).status).toBe(403);
    expect((await add({}, neighbour)).status).toBe(201);
    world({ count: 10 });
    expect((await add()).status).toBe(400);
  });

  test('checks the name, phone, relation, email and photo link', async () => {
    world();
    expect((await add({ name: 'A' })).status).toBe(400);
    expect((await add({ phone: '12345' })).status).toBe(400);
    expect((await add({ relation: '' })).status).toBe(400);
    expect((await add({ email: 'nope' })).status).toBe(400);
    expect((await add({ profilePic: 'javascript:alert(1)' })).status).toBe(400);
  });

  test('refuses an email that already has an account', async () => {
    world();
    mockingoose(User).toReturn((q) => (q.getQuery().email ? son : [head, son, neighbour].find((u) => String(u._id) === String(q.getQuery()._id)) || null), 'findOne');
    expect((await add()).status).toBe(409);
  });
});

describe('the household list', () => {
  test('shows the head and members, with family presumed home until they go out', async () => {
    world({ logs: [{ userId: son._id, action: 'out', at: new Date() }] });
    const res = await h.api().get('/api/household').set(h.auth(head));
    expect(res.status).toBe(200);
    expect(res.body.canManage).toBe(true);
    expect(res.body.members.map((m) => [m.name, m.inside])).toEqual([['Asha Rao', true], ['Kiran Rao', false]]);
    expect(res.body.members[0]).toMatchObject({ isHead: true, relation: 'Head of the house' });
  });

  test('a member sees the home but cannot manage it; staff have no household', async () => {
    world();
    const res = await h.api().get('/api/household').set(h.auth(son));
    expect(res.status).toBe(200);
    expect(res.body.canManage).toBe(false);
    const guard = h.makeUser({ role: 'security', flatNo: undefined, block: undefined });
    h.knowUsers(guard);
    expect((await h.api().get('/api/household').set(h.auth(guard))).status).toBe(403);
  });
});

describe('changing and switching off members', () => {
  test('edit name, relation and photo', async () => {
    world();
    const res = await h.api().put(`/api/household/members/${son._id}`).set(h.auth(head)).send({ relation: 'Elder son', profilePic: '/uploads/k.jpg' });
    expect(res.status).toBe(200);
    expect(son.relation).toBe('Elder son');
    expect(son.profilePic).toBe('/uploads/k.jpg');
  });

  test('cannot touch someone else’s family', async () => {
    world();
    expect((await h.api().put(`/api/household/members/${son._id}`).set(h.auth(neighbour)).send({ relation: 'x1' })).status).toBe(404);
  });

  test('switching off keeps the history; switching on restores', async () => {
    world();
    const off = await h.api().put(`/api/household/members/${son._id}/active`).set(h.auth(head)).send({ active: false });
    expect(off.status).toBe(200);
    expect(son.isActive).toBe(false);
    await h.api().put(`/api/household/members/${son._id}/active`).set(h.auth(head)).send({ active: true });
    expect(son.isActive).toBe(true);
  });

  test('re-sending the invite needs a login email', async () => {
    world();
    const ok = await h.api().post(`/api/household/members/${son._id}/invite`).set(h.auth(head));
    expect(ok.status).toBe(200);
    expect(ok.body.invite.setupUrl).toMatch(/welcome=1/);
    son.email = 'pass-only-1@members.invalid';
    expect((await h.api().post(`/api/household/members/${son._id}/invite`).set(h.auth(head))).status).toBe(400);
  });
});

describe('the flat’s entry and exit log', () => {
  test('family, visitors and daily help together, newest first', async () => {
    world();
    const t = (m) => new Date(Date.now() - m * 60000);
    mockingoose(MemberLog).toReturn([{ _id: h.oid(), userId: son._id, name: 'Kiran Rao', relation: 'Son', action: 'out', at: t(5) }], 'find');
    mockingoose(Visitor).toReturn([{ _id: h.oid(), name: 'Ravi', purpose: 'delivery', entryTime: t(30), exitTime: t(10) }], 'find');
    const help = { _id: h.oid(), name: 'Lakshmi', kind: 'maid' };
    mockingoose(DailyHelp).toReturn([help], 'find');
    mockingoose(HelpAttendance).toReturn([{ _id: h.oid(), helpId: help._id, checkIn: t(60), checkOut: null }], 'find');
    const res = await h.api().get('/api/household/activity?days=3').set(h.auth(head));
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => `${i.kind}:${i.name}:${i.action}`)).toEqual(['family:Kiran Rao:out', 'visitor:Ravi:out', 'visitor:Ravi:in', 'helper:Lakshmi:in']);
  });

  test('is for the head of the house only', async () => {
    world();
    expect((await h.api().get('/api/household/activity').set(h.auth(son))).status).toBe(403);
    expect((await h.api().get('/api/household/activity?days=99').set(h.auth(head))).status).toBe(400);
  });
});
