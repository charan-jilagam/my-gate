const h = require('./helpers/harness');
const { mockingoose } = h;
const Election = require('../models/Election');
const Ballot = require('../models/Ballot');
const User = h.models.User;
const Notification = h.models.Notification;

let resident;
let flatmate;
let neighbour;
let admin;

const HOUR = 3600 * 1000;
const makeElection = (over = {}) =>
  new Election({
    _id: h.oid(),
    societyId: h.SOCIETY_ID,
    title: 'Install solar panels?',
    kind: 'resolution',
    voting: 'per_flat',
    options: [{ label: 'Yes' }, { label: 'No' }],
    opensAt: new Date(Date.now() - HOUR),
    closesAt: new Date(Date.now() + 24 * HOUR),
    createdBy: admin._id,
    ...over
  });

const vote = (e, who, option = e.options[0]) => h.api().post(`/api/elections/${e._id}/vote`).set(h.auth(who)).send({ optionId: String(option._id) });
const newVote = (over = {}) => ({
  title: 'Elect the treasurer',
  kind: 'election',
  options: [{ label: 'Meera' }, { label: 'Kabir' }],
  opensAt: new Date(Date.now() + HOUR).toISOString(),
  closesAt: new Date(Date.now() + 48 * HOUR).toISOString(),
  ...over
});

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  flatmate = h.makeUser({ name: 'Asha Rao Senior' }); // same flat A-101
  neighbour = h.makeUser({ name: 'Bina Shah', flatNo: '202' });
  admin = h.makeUser({ role: 'society_admin', name: 'Office', flatNo: undefined, block: undefined });
  h.knowUsers(resident, flatmate, neighbour, admin);
  h.knowSociety();
});

describe('creating votes', () => {
  test('the office creates a vote and every approved resident is told', async () => {
    mockingoose(User).toReturn([resident, neighbour], 'find');
    const res = await h.api().post('/api/elections').set(h.auth(admin)).send(newVote());
    expect(res.status).toBe(201);
    expect(h.savedDocs(Election)[0]).toMatchObject({ title: 'Elect the treasurer', kind: 'election', voting: 'per_flat' });
    expect(h.savedDocs(Notification).map((n) => String(n.userId)).sort()).toEqual([String(resident._id), String(neighbour._id)].sort());
    expect(h.savedDocs(Notification)[0]).toMatchObject({ type: 'election', actionUrl: '/votes' });
  });

  test('residents cannot create votes', async () => {
    expect((await h.api().post('/api/elections').set(h.auth(resident)).send(newVote())).status).toBe(403);
  });

  test.each([
    ['one option', { options: [{ label: 'Only' }] }],
    ['more than twelve options', { options: Array.from({ length: 13 }, (_, i) => ({ label: `O${i}` })) }],
    ['duplicate options', { options: [{ label: 'Yes' }, { label: ' yes ' }] }],
    ['closing before opening', { closesAt: new Date(Date.now() - HOUR).toISOString() }],
    ['closing in the past', { opensAt: new Date(Date.now() - 3 * HOUR).toISOString(), closesAt: new Date(Date.now() - HOUR).toISOString() }],
    ['open for more than 90 days', { closesAt: new Date(Date.now() + 120 * 24 * HOUR).toISOString() }],
    ['no title', { title: 'x' }],
    ['unknown voting rule', { voting: 'per_dog' }]
  ])('refuses %s', async (_name, over) => {
    const res = await h.api().post('/api/elections').set(h.auth(admin)).send(newVote(over));
    expect(res.status).toBe(400);
    expect(h.savedDocs(Election)).toHaveLength(0);
  });

  test('can be edited only before voting opens', async () => {
    const upcoming = makeElection({ opensAt: new Date(Date.now() + HOUR) });
    mockingoose(Election).toReturn(upcoming, 'findOne');
    const ok = await h.api().put(`/api/elections/${upcoming._id}`).set(h.auth(admin)).send(newVote({ title: 'Changed title' }));
    expect(ok.status).toBe(200);
    expect(upcoming.title).toBe('Changed title');

    const open = makeElection();
    mockingoose(Election).toReturn(open, 'findOne');
    const late = await h.api().put(`/api/elections/${open._id}`).set(h.auth(admin)).send(newVote({ title: 'Sneaky change' }));
    expect(late.status).toBe(409);
    expect(open.title).toBe('Install solar panels?');
  });

  test('cancel only works on a vote that is still running, and checks that in the database update', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOneAndUpdate');
    expect((await h.api().put(`/api/elections/${e._id}/cancel`).set(h.auth(resident))).status).toBe(403);
    const res = await h.api().put(`/api/elections/${e._id}/cancel`).set(h.auth(admin));
    expect(res.status).toBe(200);
    const [call] = h.callsTo(Election, 'findOneAndUpdate');
    expect(call.filter.cancelled).toEqual({ $ne: true });
    expect(call.filter.closesAt.$gt).toBeInstanceOf(Date);
    expect(call.update).toEqual({ $set: { cancelled: true } });
  });

  test('cancelling something already closed is refused', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(null, 'findOneAndUpdate');
    expect((await h.api().put(`/api/elections/${e._id}/cancel`).set(h.auth(admin))).status).toBe(409);
  });
});

describe('casting a vote', () => {
  test('records a ballot that names the election and option but not the person', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    const res = await vote(e, resident);
    expect(res.status).toBe(201);
    const [ballot] = h.savedDocs(Ballot);
    expect(String(ballot.electionId)).toBe(String(e._id));
    expect(String(ballot.optionId)).toBe(String(e.options[0]._id));
    expect(ballot.voterKey).toMatch(/^[a-f0-9]{64}$/);
    const raw = JSON.stringify(ballot.toObject());
    expect(raw).not.toContain(String(resident._id));
    expect(raw).not.toContain('101');
    expect(Object.keys(ballot.toObject())).not.toEqual(expect.arrayContaining(['userId', 'residentId']));
  });

  test('two people in one flat share one vote key; a neighbour has a different one', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    await vote(e, resident);
    await vote(e, flatmate);
    await vote(e, neighbour);
    const keys = h.savedDocs(Ballot).map((b) => b.voterKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  test('with one vote per resident, flatmates have different keys', async () => {
    const e = makeElection({ voting: 'per_resident' });
    mockingoose(Election).toReturn(e, 'findOne');
    await vote(e, resident);
    await vote(e, flatmate);
    const keys = h.savedDocs(Ballot).map((b) => b.voterKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('a second vote from the same flat is refused (the unique index decides)', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    const real = Ballot.create;
    Ballot.create = jest.fn().mockRejectedValue(Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }));
    try {
      const res = await vote(e, flatmate);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/flat has already voted/);
    } finally {
      Ballot.create = real;
    }
  });

  test('the ballot collection has a unique index on election and voter', () => {
    const idx = Ballot.schema.indexes().find(([fields]) => fields.electionId === 1 && fields.voterKey === 1);
    expect(idx && idx[1].unique).toBe(true);
  });

  test.each([
    ['not open yet', { opensAt: new Date(Date.now() + HOUR), closesAt: new Date(Date.now() + 5 * HOUR) }],
    ['already closed', { opensAt: new Date(Date.now() - 5 * HOUR), closesAt: new Date(Date.now() - HOUR) }],
    ['cancelled', { cancelled: true }]
  ])('refuses a vote that is %s', async (_n, over) => {
    const e = makeElection(over);
    mockingoose(Election).toReturn(e, 'findOne');
    expect((await vote(e, resident)).status).toBe(409);
    expect(h.savedDocs(Ballot)).toHaveLength(0);
  });

  test('refuses an option that is not part of this vote', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    const res = await h.api().post(`/api/elections/${e._id}/vote`).set(h.auth(resident)).send({ optionId: String(h.oid()) });
    expect(res.status).toBe(400);
  });

  test('refuses a vote in another society, and by the office', async () => {
    const foreign = makeElection({ societyId: h.OTHER_SOCIETY_ID });
    mockingoose(Election).toReturn(foreign, 'findOne');
    expect((await vote(foreign, resident)).status).toBe(403);
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    expect((await vote(e, admin)).status).toBe(403);
  });

  test('a flat-based vote needs a resident with a flat number', async () => {
    const nomad = h.makeUser({ flatNo: undefined, block: undefined });
    h.knowUsers(nomad);
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    expect((await vote(e, nomad)).status).toBe(403);
  });
});

describe('seeing results', () => {
  const countsFor = (e, yes, no) => [{ _id: e.options[0]._id, votes: yes }, { _id: e.options[1]._id, votes: no }];

  test('while voting is open nobody sees counts, and residents do not see turnout', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    mockingoose(Ballot).toReturn(countsFor(e, 7, 2), 'aggregate');
    mockingoose(User).toReturn([resident, neighbour], 'find');
    const res = await h.api().get(`/api/elections/${e._id}`).set(h.auth(resident));
    expect(res.status).toBe(200);
    expect(res.body.election.resultsVisible).toBeUndefined();
    expect(res.body.election.turnout).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/"votes"/);
  });

  test('the office sees turnout but still not the split while voting runs', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn(e, 'findOne');
    mockingoose(Ballot).toReturn(countsFor(e, 7, 2), 'aggregate');
    mockingoose(User).toReturn([resident, flatmate, neighbour], 'find');
    const res = await h.api().get(`/api/elections/${e._id}`).set(h.auth(admin));
    expect(res.body.election.turnout).toEqual({ votes: 9, eligible: 2 }); // three residents live in two flats
    expect(res.body.election.resultsVisible).toBeUndefined();
    expect(res.body.election.options[0].votes).toBeUndefined();
  });

  test('after closing, everyone sees counts, shares and the leader', async () => {
    const e = makeElection({ opensAt: new Date(Date.now() - 5 * HOUR), closesAt: new Date(Date.now() - HOUR) });
    mockingoose(Election).toReturn(e, 'findOne');
    mockingoose(Ballot).toReturn(countsFor(e, 6, 2), 'aggregate');
    mockingoose(User).toReturn([resident, neighbour], 'find');
    const res = await h.api().get(`/api/elections/${e._id}`).set(h.auth(resident));
    const [yes, no] = res.body.election.options;
    expect(res.body.election.resultsVisible).toBe(true);
    expect(yes).toMatchObject({ votes: 6, percent: 75, leading: true });
    expect(no).toMatchObject({ votes: 2, percent: 25, leading: false });
    expect(res.body.election.tied).toBe(false);
  });

  test('a tie is reported as a tie', async () => {
    const e = makeElection({ opensAt: new Date(Date.now() - 5 * HOUR), closesAt: new Date(Date.now() - HOUR) });
    mockingoose(Election).toReturn(e, 'findOne');
    mockingoose(Ballot).toReturn(countsFor(e, 3, 3), 'aggregate');
    mockingoose(User).toReturn([resident], 'find');
    const res = await h.api().get(`/api/elections/${e._id}`).set(h.auth(admin));
    expect(res.body.election.tied).toBe(true);
  });

  test('the list tells a resident whether their flat has voted', async () => {
    const e = makeElection();
    mockingoose(Election).toReturn([e], 'find');
    mockingoose(Ballot).toReturn((q) => {
      const keys = q.getQuery().voterKey.$in;
      return keys.length === 1 ? [{ electionId: e._id }] : [];
    }, 'find');
    const res = await h.api().get('/api/elections').set(h.auth(flatmate));
    expect(res.body.elections[0]).toMatchObject({ phase: 'open', voted: true });
    expect(res.body.elections[0].options[0].votes).toBeUndefined();
  });

  test('a vote from another society cannot be opened', async () => {
    const foreign = makeElection({ societyId: h.OTHER_SOCIETY_ID });
    mockingoose(Election).toReturn(foreign, 'findOne');
    expect((await h.api().get(`/api/elections/${foreign._id}`).set(h.auth(resident))).status).toBe(403);
  });
});
