const flow = require('../utils/serviceFlow');

describe('transitions', () => {
  test('the happy path is allowed step by step', () => {
    const path = ['requested', 'confirmed', 'on_the_way', 'in_progress', 'completed'];
    for (let i = 0; i < path.length - 1; i++) expect(flow.canTransition(path[i], path[i + 1])).toBe(true);
  });

  test('a confirmed job can start directly without the "on the way" step', () => {
    expect(flow.canTransition('confirmed', 'in_progress')).toBe(true);
  });

  test('finished requests are final', () => {
    ['completed', 'cancelled', 'declined'].forEach((s) => {
      flow.STATUSES.forEach((t) => expect(flow.canTransition(s, t)).toBe(false));
    });
  });

  test('work in progress cannot be cancelled, only completed', () => {
    expect(flow.canTransition('in_progress', 'cancelled')).toBe(false);
    expect(flow.canTransition('in_progress', 'completed')).toBe(true);
  });

  test('no skipping ahead', () => {
    expect(flow.canTransition('requested', 'in_progress')).toBe(false);
    expect(flow.canTransition('requested', 'completed')).toBe(false);
    expect(flow.canTransition('confirmed', 'completed')).toBe(false);
  });

  test('only active requests hold a slot', () => {
    expect(flow.ACTIVE_STATUSES.sort()).toEqual(['confirmed', 'in_progress', 'on_the_way', 'requested']);
    expect(flow.isActive('completed')).toBe(false);
    expect(flow.isActive('declined')).toBe(false);
    expect(flow.isActive('cancelled')).toBe(false);
  });
});

describe('checkTransition (who may do what)', () => {
  test('providers advance the job; residents cannot', () => {
    expect(flow.checkTransition({ actor: 'provider', from: 'requested', to: 'confirmed' }).ok).toBe(true);
    expect(flow.checkTransition({ actor: 'resident', from: 'requested', to: 'confirmed' }).ok).toBe(false);
    expect(flow.checkTransition({ actor: 'resident', from: 'in_progress', to: 'completed' }).ok).toBe(false);
    expect(flow.checkTransition({ actor: 'admin', from: 'requested', to: 'declined' }).ok).toBe(false);
  });

  test('anyone involved can cancel before work starts', () => {
    ['resident', 'provider', 'admin'].forEach((actor) => {
      expect(flow.checkTransition({ actor, from: 'confirmed', to: 'cancelled' }).ok).toBe(true);
    });
  });

  test('explains an impossible move', () => {
    const r = flow.checkTransition({ actor: 'provider', from: 'completed', to: 'confirmed' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/completed cannot become confirmed/);
  });
});

describe('start code', () => {
  test('is always four digits', () => {
    for (let i = 0; i < 500; i++) expect(flow.generateStartOtp()).toMatch(/^[1-9]\d{3}$/);
  });

  test('right code passes, wrong code fails, spaces are ignored', () => {
    expect(flow.checkOtp({ expected: '4821', given: '4821' }).ok).toBe(true);
    expect(flow.checkOtp({ expected: '4821', given: ' 4821 ' }).ok).toBe(true);
    expect(flow.checkOtp({ expected: '4821', given: '4822' }).ok).toBe(false);
    expect(flow.checkOtp({ expected: '4821', given: '482' }).ok).toBe(false);
    expect(flow.checkOtp({ expected: '4821', given: '' }).ok).toBe(false);
  });

  test('a missing expected code never matches', () => {
    expect(flow.checkOtp({ expected: undefined, given: '' }).ok).toBe(false);
    expect(flow.checkOtp({ expected: '', given: '' }).ok).toBe(false);
  });

  test('locks after too many attempts, even for the right code', () => {
    const r = flow.checkOtp({ expected: '4821', given: '4821', attempts: flow.MAX_OTP_ATTEMPTS });
    expect(r).toMatchObject({ ok: false, locked: true });
  });
});

test('roundRating', () => {
  expect(flow.roundRating(4.666)).toBe(4.7);
  expect(flow.roundRating(5)).toBe(5);
  expect(flow.roundRating(NaN)).toBe(0);
  expect(flow.roundRating(null)).toBe(0);
});
