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
