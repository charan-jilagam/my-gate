const h = require('./helpers/harness');
const { mockingoose } = h;
const Post = require('../models/Post');
const Election = require('../models/Election');
const Ballot = require('../models/Ballot');
const VoteLog = require('../models/VoteLog');
const Booking = require('../models/Booking');
const Visitor = require('../models/Visitor');
const { floorOf } = require('../utils/routeKit');
const Society = h.models.Society;
const User = h.models.User;

let resident;
let neighbour;
let admin;
let guard;
const HOUR = 3600 * 1000;

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  neighbour = h.makeUser({ name: 'Bina Shah', flatNo: '202' });
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  guard = h.makeUser({ name: 'Gate Guard', role: 'security', flatNo: undefined, block: undefined });
  h.knowUsers(resident, neighbour, admin, guard);
  h.knowSociety();
});

describe('floors from flat numbers', () => {
  test.each([['210', 'Floor 2'], ['A-1204', 'Floor 12'], ['101', 'Floor 1'], ['5', 'Ground floor'], ['', ''], [undefined, '']])('%s is %s', (flat, floor) => {
    expect(floorOf(flat)).toBe(floor);
  });
});

describe('amenity list managed by the society office', () => {
  const clubId = h.oid();
  const knowList = (...list) => mockingoose(Society).toReturn({ _id: h.SOCIETY_ID, name: 'Green Heights', address: { street: 'MG Road', city: 'Pune', state: 'MH', pincode: '411001' }, totalFlats: 100, contactNumber: '9999999999', createdBy: admin._id, timezone: h.TZ, amenities: list }, 'findOne');

  test('the office adds an amenity to its own society', async () => {
    knowList();
    const res = await h.api().post('/api/bookings/amenities').set(h.auth(admin)).send({ name: 'Rooftop garden', capacity: 30, hourlyRate: 200, openTime: '07:00', closeTime: '21:00' });
    expect(res.status).toBe(201);
    expect(res.body.amenity).toMatchObject({ name: 'Rooftop garden', capacity: 30, hourlyRate: 200 });
    expect(h.savedDocs(Society)).toHaveLength(1);
  });

  test('a new amenity must have a name', async () => {
    knowList();
    expect((await h.api().post('/api/bookings/amenities').set(h.auth(admin)).send({ capacity: 5 })).status).toBe(400);
  });

  test('residents cannot change the list', async () => {
    knowList();
    expect((await h.api().post('/api/bookings/amenities').set(h.auth(resident)).send({ name: 'Pool' })).status).toBe(403);
  });

  test('a name that is already used is refused', async () => {
    knowList({ _id: clubId, name: 'Clubhouse' });
    const res = await h.api().post('/api/bookings/amenities').set(h.auth(admin)).send({ name: ' clubhouse ' });
    expect(res.status).toBe(409);
    expect(h.savedDocs(Society)).toHaveLength(0);
  });

  test('closing time must come after opening time', async () => {
    knowList();
    const res = await h.api().post('/api/bookings/amenities').set(h.auth(admin)).send({ name: 'Gym', openTime: '22:00', closeTime: '06:00' });
    expect(res.status).toBe(400);
  });

  test('the office can close an amenity without deleting it', async () => {
    knowList({ _id: clubId, name: 'Clubhouse', isActive: true });
    const res = await h.api().put(`/api/bookings/amenities/${clubId}`).set(h.auth(admin)).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.amenity.isActive).toBe(false);
  });

  test('an amenity with upcoming bookings cannot be removed', async () => {
    knowList({ _id: clubId, name: 'Clubhouse' });
    mockingoose(Booking).toReturn(2, 'countDocuments');
    const res = await h.api().delete(`/api/bookings/amenities/${clubId}`).set(h.auth(admin));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/2 upcoming bookings/);
  });

  test('an unused amenity can be removed', async () => {
    knowList({ _id: clubId, name: 'Clubhouse' });
    mockingoose(Booking).toReturn(0, 'countDocuments');
    expect((await h.api().delete(`/api/bookings/amenities/${clubId}`).set(h.auth(admin))).status).toBe(200);
  });

  test('admins can list closed amenities too; residents only the open ones', async () => {
    knowList({ _id: clubId, name: 'Clubhouse', isActive: true }, { _id: h.oid(), name: 'Old pool', isActive: false });
    const asAdmin = await h.api().get('/api/bookings/amenities?all=1').set(h.auth(admin));
    expect(asAdmin.body.amenities.map((a) => a.name)).toEqual(['Clubhouse', 'Old pool']);
    const asResident = await h.api().get('/api/bookings/amenities?all=1').set(h.auth(resident));
    expect(asResident.body.amenities.map((a) => a.name)).toEqual(['Clubhouse']);
  });
});

describe('who liked and who reported a post', () => {
  const post = () => new Post({ _id: h.oid(), societyId: h.SOCIETY_ID, authorId: resident._id, title: 'Lift is slow', likes: [neighbour._id], reports: [{ userId: neighbour._id, reason: 'Rude' }] });

  test('the office sees the people and the reasons', async () => {
    mockingoose(Post).toReturn(post(), 'findOne');
    const res = await h.api().get(`/api/community/posts/${h.oid()}`).set(h.auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.post.likers).toHaveLength(1);
    expect(res.body.post.reports).toEqual([expect.objectContaining({ reason: 'Rude' })]);
  });

  test('residents only get counts, never the names', async () => {
    mockingoose(Post).toReturn(post(), 'findOne');
    const res = await h.api().get(`/api/community/posts/${h.oid()}`).set(h.auth(neighbour));
    expect(res.status).toBe(200);
    expect(res.body.post.likeCount).toBe(1);
    expect(res.body.post.likers).toBeUndefined();
    expect(res.body.post.reports).toBeUndefined();
  });
});

describe('who has voted', () => {
  const election = () => new Election({ _id: h.oid(), societyId: h.SOCIETY_ID, title: 'Solar?', kind: 'resolution', voting: 'per_flat', options: [{ label: 'Yes' }, { label: 'No' }], opensAt: new Date(Date.now() - HOUR), closesAt: new Date(Date.now() + 24 * HOUR), createdBy: admin._id });

  test('casting a vote also records that this person took part, without the choice', async () => {
    const e = election();
    mockingoose(Election).toReturn(e, 'findOne');
    const res = await h.api().post(`/api/elections/${e._id}/vote`).set(h.auth(resident)).send({ optionId: String(e.options[0]._id) });
    expect(res.status).toBe(201);
    const [log] = h.savedDocs(VoteLog);
    expect(log).toMatchObject({ name: 'Asha Rao', flat: 'A-101' });
    const raw = JSON.stringify(log.toObject());
    expect(raw).not.toContain(String(e.options[0]._id));
    expect(raw).not.toContain('optionId');
  });

  test('ballots carry no timestamp that could be matched to the log', () => {
    const b = new Ballot({ electionId: h.oid(), societyId: h.SOCIETY_ID, voterKey: 'x', optionId: h.oid() });
    expect(b.toObject().createdAt).toBeUndefined();
  });

  test('the office sees who voted and which flats are still to vote', async () => {
    const e = election();
    mockingoose(Election).toReturn(e, 'findOne');
    mockingoose(VoteLog).toReturn([{ voterKey: 'k', name: 'Asha Rao', flat: 'A-101', votedAt: new Date() }], 'find');
    mockingoose(Ballot).toReturn(3, 'countDocuments');
    mockingoose(User).toReturn([neighbour], 'find');
    const res = await h.api().get(`/api/elections/${e._id}/voters`).set(h.auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.voted).toEqual([expect.objectContaining({ name: 'Asha Rao', flat: 'A-101' })]);
    expect(res.body.waiting).toEqual([{ name: 'Bina Shah', flat: 'A-202' }]);
    expect(res.body.unlisted).toBe(2); // earlier votes cast before this list existed
    expect(JSON.stringify(res.body)).not.toMatch(/optionId|Yes|"No"/);
  });

  test('residents cannot see the voter list', async () => {
    const e = election();
    mockingoose(Election).toReturn(e, 'findOne');
    expect((await h.api().get(`/api/elections/${e._id}/voters`).set(h.auth(resident))).status).toBe(403);
  });
});

describe('the gate scan and expected exit', () => {
  const invited = (over = {}) => new Visitor({ _id: h.oid(), residentId: resident._id, societyId: h.SOCIETY_ID, name: 'Ravi', phone: '9876543210', flatNo: '210', block: '', approved: true, approvedBy: resident._id, status: 'approved', qrCode: '{"visitorId":"abcdef123456"}', ...over });

  test('scanning shows the flat, the floor and who approved', async () => {
    const v = invited();
    v.residentId = resident;
    v.approvedBy = resident;
    mockingoose(Visitor).toReturn(v, 'findOne');
    const res = await h.api().get('/api/visitors/lookup/abcdef12').set(h.auth(guard));
    expect(res.status).toBe(200);
    expect(res.body.visitor).toMatchObject({ name: 'Ravi', flatNo: '210', floor: 'Floor 2' });
  });

  test('check-in needs an expected exit', async () => {
    mockingoose(Visitor).toReturn(invited(), 'findOne');
    const res = await h.api().put(`/api/visitors/${h.oid()}/check-in`).set(h.auth(guard)).send({ code: 'abcdef12' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expected to leave/);
    expect(h.savedDocs(Visitor)).toHaveLength(0);
  });

  test('check-in stores the expected exit from the stay length', async () => {
    mockingoose(Visitor).toReturn(invited(), 'findOne');
    const res = await h.api().put(`/api/visitors/${h.oid()}/check-in`).set(h.auth(guard)).send({ code: 'abcdef12', stayMinutes: 90 });
    expect(res.status).toBe(200);
    const [saved] = h.savedDocs(Visitor);
    expect(saved.status).toBe('checked_in');
    const mins = (saved.expectedExit - saved.entryTime) / 60000;
    expect(Math.round(mins)).toBe(90);
  });

  test('an exit time in the past is refused', async () => {
    mockingoose(Visitor).toReturn(invited(), 'findOne');
    const res = await h.api().put(`/api/visitors/${h.oid()}/check-in`).set(h.auth(guard)).send({ code: 'abcdef12', expectedExit: new Date(Date.now() - HOUR).toISOString() });
    expect(res.status).toBe(400);
  });
});
