const fs = require('fs');
const path = require('path');
const h = require('./helpers/harness');
const { manuals } = require('../content/manual');

const ROLES = ['resident', 'security', 'staff', 'vendor', 'society_admin', 'super_admin'];

beforeEach(() => h.reset());

const as = (role) => {
  const user = h.makeUser({ role, ...(role === 'super_admin' ? { societyId: undefined } : {}) });
  h.knowUsers(user);
  return user;
};

describe('manual API: each role sees only its own guide', () => {
  test.each(ROLES)('%s gets the %s guide', async (role) => {
    const res = await h.api().get('/api/manual').set(h.auth(as(role)));
    expect(res.status).toBe(200);
    expect(res.body.manual.role).toBe(role);
    expect(res.body.manual.sections.length).toBeGreaterThan(3);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  test('asking for another role with a query, header or body changes nothing', async () => {
    const resident = as('resident');
    const res = await h.api().get('/api/manual?role=society_admin&roles=super_admin').set({ ...h.auth(resident), 'x-role': 'society_admin' });
    expect(res.body.manual.role).toBe('resident');
    expect(JSON.stringify(res.body)).not.toMatch(/Approve or reject sign-ups|Create dues|Add admin/);
  });

  test('there is no route to fetch a specific role', async () => {
    const res = await h.api().get('/api/manual/society_admin').set(h.auth(as('resident')));
    expect(res.status).toBe(404);
  });

  test('needs a signed-in user', async () => {
    expect((await h.api().get('/api/manual')).status).toBe(401);
  });

  test('each guide carries only its own audience: no admin guide text in the resident or vendor guide', () => {
    const adminOnly = ['Create dues', 'Add admin', 'Verify', 'Approve or Reject'];
    ['resident', 'vendor', 'staff', 'security'].forEach((role) => {
      const text = JSON.stringify(manuals[role]);
      adminOnly.forEach((phrase) => expect(text).not.toContain(phrase));
    });
  });
});

// The sidebar is the list of screens a role can open. Every one of them must be explained in that role's guide,
// so adding a screen without documenting it fails here.
describe('manual covers every screen in the menu', () => {
  const layout = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'Layout.jsx'), 'utf8');
  const items = {};
  for (const m of layout.matchAll(/^\s{2}(\w+): \{ to: '([^']+)'/gm)) items[m[1]] = m[2];
  const navBlock = layout.slice(layout.indexOf('const NAV = {'), layout.indexOf('const TABS = {'));
  const navFor = {};
  for (const m of navBlock.matchAll(/^\s{2}(\w+): \[([\s\S]*?)\n\s{2}\](?=,?\n)/gm)) {
    navFor[m[1]] = [...m[2].matchAll(/I\.(\w+)/g)].map((x) => items[x[1]]);
  }

  test('the menu could be read', () => {
    expect(Object.keys(items).length).toBeGreaterThan(15);
    ROLES.forEach((role) => expect(navFor[role] && navFor[role].length).toBeGreaterThan(0));
  });

  test.each(ROLES)('%s guide explains each menu screen', (role) => {
    const covered = new Set(manuals[role].sections.flatMap((s) => s.covers || []));
    const missing = navFor[role].filter((p) => !covered.has(p));
    expect(missing).toEqual([]);
  });

  test.each(ROLES)('%s guide: sections are complete and links point to real screens', (role) => {
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'App.jsx'), 'utf8');
    const known = new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
    expect(known.size).toBeGreaterThan(20);
    const ids = new Set();
    manuals[role].sections.forEach((s) => {
      expect(s.id && s.title && s.summary).toBeTruthy();
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(Array.isArray(s.steps) && s.steps.length).toBeTruthy();
      if (s.path) expect({ path: s.path, known: known.has(s.path) }).toEqual({ path: s.path, known: true });
    });
  });
});
