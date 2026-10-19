const h = require('./helpers/harness');

beforeEach(() => h.reset());

const as = (role = 'resident') => {
  const u = h.makeUser({ role, googleId: 'g', ...(role === 'resident' ? {} : { flatNo: undefined, block: undefined }) });
  h.knowUsers(u);
  return u;
};

describe('society address and 1 km area', () => {
  test('the admin can save the apartment address with the pin', async () => {
    const admin = as('society_admin');
    h.mockingoose(h.models.Society).toReturn({
      _id: h.SOCIETY_ID, name: 'Sunrise', timezone: h.TZ, address: { street: 'Road 1', city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
      totalFlats: 100, contactNumber: '9999999999', createdBy: admin._id
    }, 'findOne');
    const res = await h.api().put('/api/guards/location').set(h.auth(admin)).send({ lat: 17.385, lng: 78.4867, radiusMeters: 250, label: 'Main gate', address: '  12 MG Road, Hyderabad  ' });
    expect(res.status).toBe(200);
    expect(h.savedDocs(h.models.Society)[0].location).toMatchObject({ lat: 17.385, lng: 78.4867, address: '12 MG Road, Hyderabad' });
  });

  test('a very long address is refused', async () => {
    const admin = as('society_admin');
    h.knowSociety({});
    const res = await h.api().put('/api/guards/location').set(h.auth(admin)).send({ lat: 17.3, lng: 78.4, address: 'x'.repeat(301) });
    expect(res.status).toBe(400);
  });

  test('any signed-in resident or guard can read where the society is', async () => {
    h.knowSociety({ name: 'Sunrise', location: { lat: 17.385, lng: 78.4867, radiusMeters: 300, address: '12 MG Road', label: 'Main gate' } });
    for (const role of ['resident', 'security', 'staff', 'society_admin']) {
      const res = await h.api().get('/api/nearby/home').set(h.auth(as(role)));
      expect(res.status).toBe(200);
      expect(res.body.areaMeters).toBe(1000);
      expect(res.body.home).toMatchObject({ lat: 17.385, lng: 78.4867, address: '12 MG Road', label: 'Main gate' });
    }
  });

  test('before a pin is set the page still gets the name and address', async () => {
    h.knowSociety({ name: 'Sunrise', address: { street: '1 Lake Rd', city: 'Pune', state: 'MH', pincode: '411001' } });
    const res = await h.api().get('/api/nearby/home').set(h.auth(as()));
    expect(res.body.home).toMatchObject({ lat: null, lng: null, address: '1 Lake Rd, Pune, MH, 411001' });
  });

  test('needs a signed-in user', async () => {
    expect((await h.api().get('/api/nearby/home')).status).toBe(401);
  });
});

describe('finding places nearby', () => {
  const { clearCache } = require('../utils/nearbyPlaces');
  const real = global.fetch;
  const overpass = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
  const nominatim = (list) => ({ ok: true, status: 200, json: async () => list });
  const pumps = [
    { type: 'node', id: 2, lat: 17.395, lon: 78.4867, tags: { name: 'Far Petrol', opening_hours: '24/7' } },
    { type: 'node', id: 1, lat: 17.386, lon: 78.4867, tags: { name: 'Near Petrol', phone: '+91 40 1111 2222', 'addr:street': 'MG Road' } },
    { type: 'way', id: 3, center: { lat: 17.386, lon: 78.4868 }, tags: {} }
  ];
  const get = (qs, who = 'resident') => h.api().get(`/api/nearby/places?${qs}`).set(h.auth(as(who)));

  beforeEach(() => {
    clearCache();
    h.knowSociety({ name: 'Sunrise', location: { lat: 17.385, lng: 78.4867, radiusMeters: 300 } });
  });
  afterEach(() => { global.fetch = real; });

  test('lists the nearest places first, from the society pin', async () => {
    global.fetch = jest.fn().mockResolvedValue(overpass(pumps));
    const res = await get('category=fuel&radius=2000');
    expect(res.status).toBe(200);
    expect(res.body.places.map((p) => p.name)).toEqual(['Near Petrol', 'Petrol bunk (no name on map)', 'Far Petrol']);
    expect(res.body.places[0]).toMatchObject({ name: 'Near Petrol', address: 'MG Road', phone: '+91 40 1111 2222' });
    expect(res.body.places[0].distanceM).toBeLessThan(res.body.places[2].distanceM);
    const query = decodeURIComponent(global.fetch.mock.calls[0][1].body);
    expect(query).toContain('"amenity"="fuel"');
    expect(query).toContain('around:2000,17.385,78.4867');
  });

  test('tries the next map server when the first fails', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(overpass(pumps));
    const res = await get('category=fuel');
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(res.body.count).toBeGreaterThan(0);
  });

  test('falls back to the address search when every map server fails', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => (String(url).includes('nominatim') ? nominatim([{ osm_type: 'node', osm_id: 9, lat: '17.386', lon: '78.4867', name: 'Shell Petrol Pump', display_name: 'Shell Petrol Pump, Madhapur, Hyderabad' }]) : { ok: false, status: 504 }));
    const res = await get('category=fuel');
    expect(res.status).toBe(200);
    expect(res.body.places[0].name).toBe('Shell Petrol Pump');
  });

  test('says so plainly when nothing answers', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 504 });
    const res = await get('category=fuel');
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/busy/i);
  });

  test('remembers the answer, and measures from the exact point asked', async () => {
    global.fetch = jest.fn().mockResolvedValue(overpass(pumps));
    await get('category=fuel&lat=17.3850&lng=78.4867');
    const again = await get('category=fuel&lat=17.3853&lng=78.4867');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(again.body.places[0].name).toBe('Near Petrol');
  });

  test('refuses an unknown kind of place, and a society with no pin', async () => {
    expect((await get('category=casino')).status).toBe(400);
    h.knowSociety({ name: 'Sunrise' });
    expect((await get('category=fuel')).status).toBe(409);
  });

  test('works for guards and staff, and needs a sign-in', async () => {
    global.fetch = jest.fn().mockResolvedValue(overpass(pumps));
    expect((await get('category=fuel', 'security')).status).toBe(200);
    expect((await get('category=hospital', 'staff')).status).toBe(200);
    expect((await h.api().get('/api/nearby/places?category=fuel')).status).toBe(401);
  });
});
