const h = require('./helpers/harness');
const { mockingoose } = h;
const StepDay = require('../models/StepDay');
const User = h.models.User;
const { todayIn, addDays } = require('../utils/timezone');

let me;
const today = () => todayIn(h.TZ);

beforeEach(() => {
  h.reset();
  me = h.makeUser({ name: 'Asha Rao', password: 'secret123' });
  h.knowUsers(me);
  h.knowSociety();
});

const save = (body) => h.api().post('/api/steps').set(h.auth(me)).send(body);

describe('saving steps', () => {
  test('stores today’s total and says whether the goal is reached', async () => {
    mockingoose(StepDay).toReturn(null, 'findOne');
    mockingoose(StepDay).toReturn({ steps: 8200, date: today() }, 'findOneAndUpdate');
    const res = await save({ steps: 8200 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: today(), steps: 8200, goal: 8000, reachedGoal: true });
    const [call] = h.callsTo(StepDay, 'findOneAndUpdate');
    expect(call.update.$set.steps).toBe(8200);
  });

  test('never goes down: an older, lower count cannot overwrite a higher one', async () => {
    mockingoose(StepDay).toReturn({ steps: 5000, date: today() }, 'findOne');
    mockingoose(StepDay).toReturn({ steps: 5000, date: today() }, 'findOneAndUpdate');
    await save({ steps: 1200 });
    expect(h.callsTo(StepDay, 'findOneAndUpdate')[0].update.$set.steps).toBe(5000);
  });

  test('refuses the future, old days, silly numbers and bad dates', async () => {
    expect((await save({ steps: 100, date: addDays(today(), 1) })).status).toBe(400);
    expect((await save({ steps: 100, date: addDays(today(), -5) })).status).toBe(400);
    expect((await save({ steps: 999999 })).status).toBe(400);
    expect((await save({ steps: -1 })).status).toBe(400);
    expect((await save({ steps: 100, date: 'yesterday' })).status).toBe(400);
  });

  test('can catch up yesterday and accepts the Android companion as a source', async () => {
    mockingoose(StepDay).toReturn(null, 'findOne');
    mockingoose(StepDay).toReturn({ steps: 3000 }, 'findOneAndUpdate');
    const res = await save({ steps: 3000, date: addDays(today(), -1), source: 'android' });
    expect(res.status).toBe(200);
    expect(h.callsTo(StepDay, 'findOneAndUpdate')[0].update.$set.source).toBe('android');
  });
});

describe('my steps', () => {
  test('gives today, the week and the streak of goal days', async () => {
    const day = (n, steps) => ({ date: addDays(today(), n), steps });
    mockingoose(StepDay).toReturn([day(0, 4000), day(-1, 9000), day(-2, 8000), day(-3, 3000)], 'find');
    const res = await h.api().get('/api/steps/me').set(h.auth(me));
    expect(res.status).toBe(200);
    expect(res.body.steps).toBe(4000);
    expect(res.body.week).toHaveLength(7);
    expect(res.body.week[6]).toEqual({ date: today(), steps: 4000 });
    expect(res.body.weekTotal).toBe(24000);
    expect(res.body.streak).toBe(2); // yesterday and the day before; today is still short
    expect(res.body.onLeaderboard).toBe(true);
  });
});

describe('leaderboard', () => {
  test('ranks the society, shows first names, and hides people who opted out', async () => {
    const other = h.makeUser({ name: 'Ravi Kumar', flatNo: '202' });
    const shy = h.makeUser({ name: 'Private Person', stepsOnLeaderboard: false });
    mockingoose(StepDay).toReturn([
      { userId: me._id, date: today(), steps: 5000 },
      { userId: other._id, date: today(), steps: 9000 },
      { userId: shy._id, date: today(), steps: 20000 }
    ], 'find');
    mockingoose(User).toReturn([me, other, shy], 'find');
    const res = await h.api().get('/api/steps/leaderboard?period=today').set(h.auth(me));
    expect(res.status).toBe(200);
    expect(res.body.top.map((r) => [r.rank, r.name, r.steps])).toEqual([[1, 'Ravi', 9000], [2, 'Asha', 5000]]);
    expect(res.body.you).toMatchObject({ rank: 2, you: true });
    expect(res.body.top[0].flat).toBe('A-202');
  });

  test('week adds days up and rejects unknown periods', async () => {
    mockingoose(StepDay).toReturn([{ userId: me._id, date: today(), steps: 2000 }, { userId: me._id, date: addDays(today(), -1), steps: 3000 }], 'find');
    mockingoose(User).toReturn([me], 'find');
    const res = await h.api().get('/api/steps/leaderboard?period=week').set(h.auth(me));
    expect(res.body.top[0].steps).toBe(5000);
    expect((await h.api().get('/api/steps/leaderboard?period=year').set(h.auth(me))).status).toBe(400);
  });
});

describe('leaderboard setting', () => {
  test('can be switched off', async () => {
    const res = await h.api().put('/api/steps/settings').set(h.auth(me)).send({ leaderboard: false });
    expect(res.status).toBe(200);
    expect(res.body.onLeaderboard).toBe(false);
    expect((await h.api().put('/api/steps/settings').set(h.auth(me)).send({})).status).toBe(400);
  });
});
